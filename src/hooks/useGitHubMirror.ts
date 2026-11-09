import { useCallback, useEffect, useRef, useState } from 'react';
import { VaultFile } from '../types';
import { GitHubMirrorConfig, loadGitHubConfig, saveGitHubConfig } from '../utils/githubConfig';
import {
  GitHubAuthError,
  GitHubMassDeleteError,
  MirrorResult,
  mirrorVaultToGitHub,
  vaultPath,
} from '../utils/githubMirror';
import { getErrorMessage } from '../utils/errors';
import type { ToastFn } from './useDriveSync';

/** Wait after the last change (and after Drive has saved it) before pushing to GitHub. */
const MIRROR_DELAY_MS = 60_000;
/** After Ctrl+S: push soon, once Drive has saved. */
const MIRROR_SOON_MS = 3_000;

export type GitHubMirrorStatus =
  | 'off' // not set up
  | 'waiting' // changes not pushed yet
  | 'syncing'
  | 'ok'
  | 'error'
  | 'auth' // token rejected; automatic pushes stop until the settings change
  | 'confirm'; // a push would delete many files; needs a manual push

/** 'drive-load': the vault hasn't loaded from Drive yet; 'drive-save': Drive is still saving. */
export type MirrorWait = 'drive-load' | 'drive-save' | null;

export interface GitHubMirrorState {
  status: GitHubMirrorStatus;
  error?: string;
  lastPushedAt?: number;
  lastCommitUrl?: string;
}

interface Options {
  /** False in mock mode: nothing may reach GitHub. */
  enabled: boolean;
  /** Signed in to Google Drive (Drive is the source of truth, so wait for it). */
  driveMode: boolean;
  /** The vault has been fully loaded from Drive this session. */
  hasLoadedFromDrive: boolean;
  /** Files with edits Drive hasn't saved yet. */
  unsavedCount: number;
  isDriveSyncing: boolean;
  files: VaultFile[];
  notify: ToastFn;
}

/** What a push would contain; used to skip automatic runs when nothing changed. */
const vaultSignature = (files: VaultFile[]) =>
  files
    .map((f) => `${vaultPath(f)}\u0000${f.content}`)
    .sort()
    .join('\u0001');

const sameTarget = (a: GitHubMirrorConfig, b: GitHubMirrorConfig) =>
  a.owner === b.owner && a.repo === b.repo && a.branch === b.branch && a.subfolder === b.subfolder;

/**
 * Keeps a GitHub repo in step with the vault: pushes one commit about a minute after changes
 * have been saved to Drive, soon after Ctrl+S, and on demand.
 */
export function useGitHubMirror({
  enabled,
  driveMode,
  hasLoadedFromDrive,
  unsavedCount,
  isDriveSyncing,
  files,
  notify,
}: Options) {
  const [config, setConfig] = useState<GitHubMirrorConfig | null>(() =>
    enabled ? loadGitHubConfig() : null,
  );
  const [state, setState] = useState<GitHubMirrorState>(() => ({
    status: config ? 'waiting' : 'off',
  }));
  const [soonTick, setSoonTick] = useState(0);

  const configRef = useRef(config);
  const filesRef = useRef(files);
  const notifyRef = useRef(notify);
  /* eslint-disable react-hooks/refs -- "latest value in a ref" pattern (intentional, see eslint.config.js) */
  configRef.current = config;
  filesRef.current = files;
  notifyRef.current = notify;
  /* eslint-enable react-hooks/refs */
  const runningRef = useRef<Promise<MirrorResult | null> | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const lastCommitShaRef = useRef<string | undefined>(config?.lastCommitSha);
  const soonRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);

  const ready =
    enabled &&
    !!config &&
    (!driveMode || (hasLoadedFromDrive && unsavedCount === 0 && !isDriveSyncing));

  const push = useCallback(
    async (opts: { manual?: boolean; allowMassDelete?: boolean } = {}) => {
      const cfg = configRef.current;
      if (!enabled || !cfg) return null;
      if (runningRef.current) await runningRef.current.catch(() => null);
      const snapshot = filesRef.current;
      const signature = vaultSignature(snapshot);
      if (!opts.manual && signature === lastSignatureRef.current) return null;

      setState((s) => ({ ...s, status: 'syncing', error: undefined }));
      const run = (async () => {
        try {
          const result = await mirrorVaultToGitHub(
            snapshot,
            { ...cfg, lastCommitSha: lastCommitShaRef.current },
            { allowMassDelete: opts.allowMassDelete },
          );
          lastSignatureRef.current = signature;
          lastCommitShaRef.current = result.commitSha;
          if (configRef.current && sameTarget(configRef.current, cfg)) {
            saveGitHubConfig({ ...configRef.current, lastCommitSha: result.commitSha });
          }
          lastErrorRef.current = null;
          setState((s) => ({
            status: 'ok',
            lastPushedAt: Date.now(),
            lastCommitUrl: result.commitUrl || s.lastCommitUrl,
          }));
          if (result.externalChanges) {
            notifyRef.current({
              type: 'info',
              text: `The GitHub repo ${cfg.owner}/${cfg.repo} had commits made outside mdlife. mdlife's copy was pushed on top; the earlier versions stay in the repo's history.`,
            });
          }
          if (opts.manual) {
            notifyRef.current({
              type: 'success',
              text:
                result.changed + result.deleted > 0
                  ? `Pushed to GitHub: ${result.changed} updated, ${result.deleted} deleted.`
                  : 'GitHub is already up to date.',
            });
          }
          return result;
        } catch (err) {
          const message = getErrorMessage(err) || 'Could not push to GitHub.';
          const status: GitHubMirrorStatus =
            err instanceof GitHubAuthError
              ? 'auth'
              : err instanceof GitHubMassDeleteError
                ? 'confirm'
                : 'error';
          console.error('GitHub mirror failed:', err);
          setState((s) => ({ ...s, status, error: message }));
          if (opts.manual || lastErrorRef.current !== message) {
            notifyRef.current({ type: 'error', text: `GitHub mirror: ${message}` });
          }
          lastErrorRef.current = message;
          if (opts.manual && !(err instanceof GitHubMassDeleteError)) throw err;
          return null;
        }
      })();
      runningRef.current = run;
      try {
        return await run;
      } finally {
        if (runningRef.current === run) runningRef.current = null;
      }
    },
    [enabled],
  );

  // Automatic pushes: a while after the vault changes and Drive has caught up.
  useEffect(() => {
    if (!ready || state.status === 'auth' || state.status === 'confirm') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (vaultSignature(files) === lastSignatureRef.current) return;
    const delay = soonRef.current ? MIRROR_SOON_MS : MIRROR_DELAY_MS;
    const timer = setTimeout(() => {
      soonRef.current = false;
      void push();
    }, delay);
    return () => clearTimeout(timer);
  }, [ready, files, state.status, soonTick, push]);

  // Ctrl/Cmd+S: push soon (after Drive has saved).
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      if (!configRef.current) return;
      soonRef.current = true;
      setSoonTick((t) => t + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  /** Saves new settings (null disconnects and forgets the token). */
  const updateConfig = useCallback((next: GitHubMirrorConfig | null) => {
    const prev = configRef.current;
    const keepSha = next && prev && sameTarget(prev, next) ? lastCommitShaRef.current : undefined;
    const stored = next ? { ...next, lastCommitSha: keepSha } : null;
    saveGitHubConfig(stored);
    lastCommitShaRef.current = keepSha;
    lastSignatureRef.current = null;
    lastErrorRef.current = null;
    configRef.current = stored;
    setConfig(stored);
    setState({ status: stored ? 'waiting' : 'off' });
  }, []);

  return {
    config,
    // Edits waiting for Drive are also waiting for GitHub.
    state:
      state.status === 'ok' && driveMode && unsavedCount > 0
        ? { ...state, status: 'waiting' as const }
        : state,
    updateConfig,
    /** Pushes now; `allowMassDelete` confirms a push that deletes many files. */
    pushNow: (allowMassDelete = false) => push({ manual: true, allowMassDelete }),
    /** Why automatic pushes are on hold, if they are. */
    waitingFor: (config && driveMode && !hasLoadedFromDrive
      ? 'drive-load'
      : config && driveMode && (unsavedCount > 0 || isDriveSyncing)
        ? 'drive-save'
        : null) as MirrorWait,
  };
}
