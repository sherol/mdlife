import React, { useState, useEffect, useId } from 'react';
import {
  Rocket,
  X,
  UserPlus,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Trash2,
  Loader2,
  HardDrive,
  Users,
  AlertCircle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { DriveConnectionStatus } from '../types';
import {
  DrivePermission,
  ProjectShareInfo,
  getProjectFolderShareInfo,
  shareProjectWithGoogleAccount,
  updateProjectPermissionRole,
  removeProjectPermission,
} from '../utils/googleDrive';
import { Modal } from './Modal';
import { getErrorMessage } from '../utils/errors';

type ShareRole = 'reader' | 'writer' | 'commenter';

const ROLE_LABELS: Record<ShareRole, string> = {
  writer: 'Editor',
  commenter: 'Commenter',
  reader: 'Viewer',
};

const roleLabel = (role: string) => ROLE_LABELS[role as ShareRole] || 'Viewer';

interface ShareProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectFolder: string; // e.g. "projects/ai-infrastructure" or "projects"
  googleUser: User | null;
  driveStatus: DriveConnectionStatus;
  isMockMode?: boolean;
  onOpenConnectDrive?: () => void;
}

export const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
  isOpen,
  onClose,
  projectFolder,
  googleUser,
  driveStatus,
  isMockMode = false,
  onOpenConnectDrive,
}) => {
  const [shareInfo, setShareInfo] = useState<ProjectShareInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New collaborator form states
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<ShareRole>('writer');
  const [sendNotification, setSendNotification] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'info';
  } | null>(null);

  // Clean human-readable project title
  const projectSlug = projectFolder.replace(/^projects\/?/, '');
  const projectTitle = projectSlug
    ? projectSlug
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'All Projects';

  const isConnected = driveStatus === 'connected' && !isMockMode && !!googleUser;
  // Sharing only works against real Google Drive permissions. The offline mock build keeps a
  // clearly-labelled local simulation; a disconnected real vault cannot share at all.
  const canShare = isConnected || isMockMode;
  const titleId = useId();

  const loadDriveShareInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await getProjectFolderShareInfo(projectFolder);
      setShareInfo(info);
    } catch (err) {
      console.error('Failed to load Google Drive sharing info:', err);
      setError(getErrorMessage(err) || 'Could not load Google Drive project permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMockShareInfo = () => {
    setIsLoading(true);
    try {
      const savedShares = localStorage.getItem(`mock_shares_${projectFolder}`);
      const mockPerms: DrivePermission[] = savedShares ? JSON.parse(savedShares) : [];

      setShareInfo({
        folderId: `mock-folder-${projectSlug || 'root'}`,
        folderName: projectTitle,
        projectPath: projectFolder,
        webViewLink: `https://drive.google.com/drive/folders/mock-${projectSlug || 'projects'}`,
        permissions: mockPerms,
        ownerEmail: googleUser?.email || 'you@example.com',
        ownerDisplayName: googleUser?.displayName || 'Vault Owner',
      });
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  // Load share permissions when modal opens
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-close (intentional, see eslint.config.js)
      setShareInfo(null);
      setError(null);
      setStatusMessage(null);
      setEmailInput('');
      return;
    }

    if (isConnected) {
      loadDriveShareInfo();
    } else if (isMockMode) {
      // Offline mock build (mock.html): simulated permissions kept in localStorage
      loadMockShareInfo();
    } else {
      setShareInfo(null);
    }
    // Reload only when the modal opens or the folder/connection changes; the loaders are
    // recreated every render, so listing them would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectFolder, isConnected, isMockMode]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!canShare) {
      setError('Connect Google Drive to share this project.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please provide a valid Google Account email address.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      if (isConnected && shareInfo?.folderId) {
        const newPerm = await shareProjectWithGoogleAccount(
          shareInfo.folderId,
          cleanEmail,
          roleInput,
          sendNotification,
        );
        setShareInfo((prev) =>
          prev
            ? {
                ...prev,
                permissions: [
                  ...prev.permissions.filter((p) => p.emailAddress !== cleanEmail),
                  newPerm,
                ],
              }
            : null,
        );
        setStatusMessage({
          type: 'success',
          text: `Shared project with ${cleanEmail} (${roleLabel(roleInput)}).${
            sendNotification ? ' Google Drive notification sent.' : ''
          }`,
        });
      } else if (isMockMode) {
        // Offline mock build: simulated share stored locally only
        const newPerm: DrivePermission = {
          id: `mock-${Date.now()}`,
          type: 'user',
          role: roleInput,
          emailAddress: cleanEmail,
          displayName: cleanEmail.split('@')[0],
        };
        const updated = [...(shareInfo?.permissions || []), newPerm];
        localStorage.setItem(`mock_shares_${projectFolder}`, JSON.stringify(updated));
        setShareInfo((prev) => (prev ? { ...prev, permissions: updated } : null));
        setStatusMessage({
          type: 'success',
          text: `Added ${cleanEmail} to project collaborators (offline mock mode, not shared).`,
        });
      } else {
        throw new Error(
          'Could not load the Google Drive folder for this project. Try reopening this dialog.',
        );
      }

      setEmailInput('');
    } catch (err) {
      console.error('Error sharing project:', err);
      setError(
        getErrorMessage(err) ||
          'Failed to share project folder. Ensure the email is a registered Google account.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveCollaborator = async (permId: string, email?: string) => {
    try {
      if (isConnected && shareInfo?.folderId) {
        await removeProjectPermission(shareInfo.folderId, permId);
      } else if (!isMockMode) {
        return;
      }
      setShareInfo((prev) => {
        if (!prev) return null;
        const nextPerms = prev.permissions.filter((p) => p.id !== permId);
        if (!isConnected) {
          localStorage.setItem(`mock_shares_${projectFolder}`, JSON.stringify(nextPerms));
        }
        return { ...prev, permissions: nextPerms };
      });
      setStatusMessage({
        type: 'info',
        text: `Removed access for ${email || 'collaborator'}.`,
      });
    } catch (err) {
      console.error('Error removing collaborator:', err);
      setError(getErrorMessage(err) || 'Failed to remove collaborator.');
    }
  };

  const handleRoleChange = async (permId: string, newRole: ShareRole) => {
    try {
      if (isConnected && shareInfo?.folderId) {
        const updated = await updateProjectPermissionRole(shareInfo.folderId, permId, newRole);
        setShareInfo((prev) =>
          prev
            ? {
                ...prev,
                permissions: prev.permissions.map((p) =>
                  p.id === permId ? { ...p, role: updated.role } : p,
                ),
              }
            : null,
        );
      } else if (isMockMode) {
        setShareInfo((prev) => {
          if (!prev) return null;
          const nextPerms = prev.permissions.map((p) =>
            p.id === permId ? { ...p, role: newRole } : p,
          );
          localStorage.setItem(`mock_shares_${projectFolder}`, JSON.stringify(nextPerms));
          return { ...prev, permissions: nextPerms };
        });
      } else {
        return;
      }
      setStatusMessage({
        type: 'success',
        text: `Updated role to ${roleLabel(newRole)}.`,
      });
    } catch (err) {
      console.error('Error updating role:', err);
      setError(getErrorMessage(err) || 'Failed to update role.');
    }
  };

  const handleCopyLink = () => {
    const link = shareInfo?.webViewLink || window.location.href;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-stone-200 bg-stone-50/70 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-2xs shrink-0">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id={titleId} className="font-bold text-stone-900 text-base leading-tight">
                Share Project: {projectTitle}
              </h3>
            </div>
            <p className="text-xs text-stone-500 font-mono mt-0.5">/{projectFolder}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
          title="Close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal Body */}
      <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
        {/* Connection Status Pill & Direct Drive Link */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-100 border border-stone-200">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive
              className={`w-4 h-4 shrink-0 ${isConnected ? 'text-emerald-600' : 'text-stone-500'}`}
            />
            <div className="truncate">
              <span className="font-medium text-stone-800 block text-xs truncate">
                {isConnected
                  ? 'Google Drive Folder'
                  : isMockMode
                    ? 'Offline Mock Mode'
                    : 'Google Drive not connected'}
              </span>
              <span className="text-[10px] text-stone-500 block truncate">
                {isConnected
                  ? `Syncs with /Markdown Life Vault/${projectFolder}`
                  : 'Connect Google Drive to share live with Google accounts'}
              </span>
            </div>
          </div>

          {shareInfo?.webViewLink && (
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white hover:bg-stone-50 text-stone-700 rounded-md border border-stone-300 transition-colors cursor-pointer"
                title="Copy Google Drive folder link"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-stone-500" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              <a
                href={shareInfo.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-stone-200 text-stone-500 hover:text-stone-800 rounded transition-colors"
                title="Open folder directly in Google Drive"
                aria-label="Open folder in Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {!isConnected && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-medium leading-snug">
                {isMockMode
                  ? 'Offline mock mode: sharing is simulated locally'
                  : 'Connect Google Drive to share'}
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                {isMockMode
                  ? 'Nothing added here is actually shared. In the real app, projects are shared via Google Drive’s native permissions.'
                  : 'Projects are shared via Google Drive’s native permissions, allowing other Google accounts to view and collaborate on your Markdown files.'}
              </p>
              {onOpenConnectDrive && !isMockMode && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConnectDrive();
                  }}
                  className="mt-1 inline-flex items-center gap-1 font-semibold text-[11px] text-blue-700 hover:underline cursor-pointer"
                >
                  <span>Connect Google Drive</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Feedback messages */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {statusMessage && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-stone-100 border border-stone-200 text-stone-800'
            }`}
          >
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Add Collaborator Form */}
        <form
          onSubmit={handleShare}
          className="space-y-3 p-3.5 bg-stone-50 rounded-xl border border-stone-200"
        >
          <fieldset disabled={!canShare} className="space-y-3 disabled:opacity-60">
            <label
              htmlFor={`${titleId}-email`}
              className="block font-semibold text-stone-800 text-xs"
            >
              Add Google Account
            </label>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                <input
                  id={`${titleId}-email`}
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="colleague@gmail.com or Workspace email"
                  required
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-blue-500 font-sans"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={roleInput}
                  aria-label="Access role"
                  onChange={(e) => setRoleInput(e.target.value as ShareRole)}
                  className="bg-white border border-stone-300 rounded-lg py-1.5 px-2 text-xs font-medium text-stone-800 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                >
                  <option value="writer">Editor (Can edit)</option>
                  <option value="reader">Viewer (Read only)</option>
                  <option value="commenter">Commenter</option>
                </select>

                <button
                  type="submit"
                  disabled={!canShare || isSubmitting || !emailInput.trim()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Share</span>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-stone-600 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span>Send notification email from Google Drive</span>
            </label>
          </fieldset>
        </form>

        {/* People with Access */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-stone-800 text-xs flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-stone-500" />
              <span>People with access</span>
            </h4>
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />}
          </div>

          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-white">
            {/* Owner */}
            <div className="p-3 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-stone-800 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                  {(shareInfo?.ownerDisplayName || googleUser?.displayName || 'Y').charAt(0)}
                </div>
                <div className="truncate">
                  <span className="font-medium text-stone-900 block truncate text-xs">
                    {shareInfo?.ownerDisplayName || googleUser?.displayName || 'You'} (Owner)
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono block truncate">
                    {shareInfo?.ownerEmail || googleUser?.email || 'Current Account'}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-200 text-stone-700 shrink-0">
                Owner
              </span>
            </div>

            {/* Collaborators List */}
            {shareInfo?.permissions
              ?.filter((p) => p.role !== 'owner' && p.type !== 'owner')
              ?.map((perm) => (
                <div
                  key={perm.id}
                  className="p-3 flex items-center justify-between hover:bg-stone-50 transition-colors gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {perm.photoLink ? (
                      <img
                        src={perm.photoLink}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full border border-stone-200 shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center uppercase shrink-0">
                        {(perm.displayName || perm.emailAddress || 'U').charAt(0)}
                      </div>
                    )}
                    <div className="truncate">
                      <span className="font-medium text-stone-900 block truncate text-xs">
                        {perm.displayName || perm.emailAddress || 'Google Collaborator'}
                      </span>
                      {perm.emailAddress && (
                        <span className="text-[10px] text-stone-500 font-mono block truncate">
                          {perm.emailAddress}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={
                        perm.role === 'writer' || perm.role === 'commenter' ? perm.role : 'reader'
                      }
                      onChange={(e) => handleRoleChange(perm.id, e.target.value as ShareRole)}
                      aria-label={`Access role for ${perm.emailAddress || perm.displayName || 'collaborator'}`}
                      className="bg-stone-50 border border-stone-200 rounded px-1.5 py-1 text-[11px] font-medium text-stone-700 focus:outline-hidden focus:border-blue-400 cursor-pointer"
                    >
                      <option value="writer">Editor</option>
                      <option value="commenter">Commenter</option>
                      <option value="reader">Viewer</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRemoveCollaborator(perm.id, perm.emailAddress)}
                      className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Remove access"
                      aria-label={`Remove access for ${perm.emailAddress || perm.displayName || 'collaborator'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

            {(!shareInfo?.permissions ||
              shareInfo.permissions.filter((p) => p.role !== 'owner').length === 0) && (
              <div className="p-4 text-center text-stone-400 text-xs italic">
                {canShare
                  ? 'No other accounts have access yet. Add a colleague above to collaborate!'
                  : 'Connect Google Drive to see and manage who has access.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 sm:p-4 border-t border-stone-200 bg-stone-50/50 flex items-center justify-between text-xs">
        <span className="text-[11px] text-stone-500 flex items-center gap-1">
          <Shield className="w-3.5 h-3.5 text-stone-400" />
          <span>Google Drive permissions apply instantly</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </Modal>
  );
};
