/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { HardDrive, Plus, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { VaultFile, ActiveTab, FileCategory, DriveConnectionStatus } from './types';
import { loadVaultFiles, saveVaultFiles, loadUnsavedFileIds, saveUnsavedFileIds, getTemplateForCategory } from './utils/storage';
import { parseFrontmatter, toggleCheckboxInMarkdown, updateWikiLinks } from './utils/markdownParser';
import { initAuth, googleSignIn, logout, subscribeDriveStatus, testDriveConnection } from './utils/googleAuth';
import {
  saveFileToDrive,
  deleteFileFromDrive,
  renameFileInDrive,
  getVaultFolderHierarchy,
  importFilesFromDrive,
  syncAllFilesToDrive,
} from './utils/googleDrive';
import { VaultHeader } from './components/VaultHeader';
import { VaultSidebar } from './components/VaultSidebar';
import { MarkdownEditor } from './components/MarkdownEditor';
import { LifeMatrixView } from './components/LifeMatrixView';
import { AgentSkillsLab } from './components/AgentSkillsLab';
import { SkillPlaygroundModal } from './components/SkillPlaygroundModal';
import { NewFileModal } from './components/NewFileModal';
import { GoogleDriveSyncModal } from './components/GoogleDriveSyncModal';
import { ConfirmDriveActionModal } from './components/ConfirmDriveActionModal';
import { GoogleDriveStartScreen } from './components/GoogleDriveStartScreen';
import { ReloadFromDriveModal } from './components/ReloadFromDriveModal';

interface AppProps {
  forceOffline?: boolean;
}

export default function App({ forceOffline = false }: AppProps) {
  const isMockMode =
    forceOffline ||
    (typeof window !== 'undefined' &&
      (window.location.pathname.endsWith('mock.html') ||
        window.location.pathname.endsWith('/mock') ||
        window.location.search.includes('offline=true') ||
        window.location.search.includes('mock=true')));

  // If user is in mock mode or previously selected offline mode, load local storage files; otherwise start empty until auth
  const [files, setFiles] = useState<VaultFile[]>(() => {
    const bypassed = isMockMode || localStorage.getItem('md_vault_bypassed_auth') === 'true';
    return bypassed ? loadVaultFiles() : [];
  });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(() => {
    const bypassed = isMockMode || localStorage.getItem('md_vault_bypassed_auth') === 'true';
    if (bypassed) {
      const loaded = loadVaultFiles();
      return loaded.length > 0 ? loaded[0].id : null;
    }
    return null;
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [newFileInitialFolder, setNewFileInitialFolder] = useState<string>('goals');
  const [skillForPlayground, setSkillForPlayground] = useState<VaultFile | null>(null);

  // Google Drive & Auth State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus>('disconnected');
  const [unsavedFileIds, setUnsavedFileIds] = useState<Set<string>>(loadUnsavedFileIds);
  const [isReloadModalOpen, setIsReloadModalOpen] = useState(false);
  const [hasBypassedAuth, setHasBypassedAuth] = useState<boolean>(() => {
    if (isMockMode) return true;
    return localStorage.getItem('md_vault_bypassed_auth') === 'true';
  });
  const [isStartingSignIn, setIsStartingSignIn] = useState(false);
  const [startScreenError, setStartScreenError] = useState<string | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [confirmDriveFile, setConfirmDriveFile] = useState<VaultFile | null>(null);
  const [isSavingSingleFileToDrive, setIsSavingSingleFileToDrive] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [isRefreshingDrive, setIsRefreshingDrive] = useState(false);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const isFetchingDriveRef = useRef(false);

  // CRITICAL PERSISTENCE: Save unsavedFileIds to localStorage so dirty edits survive refresh
  useEffect(() => {
    saveUnsavedFileIds(unsavedFileIds);
  }, [unsavedFileIds]);

  // Subscribe to drive status updates
  useEffect(() => {
    const unsubscribe = subscribeDriveStatus((status, details) => {
      setDriveStatus(status);
      if (status === 'expired') {
        setToastNotification({
          type: 'error',
          text: details?.error || 'Google Drive session expired. Your recent edits are safely stored in your browser.',
        });
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetches files from Google Drive and safely merges them with local edits so work is never lost.
   */
  const fetchFilesFromDrive = useCallback(async (isSilent = false) => {
    if (isFetchingDriveRef.current) return;
    isFetchingDriveRef.current = true;

    try {
      setIsRefreshingDrive(true);
      if (!isSilent) setIsLoadingDriveFiles(true);
      const driveFiles = await importFilesFromDrive();

      // SMART RESILIENT MERGE:
      // Never overwrite files that have unsaved local edits or newer local timestamps
      setFiles((prevLocalFiles) => {
        const mergedMap = new Map<string, VaultFile>();
        // Add Drive files
        for (const df of driveFiles) {
          mergedMap.set(df.id, df);
        }

        const currentUnsaved = loadUnsavedFileIds();
        let preservedLocalCount = 0;

        for (const lf of prevLocalFiles) {
          const hasUnsaved = currentUnsaved.has(lf.id);
          const driveVersion = mergedMap.get(lf.id);

          if (hasUnsaved) {
            // Keep local version with unsaved changes
            mergedMap.set(lf.id, lf);
            preservedLocalCount++;
          } else if (driveVersion) {
            // If local version has a significantly newer updatedAt timestamp, preserve it
            if (lf.updatedAt && driveVersion.updatedAt && lf.updatedAt > driveVersion.updatedAt + 2000) {
              mergedMap.set(lf.id, lf);
              setUnsavedFileIds((prev) => new Set(prev).add(lf.id));
              preservedLocalCount++;
            }
          } else if (currentUnsaved.has(lf.id)) {
            // File created locally while offline
            mergedMap.set(lf.id, lf);
            preservedLocalCount++;
          }
        }

        const finalMerged = Array.from(mergedMap.values());
        saveVaultFiles(finalMerged);

        if (preservedLocalCount > 0 && !isSilent) {
          setToastNotification({
            type: 'info',
            text: `Synced with Google Drive (${driveFiles.length} file(s)). Safely preserved ${preservedLocalCount} local file(s) with newer edits.`,
          });
        }

        return finalMerged;
      });

      if (driveFiles.length > 0) {
        setSelectedFileId((prev) => {
          return prev || driveFiles[0].id;
        });
        if (!isSilent) {
          setToastNotification({
            type: 'success',
            text: `Synced with Google Drive: loaded ${driveFiles.length} file(s).`,
          });
        }
      } else {
        setSelectedFileId((prev) => prev);
        if (!isSilent) {
          setToastNotification({
            type: 'info',
            text: 'Google Drive connected: 0 files in /Markdown Life Vault/.',
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to load files from Google Drive:', err);
      const isAuthErr =
        err?.message?.includes('401') ||
        err?.message?.includes('expired') ||
        err?.message?.includes('authenticated');
      if (isAuthErr) {
        setDriveStatus('expired');
      }
      setToastNotification({
        type: 'error',
        text: err?.message || 'Failed to load files from Google Drive',
      });
    } finally {
      isFetchingDriveRef.current = false;
      setIsRefreshingDrive(false);
      setIsLoadingDriveFiles(false);
    }
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    if (isMockMode) {
      // In offline mock mode, skip Google Drive auto-fetch to maintain local state
      return;
    }
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
        setHasBypassedAuth(false);
        setDriveStatus('connected');
        // Automatically load ONLY files that exist in Google Drive
        fetchFilesFromDrive(false);
      },
      () => {
        setGoogleUser(null);
        setDriveStatus('disconnected');
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchFilesFromDrive, isMockMode]);

  // Periodic and on-focus proactive Google Drive connection health check
  useEffect(() => {
    if (!googleUser || isMockMode) return;

    // Check connection every 3 minutes
    const interval = setInterval(() => {
      testDriveConnection();
    }, 3 * 60 * 1000);

    const onFocus = () => {
      testDriveConnection();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [googleUser, isMockMode]);

  // One-time banner when opening in mock mode
  useEffect(() => {
    if (isMockMode) {
      setToastNotification({
        type: 'info',
        text: 'Explore Offline: Running in local mock mode with sample files.',
      });
    }
  }, [isMockMode]);

  // Toast notification auto-dismiss
  useEffect(() => {
    if (toastNotification) {
      const timer = setTimeout(() => {
        setToastNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  // CRITICAL SAFETY: ALWAYS backup files to browser localStorage so edits are NEVER lost
  useEffect(() => {
    if (files.length > 0) {
      saveVaultFiles(files);
    }
  }, [files]);

  // Currently active file object
  const currentFile = files.find((f) => f.id === selectedFileId) || files[0] || null;

  // Auto-save edited file to Google Drive (debounced by 1.2s)
  useEffect(() => {
    if (!googleUser || !currentFile) return;
    if (!unsavedFileIds.has(currentFile.id)) return;

    const timer = setTimeout(async () => {
      try {
        setIsDriveSyncing(true);
        await saveFileToDrive(currentFile);
        // Successfully saved to Google Drive: remove from unsaved list
        setUnsavedFileIds((prev) => {
          const next = new Set(prev);
          next.delete(currentFile.id);
          return next;
        });
      } catch (err: any) {
        console.error('Auto-save to Google Drive error:', err);
        const isAuthErr =
          err?.message?.includes('401') ||
          err?.message?.includes('expired') ||
          err?.message?.includes('authenticated');

        if (isAuthErr) {
          setDriveStatus('expired');
          setToastNotification({
            type: 'error',
            text: 'Google Drive connection expired. Your edits are safely preserved locally in browser storage. Click Reconnect to sync.',
          });
        } else {
          setToastNotification({
            type: 'error',
            text: `Drive auto-sync issue (${err?.message || 'network'}). Edits preserved locally.`,
          });
        }
      } finally {
        setIsDriveSyncing(false);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentFile?.content, googleUser, unsavedFileIds]);

  // Handle content updates to current file
  const handleUpdateContent = (newContent: string) => {
    if (!currentFile) return;
    const { frontmatter } = parseFrontmatter(newContent);
    const updated: VaultFile = {
      ...currentFile,
      content: newContent,
      frontmatter,
      updatedAt: Date.now(),
    };

    // Mark as having unsaved local changes pending Drive sync
    setUnsavedFileIds((prev) => new Set(prev).add(currentFile.id));

    setFiles((prev) => {
      const next = prev.map((f) => (f.id === currentFile.id ? updated : f));
      saveVaultFiles(next);
      return next;
    });
  };

  // Toggle a checkbox in the active file
  const handleToggleCheckbox = (taskIndex: number) => {
    if (!currentFile) return;
    const newContent = toggleCheckboxInMarkdown(currentFile.content, taskIndex);
    handleUpdateContent(newContent);
  };

  // Navigate to another file (e.g. from wiki-link or relation card)
  const handleNavigateToFile = (query: string) => {
    const cleanQuery = query.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();
    const found = files.find((f) => {
      const matchName = f.name.toLowerCase() === cleanQuery || f.name.toLowerCase() === `${cleanQuery}.md`;
      const matchPath = f.path.toLowerCase() === cleanQuery;
      const matchTitle = f.frontmatter.title?.toLowerCase() === cleanQuery;
      return matchName || matchPath || matchTitle;
    });

    if (found) {
      setSelectedFileId(found.id);
      setActiveTab('editor');
    }
  };

  // Create new file
  const handleCreateFile = async (folder: string, filename: string, title: string) => {
    const category: FileCategory =
      folder === 'goals' || folder.startsWith('goals/')
        ? 'goals'
        : folder === 'projects' || folder.startsWith('projects/')
        ? 'projects'
        : folder === 'skills' || folder.startsWith('skills/')
        ? 'skills'
        : folder === 'notes' || folder.startsWith('notes/')
        ? 'notes'
        : folder === 'archive' || folder.startsWith('archive/')
        ? 'archive'
        : 'custom';

    const content = getTemplateForCategory(category, title);
    const { frontmatter } = parseFrontmatter(content);
    const cleanName = filename.endsWith('.md') ? filename : `${filename}.md`;
    const path = `${folder}/${cleanName}`;

    const newFile: VaultFile = {
      id: path,
      name: cleanName,
      path,
      folder,
      content,
      frontmatter,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (googleUser) {
      try {
        setIsSavingSingleFileToDrive(true);
        await saveFileToDrive(newFile);
        setFiles((prev) => [newFile, ...prev]);
        setSelectedFileId(newFile.id);
        setActiveTab('editor');
        setToastNotification({
          type: 'success',
          text: `Created and saved "${cleanName}" directly to Google Drive!`,
        });
      } catch (err: any) {
        console.error('Error saving new file to Google Drive:', err);
        setFiles((prev) => [newFile, ...prev]);
        setUnsavedFileIds((prev) => new Set(prev).add(newFile.id));
        setSelectedFileId(newFile.id);
        setActiveTab('editor');
        setToastNotification({
          type: 'error',
          text: `Failed to create file in Google Drive (${err?.message || 'error'}). File saved locally.`,
        });
      } finally {
        setIsSavingSingleFileToDrive(false);
      }
    } else {
      setFiles((prev) => [newFile, ...prev]);
      setSelectedFileId(newFile.id);
      setActiveTab('editor');
    }
  };

  // Delete file
  const handleDeleteFile = async (id: string) => {
    const fileToDelete = files.find((f) => f.id === id);
    if (!fileToDelete) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${fileToDelete.name}"?`);
    if (!confirmed) return;

    if (googleUser) {
      try {
        await deleteFileFromDrive(fileToDelete.folder, fileToDelete.name);
        setToastNotification({
          type: 'info',
          text: `Deleted "${fileToDelete.name}" from Google Drive.`,
        });
      } catch (err: any) {
        console.error('Failed to delete file from Google Drive:', err);
        setToastNotification({
          type: 'error',
          text: `Failed to delete from Drive: ${err?.message}`,
        });
      }
    }

    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) {
      const remaining = files.filter((f) => f.id !== id);
      setSelectedFileId(remaining[0]?.id || null);
    }
  };

  // Rename file
  const handleRenameFile = async (id: string, rawNewName: string): Promise<boolean> => {
    const fileToRename = files.find((f) => f.id === id);
    if (!fileToRename) return false;

    // Sanitize filename
    let cleanName = rawNewName.trim().replace(/[/\\]/g, '');
    if (!cleanName) return false;
    if (!cleanName.endsWith('.md')) {
      cleanName = `${cleanName}.md`;
    }

    // If identical, no-op
    if (cleanName === fileToRename.name) {
      return true;
    }

    // Check collision in same folder
    const collision = files.find(
      (f) =>
        f.folder === fileToRename.folder &&
        f.name.toLowerCase() === cleanName.toLowerCase() &&
        f.id !== id
    );
    if (collision) {
      setToastNotification({
        type: 'error',
        text: `A file named "${cleanName}" already exists in /${fileToRename.folder}.`,
      });
      return false;
    }

    const oldName = fileToRename.name;
    const newPath = `${fileToRename.folder}/${cleanName}`;
    const newId = newPath;

    const renamedFile: VaultFile = {
      ...fileToRename,
      id: newId,
      name: cleanName,
      path: newPath,
      updatedAt: Date.now(),
    };

    if (googleUser) {
      try {
        const renamed = await renameFileInDrive(fileToRename.folder, oldName, cleanName);
        if (!renamed) {
          // If PATCH failed to locate the old file, save as new and delete old
          await saveFileToDrive(renamedFile);
          await deleteFileFromDrive(fileToRename.folder, oldName);
        }
        setToastNotification({
          type: 'success',
          text: `Renamed to "${cleanName}" in Google Drive!`,
        });
      } catch (err: any) {
        console.error('Failed to rename file in Google Drive:', err);
        setToastNotification({
          type: 'error',
          text: `Failed to rename in Google Drive: ${err?.message}`,
        });
        return false;
      }
    } else {
      setToastNotification({
        type: 'success',
        text: `Renamed to "${cleanName}".`,
      });
    }

    // Update the file and update any [[wiki-links]] referencing the old file in all other files
    const filesToSync: VaultFile[] = [];
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          return renamedFile;
        }

        const updatedContent = updateWikiLinks(f.content, oldName, cleanName);
        if (updatedContent !== f.content) {
          const updatedFile: VaultFile = {
            ...f,
            content: updatedContent,
            updatedAt: Date.now(),
          };
          if (googleUser) {
            filesToSync.push(updatedFile);
          }
          return updatedFile;
        }

        return f;
      })
    );

    // If other files had wiki-links updated and user is connected to Drive, sync them
    if (googleUser && filesToSync.length > 0) {
      for (const updatedF of filesToSync) {
        try {
          await saveFileToDrive(updatedF);
        } catch (err) {
          console.error(`Failed to update wiki-links in Drive file ${updatedF.name}:`, err);
        }
      }
    }

    if (selectedFileId === id) {
      setSelectedFileId(newId);
    }

    return true;
  };

  // Duplicate file
  const handleDuplicateFile = async (file: VaultFile) => {
    const copyName = file.name.replace(/\.md$/, '') + '-copy.md';
    const copyPath = `${file.folder}/${copyName}`;
    const duplicate: VaultFile = {
      ...file,
      id: copyPath,
      name: copyName,
      path: copyPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (googleUser) {
      try {
        await saveFileToDrive(duplicate);
        setFiles((prev) => [duplicate, ...prev]);
        setSelectedFileId(duplicate.id);
        setToastNotification({
          type: 'success',
          text: `Duplicated "${copyName}" in Google Drive.`,
        });
      } catch (err: any) {
        console.error('Error duplicating file in Google Drive:', err);
      }
    } else {
      setFiles((prev) => [duplicate, ...prev]);
      setSelectedFileId(duplicate.id);
    }
  };

  // Import markdown files
  const handleImportFiles = async (fileList: FileList) => {
    const imported: VaultFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const item = fileList[i];
      if (item.name.endsWith('.md') || item.name.endsWith('.markdown') || item.type.includes('markdown')) {
        const text = await item.text();
        const { frontmatter } = parseFrontmatter(text);
        const folder = frontmatter.category || 'notes';
        const path = `${folder}/${item.name}`;

        const vaultFile: VaultFile = {
          id: path,
          name: item.name,
          path,
          folder,
          content: text,
          frontmatter,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        if (googleUser) {
          try {
            await saveFileToDrive(vaultFile);
          } catch (err) {
            console.error(`Failed to save imported file ${item.name} to Drive:`, err);
          }
        }

        imported.push(vaultFile);
      }
    }

    if (imported.length > 0) {
      if (googleUser) {
        await fetchFilesFromDrive();
      } else {
        setFiles((prev) => [...imported, ...prev]);
        setSelectedFileId(imported[0].id);
        setActiveTab('editor');
      }
    }
  };

  // Initialize Starter Templates in Google Drive
  const handleInitializeDriveTemplates = async () => {
    const ok = window.confirm(
      'This will upload the standard Markdown Life Vault starter files (Goals, Projects, Skills, Notes) into your Google Drive (/Markdown Life Vault/). Proceed?'
    );
    if (!ok) return;

    try {
      setIsRefreshingDrive(true);
      const starterFiles = loadVaultFiles();
      await syncAllFilesToDrive(starterFiles);
      await fetchFilesFromDrive(false);
      setToastNotification({
        type: 'success',
        text: `Initialized ${starterFiles.length} starter files in your Google Drive!`,
      });
    } catch (err: any) {
      console.error('Failed to initialize starter files in Drive:', err);
      setToastNotification({
        type: 'error',
        text: `Error initializing Google Drive templates: ${err?.message}`,
      });
    } finally {
      setIsRefreshingDrive(false);
    }
  };

  // Reset to defaults
  const handleResetVault = () => {
    if (googleUser) {
      handleInitializeDriveTemplates();
    } else {
      const ok = window.confirm(
        'Reset vault to initial template files? Any unsaved edits will be overwritten.'
      );
      if (!ok) return;
      localStorage.removeItem('md_life_vault_v1');
      const fresh = loadVaultFiles();
      setFiles(fresh);
      setSelectedFileId(fresh[0]?.id || null);
    }
  };

  const handleOpenNewFileInFolder = (folder: string) => {
    setNewFileInitialFolder(folder);
    setIsNewFileModalOpen(true);
  };

  // Google Drive Auth Handlers
  const handleSignInWithGoogle = async () => {
    try {
      setIsStartingSignIn(true);
      setStartScreenError(null);
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setHasBypassedAuth(false);
        localStorage.removeItem('md_vault_bypassed_auth');
        // Unblock start screen immediately so workspace opens in ~1 second
        setIsStartingSignIn(false);
        fetchFilesFromDrive(false);
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setStartScreenError(err?.message || 'Failed to sign in with Google');
      throw err;
    } finally {
      setIsStartingSignIn(false);
    }
  };

  const handleTestDriveConnection = async () => {
    setToastNotification({
      type: 'info',
      text: 'Verifying Google Drive connection and write authorization...',
    });
    try {
      const result = await testDriveConnection();
      if (result.ok) {
        setToastNotification({
          type: 'success',
          text: `Google Drive connection verified! Active and ready to sync (${result.email || googleUser?.email || 'Authenticated'}).`,
        });
      } else {
        setToastNotification({
          type: 'error',
          text: `Drive connection issue: ${result.error || 'Token expired'}. Please click Reconnect.`,
        });
      }
    } catch (err: any) {
      setToastNotification({
        type: 'error',
        text: `Error verifying connection: ${err?.message || 'Network error'}`,
      });
    }
  };

  const handleSignOutGoogle = async () => {
    await logout();
    setGoogleUser(null);
    setHasBypassedAuth(false);
    localStorage.removeItem('md_vault_bypassed_auth');
    setFiles([]);
    setSelectedFileId(null);
    setToastNotification({
      type: 'info',
      text: 'Disconnected from Google account.',
    });
  };

  const handleContinueOffline = () => {
    setHasBypassedAuth(true);
    localStorage.setItem('md_vault_bypassed_auth', 'true');
    const localFiles = loadVaultFiles();
    setFiles(localFiles);
    setSelectedFileId(localFiles[0]?.id || null);
    setToastNotification({
      type: 'info',
      text: 'Using local storage mode. Connect Google Drive anytime from the top bar.',
    });
  };

  const handleRequestSaveFileToDrive = (file: VaultFile) => {
    if (!googleUser) {
      setIsDriveModalOpen(true);
      return;
    }
    setConfirmDriveFile(file);
  };

  const handleConfirmedSaveFileToDrive = async () => {
    if (!confirmDriveFile) return;
    const target = confirmDriveFile;
    setConfirmDriveFile(null);
    try {
      setIsSavingSingleFileToDrive(true);
      const { folderMap, rootId } = await getVaultFolderHierarchy();
      const folderId = folderMap[target.folder] || rootId;
      const result = await saveFileToDrive(target, folderId);
      // Remove from unsaved local edits
      setUnsavedFileIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setToastNotification({
        type: 'success',
        text: result.isNew
          ? `Created "${target.name}" in Google Drive (/Markdown Life Vault/${target.folder})!`
          : `Updated "${target.name}" in Google Drive (/Markdown Life Vault/${target.folder})!`,
      });
    } catch (err: any) {
      console.error('Failed to save file to Google Drive:', err);
      const isAuthErr =
        err?.message?.includes('401') ||
        err?.message?.includes('expired') ||
        err?.message?.includes('authenticated');
      if (isAuthErr) {
        setDriveStatus('expired');
      }
      setToastNotification({
        type: 'error',
        text: err?.message || `Failed to save ${target.name} to Google Drive`,
      });
    } finally {
      setIsSavingSingleFileToDrive(false);
    }
  };

  // Reconnect Google Drive and push any pending unsaved local edits
  const handleReconnectDrive = async () => {
    try {
      setIsStartingSignIn(true);
      const res = await googleSignIn();
      if (res?.user) {
        setGoogleUser(res.user);
        setDriveStatus('connected');

        // Immediately push any pending unsaved files to Google Drive
        const filesToSync = files.filter((f) => unsavedFileIds.has(f.id));
        if (filesToSync.length > 0) {
          setIsDriveSyncing(true);
          let syncedCount = 0;
          for (const unsavedF of filesToSync) {
            try {
              await saveFileToDrive(unsavedF);
              syncedCount++;
              setUnsavedFileIds((prev) => {
                const next = new Set(prev);
                next.delete(unsavedF.id);
                return next;
              });
            } catch (err) {
              console.error(`Failed to push unsaved file ${unsavedF.name}:`, err);
            }
          }
          setToastNotification({
            type: 'success',
            text: `Reconnected to Google Drive! Saved ${syncedCount} pending local file(s).`,
          });
        } else {
          setToastNotification({
            type: 'success',
            text: 'Reconnected to Google Drive successfully.',
          });
        }
      }
    } catch (err: any) {
      console.error('Reconnect failed:', err);
      setToastNotification({
        type: 'error',
        text: `Reconnection failed: ${err?.message || 'Check popup permissions'}`,
      });
    } finally {
      setIsStartingSignIn(false);
      setIsDriveSyncing(false);
    }
  };

  // Reload from Google Drive flow
  const handleRequestReloadFromDrive = async () => {
    if (driveStatus === 'expired') {
      setToastNotification({
        type: 'error',
        text: 'Google Drive connection is expired. Reconnecting first...',
      });
      await handleReconnectDrive();
      return;
    }

    const unsavedList = files.filter((f) => unsavedFileIds.has(f.id));
    if (unsavedList.length > 0) {
      setIsReloadModalOpen(true);
      return;
    }

    await executeReloadFromDrive();
  };

  const executeReloadFromDrive = async () => {
    setIsReloadModalOpen(false);
    setToastNotification({
      type: 'info',
      text: 'Checking connection & reloading files from Google Drive...',
    });

    const health = await testDriveConnection();
    if (!health.ok) {
      setToastNotification({
        type: 'error',
        text: `Drive connection issue: ${health.error}. Please reconnect.`,
      });
      return;
    }

    await fetchFilesFromDrive(false);
  };

  const handleSaveAndReloadFromDrive = async () => {
    setIsReloadModalOpen(false);
    setIsRefreshingDrive(true);
    try {
      const unsavedList = files.filter((f) => unsavedFileIds.has(f.id));
      for (const f of unsavedList) {
        await saveFileToDrive(f);
      }
      setUnsavedFileIds(new Set());
      setToastNotification({
        type: 'success',
        text: `Saved ${unsavedList.length} local file(s) to Drive. Reloading fresh index...`,
      });
      await fetchFilesFromDrive(false);
    } catch (err: any) {
      setToastNotification({
        type: 'error',
        text: `Failed to save local edits before reload: ${err?.message}`,
      });
    } finally {
      setIsRefreshingDrive(false);
    }
  };

  const handleDiscardAndReloadFromDrive = async () => {
    setIsReloadModalOpen(false);
    setUnsavedFileIds(new Set());
    await executeReloadFromDrive();
  };

  // If user is not signed in to Google Drive and hasn't chosen offline exploration, show start screen
  if (!isMockMode && !googleUser && !hasBypassedAuth) {
    return (
      <GoogleDriveStartScreen
        onSignIn={handleSignInWithGoogle}
        onContinueOffline={handleContinueOffline}
        isSigningIn={isStartingSignIn}
        errorMessage={startScreenError}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-stone-100 text-stone-900 overflow-hidden font-sans antialiased">
      {/* Top Vault Header */}
      <VaultHeader
        files={files}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewFileModal={() => {
          setNewFileInitialFolder('goals');
          setIsNewFileModalOpen(true);
        }}
        onImportFiles={handleImportFiles}
        onResetVault={handleResetVault}
        isExportingZip={isExportingZip}
        setIsExportingZip={setIsExportingZip}
        googleUser={googleUser}
        driveStatus={driveStatus}
        unsavedFilesCount={unsavedFileIds.size}
        onOpenDriveModal={() => setIsDriveModalOpen(true)}
        onRefreshDrive={handleRequestReloadFromDrive}
        onReconnectDrive={handleReconnectDrive}
        onTestConnection={handleTestDriveConnection}
        isRefreshingDrive={isRefreshingDrive}
        isMockMode={isMockMode}
      />

      {/* Floating Notification Toast */}
      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-70 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-3 rounded-xl border shadow-lg text-xs font-medium max-w-sm flex items-center gap-2.5 ${
              toastNotification.type === 'success'
                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                : toastNotification.type === 'error'
                ? 'bg-red-900 text-red-100 border-red-700'
                : 'bg-stone-900 text-stone-100 border-stone-700'
            }`}
          >
            <span>{toastNotification.text}</span>
            <button
              type="button"
              onClick={() => setToastNotification(null)}
              className="ml-auto opacity-70 hover:opacity-100 text-sm font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* TAB 1: Editor View */}
        {activeTab === 'editor' && (
          <div className="flex-1 flex overflow-hidden w-full">
            {/* Folder / File Explorer Sidebar */}
            <VaultSidebar
              files={files}
              selectedFileId={selectedFileId}
              onSelectFile={(id) => setSelectedFileId(id)}
              onDeleteFile={handleDeleteFile}
              onDuplicateFile={handleDuplicateFile}
              onRenameFile={handleRenameFile}
              onQuickNewFileInFolder={handleOpenNewFileInFolder}
              onDropFiles={handleImportFiles}
            />

            {/* Markdown Editor / Loading / Empty State */}
            {isLoadingDriveFiles ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-white text-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                <h3 className="text-base font-semibold text-stone-800">Reading Google Drive Vault...</h3>
                <p className="text-xs text-stone-500 mt-1">Scanning folder: /Markdown Life Vault/</p>
              </div>
            ) : files.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-50/50 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 shadow-xs">
                  <HardDrive className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-stone-900 mb-2">
                  {googleUser ? 'Your Google Drive Vault is Empty' : 'Your Vault is Empty'}
                </h2>
                <p className="text-sm text-stone-600 max-w-md mb-6 leading-relaxed">
                  {googleUser
                    ? 'Connected to Google Drive, but no markdown (.md) files were found in your "/Markdown Life Vault/" folder. You can create your first file or populate it with starter templates.'
                    : 'No files are currently loaded. Create your first file or initialize starter templates.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    id="btn-empty-new-file"
                    onClick={() => {
                      setNewFileInitialFolder('goals');
                      setIsNewFileModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Create First File
                  </button>

                  {googleUser && (
                    <button
                      type="button"
                      id="btn-empty-init-templates"
                      onClick={handleInitializeDriveTemplates}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      Initialize Starter Templates in Drive
                    </button>
                  )}

                  {googleUser && (
                    <button
                      type="button"
                      id="btn-empty-refresh-drive"
                      onClick={handleRequestReloadFromDrive}
                      disabled={isRefreshingDrive}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDrive ? 'animate-spin text-blue-600' : ''}`} />
                      Reload from Drive
                    </button>
                  )}
                </div>
              </div>
            ) : currentFile ? (
              <MarkdownEditor
                file={currentFile}
                allFiles={files}
                onChangeContent={handleUpdateContent}
                onNavigateToFile={handleNavigateToFile}
                onToggleCheckbox={handleToggleCheckbox}
                onOpenSkillPlayground={(s) => setSkillForPlayground(s)}
                onRenameFile={handleRenameFile}
                onSaveToDrive={isMockMode ? undefined : handleRequestSaveFileToDrive}
                isSavingToDrive={isSavingSingleFileToDrive}
                isDriveSyncing={isDriveSyncing}
                driveStatus={driveStatus}
                isUnsavedToDrive={currentFile ? unsavedFileIds.has(currentFile.id) : false}
                onReconnectDrive={handleReconnectDrive}
                googleUser={googleUser}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white text-stone-400">
                Select a file from the vault sidebar
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Life Matrix View */}
        {activeTab === 'matrix' && (
          <LifeMatrixView
            files={files}
            onSelectFile={(id) => {
              setSelectedFileId(id);
              setActiveTab('editor');
            }}
            onOpenSkillPlayground={(s) => setSkillForPlayground(s)}
            onQuickNewFileInFolder={handleOpenNewFileInFolder}
          />
        )}

        {/* TAB 3: Agent Skills Lab View */}
        {activeTab === 'skills-hub' && (
          <AgentSkillsLab
            files={files}
            onSelectFile={(id) => {
              setSelectedFileId(id);
              setActiveTab('editor');
            }}
            onOpenSkillPlayground={(s) => setSkillForPlayground(s)}
            onQuickNewFileInFolder={handleOpenNewFileInFolder}
          />
        )}
      </div>

      {/* New File Modal */}
      {isNewFileModalOpen && (
        <NewFileModal
          initialFolder={newFileInitialFolder}
          existingFolders={Array.from(new Set(files.map((f) => f.folder)))}
          onClose={() => setIsNewFileModalOpen(false)}
          onCreateFile={handleCreateFile}
        />
      )}

      {/* Skill Playground Modal */}
      {skillForPlayground && (
        <SkillPlaygroundModal
          skill={skillForPlayground}
          onClose={() => setSkillForPlayground(null)}
        />
      )}

      {/* Google Drive Auth & Sync Modal */}
      {!isMockMode && (
        <GoogleDriveSyncModal
          isOpen={isDriveModalOpen}
          onClose={() => setIsDriveModalOpen(false)}
          user={googleUser}
          onSignInWithGoogle={handleSignInWithGoogle}
          onSignOut={handleSignOutGoogle}
          files={files}
          onImportFilesFromDrive={() => fetchFilesFromDrive(false)}
        />
      )}

      {/* Explicit User Confirmation for Single File Save to Drive */}
      {confirmDriveFile && (
        <ConfirmDriveActionModal
          isOpen={!!confirmDriveFile}
          onClose={() => setConfirmDriveFile(null)}
          onConfirm={handleConfirmedSaveFileToDrive}
          file={confirmDriveFile}
        />
      )}

      {/* Safety Modal when reloading from Drive while unsaved local changes exist */}
      <ReloadFromDriveModal
        isOpen={isReloadModalOpen}
        onClose={() => setIsReloadModalOpen(false)}
        unsavedFiles={files.filter((f) => unsavedFileIds.has(f.id))}
        onSaveAndReload={handleSaveAndReloadFromDrive}
        onDiscardAndReload={handleDiscardAndReloadFromDrive}
        isProcessing={isRefreshingDrive}
      />
    </div>
  );
}
