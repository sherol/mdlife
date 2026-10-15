import React from 'react';
import {
  FolderArchive,
  Plus,
  Upload,
  RefreshCw,
  LayoutGrid,
  FileCode,
  Bot,
  Target,
  Rocket,
  CheckCircle2,
  Sparkles,
  HardDrive,
  CloudCheck,
  CloudUpload,
  AlertCircle,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { VaultFile, ActiveTab, DriveConnectionStatus } from '../types';
import { exportVaultAsZip } from '../utils/storage';
import { getTaskProgress } from '../utils/markdownParser';
import { SQUIRREL_FAVICON_DATA_URI } from '../utils/favicon';

interface VaultHeaderProps {
  files: VaultFile[];
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenNewFileModal: () => void;
  onImportFiles: (files: FileList) => void;
  onResetVault: () => void;
  isExportingZip: boolean;
  setIsExportingZip: (v: boolean) => void;
  googleUser: User | null;
  driveStatus?: DriveConnectionStatus;
  unsavedFilesCount?: number;
  onOpenDriveModal: () => void;
  onRefreshDrive?: () => void;
  onReconnectDrive?: () => void;
  onSyncAllUnsaved?: () => void;
  onTestConnection?: () => void;
  isRefreshingDrive?: boolean;
  isMockMode?: boolean;
}

export const VaultHeader: React.FC<VaultHeaderProps> = ({
  files,
  activeTab,
  onSelectTab,
  onOpenNewFileModal,
  onImportFiles,
  onResetVault,
  isExportingZip,
  setIsExportingZip,
  googleUser,
  driveStatus = 'disconnected',
  unsavedFilesCount = 0,
  onOpenDriveModal,
  onRefreshDrive,
  onReconnectDrive,
  onSyncAllUnsaved,
  onTestConnection,
  isRefreshingDrive = false,
  isMockMode = false,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [showFaviconModal, setShowFaviconModal] = React.useState(false);

  // Compute vault stats
  const goalsCount = files.filter(
    (f) => f.folder === 'goals' || f.folder.startsWith('goals/') || f.frontmatter.category === 'goals'
  ).length;
  const projectsCount = files.filter(
    (f) => f.folder === 'projects' || f.folder.startsWith('projects/') || f.frontmatter.category === 'projects'
  ).length;
  const skillsCount = files.filter(
    (f) => f.folder === 'skills' || f.folder.startsWith('skills/') || f.frontmatter.category === 'skills'
  ).length;
  const archiveCount = files.filter(
    (f) => f.folder === 'archive' || f.folder.startsWith('archive/') || f.frontmatter.category === 'archive'
  ).length;

  let totalTasks = 0;
  let completedTasks = 0;
  for (const f of files) {
    const progress = getTaskProgress(f.content);
    totalTasks += progress.total;
    completedTasks += progress.completed;
  }
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleExportZip = async () => {
    try {
      setIsExportingZip(true);
      await exportVaultAsZip(files);
    } catch (err) {
      console.error('Failed to export vault:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Stats */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowFaviconModal(true)}
            title="Click to view the Squirrel .md Favicon & Brand Icon"
            className="w-10 h-10 rounded-xl overflow-hidden shadow-xs border border-stone-800 bg-[#111827] flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all p-0.5 group"
          >
            <img
              src={SQUIRREL_FAVICON_DATA_URI}
              alt="Squirrel .md Favicon"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
            />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-stone-900 tracking-tight">
                Markdown Life & Skills Vault
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                {files.length} markdown files
              </span>
              {isMockMode && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-800 border border-amber-300 flex items-center gap-1"
                  title="Running in local browser storage mode (mock.html)"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                  Offline Mock
                </span>
              )}
            </div>
            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-3 text-xs text-stone-500 mt-0.5 font-sans">
              <span className="inline-flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-amber-600" />
                <strong className="text-stone-800 font-semibold">{goalsCount}</strong> Goals
              </span>
              <span className="text-stone-300">•</span>
              <span className="inline-flex items-center gap-1">
                <Rocket className="w-3.5 h-3.5 text-blue-600" />
                <strong className="text-stone-800 font-semibold">{projectsCount}</strong> Projects
              </span>
              <span className="text-stone-300">•</span>
              <span className="inline-flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-emerald-600" />
                <strong className="text-stone-800 font-semibold">{skillsCount}</strong> Agent Skills
              </span>
              <span className="text-stone-300">•</span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-stone-600" />
                <strong className="text-stone-800 font-semibold">{completedTasks}/{totalTasks}</strong> Tasks ({taskPct}%)
              </span>
              {archiveCount > 0 && (
                <>
                  <span className="text-stone-300">•</span>
                  <span className="inline-flex items-center gap-1 text-stone-400">
                    <FolderArchive className="w-3.5 h-3.5 text-stone-400" />
                    <strong className="text-stone-600 font-semibold">{archiveCount}</strong> Archived
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <div className="flex items-center bg-stone-100 p-1 rounded-lg border border-stone-200 self-start md:self-auto">
          <button
            type="button"
            id="tab-editor"
            onClick={() => onSelectTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'editor'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            File Editor
          </button>
          <button
            type="button"
            id="tab-matrix"
            onClick={() => onSelectTab('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'matrix'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Life Matrix
          </button>
          <button
            type="button"
            id="tab-skills"
            onClick={() => onSelectTab('skills-hub')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'skills-hub'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Agent Skills Lab
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Google Drive Status & Modal Trigger */}
          {!isMockMode && (
            <div className="flex items-center gap-1.5">
              {driveStatus === 'checking' ? (
                <button
                  type="button"
                  disabled
                  id="btn-google-drive-header"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 bg-stone-50 text-stone-600 opacity-80"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-stone-500" />
                  <span>Checking Drive...</span>
                </button>
              ) : driveStatus === 'connected' ? (
                <>
                  <button
                    type="button"
                    id="btn-google-drive-header"
                    onClick={onOpenDriveModal}
                    title={`Google Drive Active (${googleUser?.email || 'Connected'}). Click to sync, reload, test connection, or manage Drive.`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-all cursor-pointer shadow-2xs group"
                  >
                    {isRefreshingDrive ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    ) : googleUser?.photoURL ? (
                      <img
                        src={googleUser.photoURL}
                        alt="Google"
                        referrerPolicy="no-referrer"
                        className="w-4 h-4 rounded-full border border-emerald-300"
                      />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{isRefreshingDrive ? 'Syncing...' : 'Drive Active'}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" title="Connected & Active" />
                    {unsavedFilesCount > 0 && (
                      <span
                        className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300"
                        title={`${unsavedFilesCount} local file(s) with edits not yet in Drive`}
                      >
                        {unsavedFilesCount} unsaved
                      </span>
                    )}
                  </button>
                  {unsavedFilesCount > 0 && onSyncAllUnsaved && (
                    <button
                      type="button"
                      id="btn-sync-all-unsaved-header"
                      disabled={isRefreshingDrive}
                      onClick={onSyncAllUnsaved}
                      title={`Sync all ${unsavedFilesCount} unsaved file(s) to Google Drive immediately`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>Sync ({unsavedFilesCount})</span>
                    </button>
                  )}
                </>
              ) : driveStatus === 'expired' || (driveStatus === 'disconnected' && (googleUser || unsavedFilesCount > 0)) ? (
                <button
                  type="button"
                  id="btn-reconnect-drive-header"
                  onClick={onReconnectDrive || onOpenDriveModal}
                  title="Google Drive disconnected! Click to reconnect with 1-click and sync local files."
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 shadow-2xs transition-all cursor-pointer animate-pulse"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Reconnect Drive</span>
                  {unsavedFilesCount > 0 && (
                    <span
                      className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-200 text-amber-900"
                      title={`${unsavedFilesCount} local file(s) saved safely`}
                    >
                      {unsavedFilesCount} local
                    </span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-google-drive-header"
                  onClick={onOpenDriveModal}
                  title="Connect Google Drive to sync your markdown vault"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 bg-white hover:bg-stone-50 hover:border-blue-400 text-stone-700 transition-all cursor-pointer"
                >
                  <HardDrive className="w-3.5 h-3.5 text-stone-500" />
                  <span>Connect Drive</span>
                </button>
              )}
            </div>
          )}

          {/* Hidden File Input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            type="button"
            id="btn-import-md"
            onClick={() => fileInputRef.current?.click()}
            title="Import .md files"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-stone-500" />
            Import .md
          </button>

          <button
            type="button"
            id="btn-export-zip"
            disabled={isExportingZip}
            onClick={handleExportZip}
            title="Export all markdown files as a .zip vault"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <FolderArchive className="w-3.5 h-3.5 text-stone-500" />
            {isExportingZip ? 'Packing ZIP...' : 'Export .ZIP'}
          </button>

          <button
            type="button"
            id="btn-reset-vault"
            onClick={onResetVault}
            title="Reload initial template vault"
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            id="btn-new-file"
            onClick={onOpenNewFileModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New File
          </button>
        </div>
      </div>

      {/* Favicon & Icon Showcase Modal */}
      {showFaviconModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="rounded-2xl border shadow-2xl max-w-lg w-full p-6 space-y-5 bg-white border-stone-200 text-stone-900">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111827] p-1 flex items-center justify-center shadow-xs">
                  <img src={SQUIRREL_FAVICON_DATA_URI} alt="Favicon" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-stone-900">Vault Favicon & Squirrel Mascot</h3>
                  <p className="text-[11px] text-stone-500">Stylized squirrel with stamped .md imprint</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFaviconModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Large High-Res Preview */}
            <div className="flex flex-col items-center justify-center p-6 bg-stone-100/70 rounded-2xl border border-stone-200/80">
              <div className="w-44 h-44 rounded-3xl overflow-hidden shadow-xl border-2 border-stone-800 bg-[#111827] p-2 flex items-center justify-center">
                <img
                  src={SQUIRREL_FAVICON_DATA_URI}
                  alt="High Resolution Squirrel Favicon"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="mt-3 text-xs font-semibold text-stone-700">
                Vector SVG (Scalable to any size)
              </span>
              <span className="text-[11px] text-stone-400 font-mono">
                512 x 512 px master canvas
              </span>
            </div>

            {/* Standard Browser Favicon Scales Preview */}
            <div>
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
                Favicon Resolution Previews:
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {/* 64px */}
                <div className="flex flex-col items-center p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shadow-xs bg-[#111827] p-1 mb-1.5">
                    <img src={SQUIRREL_FAVICON_DATA_URI} alt="64px" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[10px] font-bold text-stone-700">64 x 64</span>
                  <span className="text-[9px] text-stone-400">PWA / App</span>
                </div>
                {/* 32px */}
                <div className="flex flex-col items-center p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <div className="w-8 h-8 rounded-lg overflow-hidden shadow-xs bg-[#111827] p-0.5 mb-1.5">
                    <img src={SQUIRREL_FAVICON_DATA_URI} alt="32px" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[10px] font-bold text-stone-700">32 x 32</span>
                  <span className="text-[9px] text-stone-400">Retina Tab</span>
                </div>
                {/* 24px */}
                <div className="flex flex-col items-center p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <div className="w-6 h-6 rounded-md overflow-hidden shadow-xs bg-[#111827] p-0.5 mb-1.5">
                    <img src={SQUIRREL_FAVICON_DATA_URI} alt="24px" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[10px] font-bold text-stone-700">24 x 24</span>
                  <span className="text-[9px] text-stone-400">Toolbar</span>
                </div>
                {/* 16px */}
                <div className="flex flex-col items-center p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <div className="w-4 h-4 rounded-xs overflow-hidden shadow-2xs bg-[#111827] mb-1.5">
                    <img src={SQUIRREL_FAVICON_DATA_URI} alt="16px" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[10px] font-bold text-stone-700">16 x 16</span>
                  <span className="text-[9px] text-stone-400">Standard Tab</span>
                </div>
              </div>
            </div>

            {/* Design Specifications */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 text-xs text-stone-600 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700">Mascot:</span>
                <span className="font-mono text-stone-600">Pure White Silhouette Squirrel in Profile</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700">Imprint:</span>
                <span className="font-mono text-stone-900 font-bold">md (Bold black cutout on body)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700">Background:</span>
                <span className="font-mono text-stone-600">#000000 (Pure Black Frame)</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <a
                href={SQUIRREL_FAVICON_DATA_URI}
                download="favicon.svg"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-medium cursor-pointer"
              >
                <span>Download SVG</span>
              </a>
              <button
                type="button"
                onClick={() => setShowFaviconModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 shadow-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
