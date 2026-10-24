import { FileCategory, VaultFile } from '../types';
import { getAccessToken, markTokenExpired } from './googleAuth';
import {
  folderAllowsAltFormats,
  getFileFormat,
  getFileFrontmatter,
  mimeTypeForFile,
} from './fileFormats';
import { isDriveSyncDisabled } from './storageKeys';

const ROOT_FOLDER_NAME = 'Markdown Life Vault';
/** Top-level vault folder holding backup snapshots (never loaded into the vault). */
export const BACKUP_FOLDER_NAME = 'backup';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const LIST_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Any non-2xx response from the Drive API. */
export class DriveApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
  }
}

/** The Drive session is missing or expired (HTTP 401): the user must reconnect. */
export class DriveAuthError extends DriveApiError {
  constructor(message = 'Google Drive session expired. Please reconnect.') {
    super(message, 401);
    this.name = 'DriveAuthError';
  }
}

/** The file changed in Drive since we last fetched/saved it; it was NOT overwritten. */
export class DriveConflictError extends Error {
  driveFileId: string;
  remoteModifiedTime: string;
  constructor(fileName: string, driveFileId: string, remoteModifiedTime: string) {
    super(`"${fileName}" was changed in Google Drive since it was last synced.`);
    this.name = 'DriveConflictError';
    this.driveFileId = driveFileId;
    this.remoteModifiedTime = remoteModifiedTime;
  }
}

const isNotFound = (err: unknown) => err instanceof DriveApiError && err.status === 404;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

/** Escapes a value for use inside a single-quoted Drive query string literal. */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Calls the Google Drive API with the current in-memory token.
 * Accepts a path relative to drive/v3/ or an absolute googleapis URL (for uploads).
 * Throws DriveAuthError on 401 / missing token and DriveApiError on other failures.
 */
async function driveFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  if (isDriveSyncDisabled()) {
    throw new Error('Google Drive is disabled in offline mock mode.');
  }
  const token = await getAccessToken();
  if (!token) {
    throw new DriveAuthError();
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const url = endpoint.startsWith('https://') ? endpoint : `${DRIVE_API}${endpoint}`;
  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let message = `Google Drive error (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // ignore
    }
    if (res.status === 401) {
      markTokenExpired('Google Drive session expired (401)');
      throw new DriveAuthError(message);
    }
    throw new DriveApiError(message, res.status);
  }

  return res;
}

/** Lists every file matching `q`, following nextPageToken until exhausted. */
async function listAll<T>(q: string, fileFields: string): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    let url =
      `files?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent(`nextPageToken,files(${fileFields})`)}` +
      `&pageSize=${LIST_PAGE_SIZE}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveFetch(url);
    const data = await res.json();
    if (Array.isArray(data.files)) items.push(...data.files);
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);
  return items;
}

/**
 * Serializes Drive operations per key (local file id), so two saves of the same file never
 * run concurrently — which is what used to create duplicates via search-then-create.
 */
const fileLocks = new Map<string, Promise<unknown>>();
export function withDriveFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(key) || Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  fileLocks.set(key, tail);
  tail.then(() => {
    if (fileLocks.get(key) === tail) fileLocks.delete(key);
  });
  return run;
}

// ---------------------------------------------------------------------------
// Folders (with in-memory ID cache)
// ---------------------------------------------------------------------------

// key: `${parentId}/${lowercased folder name}` -> folder id (promise, so concurrent callers share one lookup/create)
const folderIdCache = new Map<string, Promise<string>>();
let rootIdPromise: Promise<string> | null = null;

/** Drops cached folder IDs (on sign-out, reload, or when a cached folder disappears). */
export function resetDriveCaches(): void {
  folderIdCache.clear();
  rootIdPromise = null;
}

function folderNameMatches(targetName: string, candidateName: string): boolean {
  const targetLower = targetName.toLowerCase().trim();
  const nameLower = (candidateName || '').toLowerCase().trim();
  if (nameLower === targetLower) return true;
  // Check standard category aliases
  if (
    targetLower === 'skills' &&
    (nameLower === 'agent skills' ||
      nameLower === 'agent-skills' ||
      nameLower === '3. agent skills' ||
      nameLower === '3. skills')
  )
    return true;
  if (targetLower === 'goals' && nameLower === '1. goals') return true;
  if (targetLower === 'projects' && nameLower === '2. projects') return true;
  if (targetLower === 'notes' && nameLower === '4. notes') return true;
  if (targetLower === 'archive' && nameLower === '5. archive') return true;
  if (targetLower === ROOT_FOLDER_NAME.toLowerCase() && nameLower.includes('markdown life'))
    return true;
  return false;
}

const folderCacheKey = (folderName: string, parentId?: string) =>
  `${parentId || 'root'}/${folderName.toLowerCase().trim()}`;

/** Finds a child folder (exact, case-insensitive or alias match). Search errors propagate. */
async function findChildFolder(folderName: string, parentId?: string): Promise<string | null> {
  const parentQuery = `'${escapeDriveQuery(parentId || 'root')}' in parents`;
  const q = `mimeType = '${FOLDER_MIME}' and ${parentQuery} and trashed = false`;
  const folders = await listAll<{ id: string; name: string }>(q, 'id,name');
  const match = folders.find((f) => folderNameMatches(folderName, f.name));
  return match ? match.id : null;
}

/**
 * Finds or creates a folder inside a parent folder (or root if parentId is null),
 * checking for case-insensitive matches and common folder aliases first.
 * If the search itself fails, the error is rethrown (never create blindly).
 */
export function getOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  const key = folderCacheKey(folderName, parentId);
  const cached = folderIdCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const existing = await findChildFolder(folderName, parentId);
    if (existing) return existing;

    const createPayload: { name: string; mimeType: string; parents?: string[] } = {
      name: folderName,
      mimeType: FOLDER_MIME,
    };
    if (parentId) {
      createPayload.parents = [parentId];
    }
    const createRes = await driveFetch('files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    });
    const created = await createRes.json();
    return created.id as string;
  })();

  folderIdCache.set(key, promise);
  promise.catch(() => {
    if (folderIdCache.get(key) === promise) folderIdCache.delete(key);
  });
  return promise;
}

/** Returns the (cached) ID of the root 'Markdown Life Vault' folder, creating it if needed. */
export function getVaultRootId(): Promise<string> {
  if (!rootIdPromise) {
    const promise = getOrCreateFolder(ROOT_FOLDER_NAME);
    rootIdPromise = promise;
    promise.catch(() => {
      if (rootIdPromise === promise) rootIdPromise = null;
    });
  }
  return rootIdPromise;
}

/**
 * Ensures the root 'Markdown Life Vault' folder and its standard subfolders exist in Google Drive
 */
export async function getVaultFolderHierarchy(): Promise<{
  rootId: string;
  folderMap: Record<string, string>;
}> {
  const rootId = await getVaultRootId();

  const subfolders = ['goals', 'projects', 'skills', 'notes', 'archive'];
  const folderMap: Record<string, string> = {};

  for (const sf of subfolders) {
    folderMap[sf] = await getOrCreateFolder(sf, rootId);
  }

  return { rootId, folderMap };
}

const splitFolderPath = (folderPath: string) =>
  folderPath && folderPath !== '.' && folderPath !== '/'
    ? folderPath
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/**
 * Resolves or creates a nested sub-directory path inside Google Drive (e.g. "goals/2026" or "projects/ai-agent")
 */
export async function resolveDriveFolderId(folderPath: string, rootId: string): Promise<string> {
  let currentParentId = rootId;
  for (const part of splitFolderPath(folderPath)) {
    currentParentId = await getOrCreateFolder(part, currentParentId);
  }
  return currentParentId;
}

/** Resolves a vault folder path WITHOUT creating anything; null if any segment is missing. */
async function findVaultFolderId(folderPath: string): Promise<string | null> {
  const rootId = await getVaultRootId();
  let currentParentId = rootId;
  for (const part of splitFolderPath(folderPath)) {
    const key = folderCacheKey(part, currentParentId);
    const cached = folderIdCache.get(key);
    const nextId = cached ? await cached : await findChildFolder(part, currentParentId);
    if (!nextId) return null;
    if (!cached) folderIdCache.set(key, Promise.resolve(nextId));
    currentParentId = nextId;
  }
  return currentParentId;
}

/**
 * The name a vault file has in Drive: markdown files always end in ".md";
 * JSON and plain-text files keep their own name.
 */
const driveFileName = (fileName: string) =>
  getFileFormat(fileName) === 'markdown' ? `${fileName.replace(/\.md$/i, '')}.md` : fileName;

/**
 * Lists non-trashed files in `folderId` named exactly `fileName`
 * (for markdown also `<base>` without the ".md" extension).
 */
async function findFilesByExactName(folderId: string, fileName: string) {
  const name = driveFileName(fileName);
  const nameQuery =
    getFileFormat(name) === 'markdown'
      ? `(name = '${escapeDriveQuery(name)}' or name = '${escapeDriveQuery(name.replace(/\.md$/i, ''))}')`
      : `name = '${escapeDriveQuery(name)}'`;
  const q =
    `'${escapeDriveQuery(folderId)}' in parents and trashed = false and ` +
    `mimeType != '${FOLDER_MIME}' and ${nameQuery}`;
  return listAll<{ id: string; name: string; modifiedTime?: string }>(q, 'id,name,modifiedTime');
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface DriveSaveResult {
  fileId: string;
  isNew: boolean;
  modifiedTime?: string;
}

const isRemoteNewer = (remote?: string, known?: string) =>
  !!remote && !!known && Date.parse(remote) > Date.parse(known);

async function getFileMetadata(
  fileId: string,
): Promise<{ id: string; modifiedTime?: string; trashed?: boolean } | null> {
  try {
    const res = await driveFetch(
      `files/${encodeURIComponent(fileId)}?fields=id,modifiedTime,trashed`,
    );
    return await res.json();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Replaces a Drive file's content. */
async function uploadContent(
  fileId: string,
  content: string,
  fileName: string,
): Promise<{ modifiedTime?: string }> {
  const res = await driveFetch(
    `${UPLOAD_API}files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': `${mimeTypeForFile(fileName)}; charset=utf-8` },
      body: content,
    },
  );
  return res.json();
}

/** Creates a vault file with content in a single multipart request (no empty orphans on failure). */
async function createFileWithContent(
  fileName: string,
  parentId: string,
  content: string,
): Promise<{ id: string; modifiedTime?: string }> {
  const boundary = `mdlife-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const mimeType = mimeTypeForFile(fileName);
  const metadata = { name: fileName, parents: [parentId], mimeType };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch(`${UPLOAD_API}files?uploadType=multipart&fields=id,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.json();
}

/** Downloads a Drive file's current content and modifiedTime. */
export async function downloadDriveFile(
  fileId: string,
): Promise<{ content: string; modifiedTime?: string }> {
  const meta = await getFileMetadata(fileId);
  const res = await driveFetch(`files/${encodeURIComponent(fileId)}?alt=media`);
  return { content: await res.text(), modifiedTime: meta?.modifiedTime };
}

/**
 * Saves or updates a single vault file in Google Drive.
 *
 * - With a known driveFileId: checks the remote modifiedTime first and throws DriveConflictError
 *   (without writing) if Drive has a newer version than the one we last saw.
 * - Otherwise: resolves the folder (cached) and updates an exact-name match or creates the file.
 * Saves of the same local file are serialized.
 */
export function saveFileToDrive(
  file: VaultFile,
  targetFolderId?: string,
): Promise<DriveSaveResult> {
  return withDriveFileLock(file.id, async () => {
    if (file.driveFileId) {
      const meta = await getFileMetadata(file.driveFileId);
      if (meta && !meta.trashed) {
        if (isRemoteNewer(meta.modifiedTime, file.driveModifiedTime)) {
          throw new DriveConflictError(file.name, file.driveFileId, meta.modifiedTime!);
        }
        const updated = await uploadContent(file.driveFileId, file.content, file.name);
        return { fileId: file.driveFileId, isNew: false, modifiedTime: updated.modifiedTime };
      }
      // File was deleted/trashed in Drive: fall through and recreate it in its folder.
    }

    const resolvedFolderId =
      targetFolderId || (await resolveDriveFolderId(file.folder, await getVaultRootId()));

    const fileName = driveFileName(file.name);
    const existing = await findFilesByExactName(resolvedFolderId, fileName);

    if (existing.length > 0) {
      const existingId = existing[0].id;
      const updated = await uploadContent(existingId, file.content, fileName);
      return { fileId: existingId, isNew: false, modifiedTime: updated.modifiedTime };
    }

    try {
      const created = await createFileWithContent(fileName, resolvedFolderId, file.content);
      return { fileId: created.id, isNew: true, modifiedTime: created.modifiedTime };
    } catch (err) {
      // A cached folder ID may point at a folder deleted in Drive: drop the cache so a retry re-resolves.
      if (isNotFound(err)) resetDriveCaches();
      throw err;
    }
  });
}

/**
 * Deletes exactly one vault file from Google Drive: by driveFileId when known, otherwise by
 * exact name within its own vault folder (never searches the rest of Drive, never creates folders).
 * Returns true when the file is gone from Drive. Throws on failure so callers can retry later.
 */
export function deleteFileFromDrive(
  folderName: string,
  fileName: string,
  driveFileId?: string,
): Promise<boolean> {
  const cleanName = driveFileName(fileName);
  return withDriveFileLock(`${folderName}/${cleanName}`, async () => {
    if (driveFileId) {
      try {
        await driveFetch(`files/${encodeURIComponent(driveFileId)}`, { method: 'DELETE' });
      } catch (err) {
        if (!isNotFound(err)) throw err;
        // Already gone from Drive.
      }
      return true;
    }

    const folderId = await findVaultFolderId(folderName);
    if (!folderId) return true;

    const matches = await findFilesByExactName(folderId, cleanName);
    for (const item of matches) {
      try {
        await driveFetch(`files/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    }
    return true;
  });
}

/**
 * Renames a file in Google Drive (by driveFileId, else exact name in its folder).
 * Returns renamed=false when no matching Drive file exists.
 */
export function renameFileInDrive(
  folderName: string,
  oldFileName: string,
  newFileName: string,
  driveFileId?: string,
): Promise<{ renamed: boolean; fileId?: string; modifiedTime?: string }> {
  const cleanNewName = driveFileName(newFileName);
  const cleanOldName = driveFileName(oldFileName);

  const patchName = async (fileId: string) => {
    const res = await driveFetch(`files/${encodeURIComponent(fileId)}?fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanNewName }),
    });
    const data = await res.json();
    return { renamed: true, fileId, modifiedTime: data.modifiedTime as string | undefined };
  };

  return withDriveFileLock(`${folderName}/${cleanOldName}`, async () => {
    if (driveFileId) {
      try {
        return await patchName(driveFileId);
      } catch (err) {
        if (!isNotFound(err)) throw err;
        // Fall through to a name lookup in the file's folder.
      }
    }

    const folderId = await findVaultFolderId(folderName);
    if (!folderId) return { renamed: false };
    const matches = await findFilesByExactName(folderId, cleanOldName);
    if (matches.length === 0) return { renamed: false };
    return patchName(matches[0].id);
  });
}

// ---------------------------------------------------------------------------
// Bulk sync
// ---------------------------------------------------------------------------

export interface DriveSaveEvent {
  localId: string;
  content: string;
  driveFileId: string;
  modifiedTime?: string;
}

type DriveSaveListener = (event: DriveSaveEvent) => void;
const saveListeners = new Set<DriveSaveListener>();

/**
 * Subscribes to saves performed by bulk sync (syncAllFilesToDrive), so the app can record the
 * returned driveFileId/modifiedTime and clear unsaved flags even when a component triggered it.
 */
export function subscribeDriveSaves(listener: DriveSaveListener): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

/**
 * Saves all files from the vault into their matching Google Drive folders.
 * Files that changed in Drive since last sync are skipped (counted in `conflicts`), never overwritten.
 */
export async function syncAllFilesToDrive(
  files: VaultFile[],
  onProgress?: (current: number, total: number, fileName: string) => void,
): Promise<{ uploaded: number; updated: number; conflicts: number }> {
  const { rootId } = await getVaultFolderHierarchy();

  let uploaded = 0;
  let updated = 0;
  let conflicts = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length, file.name);

    const folderId = await resolveDriveFolderId(file.folder, rootId);
    let result: DriveSaveResult;
    try {
      result = await saveFileToDrive(file, folderId);
    } catch (err) {
      if (err instanceof DriveConflictError) {
        conflicts++;
        continue;
      }
      throw err;
    }
    if (result.isNew) {
      uploaded++;
    } else {
      updated++;
    }
    const event: DriveSaveEvent = {
      localId: file.id,
      content: file.content,
      driveFileId: result.fileId,
      modifiedTime: result.modifiedTime,
    };
    saveListeners.forEach((fn) => {
      try {
        fn(event);
      } catch (listenerErr) {
        console.error('Error in Drive save listener:', listenerErr);
      }
    });
  }

  return { uploaded, updated, conflicts };
}

// Helper for concurrent batch execution with concurrency limit
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
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

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportDriveOptions {
  onProgress?: (message: string) => void;
}

export interface DriveVaultSnapshot {
  files: VaultFile[];
  /** Local ids (paths) whose content could not be downloaded; callers must keep their local copy. */
  failedPaths: Set<string>;
}

function normalizeTopLevelFolder(name: string): string {
  const nameLower = name.toLowerCase().trim();
  if (
    nameLower === 'skills' ||
    nameLower === 'agent skills' ||
    nameLower === 'agent-skills' ||
    nameLower.includes('agent skill') ||
    nameLower.endsWith('skills')
  ) {
    return 'skills';
  }
  if (nameLower.includes('trailhead')) return 'trailhead';
  if (nameLower.includes('goal')) return 'goals';
  if (nameLower.includes('project')) return 'projects';
  if (nameLower.includes('note')) return 'notes';
  if (nameLower.includes('archive')) return 'archive';
  return name;
}

/**
 * Reads every markdown file in the Drive 'Markdown Life Vault' folder tree (paginated).
 * Folder listing errors abort the import (so a partial listing is never mistaken for deletions);
 * individual download failures are reported in `failedPaths`.
 */
export async function importVaultFromDrive(
  options: ImportDriveOptions = {},
): Promise<DriveVaultSnapshot> {
  const { onProgress } = options;
  const rootId = await getVaultRootId();
  const importedFiles: VaultFile[] = [];
  const processedPaths = new Set<string>();
  const failedPaths = new Set<string>();

  onProgress?.('Scanning vault directories in Google Drive...');

  async function scanDirectory(folderId: string, relativePath: string) {
    const isSkillsFolder = relativePath.toLowerCase().includes('skill');
    // Projects may also hold JSON and plain-text files, which keep their own extension.
    const allowsAltFormats = folderAllowsAltFormats(relativePath);
    const parentQuery = `'${escapeDriveQuery(folderId)}' in parents and trashed = false`;

    // 1. Scan files in this directory
    const items = await listAll<{
      id: string;
      name: string;
      modifiedTime?: string;
      mimeType?: string;
    }>(`${parentQuery} and mimeType != '${FOLDER_MIME}'`, 'id,name,modifiedTime,mimeType');

    const eligibleItems = items.filter((item) => {
      if (item.mimeType?.startsWith('application/vnd.google-apps.')) return false;
      if (!isSkillsFolder) {
        const hasTextExt =
          item.name.endsWith('.md') ||
          item.name.endsWith('.markdown') ||
          item.name.endsWith('.txt') ||
          (allowsAltFormats && item.name.endsWith('.json'));
        const isTextMime =
          item.mimeType === 'text/markdown' ||
          item.mimeType === 'text/plain' ||
          item.mimeType === 'application/octet-stream' ||
          (allowsAltFormats && item.mimeType === 'application/json');
        if (!hasTextExt && !isTextMime) return false;
      }
      return true;
    });

    // Concurrently fetch file contents in batches of 10 for faster sign-in
    await mapConcurrent(eligibleItems, 10, async (item) => {
      const keepName = allowsAltFormats && getFileFormat(item.name) !== 'markdown';
      const cleanName = item.name.endsWith('.md') || keepName ? item.name : `${item.name}.md`;
      const currentFolder = relativePath || (isSkillsFolder ? 'skills' : 'notes');
      const filePath = `${currentFolder}/${cleanName}`;

      if (processedPaths.has(filePath)) return null;
      processedPaths.add(filePath);

      try {
        const contentRes = await driveFetch(`files/${encodeURIComponent(item.id)}?alt=media`);
        const text = await contentRes.text();
        const parsed = { frontmatter: getFileFrontmatter(cleanName, text) };

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

        const timestamp = item.modifiedTime ? new Date(item.modifiedTime).getTime() : Date.now();
        const fileObj: VaultFile = {
          id: filePath,
          driveFileId: item.id,
          driveModifiedTime: item.modifiedTime,
          name: cleanName,
          path: filePath,
          folder: currentFolder,
          content: text,
          frontmatter: {
            ...parsed.frontmatter,
            title: title,
            category: isSkillCategory
              ? 'skills'
              : parsed.frontmatter.category || (currentFolder.split('/')[0] as FileCategory),
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        importedFiles.push(fileObj);
        return fileObj;
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        console.error(`Error reading ${item.name} from Google Drive:`, err);
        failedPaths.add(filePath);
        return null;
      }
    });

    // 2. Scan child sub-directories in this directory
    const subDirs = await listAll<{ id: string; name: string }>(
      `${parentQuery} and mimeType = '${FOLDER_MIME}'`,
      'id,name',
    );
    for (const subDir of subDirs) {
      // Backup snapshots are stored in the vault folder but are not part of the vault itself
      if (!relativePath && subDir.name.trim().toLowerCase() === BACKUP_FOLDER_NAME) continue;
      // Normalize standard folder names if at top-level
      const childRelative = relativePath
        ? `${relativePath}/${subDir.name}`
        : normalizeTopLevelFolder(subDir.name);
      await scanDirectory(subDir.id, childRelative);
    }
  }

  await scanDirectory(rootId, '');

  return { files: importedFiles, failedPaths };
}

/**
 * Imports markdown files from the Google Drive 'Markdown Life Vault' folder, including nested sub-directories.
 */
export async function importFilesFromDrive(options: ImportDriveOptions = {}): Promise<VaultFile[]> {
  const { files } = await importVaultFromDrive(options);
  return files;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

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
  const folderId = await resolveDriveFolderId(projectPath, await getVaultRootId());

  // 1. Fetch folder metadata including webViewLink and owners
  const folderRes = await driveFetch(
    `files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink,owners(displayName,emailAddress)`,
  );
  const folderData = await folderRes.json();

  // 2. Fetch permissions list (paginated)
  const permissions: DrivePermission[] = [];
  let pageToken: string | undefined;
  do {
    let url =
      `files/${encodeURIComponent(folderId)}/permissions?pageSize=100` +
      `&fields=${encodeURIComponent('nextPageToken,permissions(id,type,role,emailAddress,displayName,photoLink)')}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const permRes = await driveFetch(url);
    const permData = await permRes.json();
    if (Array.isArray(permData.permissions)) permissions.push(...permData.permissions);
    pageToken = permData.nextPageToken || undefined;
  } while (pageToken);

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
  sendNotificationEmail: boolean = true,
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
  newRole: 'reader' | 'commenter' | 'writer',
): Promise<DrivePermission> {
  const res = await driveFetch(
    `files/${folderId}/permissions/${permissionId}?fields=id,role,emailAddress,displayName`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: newRole,
      }),
    },
  );

  return await res.json();
}

/**
 * Removes a collaborator's access from a project folder.
 */
export async function removeProjectPermission(
  folderId: string,
  permissionId: string,
): Promise<boolean> {
  await driveFetch(`files/${folderId}/permissions/${permissionId}`, {
    method: 'DELETE',
  });
  return true;
}

// ---------------------------------------------------------------------------
// Shared Google Docs (a note mirrored to a Google Doc that someone else edits in Docs)
// ---------------------------------------------------------------------------

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

export interface SharedDocMeta {
  id: string;
  name: string;
  /** Increments on every change to the doc (ours or theirs). */
  version: string;
  modifiedTime?: string;
  webViewLink?: string;
  trashed?: boolean;
}

const DOC_META_FIELDS = 'id,name,version,modifiedTime,webViewLink,trashed';

/** Returns the doc's metadata, or null when it no longer exists / is not accessible. */
export async function getSharedDocMeta(docId: string): Promise<SharedDocMeta | null> {
  try {
    const res = await driveFetch(`files/${encodeURIComponent(docId)}?fields=${DOC_META_FIELDS}`);
    return await res.json();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Exports a Google Doc as Markdown (Google converts headings, lists, tables, links, ...). */
export async function exportDocAsMarkdown(docId: string): Promise<string> {
  const res = await driveFetch(
    `files/${encodeURIComponent(docId)}/export?mimeType=${encodeURIComponent('text/markdown')}`,
  );
  return res.text();
}

/**
 * Creates a Google Doc from markdown in the note's vault folder. Drive converts the markdown
 * into native Docs formatting.
 */
export async function createSharedDoc(
  title: string,
  folder: string,
  markdown: string,
): Promise<SharedDocMeta> {
  const parentId = await resolveDriveFolderId(folder, await getVaultRootId());
  const boundary = `mdlife-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const metadata = { name: title, parents: [parentId], mimeType: GOOGLE_DOC_MIME };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n${markdown}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch(
    `${UPLOAD_API}files?uploadType=multipart&fields=${encodeURIComponent(DOC_META_FIELDS)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  return res.json();
}

/**
 * Replaces the whole content of a Google Doc with converted markdown.
 * (Drive can only replace a doc's content as a whole; Docs keeps the old one in version history.)
 */
export async function replaceSharedDocContent(
  docId: string,
  markdown: string,
): Promise<SharedDocMeta> {
  const res = await driveFetch(
    `${UPLOAD_API}files/${encodeURIComponent(docId)}?uploadType=media&fields=${encodeURIComponent(DOC_META_FIELDS)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: markdown,
    },
  );
  return res.json();
}

/** Lists the people a file (e.g. a shared doc) is shared with. */
export async function getFilePermissions(fileId: string): Promise<DrivePermission[]> {
  const res = await driveFetch(
    `files/${encodeURIComponent(fileId)}/permissions?fields=${encodeURIComponent(
      'permissions(id,type,role,emailAddress,displayName,photoLink)',
    )}`,
  );
  const data = await res.json();
  return Array.isArray(data.permissions) ? data.permissions : [];
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

/** Snapshot folder name for a date, e.g. "2026-10-20 14-32-05" (local time, sorts chronologically). */
export function backupSnapshotName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

/** Always creates a new folder (unlike getOrCreateFolder, which reuses a match). */
async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await driveFetch('files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return (await res.json()).id as string;
}

export interface BackupResult {
  snapshotName: string;
  snapshotFolderId: string;
  /** Path shown to the user, e.g. "backup/2026-10-20 14-32-05". */
  path: string;
  saved: number;
  failed: string[];
}

/**
 * Copies every file into a new snapshot folder: Markdown Life Vault/backup/<date time>/,
 * keeping the vault's folder structure. Uses the given (local, newest) content, so unsaved
 * edits are included. Existing files and earlier snapshots are never touched.
 */
export async function backupVaultToDrive(
  files: VaultFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<BackupResult> {
  const rootId = await getVaultRootId();
  const backupRootId = await getOrCreateFolder(BACKUP_FOLDER_NAME, rootId);
  const snapshotName = backupSnapshotName();
  const snapshotFolderId = await createFolder(snapshotName, backupRootId);

  // Create each sub-folder once (sequentially, so parents exist before children).
  const folderIds = new Map<string, string>([['', snapshotFolderId]]);
  const folderIdFor = async (folderPath: string): Promise<string> => {
    let current = '';
    let parentId = snapshotFolderId;
    for (const segment of folderPath.split('/').filter(Boolean)) {
      current = current ? `${current}/${segment}` : segment;
      let id = folderIds.get(current);
      if (!id) {
        id = await createFolder(segment, parentId);
        folderIds.set(current, id);
      }
      parentId = id;
    }
    return parentId;
  };
  for (const file of files) await folderIdFor(file.folder);

  let done = 0;
  const failed: string[] = [];
  await mapConcurrent(files, 5, async (file) => {
    try {
      await createFileWithContent(file.name, await folderIdFor(file.folder), file.content);
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      console.error(`Backup of ${file.path} failed:`, err);
      failed.push(file.path);
    }
    onProgress?.(++done, files.length);
    return null;
  });

  return {
    snapshotName,
    snapshotFolderId,
    path: `${BACKUP_FOLDER_NAME}/${snapshotName}`,
    saved: files.length - failed.length,
    failed,
  };
}
