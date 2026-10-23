import React, { useEffect, useId, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Unlink,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { VaultFile } from '../types';
import { Modal } from './Modal';
import {
  DrivePermission,
  getFilePermissions,
  shareProjectWithGoogleAccount,
} from '../utils/googleDrive';
import { getLinkedDocId } from '../utils/sharedDocs';
import type { SharedDocStatus } from '../hooks/useDriveSync';
import { getErrorMessage } from '../utils/errors';

const LAST_EMAIL_KEY = 'md_shared_doc_last_email';

interface SharedDocModalProps {
  file: VaultFile;
  onClose: () => void;
  /** Google Drive is connected (sharing needs it). */
  isConnected: boolean;
  status?: SharedDocStatus;
  hasConflict: boolean;
  onCreate: (email: string, notify: boolean) => Promise<{ webViewLink?: string }>;
  onSyncNow: () => void;
  onUnlink: () => void;
  onResolveConflict: () => void;
}

const docUrl = (docId: string) =>
  `https://docs.google.com/document/d/${encodeURIComponent(docId)}/edit`;

function loadLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function formatTime(ts?: number): string {
  if (!ts) return 'not yet';
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  return new Date(ts).toLocaleString();
}

export const SharedDocModal: React.FC<SharedDocModalProps> = ({
  file,
  onClose,
  isConnected,
  status,
  hasConflict,
  onCreate,
  onSyncNow,
  onUnlink,
  onResolveConflict,
}) => {
  const titleId = useId();
  const emailId = useId();
  const docId = getLinkedDocId(file);

  const [email, setEmail] = useState(loadLastEmail);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [people, setPeople] = useState<DrivePermission[] | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  useEffect(() => {
    if (!docId || !isConnected) return;
    let cancelled = false;
    getFilePermissions(docId)
      .then((perms) => !cancelled && setPeople(perms))
      .catch(() => !cancelled && setPeople(null));
    return () => {
      cancelled = true;
    };
  }, [docId, isConnected]);

  const rememberEmail = (value: string) => {
    try {
      localStorage.setItem(LAST_EMAIL_KEY, value.trim());
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(email, notify);
      if (email.trim()) rememberEmail(email);
      setMessage(
        email.trim()
          ? `Google Doc created and shared with ${email.trim()} as an editor.`
          : 'Google Doc created. You can share it with someone below.',
      );
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not create the Google Doc.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddPerson = async () => {
    if (!docId) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await shareProjectWithGoogleAccount(docId, email, 'writer', notify);
      rememberEmail(email);
      setPeople((prev) => [...(prev || []).filter((p) => p.id !== perm.id), perm]);
      setMessage(
        `Shared with ${email.trim()} as an editor${notify ? ' (they were emailed a link)' : ''}.`,
      );
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not share the Google Doc.');
    } finally {
      setBusy(false);
    }
  };

  const emailField = (
    <div className="space-y-2">
      <label htmlFor={emailId} className="block text-xs font-semibold text-stone-700">
        Share with (Google account email)
      </label>
      <input
        id={emailId}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@gmail.com"
        className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white text-stone-900 focus:outline-hidden focus:border-stone-500"
      />
      <label className="flex items-center gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Email them a link to the doc
      </label>
    </div>
  );

  return (
    <Modal
      onClose={() => !busy && onClose()}
      labelledBy={titleId}
      className="rounded-2xl border shadow-2xl max-w-lg w-full p-5 space-y-4 bg-white border-stone-200 text-stone-900 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h4 id={titleId} className="font-bold text-sm text-stone-900">
            {docId ? 'Shared Google Doc' : 'Edit together in Google Docs'}
          </h4>
          <p className="text-[11px] text-stone-500 font-mono">{file.path}</p>
        </div>
      </div>

      {!isConnected && (
        <p className="text-xs p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          Connect Google Drive to share this note as a Google Doc.
        </p>
      )}

      {!docId ? (
        <>
          <div className="text-xs text-stone-600 space-y-2 leading-relaxed">
            <p>
              This creates a Google Doc with this note's content and keeps the two in sync. You keep
              editing here; the other person edits the Google Doc. Each side's changes appear in the
              other, and if you both change the same lines you choose which to keep.
            </p>
            <p className="text-stone-500">
              The note's metadata (status, tags, links) stays in mdlife and isn't shown in the doc.
              Simple formatting (headings, bold/italic, lists, checklists, links, tables) works both
              ways; colors, fonts and images added in Docs may be dropped when you save here.
            </p>
          </div>
          {emailField}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || !isConnected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {email.trim() ? 'Create Google Doc & share' : 'Create Google Doc'}
            </button>
          </div>
        </>
      ) : (
        <>
          {message && (
            <p className="text-xs p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
              {message}
            </p>
          )}

          {hasConflict && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                You and the other editor changed the same lines. Syncing is paused for this note
                until you choose what to keep.
              </div>
              <button
                type="button"
                onClick={onResolveConflict}
                className="px-2 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 cursor-pointer shrink-0"
              >
                Resolve
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={docUrl(docId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google Docs
            </a>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={!isConnected || status?.syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${status?.syncing ? 'animate-spin' : ''}`} />
              Sync now
            </button>
            <span className="text-[11px] text-stone-500">
              Last synced: {formatTime(status?.syncedAt)}
            </span>
          </div>
          {status?.error && <p className="text-xs text-red-600">{status.error}</p>}

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-stone-700">People with access</div>
            {people === null ? (
              <p className="text-[11px] text-stone-400">
                {isConnected ? 'Loading…' : 'Connect Google Drive to see who has access.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {people.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-xs text-stone-700"
                  >
                    <span className="truncate">{p.displayName || p.emailAddress || p.type}</span>
                    <span className="text-[10px] uppercase tracking-wide text-stone-400">
                      {p.role === 'writer' ? 'editor' : p.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-stone-100 pt-3 space-y-2">
            {emailField}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleAddPerson}
                disabled={busy || !isConnected || !email.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UserPlus className="w-3.5 h-3.5" />
                )}
                Share as editor
              </button>
            </div>
          </div>

          <div className="border-t border-stone-100 pt-3 flex items-center justify-between gap-2">
            {confirmUnlink ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                <span>
                  Stop syncing? The Google Doc stays in Drive; this note stops updating from it.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onUnlink();
                    onClose();
                  }}
                  className="px-2 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
                >
                  Stop syncing
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnlink(false)}
                  className="px-2 py-1 rounded-md border border-stone-300 hover:bg-stone-100 cursor-pointer"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmUnlink(true)}
                className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-red-600 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                Stop syncing with this doc
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};
