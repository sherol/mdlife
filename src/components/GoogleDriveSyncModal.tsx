import React, { useId, useState } from 'react';
import {
  X,
  HardDrive,
  CloudUpload,
  CloudDownload,
  Check,
  AlertCircle,
  FolderSync,
  LogOut,
  FolderCheck,
  Loader2,
  Lock,
  ExternalLink,
  RefreshCw,
  Sheet,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { VaultFile } from '../types';
import { syncAllFilesToDrive, importFilesFromDrive } from '../utils/googleDrive';
import { getAccessToken, testDriveConnection } from '../utils/googleAuth';
import {
  getSavedSpreadsheet,
  getSpreadsheetInfo,
  openSheetSyncPicker,
  saveSpreadsheet,
  SheetSyncSpreadsheet,
} from '../utils/sheetSync';
import { Modal } from './Modal';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSignInWithGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  files: VaultFile[];
  onImportFilesFromDrive: (files: VaultFile[]) => void;
  /** Called after "Sync All" completes successfully so the parent can clear its unsaved-file state. */
  onSyncedAll?: () => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  isOpen,
  onClose,
  user,
  onSignInWithGoogle,
  onSignOut,
  files,
  onImportFilesFromDrive,
  onSyncedAll,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; file: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false);
  const [sheetSyncSheet, setSheetSyncSheet] = useState<SheetSyncSpreadsheet | null>(getSavedSpreadsheet);
  const [sheetSyncTabs, setSheetSyncTabs] = useState<string[] | null>(null);
  const [isPickingSheet, setIsPickingSheet] = useState(false);
  const titleId = useId();
  const confirmTitleId = useId();

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    try {
      setIsTestingConnection(true);
      setStatusMessage(null);
      const res = await testDriveConnection();
      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Google Drive connection is active and verified! (User: ${res.email || user?.email})`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Connection issue detected with Google Drive.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to test Google Drive connection.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleChooseSheetSyncSheet = async () => {
    setStatusMessage(null);
    const token = await getAccessToken();
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Google Drive session expired. Please reconnect.' });
      return;
    }
    setIsPickingSheet(true);
    await openSheetSyncPicker({
      accessToken: token,
      onPicked: async (file) => {
        try {
          const info = await getSpreadsheetInfo(file.id);
          const sheet = { id: file.id, name: info.title };
          saveSpreadsheet(sheet);
          setSheetSyncSheet(sheet);
          setSheetSyncTabs(info.tabs);
          setStatusMessage({ type: 'success', text: `mdlife can now read and edit "${info.title}".` });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: err?.message || 'Could not open that spreadsheet.' });
        } finally {
          setIsPickingSheet(false);
        }
      },
      onCancel: () => setIsPickingSheet(false),
      onError: (err) => {
        setIsPickingSheet(false);
        setStatusMessage({ type: 'error', text: err?.message || 'Could not open Google Picker.' });
      },
    });
  };

  const handleCheckSheetSyncSheet = async () => {
    if (!sheetSyncSheet) return;
    setStatusMessage(null);
    setIsPickingSheet(true);
    try {
      const info = await getSpreadsheetInfo(sheetSyncSheet.id);
      setSheetSyncTabs(info.tabs);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Could not open the SheetSync spreadsheet.' });
    } finally {
      setIsPickingSheet(false);
    }
  };

  const handleForgetSheetSyncSheet = () => {
    saveSpreadsheet(null);
    setSheetSyncSheet(null);
    setSheetSyncTabs(null);
  };

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setStatusMessage(null);
      await onSignInWithGoogle();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to sign in with Google' });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleExecuteSyncToDrive = async () => {
    setConfirmSyncOpen(false);
    try {
      setIsSyncing(true);
      setStatusMessage(null);
      const result = await syncAllFilesToDrive(files, (current, total, file) => {
        setSyncProgress({ current, total, file });
      });
      setStatusMessage({
        type: 'success',
        text: `Successfully synced to Google Drive: ${result.uploaded} new file(s) created, ${result.updated} file(s) updated in /Markdown Life Vault.`,
      });
      onSyncedAll?.();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to sync files to Google Drive' });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleExecuteImportFromDrive = async () => {
    try {
      setIsImporting(true);
      setStatusMessage(null);
      const imported = await importFilesFromDrive();
      if (imported.length === 0) {
        setStatusMessage({
          type: 'success',
          text: 'No markdown files found in Google Drive folder "Markdown Life Vault" yet.',
        });
      } else {
        onImportFilesFromDrive(imported);
        setStatusMessage({
          type: 'success',
          text: `Successfully imported ${imported.length} markdown file(s) from your Google Drive!`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to import files from Google Drive' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      closeOnEscape={!confirmSyncOpen}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      className="rounded-2xl border shadow-2xl max-w-lg w-full overflow-hidden transition-colors bg-white border-stone-200 text-stone-900"
    >
        {/* Header */}
        <div className="p-4 md:px-6 border-b flex items-center justify-between bg-stone-50 border-stone-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 id={titleId} className="font-bold text-base text-stone-900">
                Google Drive Storage & Sync
              </h3>
              <p className="text-[11px] text-stone-400">Save and sync markdown files directly to your Drive</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg transition-colors text-stone-400 hover:text-stone-700 hover:bg-stone-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex flex-col gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {statusMessage.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed font-medium">{statusMessage.text}</span>
              </div>
              {statusMessage.text.includes('unauthorized-domain') && typeof window !== 'undefined' && (
                <div className="text-[11px] pt-1.5 border-t border-red-200 space-y-1">
                  <div>
                    Domain <code className="font-mono bg-red-100 px-1 py-0.5 rounded">{window.location.hostname}</code> must be authorized in Firebase.
                  </div>
                  <a
                    href="https://console.firebase.google.com/project/gen-lang-client-0609175245/authentication/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                  >
                    Open Firebase Console Settings &rarr; Authorized Domains
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {(statusMessage.text.toLowerCase().includes('401') ||
                statusMessage.text.toLowerCase().includes('expired') ||
                statusMessage.text.toLowerCase().includes('not authenticated') ||
                statusMessage.text.toLowerCase().includes('token')) && (
                <div className="pt-2 border-t border-red-200 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-red-700">
                    Google Drive session needs re-authentication to sync.
                  </span>
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer shrink-0 shadow-xs"
                  >
                    {isSigningIn ? 'Connecting...' : 'Reconnect Drive'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* User Auth Section */}
          {!user ? (
            <div className="text-center py-4 space-y-4">
              <div className="max-w-xs mx-auto text-stone-500">
                Authorize with your Google account to grant permission to save and sync files in your Google Drive.
              </div>

              {/* Official Google Sign-in Button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  id="btn-google-signin"
                  disabled={isSigningIn}
                  onClick={handleSignIn}
                  className="inline-flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 rounded-lg shadow-xs transition-all font-medium text-xs cursor-pointer disabled:opacity-50"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  )}
                  <span>{isSigningIn ? 'Connecting to Google...' : 'Sign in with Google'}</span>
                </button>
              </div>

              <p className="text-[11px] text-stone-400 max-w-sm mx-auto flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" />
                Uses least-privilege permission: only accesses your vault files and documents you explicitly choose to import.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Account Card */}
              <div className="p-3.5 rounded-xl border flex items-center justify-between bg-stone-50 border-stone-200">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google Account'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full border border-stone-300"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
                      {(user.displayName || user.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-stone-800">
                        {user.displayName || 'Google Account'}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-medium">
                        Connected
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-400 font-mono block">{user.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    title="Verify Google Drive API connection and token validity"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-white border-stone-200 hover:bg-stone-50 text-stone-700"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin text-blue-600' : 'text-stone-500'}`} />
                    <span>{isTestingConnection ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onSignOut}
                    title="Disconnect Google Account"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors bg-white border-stone-200 hover:bg-stone-100 text-stone-600"
                  >
                    <LogOut className="w-3 h-3" />
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Target Location in Drive */}
              <div className="p-3.5 rounded-xl border space-y-2 bg-blue-50/50 border-blue-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5 text-blue-600">
                    <FolderCheck className="w-4 h-4" />
                    Google Drive Destination
                  </span>
                  <span className="font-mono text-[10px] text-stone-400">drive.google.com</span>
                </div>
                <div className="font-mono text-xs text-stone-700 bg-white/70 p-2 rounded border border-stone-200">
                  📁 Google Drive / <strong>Markdown Life Vault</strong>
                  <div className="text-[10px] text-stone-400 ml-4 mt-0.5">
                    ├── 1. /goals/ (Goals)<br />
                    ├── 2. /projects/ (Projects)<br />
                    ├── 3. /skills/ (Agent Skills)<br />
                    ├── 4. /notes/ (Notes)<br />
                    └── 5. /archive/ (Archive)
                  </div>
                </div>
              </div>

              {/* SheetSync spreadsheet */}
              <div className="p-3.5 rounded-xl border space-y-2 bg-emerald-50/50 border-emerald-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5 text-emerald-700">
                    <Sheet className="w-4 h-4" />
                    SheetSync Spreadsheet
                  </span>
                  {sheetSyncSheet && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${sheetSyncSheet.id}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {sheetSyncSheet ? (
                  <div className="text-stone-700">
                    <strong>{sheetSyncSheet.name}</strong>
                    {sheetSyncTabs && (
                      <div className="text-[11px] text-stone-500 mt-0.5">Tabs: {sheetSyncTabs.join(', ')}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-500">
                    Choose your SheetSync spreadsheet once to let mdlife read and edit it. mdlife gets access to that
                    one spreadsheet only.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    id="btn-choose-sheetsync-sheet"
                    onClick={handleChooseSheetSyncSheet}
                    disabled={isPickingSheet}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-white border-stone-200 hover:bg-stone-50 text-stone-700 disabled:opacity-50"
                  >
                    {isPickingSheet && <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />}
                    {sheetSyncSheet ? 'Choose a different sheet' : 'Choose SheetSync sheet'}
                  </button>
                  {sheetSyncSheet && (
                    <>
                      <button
                        type="button"
                        onClick={handleCheckSheetSyncSheet}
                        disabled={isPickingSheet}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors bg-white border-stone-200 hover:bg-stone-50 text-stone-700 disabled:opacity-50"
                      >
                        Check access
                      </button>
                      <button
                        type="button"
                        onClick={handleForgetSheetSyncSheet}
                        disabled={isPickingSheet}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors bg-white border-stone-200 hover:bg-stone-100 text-stone-600 disabled:opacity-50"
                      >
                        Forget
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar (if syncing) */}
              {syncProgress && (
                <div className="space-y-1 p-3 rounded-lg border border-blue-200 bg-blue-50/60">
                  <div className="flex justify-between text-[11px] text-blue-700 font-medium">
                    <span>Syncing file: {syncProgress.file}</span>
                    <span>{syncProgress.current} / {syncProgress.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  id="btn-sync-to-drive-trigger"
                  disabled={isSyncing || isImporting}
                  onClick={() => setConfirmSyncOpen(true)}
                  className="p-3 rounded-xl border text-left flex items-start gap-3 transition-all disabled:opacity-50 cursor-pointer bg-white border-stone-200 hover:border-blue-500 hover:bg-blue-50/20"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">Sync All to Google Drive</div>
                    <div className="text-[11px] text-stone-500">
                      Upload and update all {files.length} markdown files into Google Drive
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-import-from-drive"
                  disabled={isSyncing || isImporting}
                  onClick={handleExecuteImportFromDrive}
                  className="p-3 rounded-xl border text-left flex items-start gap-3 transition-all disabled:opacity-50 cursor-pointer bg-white border-stone-200 hover:border-emerald-500 hover:bg-emerald-50/20"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">Import from Google Drive</div>
                    <div className="text-[11px] text-stone-500">
                      Pull all existing .md files from your Google Drive vault folder
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between text-[11px] text-stone-500 bg-stone-50 border-stone-200">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Google Workspace Drive API v3
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border rounded-lg transition-colors bg-white border-stone-200 text-stone-700 hover:bg-stone-100"
          >
            Close
          </button>
        </div>
    </Modal>

      {/* Explicit User Confirmation Dialog for Mutating Drive Data */}
      {confirmSyncOpen && (
        <Modal
          onClose={() => setConfirmSyncOpen(false)}
          labelledBy={confirmTitleId}
          overlayClassName="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-100"
          className="rounded-xl border shadow-xl max-w-md w-full p-5 space-y-4 bg-white border-stone-200 text-stone-900"
        >
            <div className="flex items-center gap-2.5 text-amber-500">
              <FolderSync className="w-5 h-5" />
              <h4 id={confirmTitleId} className="font-bold text-sm text-stone-900">
                Confirm Google Drive Synchronization
              </h4>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to sync <strong>{files.length} markdown file(s)</strong> to your Google Drive?
              This will create or overwrite files in folder <strong>"Markdown Life Vault"</strong> on your Google account ({user?.email}).
            </p>

            <div className="max-h-32 overflow-y-auto p-2 rounded bg-stone-100 border border-stone-200 text-[11px] font-mono space-y-0.5">
              {files.map((f) => (
                <div key={f.id} className="truncate text-stone-500">
                  📁 {f.path}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSyncOpen(false)}
                className="px-3 py-1.5 rounded-lg border text-xs border-stone-200 text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-drive-sync"
                onClick={handleExecuteSyncToDrive}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
              >
                Confirm & Sync Files
              </button>
            </div>
        </Modal>
      )}
    </>
  );
};
