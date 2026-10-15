import { useCallback, useEffect, useRef, useState, MutableRefObject } from 'react';
import { VaultFile, DriveConnectionStatus, PendingDriveDeletion } from '../types';
import {
  saveFileToDrive,
  deleteFileFromDrive,
  downloadDriveFile,
  importVaultFromDrive,
  subscribeDriveSaves,
  DriveAuthError,
  DriveConflictError,
} from '../utils/googleDrive';
import { subscribeDriveStatus, testDriveConnection } from '../utils/googleAuth';
import { parseFrontmatter } from '../utils/markdownParser';
import { loadPendingDeletions, savePendingDeletions, flushScheduledVaultSave } from '../utils/storage';

const AUTOSAVE_DELAY_MS = 1200;

export type ToastFn = (toast: { text: string; type: 'success' | 'info' | 'error' }) => void;

type SaveOutcome = 'saved' | 'failed' | 'conflict' | 'auth' | 'skipped';

export interface SyncSummary {
  saved: number;
  failed: number;
  conflicts: number;
  /** Not attempted (offline / expired / not signed in). */
  skipped: number;
  authFailed: boolean;
}

interface UseDriveSyncOptions {
  /** Signed in with Google and not in mock mode. */
  enabled: boolean;
  driveStatus: DriveConnectionStatus;
  setDriveStatus: (status: DriveConnectionStatus) => void;
  files: VaultFile[];
  filesRef: MutableRefObject<VaultFile[]>;
  updateFiles: (updater: (prev: VaultFile[]) => VaultFile[]) => void;
  unsavedFileIds: Set<string>;
  unsavedRef: MutableRefObject<Set<string>>;
  updateUnsaved: (updater: (prev: Set<string>) => Set<string>) => void;
  setSelectedFileId: (updater: (prev: string | null) => string | null) => void;
  notify: ToastFn;
}

/**
 * Merges a Drive listing with the local vault.
 * - Local files with unsaved edits always win (their Drive baseline modifiedTime is kept for conflict checks).
 * - Otherwise the Drive version wins.
 * - Local files missing from Drive are dropped only when `pruneMissing` (a complete listing) and
 *   they have no unsaved edits and their download didn't fail.
 */
export function mergeDriveFiles(
  localFiles: VaultFile[],
  driveFiles: VaultFile[],
  unsaved: Set<string>,
  options: { pruneMissing: boolean; failedPaths?: Set<string> }
): { merged: VaultFile[]; preservedCount: number } {
  const mergedMap = new Map<string, VaultFile>();
  for (const df of driveFiles) {
    mergedMap.set(df.id, df);
  }

  let preservedCount = 0;
  for (const lf of localFiles) {
    const driveVersion = mergedMap.get(lf.id);
    if (unsaved.has(lf.id)) {
      mergedMap.set(lf.id, {
        ...lf,
        driveFileId: lf.driveFileId || driveVersion?.driveFileId,
      });
      preservedCount++;
    } else if (!driveVersion) {
      if (!options.pruneMissing || options.failedPaths?.has(lf.id)) {
        mergedMap.set(lf.id, lf);
      }
    }
  }

  return { merged: Array.from(mergedMap.values()), preservedCount };
}

function summarize(ids: string[], results: Map<string, SaveOutcome>): SyncSummary {
  const summary: SyncSummary = { saved: 0, failed: 0, conflicts: 0, skipped: 0, authFailed: false };
  for (const id of ids) {
    const outcome = results.get(id) || 'skipped';
    if (outcome === 'saved') summary.saved++;
    else if (outcome === 'failed') summary.failed++;
    else if (outcome === 'conflict') summary.conflicts++;
    else if (outcome === 'auth') {
      summary.authFailed = true;
      summary.skipped++;
    } else summary.skipped++;
  }
  return summary;
}

/**
 * Single, serialized Google Drive sync queue for the vault:
 * autosave, manual save, reconnect/online flushes, pending deletions and conflict handling.
 */
export function useDriveSync({
  enabled,
  driveStatus,
  setDriveStatus,
  files,
  filesRef,
  updateFiles,
  unsavedFileIds,
  unsavedRef,
  updateUnsaved,
  setSelectedFileId,
  notify,
}: UseDriveSyncOptions) {
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [isRefreshingDrive, setIsRefreshingDrive] = useState(false);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [pendingDeletionCount, setPendingDeletionCount] = useState(() => loadPendingDeletions().length);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const setDriveStatusRef = useRef(setDriveStatus);
  setDriveStatusRef.current = setDriveStatus;
  const setSelectedRef = useRef(setSelectedFileId);
  setSelectedRef.current = setSelectedFileId;

  // Auth status mirrored synchronously (the status listener fires inside googleSignIn/markTokenExpired).
  const authStatusRef = useRef<DriveConnectionStatus>('disconnected');
  useEffect(() => subscribeDriveStatus((status) => {
    authStatusRef.current = status;
  }), []);

  const pendingSavesRef = useRef<Set<string>>(new Set());
  const resultsRef = useRef<Map<string, SaveOutcome>>(new Map());
  const pendingDeletionsRef = useRef<PendingDriveDeletion[]>(loadPendingDeletions());
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const isFetchingRef = useRef(false);

  const canSync = () =>
    enabledRef.current &&
    authStatusRef.current !== 'expired' &&
    (typeof navigator === 'undefined' || navigator.onLine !== false);

  const setPendingDeletions = useCallback((next: PendingDriveDeletion[]) => {
    pendingDeletionsRef.current = next;
    savePendingDeletions(next);
    setPendingDeletionCount(next.length);
  }, []);

  const removeUnsaved = useCallback((id: string) => {
    updateUnsaved((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [updateUnsaved]);

  /** Marks files as having local edits not yet in Drive. */
  const markUnsaved = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    updateUnsaved((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, [updateUnsaved]);

  /**
   * Records a successful save: persists driveFileId/modifiedTime on the file, and clears its
   * unsaved flag ONLY if the content saved is still the current content.
   */
  const recordSaved = useCallback(
    (localId: string, savedContent: string, driveFileId: string, modifiedTime?: string) => {
      updateFiles((prev) => {
        let changed = false;
        const next = prev.map((f) => {
          if (f.id !== localId) return f;
          if (f.driveFileId === driveFileId && (!modifiedTime || f.driveModifiedTime === modifiedTime)) return f;
          changed = true;
          return { ...f, driveFileId, driveModifiedTime: modifiedTime || f.driveModifiedTime };
        });
        return changed ? next : prev;
      });
      const current = filesRef.current.find((f) => f.id === localId);
      if (current && current.content === savedContent) {
        removeUnsaved(localId);
      }
    },
    [filesRef, updateFiles, removeUnsaved]
  );

  // Saves done by bulk "sync all" (e.g. from GoogleDriveSyncModal) also update local state.
  useEffect(
    () => subscribeDriveSaves((e) => recordSaved(e.localId, e.content, e.driveFileId, e.modifiedTime)),
    [recordSaved]
  );

  const handleAuthFailure = () => {
    setDriveStatusRef.current('expired');
    notifyRef.current({
      type: 'error',
      text: 'Google Drive session expired. Your recent edits are safely preserved locally in browser storage. Click Reconnect to sync.',
    });
  };

  /** Keeps the local edits, saves Drive's newer version as a sibling "<name> (conflict).md". */
  const handleConflict = async (file: VaultFile, err: DriveConflictError) => {
    const remote = await downloadDriveFile(err.driveFileId);
    const baseName = file.name.replace(/\.md$/i, '');
    const existingIds = new Set(filesRef.current.map((f) => f.id));
    let copyName = `${baseName} (conflict).md`;
    for (let n = 2; existingIds.has(`${file.folder}/${copyName}`); n++) {
      copyName = `${baseName} (conflict ${n}).md`;
    }
    const copyPath = `${file.folder}/${copyName}`;
    const now = Date.now();
    const copy: VaultFile = {
      id: copyPath,
      name: copyName,
      path: copyPath,
      folder: file.folder,
      content: remote.content,
      frontmatter: parseFrontmatter(remote.content).frontmatter,
      createdAt: now,
      updatedAt: now,
    };

    updateFiles((prev) => {
      const next: VaultFile[] = [];
      for (const f of prev) {
        // Acknowledge the remote version: it is preserved in the conflict copy, so the local
        // version (still unsaved) may be written on the next save.
        next.push(f.id === file.id ? { ...f, driveModifiedTime: remote.modifiedTime || err.remoteModifiedTime } : f);
        if (f.id === file.id) next.push(copy);
      }
      return next;
    });
    markUnsaved([copy.id]);
    notifyRef.current({
      type: 'error',
      text: `Sync conflict: "${file.name}" was changed in Google Drive. Drive's version was kept as "${copyName}"; your local edits were kept in "${file.name}".`,
    });
  };

  const saveOne = async (id: string): Promise<'ok' | 'auth'> => {
    const file = filesRef.current.find((f) => f.id === id);
    if (!file || !unsavedRef.current.has(id)) {
      resultsRef.current.set(id, 'saved');
      return 'ok';
    }
    try {
      const res = await saveFileToDrive(file);
      recordSaved(id, file.content, res.fileId, res.modifiedTime);
      resultsRef.current.set(id, 'saved');
    } catch (err) {
      if (err instanceof DriveAuthError) {
        resultsRef.current.set(id, 'auth');
        pendingSavesRef.current.add(id);
        return 'auth';
      }
      if (err instanceof DriveConflictError) {
        resultsRef.current.set(id, 'conflict');
        try {
          await handleConflict(file, err);
        } catch (conflictErr) {
          if (conflictErr instanceof DriveAuthError) return 'auth';
          console.error(`Failed to fetch the Drive version of ${file.name}:`, conflictErr);
        }
        return 'ok';
      }
      console.error(`Drive save error for ${file.name}:`, err);
      resultsRef.current.set(id, 'failed');
    }
    return 'ok';
  };

  const processDeletions = async (): Promise<'ok' | 'auth'> => {
    for (const entry of [...pendingDeletionsRef.current]) {
      if (!canSync()) return 'ok';
      const removeEntry = () =>
        setPendingDeletions(pendingDeletionsRef.current.filter((d) => d !== entry));
      // A name-based deletion must not hit a file that has since been re-created locally.
      if (!entry.driveFileId && filesRef.current.some((f) => f.id === entry.id)) {
        removeEntry();
        continue;
      }
      try {
        await deleteFileFromDrive(entry.folder, entry.name, entry.driveFileId);
        removeEntry();
      } catch (err) {
        if (err instanceof DriveAuthError) return 'auth';
        console.warn(`Pending Drive deletion of ${entry.name} failed; will retry:`, err);
      }
    }
    return 'ok';
  };

  const drain = async () => {
    if (!canSync()) return;
    setIsDriveSyncing(true);
    let auth: 'ok' | 'auth' = 'ok';
    try {
      auth = await processDeletions();
      while (auth === 'ok' && pendingSavesRef.current.size > 0 && canSync()) {
        const id = pendingSavesRef.current.values().next().value as string;
        pendingSavesRef.current.delete(id);
        auth = await saveOne(id);
      }
    } finally {
      setIsDriveSyncing(false);
    }
    if (auth === 'auth') handleAuthFailure();
  };

  /**
   * Saves the given files (default: all unsaved) to Drive through the single serialized queue.
   * Resolves with the outcome for those files.
   */
  const flushSaves = useCallback((ids?: string[]): Promise<SyncSummary> => {
    const targetIds = ids ?? Array.from(unsavedRef.current);
    targetIds.forEach((id) => {
      resultsRef.current.delete(id);
      pendingSavesRef.current.add(id);
    });
    const run = chainRef.current.then(drain).catch((err) => {
      console.error('Drive sync queue error:', err);
    });
    chainRef.current = run;
    return run.then(() => summarize(targetIds, resultsRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Deletes a file from Drive, or queues the deletion (persisted) to retry on reconnect.
   */
  const deleteFromDrive = useCallback(async (file: VaultFile): Promise<'deleted' | 'queued'> => {
    pendingSavesRef.current.delete(file.id);
    const entry: PendingDriveDeletion = {
      id: file.id,
      folder: file.folder,
      name: file.name,
      driveFileId: file.driveFileId,
      queuedAt: Date.now(),
    };
    setPendingDeletions([...pendingDeletionsRef.current.filter((d) => d.id !== file.id), entry]);
    if (!canSync()) return 'queued';
    await flushSaves([]);
    return pendingDeletionsRef.current.includes(entry) ? 'queued' : 'deleted';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushSaves, setPendingDeletions]);

  /** Drops all queued saves, unsaved flags and pending deletions (Drive wins). */
  const discardLocalChanges = useCallback(() => {
    pendingSavesRef.current.clear();
    updateUnsaved(() => new Set());
    setPendingDeletions([]);
  }, [updateUnsaved, setPendingDeletions]);

  /** Forgets all sync state (sign-out). */
  const resetSyncState = useCallback(() => {
    pendingSavesRef.current.clear();
    resultsRef.current.clear();
    pendingDeletionsRef.current = [];
    setPendingDeletionCount(0);
  }, []);

  /**
   * Fetches the full vault from Google Drive and safely merges it with local edits so work is never lost.
   */
  const refreshFromDrive = useCallback(async (isSilent = false): Promise<boolean> => {
    if (isFetchingRef.current) return false;
    isFetchingRef.current = true;
    try {
      setIsRefreshingDrive(true);
      if (!isSilent) setIsLoadingDriveFiles(true);
      const snapshot = await importVaultFromDrive();
      const { merged, preservedCount } = mergeDriveFiles(
        filesRef.current,
        snapshot.files,
        unsavedRef.current,
        { pruneMissing: true, failedPaths: snapshot.failedPaths }
      );
      updateFiles(() => merged);

      if (merged.length > 0) {
        setSelectedRef.current((prev) => (prev && merged.some((f) => f.id === prev) ? prev : merged[0].id));
      }

      if (!isSilent) {
        if (snapshot.files.length === 0) {
          notifyRef.current({ type: 'info', text: 'Google Drive connected: 0 files in /Markdown Life Vault/.' });
        } else if (preservedCount > 0) {
          notifyRef.current({
            type: 'info',
            text: `Synced with Google Drive (${snapshot.files.length} file(s)). Safely preserved ${preservedCount} local file(s) with unsaved edits.`,
          });
        } else {
          notifyRef.current({
            type: 'success',
            text: `Synced with Google Drive: loaded ${snapshot.files.length} file(s).`,
          });
        }
        if (snapshot.failedPaths.size > 0) {
          notifyRef.current({
            type: 'error',
            text: `Could not download ${snapshot.failedPaths.size} file(s) from Google Drive; kept their local copies.`,
          });
        }
      }
      return true;
    } catch (err: any) {
      console.error('Failed to load files from Google Drive:', err);
      if (err instanceof DriveAuthError) {
        setDriveStatusRef.current('expired');
      }
      notifyRef.current({
        type: 'error',
        text: err?.message || 'Failed to load files from Google Drive',
      });
      return false;
    } finally {
      isFetchingRef.current = false;
      setIsRefreshingDrive(false);
      setIsLoadingDriveFiles(false);
    }
  }, [filesRef, unsavedRef, updateFiles]);

  /** Merges files imported elsewhere (e.g. the Drive modal) without dropping any local files. */
  const mergeImportedFiles = useCallback((driveFiles: VaultFile[]) => {
    const { merged } = mergeDriveFiles(filesRef.current, driveFiles, unsavedRef.current, { pruneMissing: false });
    updateFiles(() => merged);
    if (driveFiles.length > 0) {
      setSelectedRef.current((prev) => prev || driveFiles[0].id);
    }
  }, [filesRef, unsavedRef, updateFiles]);

  // Debounced autosave (and retry of pending deletions) while connected.
  useEffect(() => {
    if (!enabled || driveStatus !== 'connected') return;
    if (unsavedFileIds.size === 0 && pendingDeletionCount === 0) return;
    const timer = setTimeout(() => {
      flushSaves();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, driveStatus, unsavedFileIds, files, pendingDeletionCount, flushSaves]);

  // Network online/offline listeners with automatic Google Drive reconnection (subscribed once; reads refs).
  useEffect(() => {
    if (!enabled) return;

    const handleOffline = () => {
      setDriveStatusRef.current('disconnected');
      notifyRef.current({
        type: 'info',
        text: 'Internet connection lost. You can continue editing — all changes are saved locally in your browser.',
      });
    };

    const handleOnline = async () => {
      if (!enabledRef.current) return;
      notifyRef.current({ type: 'info', text: 'Internet restored! Checking Google Drive connection...' });
      const res = await testDriveConnection();
      if (!res.ok) {
        setDriveStatusRef.current(res.expired ? 'expired' : 'disconnected');
        return;
      }
      setDriveStatusRef.current('connected');
      const pendingCount = unsavedRef.current.size;
      if (pendingCount === 0 && pendingDeletionsRef.current.length === 0) {
        notifyRef.current({ type: 'success', text: 'Reconnected to Google Drive successfully.' });
        return;
      }
      const summary = await flushSaves();
      notifyRef.current({
        type: summary.failed > 0 ? 'error' : 'success',
        text: `Reconnected to Google Drive! Synced ${summary.saved} pending local file(s)${summary.failed > 0 ? `, ${summary.failed} failed` : ''}.`,
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, flushSaves, unsavedRef]);

  // Warn before leaving with edits not yet in Drive; always flush the local backup.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushScheduledVaultSave();
      if (enabledRef.current && (unsavedRef.current.size > 0 || pendingDeletionsRef.current.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const handlePageHide = () => flushScheduledVaultSave();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [unsavedRef]);

  // Ctrl/Cmd+S: flush the save queue immediately.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      flushScheduledVaultSave();
      if (!enabledRef.current) return;
      if (authStatusRef.current === 'expired') {
        notifyRef.current({ type: 'error', text: 'Google Drive session expired. Click Reconnect to save your changes.' });
        return;
      }
      if (unsavedRef.current.size === 0 && pendingDeletionsRef.current.length === 0) {
        notifyRef.current({ type: 'info', text: 'All files are already in sync with Google Drive.' });
        return;
      }
      flushSaves().then((summary) => {
        if (summary.authFailed) return;
        if (summary.failed > 0) {
          notifyRef.current({ type: 'error', text: `Saved ${summary.saved} file(s); ${summary.failed} failed to save to Google Drive.` });
        } else if (summary.saved > 0) {
          notifyRef.current({ type: 'success', text: `Saved ${summary.saved} file(s) to Google Drive.` });
        } else if (summary.skipped > 0) {
          notifyRef.current({ type: 'info', text: 'Saved locally. Changes will sync to Google Drive when the connection is back.' });
        }
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flushSaves, unsavedRef]);

  return {
    isDriveSyncing,
    isRefreshingDrive,
    setIsRefreshingDrive,
    isLoadingDriveFiles,
    pendingDeletionCount,
    markUnsaved,
    flushSaves,
    deleteFromDrive,
    discardLocalChanges,
    resetSyncState,
    refreshFromDrive,
    mergeImportedFiles,
  };
}
