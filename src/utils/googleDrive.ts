import { VaultFile } from '../types';
import { getAccessToken, markTokenExpired } from './googleAuth';
import { parseFrontmatter } from './markdownParser';

const ROOT_FOLDER_NAME = 'Markdown Life Vault';

interface DriveFileItem {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  modifiedTime?: string;
}

/**
 * Helper to call Google Drive API with current in-memory token
 */
async function driveFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('You must be signed in with Google to access Google Drive.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      markTokenExpired('Google Drive session expired (401)');
    }
    const errText = await res.text();
    let message = `Google Drive error (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res;
}

/**
 * Finds or creates a folder inside a parent folder (or root if parentId is null),
 * checking for case-insensitive matches and common folder aliases first.
 */
export async function getOrCreateFolder(
  folderName: string,
  parentId?: string
): Promise<string> {
  const parentQuery = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;

  // First, search all folders in parent to find exact or case-insensitive/alias matches
  try {
    const qAll = `mimeType = 'application/vnd.google-apps.folder' and ${parentQuery} and trashed = false`;
    const searchRes = await driveFetch(`files?q=${encodeURIComponent(qAll)}&fields=files(id,name)`);
    const data = await searchRes.json();

    if (data.files && Array.isArray(data.files) && data.files.length > 0) {
      const targetLower = folderName.toLowerCase().trim();
      const match = data.files.find((f: any) => {
        const nameLower = (f.name || '').toLowerCase().trim();
        if (nameLower === targetLower) return true;
        // Check standard category aliases
        if (targetLower === 'skills' && (nameLower === 'skills' || nameLower === 'agent skills' || nameLower === 'agent-skills' || nameLower === '3. agent skills' || nameLower === '3. skills')) return true;
        if (targetLower === 'goals' && (nameLower === 'goals' || nameLower === '1. goals')) return true;
        if (targetLower === 'projects' && (nameLower === 'projects' || nameLower === '2. projects')) return true;
        if (targetLower === 'notes' && (nameLower === 'notes' || nameLower === '4. notes')) return true;
        if (targetLower === 'archive' && (nameLower === 'archive' || nameLower === '5. archive')) return true;
        if (targetLower === ROOT_FOLDER_NAME.toLowerCase() && nameLower.includes('markdown life')) return true;
        return false;
      });

      if (match) {
        return match.id;
      }
    }
  } catch (err) {
    console.warn(`Error searching folders in parent ${parentId}:`, err);
  }

  // Create folder if not found
  const createPayload: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    createPayload.parents = [parentId];
  }

  const createRes = await driveFetch('files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });
  const created = await createRes.json();
  return created.id;
}

/**
 * Ensures the root 'Markdown Life Vault' folder and its standard subfolders exist in Google Drive
 */
export async function getVaultFolderHierarchy(): Promise<{
  rootId: string;
  folderMap: Record<string, string>;
}> {
  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME);

  const subfolders = ['goals', 'projects', 'skills', 'notes', 'archive'];
  const folderMap: Record<string, string> = {};

  for (const sf of subfolders) {
    const id = await getOrCreateFolder(sf, rootId);
    folderMap[sf] = id;
  }

  return { rootId, folderMap };
}

/**
 * Resolves or creates a nested sub-directory path inside Google Drive (e.g. "goals/2026" or "projects/ai-agent")
 */
export async function resolveDriveFolderId(
  folderPath: string,
  rootId: string
): Promise<string> {
  if (!folderPath || folderPath === '.' || folderPath === '/') return rootId;
  const parts = folderPath.split('/').map((s) => s.trim()).filter(Boolean);
  let currentParentId = rootId;
  for (const part of parts) {
    currentParentId = await getOrCreateFolder(part, currentParentId);
  }
  return currentParentId;
}

/**
 * Saves or updates a single markdown file in Google Drive
 */
export async function saveFileToDrive(
  file: VaultFile,
  targetFolderId?: string
): Promise<{ fileId: string; isNew: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  // 1. If file already has a known Google Drive file ID, update it directly in place!
  if (file.driveFileId) {
    try {
      const uploadRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${file.driveFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/markdown; charset=utf-8',
          },
          body: file.content,
        }
      );
      if (uploadRes.ok) {
        return { fileId: file.driveFileId, isNew: false };
      }
      if (uploadRes.status === 401) {
        markTokenExpired('Google Drive session expired (401)');
        throw new Error('Google Drive session expired (401)');
      }
      // If 404 (file removed from Drive) or other error, fall through to folder search
    } catch (err: any) {
      if (err?.message?.includes('401') || err?.message?.includes('expired')) {
        throw err;
      }
      console.warn(`Direct update by driveFileId failed, falling back to folder search:`, err);
    }
  }

  // 2. Resolve destination folder ID safely using resolveDriveFolderId
  let resolvedFolderId = targetFolderId;
  if (!resolvedFolderId) {
    const { rootId } = await getVaultFolderHierarchy();
    resolvedFolderId = await resolveDriveFolderId(file.folder, rootId);
  }

  // Check if file already exists in this folder (prevent duplicate creation)
  const baseName = file.name.replace(/\.md$/i, '');
  const fileName = `${baseName}.md`;
  const safeClean = fileName.replace(/'/g, "\\'");
  const safeBase = baseName.replace(/'/g, "\\'");
  const q = `'${resolvedFolderId}' in parents and trashed = false and (name = '${safeClean}' or name = '${safeBase}')`;
  const searchRes = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  const data = await searchRes.json();

  if (data.files && data.files.length > 0) {
    const existingId = data.files[0].id;
    // Update existing file content via upload API
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown; charset=utf-8',
        },
        body: file.content,
      }
    );
    if (!uploadRes.ok) {
      if (uploadRes.status === 401) {
        markTokenExpired('Google Drive session expired (401)');
      }
      throw new Error(`Failed to update ${file.name} in Google Drive (${uploadRes.status})`);
    }
    return { fileId: existingId, isNew: false };
  } else {
    // Only create a new file if it does not already exist
    const createRes = await driveFetch('files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fileName,
        parents: [resolvedFolderId],
        mimeType: 'text/markdown',
      }),
    });
    const created = await createRes.json();
    const newId = created.id;

    // Upload content
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${newId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/markdown; charset=utf-8',
        },
        body: file.content,
      }
    );
    if (!uploadRes.ok) {
      if (uploadRes.status === 401) {
        markTokenExpired('Google Drive session expired (401)');
      }
      throw new Error(`Failed to upload content for ${file.name} to Google Drive (${uploadRes.status})`);
    }
    return { fileId: newId, isNew: true };
  }
}

/**
 * Deletes a file and all matching copies from Google Drive
 */
export async function deleteFileFromDrive(
  folderName: string,
  fileName: string,
  driveFileId?: string
): Promise<boolean> {
  let anyDeleted = false;
  if (driveFileId) {
    try {
      await driveFetch(`files/${driveFileId}`, { method: 'DELETE' });
      anyDeleted = true;
    } catch (err) {
      console.warn(`Direct delete by driveFileId failed, searching by query:`, err);
    }
  }

  const baseName = fileName.replace(/\.md$/i, '');
  const cleanName = `${baseName}.md`;
  const safeClean = cleanName.replace(/'/g, "\\'");
  const safeBase = baseName.replace(/'/g, "\\'");
  const safeCopy = `${safeBase}-copy.md`.replace(/'/g, "\\'");

  try {
    const { rootId } = await getVaultFolderHierarchy();
    const folderId = await resolveDriveFolderId(folderName, rootId);
    const q = `(name = '${safeClean}' or name = '${safeBase}' or name = '${safeCopy}' or name contains '${safeBase}-copy') and '${folderId}' in parents and trashed = false`;
    const searchRes = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
    const data = await searchRes.json();

    if (data.files && Array.isArray(data.files) && data.files.length > 0) {
      for (const item of data.files) {
        try {
          await driveFetch(`files/${item.id}`, { method: 'DELETE' });
          anyDeleted = true;
        } catch (delErr) {
          console.warn(`Failed to delete Drive file copy ${item.id}:`, delErr);
        }
      }
    }

    // Also search across the whole vault to remove any stray copies or duplicate versions
    const qGlobal = `(name = '${safeClean}' or name = '${safeBase}' or name = '${safeCopy}' or name contains '${safeBase}-copy') and trashed = false`;
    const resGlobal = await driveFetch(`files?q=${encodeURIComponent(qGlobal)}&fields=files(id,name)`);
    const dataGlobal = await resGlobal.json();
    if (dataGlobal.files && Array.isArray(dataGlobal.files)) {
      for (const item of dataGlobal.files) {
        try {
          await driveFetch(`files/${item.id}`, { method: 'DELETE' });
          anyDeleted = true;
        } catch (delErr) {
          console.warn(`Failed to delete Drive file copy ${item.id}:`, delErr);
        }
      }
    }
  } catch (err) {
    console.warn(`Query-based file delete error in Drive:`, err);
  }

  return anyDeleted;
}

/**
 * Renames a file in Google Drive
 */
export async function renameFileInDrive(
  folderName: string,
  oldFileName: string,
  newFileName: string,
  driveFileId?: string
): Promise<boolean> {
  const cleanNewName = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
  if (driveFileId) {
    try {
      await driveFetch(`files/${driveFileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanNewName }),
      });
      return true;
    } catch {
      // Fall through
    }
  }
  const { rootId } = await getVaultFolderHierarchy();
  const folderId = await resolveDriveFolderId(folderName, rootId);
  const baseOld = oldFileName.replace(/\.md$/i, '');
  const cleanOldName = `${baseOld}.md`;

  const q = `(name = '${cleanOldName}' or name = '${baseOld}') and '${folderId}' in parents and trashed = false`;
  const searchRes = await driveFetch(`files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  const data = await searchRes.json();

  if (data.files && data.files.length > 0) {
    const fileId = data.files[0].id;
    await driveFetch(`files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanNewName }),
    });
    return true;
  }
  return false;
}

/**
 * Saves all files from the vault into their matching Google Drive folders
 */
export async function syncAllFilesToDrive(
  files: VaultFile[],
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<{ uploaded: number; updated: number }> {
  const { rootId } = await getVaultFolderHierarchy();

  let uploaded = 0;
  let updated = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);

    const folderId = await resolveDriveFolderId(file.folder, rootId);
    const result = await saveFileToDrive(file, folderId);
    if (result.isNew) {
      uploaded++;
    } else {
      updated++;
    }
  }

  return { uploaded, updated };
}

// Helper for concurrent batch execution with concurrency limit
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    for (const r of chunkResults) {
      if (r !== null) results.push(r);
    }
  }
  return results;
}

export interface ImportDriveOptions {
  includeGlobalSearch?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Imports markdown files from the Google Drive 'Markdown Life Vault' folder, including nested sub-directories.
 * Uses concurrent parallel downloads and skips redundant global queries for instant loading.
 */
export async function importFilesFromDrive(options: ImportDriveOptions = {}): Promise<VaultFile[]> {
  const { includeGlobalSearch = false, onProgress } = options;
  const rootId = await getOrCreateFolder(ROOT_FOLDER_NAME);
  const importedFiles: VaultFile[] = [];
  const processedPaths = new Set<string>();

  onProgress?.('Scanning vault directories in Google Drive...');

  async function scanDirectory(folderId: string, relativePath: string) {
    const isSkillsFolder = relativePath.toLowerCase().includes('skill');

    // 1. Scan files in this directory
    const qFiles = `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;

    try {
      const resFiles = await driveFetch(
        `files?q=${encodeURIComponent(qFiles)}&fields=files(id,name,modifiedTime,mimeType)`
      );
      const dataFiles = await resFiles.json();

      if (dataFiles.files && Array.isArray(dataFiles.files) && dataFiles.files.length > 0) {
        // Filter eligible files
        const eligibleItems = dataFiles.files.filter((item: any) => {
          if (item.mimeType?.startsWith('application/vnd.google-apps.')) return false;
          if (!isSkillsFolder) {
            const hasTextExt =
              item.name.endsWith('.md') ||
              item.name.endsWith('.markdown') ||
              item.name.endsWith('.txt');
            const isTextMime =
              item.mimeType === 'text/markdown' ||
              item.mimeType === 'text/plain' ||
              item.mimeType === 'application/octet-stream';
            if (!hasTextExt && !isTextMime) return false;
          }
          return true;
        });

        // Concurrently fetch file contents in batches of 10 for faster sign-in
        await mapConcurrent(eligibleItems, 10, async (item: any) => {
          try {
            const cleanName = item.name.endsWith('.md') ? item.name : `${item.name}.md`;
            const currentFolder = relativePath || (isSkillsFolder ? 'skills' : 'notes');
            const filePath = `${currentFolder}/${cleanName}`;

            if (processedPaths.has(filePath)) return null;
            processedPaths.add(filePath);

            const contentRes = await driveFetch(`files/${item.id}?alt=media`);
            const text = await contentRes.text();
            const parsed = parseFrontmatter(text);

            let title = parsed.frontmatter.title;
            if (!title || title.toUpperCase() === 'SKILL' || title.toLowerCase() === 'untitled') {
              if (currentFolder.startsWith('skills/') && currentFolder.split('/').length > 1) {
                const subName = currentFolder.split('/').pop() || '';
                const formattedSub = subName
                  .split(/[-_]/)
                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
                title = `${formattedSub} (${cleanName.replace(/\.md$/, '')})`;
              } else {
                title = cleanName.replace(/\.md$/, '');
              }
            }

            const isSkillCategory =
              isSkillsFolder ||
              currentFolder.toLowerCase().includes('skill') ||
              parsed.frontmatter.category === 'skills' ||
              cleanName.toLowerCase().includes('skill');

            const fileObj: VaultFile = {
              id: filePath,
              driveFileId: item.id,
              name: cleanName,
              path: filePath,
              folder: currentFolder,
              content: text,
              frontmatter: {
                ...parsed.frontmatter,
                title: title,
                category: isSkillCategory
                  ? 'skills'
                  : parsed.frontmatter.category || (currentFolder.split('/')[0] as any),
              },
              createdAt: item.modifiedTime ? new Date(item.modifiedTime).getTime() : Date.now(),
              updatedAt: item.modifiedTime ? new Date(item.modifiedTime).getTime() : Date.now(),
            };

            importedFiles.push(fileObj);
            return fileObj;
          } catch (err) {
            console.error(`Error reading ${item.name} from Google Drive:`, err);
            return null;
          }
        });
      }
    } catch (err) {
      console.warn(`Error querying files in folder ${folderId} (${relativePath}):`, err);
    }

    // 2. Scan child sub-directories in this directory
    try {
      const qDirs = `'${folderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
      const resDirs = await driveFetch(`files?q=${encodeURIComponent(qDirs)}&fields=files(id,name)`);
      const dataDirs = await resDirs.json();

      if (dataDirs.files && Array.isArray(dataDirs.files)) {
        for (const subDir of dataDirs.files) {
          // Normalize standard folder names if at top-level
          let childRelative = subDir.name;
          if (!relativePath) {
            const nameLower = subDir.name.toLowerCase().trim();
            if (
              nameLower === 'skills' ||
              nameLower === 'agent skills' ||
              nameLower === 'agent-skills' ||
              nameLower.includes('agent skill') ||
              nameLower.endsWith('skills')
            ) {
              childRelative = 'skills';
            } else if (nameLower.includes('goal')) {
              childRelative = 'goals';
            } else if (nameLower.includes('project')) {
              childRelative = 'projects';
            } else if (nameLower.includes('note')) {
              childRelative = 'notes';
            } else if (nameLower.includes('archive')) {
              childRelative = 'archive';
            }
          } else {
            childRelative = `${relativePath}/${subDir.name}`;
          }
          await scanDirectory(subDir.id, childRelative);
        }
      }
    } catch (err) {
      console.warn(`Error scanning subdirectories in ${folderId}:`, err);
    }
  }

  // Scan root directory and all its child sub-directories once
  await scanDirectory(rootId, '');

  // 3. Optional Global Search ONLY if explicitly requested
  if (includeGlobalSearch) {
    onProgress?.('Searching external folders for Agent Skills...');
    try {
      const qSkillsGlobal = `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = 'skills' or name = 'Skills' or name = 'SKILLS' or name = 'agent-skills' or name = 'Agent Skills')`;
      const resSkillsGlobal = await driveFetch(
        `files?q=${encodeURIComponent(qSkillsGlobal)}&fields=files(id,name,parents)`
      );
      const dataSkillsGlobal = await resSkillsGlobal.json();

      if (dataSkillsGlobal.files && Array.isArray(dataSkillsGlobal.files)) {
        for (const sf of dataSkillsGlobal.files) {
          if (sf.id === rootId) continue;
          if (sf.parents && sf.parents.includes(rootId)) continue;
          await scanDirectory(sf.id, 'skills');
        }
      }
    } catch (err) {
      console.warn('Error querying global skills folders in Drive:', err);
    }

    // Global Search for standalone skill specification files (e.g. SKILL.md, skill.md)
    try {
      const qSkillFiles = `trashed = false and mimeType != 'application/vnd.google-apps.folder' and (name = 'SKILL.md' or name = 'skill.md' or name contains '.skill')`;
      const resSkillFiles = await driveFetch(
        `files?q=${encodeURIComponent(qSkillFiles)}&fields=files(id,name,modifiedTime,parents,mimeType)`
      );
      const dataSkillFiles = await resSkillFiles.json();

      if (dataSkillFiles.files && Array.isArray(dataSkillFiles.files)) {
        for (const sf of dataSkillFiles.files) {
          if (sf.mimeType?.startsWith('application/vnd.google-apps.')) continue;

          let parentSlug = '';
          if (sf.parents && sf.parents[0]) {
            try {
              const parentRes = await driveFetch(`files/${sf.parents[0]}?fields=id,name`);
              const parentData = await parentRes.json();
              if (
                parentData.name &&
                parentData.name !== 'root' &&
                parentData.name !== ROOT_FOLDER_NAME
              ) {
                parentSlug = parentData.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
              }
            } catch {
              // ignore
            }
          }

          const skillFolder =
            parentSlug && parentSlug !== 'skills' ? `skills/${parentSlug}` : 'skills';
          const cleanName = sf.name.endsWith('.md') ? sf.name : `${sf.name}.md`;
          const filePath = `${skillFolder}/${cleanName}`;

          if (processedPaths.has(filePath)) continue;
          processedPaths.add(filePath);

          try {
            const contentRes = await driveFetch(`files/${sf.id}?alt=media`);
            const text = await contentRes.text();
            const parsed = parseFrontmatter(text);
            let title = parsed.frontmatter.title;
            if (!title || title.toUpperCase() === 'SKILL' || title.toLowerCase() === 'untitled') {
              title = parentSlug
                ? parentSlug
                    .split(/[-_]/)
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')
                : cleanName.replace(/\.md$/, '');
            }

            importedFiles.push({
              id: filePath,
              driveFileId: sf.id,
              name: cleanName,
              path: filePath,
              folder: skillFolder,
              content: text,
              frontmatter: {
                ...parsed.frontmatter,
                title,
                category: 'skills',
              },
              createdAt: sf.modifiedTime ? new Date(sf.modifiedTime).getTime() : Date.now(),
              updatedAt: sf.modifiedTime ? new Date(sf.modifiedTime).getTime() : Date.now(),
            });
          } catch (err) {
            console.warn(`Error reading standalone skill file ${sf.name}:`, err);
          }
        }
      }
    } catch (err) {
      console.warn('Error querying standalone skill files in Drive:', err);
    }
  }

  return importedFiles;
}

export interface DrivePermission {
  id: string;
  type: string; // 'user' | 'group' | 'domain' | 'anyone'
  role: 'owner' | 'organizer' | 'fileOrganizer' | 'writer' | 'commenter' | 'reader';
  emailAddress?: string;
  displayName?: string;
  photoLink?: string;
}

export interface ProjectShareInfo {
  folderId: string;
  folderName: string;
  projectPath: string;
  webViewLink?: string;
  permissions: DrivePermission[];
  ownerEmail?: string;
  ownerDisplayName?: string;
}

/**
 * Gets or creates the project folder in Google Drive, retrieves its shareable webViewLink,
 * and lists all current collaborators and permissions.
 */
export async function getProjectFolderShareInfo(projectPath: string): Promise<ProjectShareInfo> {
  const { rootId } = await getVaultFolderHierarchy();
  const folderId = await resolveDriveFolderId(projectPath, rootId);

  // 1. Fetch folder metadata including webViewLink and owners
  const folderRes = await driveFetch(
    `files/${folderId}?fields=id,name,webViewLink,owners(displayName,emailAddress)`
  );
  const folderData = await folderRes.json();

  // 2. Fetch permissions list
  const permRes = await driveFetch(
    `files/${folderId}/permissions?fields=permissions(id,type,role,emailAddress,displayName,photoLink)`
  );
  const permData = await permRes.json();

  const permissions: DrivePermission[] = Array.isArray(permData.permissions) ? permData.permissions : [];
  const owner = folderData.owners && folderData.owners[0];

  return {
    folderId,
    folderName: folderData.name || projectPath.split('/').pop() || 'project',
    projectPath,
    webViewLink: folderData.webViewLink,
    permissions,
    ownerEmail: owner?.emailAddress,
    ownerDisplayName: owner?.displayName,
  };
}

/**
 * Shares a project folder with a specific Google Account email address.
 * Uses Google Drive's Permissions API (files.permissions.create).
 */
export async function shareProjectWithGoogleAccount(
  folderId: string,
  emailAddress: string,
  role: 'reader' | 'commenter' | 'writer' = 'reader',
  sendNotificationEmail: boolean = true
): Promise<DrivePermission> {
  const cleanEmail = emailAddress.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Please enter a valid Google Account email address.');
  }

  const queryParams = new URLSearchParams({
    sendNotificationEmail: String(sendNotificationEmail),
    fields: 'id,type,role,emailAddress,displayName,photoLink',
  });

  const res = await driveFetch(`files/${folderId}/permissions?${queryParams.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      type: 'user',
      emailAddress: cleanEmail,
    }),
  });

  const createdPerm: DrivePermission = await res.json();
  return createdPerm;
}

/**
 * Updates the role of an existing collaborator on a project folder.
 */
export async function updateProjectPermissionRole(
  folderId: string,
  permissionId: string,
  newRole: 'reader' | 'commenter' | 'writer'
): Promise<DrivePermission> {
  const res = await driveFetch(`files/${folderId}/permissions/${permissionId}?fields=id,role,emailAddress,displayName`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: newRole,
    }),
  });

  return await res.json();
}

/**
 * Removes a collaborator's access from a project folder.
 */
export async function removeProjectPermission(
  folderId: string,
  permissionId: string
): Promise<boolean> {
  await driveFetch(`files/${folderId}/permissions/${permissionId}`, {
    method: 'DELETE',
  });
  return true;
}

