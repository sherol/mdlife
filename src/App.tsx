import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { HardDrive, Plus, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { VaultFile, ActiveTab, FileCategory, DriveConnectionStatus } from './types';
import {
  loadVaultFiles,
  loadUnsavedFileIds,
  saveUnsavedFileIds,
  scheduleSaveVaultFiles,
  clearVaultCache,
  clearAllVaultStorage,
  loadBypassedAuth,
  saveBypassedAuth,
  getTemplateForCategory,
} from './utils/storage';
import { parseFrontmatter, toggleCheckboxInMarkdown, updateWikiLinks } from './utils/markdownParser';
import { initAuth, googleSignIn, logout, subscribeDriveStatus, testDriveConnection } from './utils/googleAuth';
import { renameFileInDrive, syncAllFilesToDrive, resetDriveCaches } from './utils/googleDrive';
import { isDriveSyncDisabled } from './utils/storageKeys';
import { getInitialVaultFiles } from './data/initialVault';
import { useRefState } from './hooks/useRefState';
import { useDriveSync, SyncSummary } from './hooks/useDriveSync';
import { VaultHeader } from './components/VaultHeader';
import { VaultSidebar } from './components/VaultSidebar';
import { MarkdownEditor } from './components/MarkdownEditor';
import { LifeMatrixView } from './components/LifeMatrixView';
import { AgentSkillsLab } from './components/AgentSkillsLab';
import { SkillPlaygroundModal } from './components/SkillPlaygroundModal';
import { NewFileModal } from './components/NewFileModal';
import { GoogleDriveSyncModal } from './components/GoogleDriveSyncModal';
import { GoogleDriveStartScreen } from './components/GoogleDriveStartScreen';
import { ReloadFromDriveModal } from './components/ReloadFromDriveModal';
import { ShareProjectModal } from './components/ShareProjectModal';
import { DeleteFileModal } from './components/DeleteFileModal';

interface AppProps {
  forceOffline?: boolean;
}

export default function App({ forceOffline = false }: AppProps) {
  // Mock mode is detected (and its storage namespace isolated) before init in utils/storageKeys.
  const isMockMode = forceOffline || isDriveSyncDisabled();

  // Instant Startup: Load cached files immediately so editor is ready with zero delay.
  // files/unsavedFileIds are mirrored into refs so the async Drive sync queue always reads the latest state.
  const [files, updateFiles, filesRef] = useRefState<VaultFile[]>(loadVaultFiles);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(() => filesRef.current[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [newFileInitialFolder, setNewFileInitialFolder] = useState<string>('goals');
  const [skillForPlayground, setSkillForPlayground] = useState<VaultFile | null>(null);
  const [sharingProjectFolder, setSharingProjectFolder] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<VaultFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // Google Drive & Auth State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveConnectionStatus>('disconnected');
  const [unsavedFileIds, updateUnsaved, unsavedRef] = useRefState<Set<string>>(loadUnsavedFileIds);
  const [isReloadModalOpen, setIsReloadModalOpen] = useState(false);
  const [hasBypassedAuth, setHasBypassedAuth] = useState<boolean>(() => isMockMode || loadBypassedAuth());
  const [isStartingSignIn, setIsStartingSignIn] = useState(false);
  const [startScreenError, setStartScreenError] = useState<string | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isSavingSingleFileToDrive, setIsSavingSingleFileToDrive] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  // Mock edits can never reach Drive: the sync queue is disabled (and driveFetch refuses in mock mode).
  const isDriveEnabled = !!googleUser && !isMockMode;

  const {
    isDriveSyncing,
    isRefreshingDrive,
    setIsRefreshingDrive,
    isLoadingDriveFiles,
    markUnsaved,
    flushSaves,
    deleteFromDrive,
    discardLocalChanges,
    resetSyncState,
    refreshFromDrive: fetchFilesFromDrive,
    mergeImportedFiles,
  } = useDriveSync({
    enabled: isDriveEnabled,
    driveStatus,
    setDriveStatus,
    files,
    filesRef,
    updateFiles,
    unsavedFileIds,
    unsavedRef,
    updateUnsaved,
    setSelectedFileId,
    notify: setToastNotification,
  });

  // CRITICAL PERSISTENCE: Save unsavedFileIds to localStorage so dirty edits survive refresh
  useEffect(() => {
    saveUnsavedFileIds(unsavedFileIds);
  }, [unsavedFileIds]);

  // CRITICAL SAFETY: back up files to browser localStorage (debounced) so edits are never lost
  useEffect(() => {
    if (files.length > 0) {
      scheduleSaveVaultFiles(files);
    }
  }, [files]);

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

  // Initialize Firebase Auth listener
  useEffect(() => {
    if (isMockMode) {
      // In offline mock mode, never touch Google auth / Drive
      return;
    }
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setHasBypassedAuth(false);
        if (token) {
          setDriveStatus('connected');
          // Automatically load files from Google Drive (merged with any unsaved local edits)
          fetchFilesFromDrive(false);
        } else {
          setDriveStatus('expired');
        }
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

  // Currently active file object
  const currentFile = files.find((f) => f.id === selectedFileId) || files[0] || null;

  /** Toast describing the outcome of a Drive flush. */
  const notifySyncSummary = useCallback((summary: SyncSummary, prefix: string) => {
    if (summary.authFailed) return; // the sync queue already showed the "session expired" toast
    const parts = [`${prefix} ${summary.saved} file(s) to Google Drive`];
    if (summary.conflicts > 0) parts.push(`${summary.conflicts} conflict(s) kept as "(conflict)" copies`);
    if (summary.failed > 0) parts.push(`${summary.failed} failed`);
    if (summary.skipped > 0) parts.push(`${summary.skipped} waiting for connection`);
    setToastNotification({
      type: summary.failed > 0 || summary.skipped > 0 ? 'error' : 'success',
      text: `${parts.join(', ')}.`,
    });
  }, []);

  // Handle content updates to current file
  const handleUpdateContent = (newContent: string) => {
    if (!currentFile) return;
    const targetId = currentFile.id;
    const { frontmatter } = parseFrontmatter(newContent);

    updateFiles((prev) =>
      prev.map((f) =>
        f.id === targetId ? { ...f, content: newContent, frontmatter, updatedAt: Date.now() } : f
      )
    );
    // Mark as having unsaved local changes pending Drive sync
    markUnsaved([targetId]);
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

    updateFiles((prev) => [newFile, ...prev.filter((f) => f.id !== newFile.id)]);
    markUnsaved([newFile.id]);
    setSelectedFileId(newFile.id);
    setActiveTab('editor');

    if (isDriveEnabled) {
      try {
        setIsSavingSingleFileToDrive(true);
        const summary = await flushSaves([newFile.id]);
        if (summary.saved > 0) {
          setToastNotification({
            type: 'success',
            text: `Created and saved "${cleanName}" directly to Google Drive!`,
          });
        } else if (!summary.authFailed) {
          setToastNotification({
            type: 'error',
            text: `Could not save "${cleanName}" to Google Drive yet. File saved locally and will sync automatically.`,
          });
        }
      } finally {
        setIsSavingSingleFileToDrive(false);
      }
    }
  };

  // Request to delete a file (opens modal dialog without window.confirm)
  const handleDeleteFile = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (!target) return;
    setFileToDelete(target);
  };

  // Confirm and execute file deletion
  const handleConfirmDeleteFile = async () => {
    if (!fileToDelete) return;
    const target = fileToDelete;
    setIsDeletingFile(true);

    try {
      // Remove locally first; the Drive deletion runs now or is queued (persisted) and retried on reconnect.
      const nextFiles = filesRef.current.filter((f) => f.id !== target.id && f.path !== target.path);
      updateFiles(() => nextFiles);
      updateUnsaved((prev) => {
        if (!prev.has(target.id)) return prev;
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });

      // Update active selection if deleted file was open
      if (selectedFileId === target.id) {
        setSelectedFileId(nextFiles[0]?.id || null);
      }

      if (isDriveEnabled) {
        const outcome = await deleteFromDrive(target);
        setToastNotification(
          outcome === 'deleted'
            ? { type: 'info', text: `Deleted "${target.name}" from workspace and Google Drive.` }
            : {
                type: 'error',
                text: `Deleted "${target.name}" locally. Google Drive is unavailable — it will be removed from Drive when you reconnect.`,
              }
        );
      } else {
        setToastNotification({ type: 'info', text: `Deleted "${target.name}".` });
      }
    } catch (err: any) {
      setToastNotification({
        type: 'error',
        text: `Error deleting file: ${err?.message}`,
      });
    } finally {
      setIsDeletingFile(false);
      setFileToDelete(null);
    }
  };

  // Copy path of the file in Google Drive to clipboard (no duplicate creation!)
  const handleCopyDrivePath = async (file: VaultFile) => {
    const drivePath = `/Markdown Life Vault/${file.path}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(drivePath);
      } else {
        throw new Error('Clipboard API not available');
      }
      setToastNotification({
        type: 'success',
        text: `Copied Drive path: ${drivePath}`,
      });
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = drivePath;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setToastNotification({
          type: 'success',
          text: `Copied Drive path: ${drivePath}`,
        });
      } catch {
        setToastNotification({
          type: 'info',
          text: `Drive path: ${drivePath}`,
        });
      }
    }
  };

  // Rename file
  const handleRenameFile = async (id: string, rawNewName: string): Promise<boolean> => {
    const fileToRename = filesRef.current.find((f) => f.id === id);
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
    const collision = filesRef.current.find(
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

    let renamedFile: VaultFile = {
      ...fileToRename,
      id: newId,
      name: cleanName,
      path: newPath,
      updatedAt: Date.now(),
    };
    // The renamed file needs a content save when it had unsaved edits or was not found in Drive.
    let needsSave = unsavedRef.current.has(id);

    if (isDriveEnabled) {
      try {
        const result = await renameFileInDrive(
          fileToRename.folder,
          oldName,
          cleanName,
          fileToRename.driveFileId
        );
        if (result.renamed) {
          renamedFile = {
            ...renamedFile,
            driveFileId: result.fileId,
            driveModifiedTime: result.modifiedTime || renamedFile.driveModifiedTime,
          };
        } else {
          // Not in Drive yet: the save queue will create it under the new name.
          renamedFile = { ...renamedFile, driveFileId: undefined, driveModifiedTime: undefined };
          needsSave = true;
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

    // Rename the file and rewrite any [[wiki-links]] referencing it in all other files
    // (computed outside any state updater; side effects follow).
    const linkUpdatedIds: string[] = [];
    const nextFiles = filesRef.current.map((f) => {
      if (f.id === id) return renamedFile;
      const updatedContent = updateWikiLinks(f.content, oldName, cleanName);
      if (updatedContent === f.content) return f;
      linkUpdatedIds.push(f.id);
      return { ...f, content: updatedContent, updatedAt: Date.now() };
    });
    updateFiles(() => nextFiles);

    // Migrate the unsaved flag to the new id and mark link-rewritten files unsaved (the queue syncs them)
    updateUnsaved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      if (needsSave) next.add(newId);
      linkUpdatedIds.forEach((fid) => next.add(fid));
      return next;
    });

    if (selectedFileId === id) {
      setSelectedFileId(newId);
    }

    return true;
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

        imported.push({
          id: path,
          name: item.name,
          path,
          folder,
          content: text,
          frontmatter,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    if (imported.length === 0) return;

    const importedIds = new Set(imported.map((f) => f.id));
    updateFiles((prev) => [
      ...imported.map((f) => {
        // Re-importing over an existing file keeps its Drive binding so it updates in place
        const existing = prev.find((p) => p.id === f.id);
        return existing
          ? { ...f, driveFileId: existing.driveFileId, driveModifiedTime: existing.driveModifiedTime }
          : f;
      }),
      ...prev.filter((f) => !importedIds.has(f.id)),
    ]);
    markUnsaved(imported.map((f) => f.id));
    setSelectedFileId(imported[0].id);
    setActiveTab('editor');

    if (isDriveEnabled) {
      flushSaves(imported.map((f) => f.id)).then((summary) => notifySyncSummary(summary, 'Imported and saved'));
    }
  };

  // Initialize Starter Templates in Google Drive (always the bundled starter set, never the current cache)
  const handleInitializeDriveTemplates = async () => {
    const ok = window.confirm(
      'This will upload the standard Markdown Life Vault starter files (Goals, Projects, Skills, Notes) into your Google Drive (/Markdown Life Vault/). Proceed?'
    );
    if (!ok) return;

    try {
      setIsRefreshingDrive(true);
      const starterFiles = getInitialVaultFiles();
      await syncAllFilesToDrive(starterFiles);
      setIsRefreshingDrive(false);
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
      clearVaultCache();
      const fresh = loadVaultFiles();
      updateFiles(() => fresh);
      updateUnsaved(() => new Set());
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
        saveBypassedAuth(false);
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
    await logout(); // also clears the in-memory/session token
    // Clear every locally cached piece of the signed-in vault: files, unsaved ids, pending deletions.
    clearAllVaultStorage();
    resetDriveCaches();
    resetSyncState();
    setGoogleUser(null);
    setHasBypassedAuth(false);
    updateFiles(() => []);
    updateUnsaved(() => new Set());
    setSelectedFileId(null);
    setToastNotification({
      type: 'info',
      text: 'Disconnected from Google account.',
    });
  };

  const handleContinueOffline = () => {
    setHasBypassedAuth(true);
    saveBypassedAuth(true);
    const localFiles = loadVaultFiles();
    updateFiles(() => localFiles);
    setSelectedFileId(localFiles[0]?.id || null);
    setToastNotification({
      type: 'info',
      text: 'Using local storage mode. Connect Google Drive anytime from the top bar.',
    });
  };

  const handleRequestSaveFileToDrive = async (file: VaultFile) => {
    if (!googleUser) {
      setIsDriveModalOpen(true);
      return;
    }

    if (driveStatus === 'expired') {
      handleReconnectDrive();
      return;
    }

    try {
      setIsSavingSingleFileToDrive(true);
      const wasNew = !file.driveFileId;
      markUnsaved([file.id]);
      const summary = await flushSaves([file.id]);
      if (summary.saved > 0) {
        setToastNotification({
          type: 'success',
          text: wasNew
            ? `Saved "${file.name}" to Google Drive (/Markdown Life Vault/${file.folder})`
            : `Saved changes to Google Drive in-place (${file.name})`,
        });
      } else if ((summary.failed > 0 || summary.skipped > 0) && !summary.authFailed) {
        setToastNotification({
          type: 'error',
          text: `Failed to save ${file.name} to Google Drive. Your edits are kept locally and will retry.`,
        });
      }
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

        // Immediately push any pending unsaved files (and pending deletions) to Google Drive
        if (unsavedRef.current.size > 0) {
          const summary = await flushSaves();
          notifySyncSummary(summary, 'Reconnected to Google Drive! Saved');
        } else {
          flushSaves([]);
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
    }
  };

  // Immediate sync for all unsaved local files to Google Drive
  const handleSyncAllUnsaved = async () => {
    if (!googleUser) {
      setIsDriveModalOpen(true);
      return;
    }
    if (driveStatus === 'expired') {
      await handleReconnectDrive();
      return;
    }

    if (unsavedRef.current.size === 0) {
      setToastNotification({
        type: 'info',
        text: 'All files are already in sync with Google Drive.',
      });
      return;
    }

    const summary = await flushSaves();
    notifySyncSummary(summary, 'Synced');
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

    if (unsavedRef.current.size > 0) {
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

    resetDriveCaches();
    await fetchFilesFromDrive(false);
  };

  const handleSaveAndReloadFromDrive = async () => {
    setIsReloadModalOpen(false);
    setIsRefreshingDrive(true);
    try {
      const summary = await flushSaves();
      if (unsavedRef.current.size > 0 || summary.authFailed) {
        if (!summary.authFailed) {
          setToastNotification({
            type: 'error',
            text: `Could not save ${unsavedRef.current.size} local edit(s) before reload. Nothing was reloaded; your edits are kept.`,
          });
        }
        return;
      }
      setToastNotification({
        type: 'success',
        text: `Saved ${summary.saved} local file(s) to Drive. Reloading fresh index...`,
      });
      setIsRefreshingDrive(false);
      await fetchFilesFromDrive(false);
    } finally {
      setIsRefreshingDrive(false);
    }
  };

  const handleDiscardAndReloadFromDrive = async () => {
    setIsReloadModalOpen(false);
    // Drive wins: forget unsaved flags, queued saves and pending deletions, then reload.
    discardLocalChanges();
    await executeReloadFromDrive();
  };

  // Files imported by the Drive modal are merged directly (no refetch). "Sync all" results from the
  // modal reach the sync queue via subscribeDriveSaves (driveFileIds stored, unsaved flags cleared).
  const handleImportedFromDriveModal = (importedFiles: VaultFile[]) => {
    mergeImportedFiles(importedFiles);
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
        onSyncAllUnsaved={handleSyncAllUnsaved}
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
              onCopyDrivePath={handleCopyDrivePath}
              onRenameFile={handleRenameFile}
              onQuickNewFileInFolder={handleOpenNewFileInFolder}
              onDropFiles={handleImportFiles}
              onShareProject={(projectKey) => setSharingProjectFolder(projectKey)}
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
                key={currentFile.id}
                file={currentFile}
                allFiles={files}
                onChangeContent={handleUpdateContent}
                onNavigateToFile={handleNavigateToFile}
                onToggleCheckbox={handleToggleCheckbox}
                onOpenSkillPlayground={(s) => setSkillForPlayground(s)}
                onRenameFile={handleRenameFile}
                onSaveToDrive={isMockMode ? undefined : handleRequestSaveFileToDrive}
                onCopyDrivePath={handleCopyDrivePath}
                onDeleteFile={handleDeleteFile}
                isSavingToDrive={isSavingSingleFileToDrive}
                isDriveSyncing={isDriveSyncing}
                driveStatus={driveStatus}
                isUnsavedToDrive={currentFile ? unsavedFileIds.has(currentFile.id) : false}
                onReconnectDrive={handleReconnectDrive}
                googleUser={googleUser}
                onShareProject={(folder) => setSharingProjectFolder(folder)}
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
          onImportFilesFromDrive={handleImportedFromDriveModal}
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

      {/* Share Project Modal */}
      {sharingProjectFolder && (
        <ShareProjectModal
          isOpen={!!sharingProjectFolder}
          projectFolder={sharingProjectFolder}
          onClose={() => setSharingProjectFolder(null)}
          googleUser={googleUser}
          driveStatus={driveStatus}
          isMockMode={isMockMode}
          onOpenConnectDrive={() => setIsDriveModalOpen(true)}
        />
      )}

      {/* Delete File Confirmation Modal */}
      <DeleteFileModal
        isOpen={!!fileToDelete}
        onClose={() => {
          if (!isDeletingFile) setFileToDelete(null);
        }}
        onConfirm={handleConfirmDeleteFile}
        file={fileToDelete}
        isDeleting={isDeletingFile}
      />
    </div>
  );
}
