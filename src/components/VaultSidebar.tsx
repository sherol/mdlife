import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  Footprints,
  FolderOpen,
  FileText,
  Target,
  Rocket,
  Bot,
  Search,
  Plus,
  Trash2,
  Download,
  Copy,
  CheckCircle,
  Tag,
  Pencil,
  Check,
  X,
  Archive,
  Calendar,
  FolderPlus,
  Sheet,
  Share2,
} from 'lucide-react';
import { VaultFile, FileCategory, TaskProgress } from '../types';
import { getTaskProgress } from '../utils/markdownParser';
import { exportSingleFile } from '../utils/storage';
import { STANDARD_FOLDERS, getTopLevelFolder } from '../utils/fileKinds';
import { TRAILHEAD_FOLDER, TRAILHEAD_LABEL, isTrailheadFile } from '../utils/trailhead';
import { SubdirectoryTree, SubfolderVariant } from './SubdirectoryTree';
import { QuickSwitcher } from './QuickSwitcher';

interface VaultSidebarProps {
  files: VaultFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
  onCopyDrivePath?: (file: VaultFile) => void;
  onRenameFile: (id: string, newFileName: string) => Promise<boolean> | boolean;
  onQuickNewFileInFolder: (folder: string) => void;
  onDropFiles: (fileList: FileList) => void;
  onShareProject?: (projectFolder: string) => void;
  /** Notes: pick the SheetSync spreadsheet and open it as a note. */
  onImportSheetSync?: () => void;
}

// Top-level categories ordered strictly:
// 0. Trailhead (start page)
// 1. Goals & OKRs
// 2. Projects & Initiatives
// 3. Agent Skills
// 4. Notes & Rituals
// 5. Archive
const folderOrder: Record<string, number> = {
  [TRAILHEAD_FOLDER]: 0,
  goals: 1,
  projects: 2,
  skills: 3,
  notes: 4,
  archive: 5,
};

const formatSlugLabel = (slug: string) =>
  slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const getCategoryIcon = (topFolder: string) => {
  switch (topFolder) {
    case TRAILHEAD_FOLDER:
      return <Footprints className="w-3.5 h-3.5 text-orange-600 shrink-0" />;
    case 'goals':
      return <Target className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
    case 'projects':
      return <Rocket className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
    case 'skills':
      return <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    case 'archive':
      return <Archive className="w-3.5 h-3.5 text-purple-600 shrink-0" />;
    case 'notes':
    default:
      return <FileText className="w-3.5 h-3.5 text-stone-500 shrink-0" />;
  }
};

const getFolderLabel = (folder: string) => {
  switch (folder) {
    case TRAILHEAD_FOLDER:
      return TRAILHEAD_LABEL;
    case 'goals':
      return '1. Goals';
    case 'projects':
      return '2. Projects';
    case 'skills':
      return '3. Agent Skills';
    case 'notes':
      return '4. Notes';
    case 'archive':
      return '5. Archive';
    default:
      return folder.charAt(0).toUpperCase() + folder.slice(1);
  }
};

const FULL_HEADER_TOGGLE =
  'flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase text-stone-500 hover:text-stone-800 cursor-pointer';

export const VaultSidebar: React.FC<VaultSidebarProps> = ({
  files,
  selectedFileId,
  onSelectFile,
  onDeleteFile,
  onCopyDrivePath,
  onRenameFile,
  onQuickNewFileInFolder,
  onDropFiles,
  onShareProject,
  onImportSheetSync,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | FileCategory>('all');
  // Folders and subfolders are closed by default
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [openSubfolders, setOpenSubfolders] = useState<Record<string, boolean>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');

  // Inline prompt states for adding new year / project subfolders directly
  const [isAddingYear, setIsAddingYear] = useState(false);
  const [newYearValue, setNewYearValue] = useState(new Date().getFullYear().toString());
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectValue, setNewProjectValue] = useState('');

  const startRenaming = (file: VaultFile) => {
    setEditingFileId(file.id);
    setEditingFileName(file.name.replace(/\.md$/, ''));
  };

  const handleConfirmRename = async (fileId: string) => {
    const trimmed = editingFileName.trim();
    if (!trimmed) {
      setEditingFileId(null);
      return;
    }
    await onRenameFile(fileId, trimmed);
    setEditingFileId(null);
  };

  const handleCancelRename = () => {
    setEditingFileId(null);
    setEditingFileName('');
  };

  const isFolderOpen = (folder: string): boolean => {
    if (searchQuery.trim().length > 0) return true;
    return !!openFolders[folder];
  };

  const isSubfolderOpen = (subfolderKey: string): boolean => {
    if (searchQuery.trim().length > 0) return true;
    return !!openSubfolders[subfolderKey];
  };

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }));
  };

  const expandFolder = (folder: string) => {
    setOpenFolders((prev) => (prev[folder] ? prev : { ...prev, [folder]: true }));
  };

  const toggleSubfolder = (subfolderKey: string) => {
    setOpenSubfolders((prev) => ({
      ...prev,
      [subfolderKey]: !prev[subfolderKey],
    }));
  };

  // Top-level folder per file (exact folder matching, see utils/fileKinds)
  const topFolderById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) map.set(f.id, getTopLevelFolder(f));
    return map;
  }, [files]);
  const getTopLevelCategory = (file: VaultFile): string =>
    topFolderById.get(file.id) ?? getTopLevelFolder(file);

  // Standard folders plus any custom top-level folders present in the vault
  const folders = useMemo(
    () =>
      Array.from(new Set<string>([...STANDARD_FOLDERS, ...topFolderById.values()])).sort((a, b) => {
        const orderA = folderOrder[a] ?? 50;
        const orderB = folderOrder[b] ?? 50;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.localeCompare(b);
      }),
    [topFolderById],
  );

  // Task progress badges: parse each file once per content change, not on every render
  const progressById = useMemo(() => {
    const map = new Map<string, TaskProgress>();
    for (const f of files) map.set(f.id, getTaskProgress(f.content));
    return map;
  }, [files]);

  // Filter pill counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const top of topFolderById.values()) counts[top] = (counts[top] || 0) + 1;
    return counts;
  }, [topFolderById]);

  // Auto-expand folder and subfolder for currently selected file
  useEffect(() => {
    if (!selectedFileId) return;
    const activeFile = files.find((f) => f.id === selectedFileId);
    if (!activeFile) return;

    const topFolder = getTopLevelFolder(activeFile);
    if (topFolder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- expand to follow the selection; no-op when already open
      setOpenFolders((prev) => (prev[topFolder] ? prev : { ...prev, [topFolder]: true }));
    }

    const segments = (activeFile.folder || '').split('/');
    if (segments.length > 1 && segments[1]) {
      const subKey = `${topFolder}/${segments[1]}`;
      setOpenSubfolders((prev) => (prev[subKey] ? prev : { ...prev, [subKey]: true }));
    }
  }, [selectedFileId, files]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      const fileCategory = topFolderById.get(file.id);
      const matchesCategory =
        activeCategoryFilter === 'all' ||
        fileCategory === activeCategoryFilter ||
        file.folder === activeCategoryFilter ||
        file.frontmatter.category === activeCategoryFilter;

      if (!matchesCategory) return false;

      if (!q) return true;
      const matchesName = file.name.toLowerCase().includes(q);
      const matchesTitle = file.frontmatter.title?.toLowerCase().includes(q);
      const matchesTags = file.frontmatter.tags?.some((t) => t.toLowerCase().includes(q));
      const matchesContent = file.content.toLowerCase().includes(q);

      return matchesName || matchesTitle || matchesTags || matchesContent;
    });
  }, [files, topFolderById, activeCategoryFilter, searchQuery]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  const handleCreateNewYear = () => {
    const yr = newYearValue.trim();
    if (!yr) return;
    onQuickNewFileInFolder(`archive/${yr}`);
    setIsAddingYear(false);
  };

  const handleCreateNewProject = () => {
    const clean = newProjectValue
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!clean) return;
    onQuickNewFileInFolder(`projects/${clean}`);
    setIsAddingProject(false);
    setNewProjectValue('');
  };

  // Helper to render a file item with consistent alignment
  const renderFileItem = (file: VaultFile) => {
    const isSelected = file.id === selectedFileId;
    // The Trailhead's start.md (vault home page) can't be renamed or deleted
    const isProtected = isTrailheadFile(file);
    const progress = progressById.get(file.id) ?? getTaskProgress(file.content);
    let title = file.frontmatter.title || file.name.replace(/\.md$/, '');
    if (
      (title.toUpperCase() === 'SKILL' || title.toLowerCase() === 'untitled') &&
      file.folder.includes('/')
    ) {
      const sub = file.folder.split('/').pop() || '';
      title = `${formatSlugLabel(sub)} (${file.name.replace(/\.md$/, '')})`;
    }
    const isEditing = file.id === editingFileId;

    if (isEditing) {
      return (
        <div
          key={file.id}
          className="p-1.5 bg-white border border-stone-300 rounded-md shadow-xs my-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-stone-400 pl-1 shrink-0 truncate max-w-[100px]">
              /{file.folder}/
            </span>
            <input
              type="text"
              value={editingFileName}
              onChange={(e) => setEditingFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmRename(file.id);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelRename();
                }
              }}
              autoFocus
              placeholder="filename"
              aria-label={`New name for ${file.name}`}
              className="flex-1 text-xs font-mono py-0.5 px-1.5 bg-stone-50 border border-stone-200 rounded text-stone-900 focus:outline-hidden focus:border-stone-500 focus:bg-white min-w-0"
            />
            <span className="text-[10px] font-mono text-stone-400 shrink-0">.md</span>
            <button
              type="button"
              title="Save filename"
              aria-label="Save filename"
              onClick={() => handleConfirmRename(file.id)}
              className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors cursor-pointer shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Cancel"
              aria-label="Cancel rename"
              onClick={handleCancelRename}
              className="p-1 hover:bg-stone-100 text-stone-400 hover:text-stone-600 rounded transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    const actionButtonClass = `p-1 rounded cursor-pointer ${
      isSelected ? 'hover:bg-stone-800 text-stone-300' : 'hover:bg-stone-300 text-stone-500'
    }`;

    return (
      <div
        key={file.id}
        className={`group/item flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-all ${
          isSelected
            ? 'bg-stone-900 text-white font-medium shadow-xs'
            : 'text-stone-700 hover:bg-stone-200/70'
        }`}
        onClick={() => onSelectFile(file.id)}
      >
        {/* Main (keyboard-focusable) part of the row; its click bubbles to the row */}
        <button
          type="button"
          aria-current={isSelected ? 'page' : undefined}
          title={file.path}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          <span className={isSelected ? 'text-white' : ''}>
            {getCategoryIcon(getTopLevelCategory(file))}
          </span>

          <span className="truncate flex-1">
            <span className="truncate block text-xs">{title}</span>
            <span
              className={`text-[10px] block truncate font-mono ${
                isSelected ? 'text-stone-300' : 'text-stone-400'
              }`}
            >
              {file.name}
            </span>
          </span>
        </button>

        {/* Meta pill or action buttons */}
        <div className="flex items-center gap-1 shrink-0 ml-1.5">
          {/* Task Progress Badge */}
          {progress.total > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex items-center gap-0.5 ${
                isSelected
                  ? 'bg-stone-800 text-stone-200'
                  : progress.completed === progress.total
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-stone-100 text-stone-600'
              }`}
              aria-label={`${progress.completed} of ${progress.total} tasks done`}
            >
              <CheckCircle className="w-2.5 h-2.5" />
              {progress.completed}/{progress.total}
            </span>
          )}

          {/* Actions: always visible when item is selected, and on hover / keyboard focus */}
          <div
            className={`${
              isSelected ? 'flex' : 'hidden group-hover/item:flex group-focus-within/item:flex'
            } items-center gap-0.5`}
          >
            {!isProtected && (
              <button
                type="button"
                title="Rename file"
                aria-label={`Rename ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  startRenaming(file);
                }}
                className={actionButtonClass}
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onCopyDrivePath && (
              <button
                type="button"
                id={`btn-copy-path-${file.id}`}
                title="Copy path in Google Drive (/Markdown Life Vault/...)"
                aria-label={`Copy Google Drive path of ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyDrivePath(file);
                }}
                className={actionButtonClass}
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              title="Download .md file"
              aria-label={`Download ${file.name}`}
              onClick={(e) => {
                e.stopPropagation();
                exportSingleFile(file);
              }}
              className={actionButtonClass}
            >
              <Download className="w-3 h-3" />
            </button>
            {!isProtected && (
              <button
                type="button"
                id={`btn-delete-file-${file.id}`}
                title="Delete file permanently"
                aria-label={`Delete ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className={`p-1 rounded cursor-pointer ${
                  isSelected ? 'hover:bg-red-900 text-red-200' : 'hover:bg-red-100 text-red-600'
                }`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const currentYear = new Date().getFullYear().toString();

  // Sub-directory looks per specialised folder
  const projectSubfolders: SubfolderVariant = {
    rowClassName:
      'flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/proj',
    toggleClassName:
      'flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer flex-1 min-w-0',
    countClassName: 'text-[10px] text-stone-400 font-mono shrink-0 ml-1',
    renderIcon: (open) =>
      open ? (
        <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
      ),
    renderLabel: (slug, subKey) => (
      <span className="font-semibold truncate text-stone-800" title={subKey}>
        {formatSlugLabel(slug)}
      </span>
    ),
    renderActions: (subKey, slug) => (
      <div className="flex items-center gap-0.5 opacity-0 group-hover/proj:opacity-100 group-focus-within/proj:opacity-100 transition-opacity shrink-0">
        {onShareProject && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShareProject(subKey);
            }}
            title={`Share project "${formatSlugLabel(slug)}" with other Google Accounts`}
            aria-label={`Share project ${formatSlugLabel(slug)}`}
            className="p-1 hover:bg-blue-100 text-stone-400 hover:text-blue-700 rounded cursor-pointer transition-colors"
          >
            <Share2 className="w-3 h-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onQuickNewFileInFolder(subKey)}
          title={`Add new file to ${slug}`}
          aria-label={`Add new file to ${slug}`}
          className="p-1 hover:bg-stone-200 text-stone-400 hover:text-stone-800 rounded cursor-pointer transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    ),
  };

  const archiveSubfolders: SubfolderVariant = {
    rowClassName:
      'flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/year',
    toggleClassName:
      'flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer',
    countClassName: 'text-[10px] text-stone-400 font-mono',
    renderIcon: () => <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />,
    renderLabel: (year) => <span className="font-mono font-semibold">{year}</span>,
    renderActions: (subKey) => (
      <button
        type="button"
        onClick={() => onQuickNewFileInFolder(subKey)}
        title={`Add new file to ${subKey}`}
        aria-label={`Add new file to ${subKey}`}
        className="p-0.5 opacity-0 group-hover/year:opacity-100 group-focus-within/year:opacity-100 focus-visible:opacity-100 hover:bg-purple-100 text-purple-800 rounded cursor-pointer transition-opacity"
      >
        <Plus className="w-3 h-3" />
      </button>
    ),
    // Most recent year first
    sort: (a, b) => b.localeCompare(a),
  };

  const skillSubfolders: SubfolderVariant = {
    rowClassName:
      'flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/skill',
    toggleClassName:
      'flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer min-w-0',
    countClassName: 'text-[10px] text-stone-400 font-mono shrink-0',
    renderIcon: () => <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
    renderLabel: (slug, subKey) => (
      <span className="font-semibold truncate max-w-[130px]" title={subKey}>
        {formatSlugLabel(slug)}
      </span>
    ),
    renderActions: (subKey, slug) => (
      <button
        type="button"
        onClick={() => onQuickNewFileInFolder(subKey)}
        title={`Add file to ${slug}`}
        aria-label={`Add file to ${slug}`}
        className="p-0.5 opacity-0 group-hover/skill:opacity-100 group-focus-within/skill:opacity-100 focus-visible:opacity-100 hover:bg-emerald-100 text-emerald-800 rounded cursor-pointer transition-opacity shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    ),
  };

  const renderFolder = (folder: string) => {
    // Files that belong under this top-level folder
    const folderFiles = filteredFiles.filter((f) => getTopLevelCategory(f) === folder);

    // If filtering by activeCategoryFilter and not matching, hide
    if (
      folderFiles.length === 0 &&
      activeCategoryFilter !== 'all' &&
      activeCategoryFilter !== folder
    ) {
      return null;
    }

    const isOpen = isFolderOpen(folder);
    const common = {
      folder,
      files: folderFiles,
      label: getFolderLabel(folder),
      isOpen,
      onToggle: () => toggleFolder(folder),
      isSubfolderOpen,
      onToggleSubfolder: toggleSubfolder,
      renderFileItem,
    };

    // Specialized handling for Projects (Sub-directory per project)
    if (folder === 'projects') {
      const firstProject = folderFiles
        .map((f) => f.folder.split('/')[1])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))[0];

      return (
        <SubdirectoryTree
          key={folder}
          {...common}
          headerToggleClassName={`${FULL_HEADER_TOGGLE} flex-1 min-w-0`}
          headerLabelClassName="truncate"
          headerCountClassName="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5 shrink-0"
          headerIcon={
            isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )
          }
          headerActions={
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
              {onShareProject && (
                <button
                  type="button"
                  title="Share projects with other Google Accounts"
                  aria-label="Share projects with other Google Accounts"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareProject('projects');
                  }}
                  className="p-1 hover:bg-blue-100 text-stone-400 hover:text-blue-600 rounded cursor-pointer transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                title="Add Project sub-directory"
                aria-label="Add Project sub-directory"
                onClick={() => {
                  expandFolder('projects');
                  setIsAddingProject(true);
                }}
                className="p-1 hover:bg-stone-200 text-stone-400 hover:text-blue-600 rounded cursor-pointer transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                id={`quick-add-${folder}`}
                onClick={() =>
                  onQuickNewFileInFolder(
                    firstProject ? `projects/${firstProject}` : 'projects/new-project',
                  )
                }
                title="Quick new project file"
                aria-label="Quick new project file"
                className="p-1 hover:bg-stone-200 text-stone-400 hover:text-stone-800 rounded cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          }
          inlineForm={
            isAddingProject && (
              <div className="p-2 bg-blue-50/80 border border-blue-200 rounded-lg my-1">
                <span className="text-[10px] font-semibold text-blue-900 block mb-1">
                  New Project Sub-Directory:
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newProjectValue}
                    onChange={(e) => setNewProjectValue(e.target.value)}
                    placeholder="e.g. cloud-migration"
                    aria-label="New project sub-directory name"
                    autoFocus
                    className="flex-1 p-1 bg-white border border-blue-300 rounded text-xs font-mono text-stone-900"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNewProject();
                      if (e.key === 'Escape') setIsAddingProject(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewProject}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-medium cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel new project sub-directory"
                    onClick={() => setIsAddingProject(false)}
                    className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          }
          subfolders={projectSubfolders}
          rootFilesHeading={
            <div className="px-2 py-0.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              Files in /projects/
            </div>
          }
          emptyText="Empty projects folder"
        />
      );
    }

    // Specialized handling for Archive (Year Sub-directories and + Year button)
    if (folder === 'archive') {
      const latestYear = folderFiles
        .map((f) => f.folder.split('/')[1])
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0];

      return (
        <SubdirectoryTree
          key={folder}
          {...common}
          headerToggleClassName={FULL_HEADER_TOGGLE}
          headerCountClassName="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5"
          headerIcon={<Archive className="w-3.5 h-3.5 text-purple-500 shrink-0" />}
          headerActions={
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                title="Add Year sub-directory to archive"
                onClick={() => {
                  expandFolder('archive');
                  setIsAddingYear(true);
                }}
                className="text-[10px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
              >
                <Plus className="w-2.5 h-2.5" />
                Year
              </button>
              <button
                type="button"
                id={`quick-add-${folder}`}
                onClick={() => onQuickNewFileInFolder(`archive/${latestYear || currentYear}`)}
                title="Quick new archive file"
                aria-label="Quick new archive file"
                className="p-1 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          }
          inlineForm={
            isAddingYear && (
              <div className="p-2 bg-purple-50/80 border border-purple-200 rounded-lg my-1">
                <span className="text-[10px] font-semibold text-purple-900 block mb-1">
                  New Archive Year Sub-Directory:
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newYearValue}
                    onChange={(e) => setNewYearValue(e.target.value)}
                    placeholder={`e.g. ${currentYear}`}
                    aria-label="New archive year"
                    autoFocus
                    className="flex-1 p-1 bg-white border border-purple-300 rounded text-xs font-mono text-stone-900"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNewYear();
                      if (e.key === 'Escape') setIsAddingYear(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewYear}
                    className="px-2 py-1 bg-purple-600 text-white rounded text-[11px] font-medium cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel new archive year"
                    onClick={() => setIsAddingYear(false)}
                    className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          }
          subfolders={archiveSubfolders}
          emptyText="Empty archive"
        />
      );
    }

    // Specialized handling for Skills (Sub-directory per skill or capability package)
    if (folder === 'skills') {
      return (
        <SubdirectoryTree
          key={folder}
          {...common}
          headerToggleClassName={FULL_HEADER_TOGGLE}
          headerCountClassName="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5"
          headerIcon={
            isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )
          }
          headerActions={
            <button
              type="button"
              id={`quick-add-${folder}`}
              onClick={() => onQuickNewFileInFolder('skills')}
              title="Add new skill file"
              aria-label="Add new skill file"
              className="p-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          }
          subfolders={skillSubfolders}
          emptyText="Empty skills folder"
        />
      );
    }

    // Standard / Goals / Notes / Custom folders (flat list, nested paths included)
    const folderIconColor =
      folder === TRAILHEAD_FOLDER
        ? 'text-orange-500'
        : folder === 'goals'
          ? 'text-amber-500'
          : folder === 'notes'
            ? 'text-stone-500'
            : 'text-stone-400';
    return (
      <SubdirectoryTree
        key={folder}
        {...common}
        headerToggleClassName={FULL_HEADER_TOGGLE}
        headerCountClassName="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5"
        headerIcon={
          isOpen ? (
            <FolderOpen className={`w-3.5 h-3.5 ${folderIconColor} shrink-0`} />
          ) : (
            <Folder className={`w-3.5 h-3.5 ${folderIconColor} shrink-0`} />
          )
        }
        headerActions={
          <div className="flex items-center gap-0.5">
            {folder === 'notes' && onImportSheetSync && (
              <button
                type="button"
                id="import-sheetsync-notes"
                onClick={onImportSheetSync}
                title="Import SheetSync sheet to view and edit"
                aria-label="Import SheetSync sheet"
                className="p-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-emerald-100 rounded text-emerald-600 hover:text-emerald-800 cursor-pointer transition-opacity"
              >
                <Sheet className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              id={`quick-add-${folder}`}
              onClick={() => onQuickNewFileInFolder(folder)}
              title={`Add new ${folder} file`}
              aria-label={`Add new ${folder} file`}
              className="p-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        }
        emptyText="Empty folder"
      />
    );
  };

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="Vault files"
      className={`w-72 md:w-80 flex-shrink-0 bg-stone-50 border-r border-stone-200 flex flex-col h-[calc(100vh-61px)] transition-colors select-none ${
        isDragOver ? 'bg-amber-50/50 border-amber-300' : ''
      }`}
    >
      {/* Ctrl/Cmd+K quick file switcher */}
      <QuickSwitcher files={files} onSelectFile={onSelectFile} />

      {/* Search & Filter Header */}
      <div className="p-3 border-b border-stone-200 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
          <input
            type="text"
            id="input-search-files"
            placeholder="Search vault, tags, content..."
            aria-label="Search vault"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-stone-100 hover:bg-stone-100/80 focus:bg-white border border-stone-200 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-stone-400 transition-colors font-sans"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
          {(
            [
              { id: 'all', label: 'All' },
              { id: TRAILHEAD_FOLDER, label: TRAILHEAD_LABEL },
              { id: 'goals', label: '1. Goals' },
              { id: 'projects', label: '2. Projects' },
              { id: 'skills', label: '3. Agent Skills' },
              { id: 'notes', label: '4. Notes' },
              { id: 'archive', label: '5. Archive' },
            ] as const
          ).map((tab) => {
            const count = tab.id === 'all' ? files.length : categoryCounts[tab.id] || 0;
            const isSelected = activeCategoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`filter-${tab.id}`}
                aria-pressed={isSelected}
                onClick={() => setActiveCategoryFilter(tab.id)}
                className={`px-2 py-0.5 rounded-full whitespace-nowrap font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label} <span className="opacity-70 text-[10px] ml-0.5">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 text-xs">
        {isDragOver && (
          <div className="p-4 border-2 border-dashed border-stone-400 rounded-lg text-center text-xs text-stone-600 bg-white font-medium">
            Drop markdown files here to import into vault
          </div>
        )}

        {folders.map((folder) => renderFolder(folder))}

        {filteredFiles.length === 0 && (
          <div className="p-6 text-center text-stone-400">
            <Tag className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="font-medium text-stone-600">No markdown files match</p>
            <p className="text-[11px] mt-1">Try another search keyword or clear filters.</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-stone-200 text-[11px] text-stone-500 bg-white flex items-center justify-between">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          Auto-saved locally
        </span>
        <span className="font-mono text-stone-400">UTF-8 .md</span>
      </div>
    </aside>
  );
};
