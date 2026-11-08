import React, { useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Github,
  Loader2,
  Unplug,
  UploadCloud,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { GitHubMirrorConfig, normalizeSubfolder, parseRepoInput } from '../utils/githubConfig';
import { RepoCheck, testGitHubConnection } from '../utils/githubMirror';
import { GitHubMirrorState, MirrorWait } from '../hooks/useGitHubMirror';
import { getErrorMessage } from '../utils/errors';

interface GitHubMirrorModalProps {
  onClose: () => void;
  config: GitHubMirrorConfig | null;
  state: GitHubMirrorState;
  waitingFor: MirrorWait;
  onSave: (config: GitHubMirrorConfig | null) => void;
  onPushNow: (allowMassDelete?: boolean) => Promise<unknown>;
}

const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';

const inputClass =
  'w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-stone-400';

export const GitHubMirrorModal: React.FC<GitHubMirrorModalProps> = ({
  onClose,
  config,
  state,
  waitingFor,
  onSave,
  onPushNow,
}) => {
  const titleId = useId();
  const [repoInput, setRepoInput] = useState(config ? `${config.owner}/${config.repo}` : '');
  const [branch, setBranch] = useState(config?.branch || 'main');
  const [subfolder, setSubfolder] = useState(config?.subfolder || '');
  const [token, setToken] = useState(config?.token || '');
  const [checking, setChecking] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [check, setCheck] = useState<RepoCheck | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const buildConfig = (): GitHubMirrorConfig | null => {
    const repo = parseRepoInput(repoInput);
    if (!repo) {
      setFormError('Enter the repo as owner/name, e.g. sherol/me.');
      return null;
    }
    if (!token.trim()) {
      setFormError('Paste a GitHub token.');
      return null;
    }
    return {
      ...repo,
      branch: branch.trim() || 'main',
      subfolder: normalizeSubfolder(subfolder),
      token: token.trim(),
    };
  };

  const isDirty =
    !config ||
    repoInput.trim() !== `${config.owner}/${config.repo}` ||
    (branch.trim() || 'main') !== config.branch ||
    normalizeSubfolder(subfolder) !== config.subfolder ||
    token.trim() !== config.token;

  const handleSave = async () => {
    setFormError(null);
    setCheck(null);
    const next = buildConfig();
    if (!next) return;
    setChecking(true);
    try {
      const result = await testGitHubConnection(next);
      setCheck(result);
      if (!result.canPush) {
        setFormError(
          'This token can read the repo but not write to it. Give it Contents: Read and write.',
        );
        return;
      }
      onSave(next);
    } catch (err) {
      setFormError(getErrorMessage(err) || 'Could not reach GitHub.');
    } finally {
      setChecking(false);
    }
  };

  const handlePush = async (allowMassDelete = false) => {
    setPushing(true);
    try {
      await onPushNow(allowMassDelete);
    } catch {
      // shown in the status line and a toast
    } finally {
      setPushing(false);
    }
  };

  const statusLine = (() => {
    if (!config) return null;
    switch (state.status) {
      case 'syncing':
        return { tone: 'info', text: 'Pushing to GitHub…' };
      case 'ok':
        return {
          tone: 'ok',
          text: `Up to date${state.lastPushedAt ? ` (checked ${new Date(state.lastPushedAt).toLocaleTimeString()})` : ''}.`,
        };
      case 'auth':
      case 'error':
        return { tone: 'error', text: state.error || 'The last push failed.' };
      case 'confirm':
        return { tone: 'error', text: state.error || 'A push would delete many files.' };
      default:
        return {
          tone: 'info',
          text:
            waitingFor === 'drive-load'
              ? 'Waiting for the vault to load from Google Drive.'
              : waitingFor === 'drive-save'
                ? 'Waiting for Google Drive to save your edits.'
                : 'Changes are pushed about a minute after they are saved.',
        };
    }
  })();

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
        <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Github className="w-4 h-4" />
          GitHub mirror
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1 text-stone-400 hover:text-stone-700 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4 text-xs text-stone-600">
        <p>
          Keeps a copy of the vault in a private GitHub repo, one commit per batch of changes.
          Google Drive stays the main copy: edits made directly on GitHub are overwritten by the
          next push (they stay in the repo&apos;s history). Only the vault&apos;s folders are
          written; other files in the repo are left alone.
        </p>

        {statusLine && (
          <div
            role="status"
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
              statusLine.tone === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : statusLine.tone === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-stone-50 border-stone-200 text-stone-700'
            }`}
          >
            {statusLine.tone === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : statusLine.tone === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : state.status === 'syncing' ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1">
              {statusLine.text}
              {state.lastCommitUrl && (
                <>
                  {' '}
                  <a
                    href={state.lastCommitUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline inline-flex items-center gap-0.5"
                  >
                    Last commit <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </span>
          </div>
        )}

        <label className="block space-y-1">
          <span className="font-medium text-stone-800">Repository</span>
          <input
            className={inputClass}
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="font-medium text-stone-800">Branch</span>
            <input
              className={inputClass}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-1">
            <span className="font-medium text-stone-800">Folder in the repo</span>
            <input
              className={inputClass}
              value={subfolder}
              onChange={(e) => setSubfolder(e.target.value)}
              placeholder="(repo root)"
              spellCheck={false}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="font-medium text-stone-800">Fine-grained access token</span>
          <input
            className={inputClass}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="block text-[11px] text-stone-500">
            <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer" className="underline">
              Create a fine-grained token
            </a>{' '}
            with <strong>Only select repositories</strong> → this repo, and{' '}
            <strong>Repository permissions → Contents: Read and write</strong>. Give it an
            expiration date. The token is kept only in this browser.
          </span>
        </label>

        {check && !check.isPrivate && (
          <p className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {check.fullName} is public: anyone can read the mirrored notes.
          </p>
        )}
        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-stone-200">
        {config && (
          <button
            type="button"
            onClick={() => {
              onSave(null);
              setToken('');
              setCheck(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg"
          >
            <Unplug className="w-3.5 h-3.5" />
            Disconnect
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {config && !isDirty && state.status === 'confirm' && (
            <button
              type="button"
              disabled={pushing}
              onClick={() => handlePush(true)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-50"
            >
              Push and delete anyway
            </button>
          )}
          {config && !isDirty && (
            <button
              type="button"
              disabled={pushing || state.status === 'syncing' || waitingFor === 'drive-load'}
              onClick={() => handlePush(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg disabled:opacity-50"
            >
              {pushing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              Push now
            </button>
          )}
          {isDirty && (
            <button
              type="button"
              disabled={checking}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg disabled:opacity-50"
            >
              {checking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {config ? 'Test and save' : 'Test and connect'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
