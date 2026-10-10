import React, { useState } from 'react';
import {
  Folder,
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
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Tag,
  Pencil,
  Check,
  X,
  Archive,
  Calendar,
  FolderPlus,
} from 'lucide-react';
import { VaultFile, FileCategory } from '../types';
import { getTaskProgress } from '../utils/markdownParser';
import { exportSingleFile } from '../utils/storage';

interface VaultSidebarProps {
  files: VaultFile[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
  onDuplicateFile: (file: VaultFile) => void;
  onRenameFile: (id: string, newFileName: string) => Promise<boolean> | boolean;
  onQuickNewFileInFolder: (folder: string) => void;
  onDropFiles: (fileList: FileList) => void;
}

export const VaultSidebar: React.FC<VaultSidebarProps> = ({
  files,
  selectedFileId,
  onSelectFile,
  onDeleteFile,
  onDuplicateFile,
  onRenameFile,
  onQuickNewFileInFolder,
  onDropFiles,
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

  const toggleSubfolder = (subfolderKey: string) => {
    setOpenSubfolders((prev) => ({
      ...prev,
      [subfolderKey]: !prev[subfolderKey],
    }));
  };

  // Top-level categories ordered strictly:
  // 1. Goals & OKRs
  // 2. Projects & Initiatives
  // 3. Agent Skills
  // 4. Notes & Rituals
  // 5. Archive
  const standardFolders = ['goals', 'projects', 'skills', 'notes', 'archive'];
  const folderOrder: Record<string, number> = {
    goals: 1,
    projects: 2,
    skills: 3,
    notes: 4,
    archive: 5,
  };

  // Find any other custom top-level folders
  const allTopFolders = Array.from(
    new Set([
      ...standardFolders,
      ...files.map((f) => (f.folder ? f.folder.split('/')[0] : 'notes')),
    ])
  );

  const folders = allTopFolders.sort((a, b) => {
    const orderA = folderOrder[a] ?? 50;
    const orderB = folderOrder[b] ?? 50;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.localeCompare(b);
  });

  // Helper to determine which top-level category a file belongs to
  const getTopLevelCategory = (file: VaultFile): string => {
    if (file.folder) {
      const top = file.folder.split('/')[0].toLowerCase().trim();
      if (top === 'goals' || top.includes('goal')) return 'goals';
      if (top === 'projects' || top.includes('project')) return 'projects';
      if (top === 'skills' || top.includes('skill')) return 'skills';
      if (top === 'notes' || top.includes('note')) return 'notes';
      if (top === 'archive' || top.includes('archive')) return 'archive';
      return file.folder.split('/')[0];
    }
    if (file.frontmatter.category) {
      const cat = file.frontmatter.category.toLowerCase().trim();
      if (cat === 'goals' || cat.includes('goal')) return 'goals';
      if (cat === 'projects' || cat.includes('project')) return 'projects';
      if (cat === 'skills' || cat.includes('skill')) return 'skills';
      if (cat === 'notes' || cat.includes('note')) return 'notes';
      if (cat === 'archive' || cat.includes('archive')) return 'archive';
      return file.frontmatter.category;
    }
    return 'notes';
  };

  // Filtered files
  const filteredFiles = files.filter((file) => {
    const fileCategory = getTopLevelCategory(file);
    const matchesCategory =
      activeCategoryFilter === 'all' ||
      fileCategory === activeCategoryFilter ||
      file.folder === activeCategoryFilter ||
      file.frontmatter.category === activeCategoryFilter;

    if (!matchesCategory) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesName = file.name.toLowerCase().includes(q);
    const matchesTitle = file.frontmatter.title?.toLowerCase().includes(q);
    const matchesTags = file.frontmatter.tags?.some((t) => t.toLowerCase().includes(q));
    const matchesContent = file.content.toLowerCase().includes(q);

    return matchesName || matchesTitle || matchesTags || matchesContent;
  });

  const getCategoryIcon = (folder: string) => {
    const top = folder.split('/')[0];
    switch (top) {
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
    const progress = getTaskProgress(file.content);
    let title = file.frontmatter.title || file.name.replace(/\.md$/, '');
    if ((title.toUpperCase() === 'SKILL' || title.toLowerCase() === 'untitled') && file.folder.includes('/')) {
      const sub = file.folder.split('/').pop() || '';
      const formatted = sub.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      title = `${formatted} (${file.name.replace(/\.md$/, '')})`;
    }
    const status = file.frontmatter.status;
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
              className="flex-1 text-xs font-mono py-0.5 px-1.5 bg-stone-50 border border-stone-200 rounded text-stone-900 focus:outline-hidden focus:border-stone-500 focus:bg-white min-w-0"
            />
            <span className="text-[10px] font-mono text-stone-400 shrink-0">.md</span>
            <button
              type="button"
              title="Save filename"
              onClick={() => handleConfirmRename(file.id)}
              className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors cursor-pointer shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Cancel"
              onClick={handleCancelRename}
              className="p-1 hover:bg-stone-100 text-stone-400 hover:text-stone-600 rounded transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={isSelected ? 'text-white' : ''}>
            {getCategoryIcon(file.folder)}
          </span>

          <div className="truncate flex-1">
            <span className="truncate block text-xs">{title}</span>
            <span
              className={`text-[10px] block truncate font-mono ${
                isSelected ? 'text-stone-300' : 'text-stone-400'
              }`}
            >
              {file.name}
            </span>
          </div>
        </div>

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
            >
              <CheckCircle className="w-2.5 h-2.5" />
              {progress.completed}/{progress.total}
            </span>
          )}

          {/* Status Indicator */}
          {status && progress.total === 0 && (
            <span
              className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono ${
                isSelected
                  ? 'bg-stone-800 text-stone-200'
                  : status === 'active' || status === 'in-progress'
                  ? 'bg-amber-100 text-amber-800'
                  : status === 'archived'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {status}
            </span>
          )}

          {/* Hover Actions */}
          <div className="hidden group-hover/item:flex items-center gap-0.5">
            <button
              type="button"
              title="Rename file"
              onClick={(e) => {
                e.stopPropagation();
                startRenaming(file);
              }}
              className={`p-1 rounded cursor-pointer ${
                isSelected
                  ? 'hover:bg-stone-800 text-stone-300'
                  : 'hover:bg-stone-300 text-stone-500'
              }`}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Duplicate file"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateFile(file);
              }}
              className={`p-1 rounded cursor-pointer ${
                isSelected
                  ? 'hover:bg-stone-800 text-stone-300'
                  : 'hover:bg-stone-300 text-stone-500'
              }`}
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Download .md file"
              onClick={(e) => {
                e.stopPropagation();
                exportSingleFile(file);
              }}
              className={`p-1 rounded cursor-pointer ${
                isSelected
                  ? 'hover:bg-stone-800 text-stone-300'
                  : 'hover:bg-stone-300 text-stone-500'
              }`}
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Delete file"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(file.id);
              }}
              className={`p-1 rounded cursor-pointer ${
                isSelected
                  ? 'hover:bg-red-900 text-red-200'
                  : 'hover:bg-red-100 text-red-600'
              }`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-72 md:w-80 flex-shrink-0 bg-stone-50 border-r border-stone-200 flex flex-col h-[calc(100vh-61px)] transition-colors select-none ${
        isDragOver ? 'bg-amber-50/50 border-amber-300' : ''
      }`}
    >
      {/* Search & Filter Header */}
      <div className="p-3 border-b border-stone-200 bg-white">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
          <input
            type="text"
            id="input-search-files"
            placeholder="Search vault, tags, content..."
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
              { id: 'goals', label: '1. Goals' },
              { id: 'projects', label: '2. Projects' },
              { id: 'skills', label: '3. Agent Skills' },
              { id: 'notes', label: '4. Notes' },
              { id: 'archive', label: '5. Archive' },
            ] as const
          ).map((tab) => {
            const count =
              tab.id === 'all'
                ? files.length
                : files.filter((f) => getTopLevelCategory(f) === tab.id).length;
            const isSelected = activeCategoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`filter-${tab.id}`}
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

        {folders.map((folder) => {
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

          // Specialized handling for Projects (Sub-directory per project)
          if (folder === 'projects') {
            // Find distinct project sub-directories
            const distinctProjects = Array.from(
              new Set(
                folderFiles
                  .filter((f) => f.folder.startsWith('projects/'))
                  .map((f) => f.folder.replace('projects/', '').split('/')[0])
                  .filter(Boolean)
              )
            ).sort((a, b) => a.localeCompare(b));

            // Any project files in root projects folder
            const rootProjectFiles = folderFiles.filter((f) => f.folder === 'projects');

            return (
              <div key={folder} className="space-y-0.5">
                {/* Folder Header */}
                <div className="flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group">
                  <button
                    type="button"
                    id={`folder-btn-${folder}`}
                    onClick={() => toggleFolder(folder)}
                    className="flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )}
                    {isOpen ? (
                      <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    )}
                    <span>{getFolderLabel(folder)}</span>
                    <span className="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5">
                      ({folderFiles.length})
                    </span>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="Add Project sub-directory"
                      onClick={() => setIsAddingProject(true)}
                      className="text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Project
                    </button>
                    <button
                      type="button"
                      id={`quick-add-${folder}`}
                      onClick={() => onQuickNewFileInFolder(distinctProjects[0] ? `projects/${distinctProjects[0]}` : 'projects/new-project')}
                      title="Quick new project file"
                      className="p-1 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-directories and Files */}
                {isOpen && (
                  <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                    {/* Inline Project creation input */}
                    {isAddingProject && (
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
                            onClick={() => setIsAddingProject(false)}
                            className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Project Sub-directories */}
                    {distinctProjects.map((projSlug) => {
                      const projectKey = `projects/${projSlug}`;
                      const isProjOpen = isSubfolderOpen(projectKey);
                      const projectFilesInSub = folderFiles.filter((f) => f.folder === projectKey);

                      // Human-friendly project label
                      const projectLabel = projSlug
                        .split('-')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');

                      return (
                        <div key={projectKey} className="space-y-0.5">
                          {/* Project Sub-directory Header */}
                          <div className="flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/proj">
                            <button
                              type="button"
                              onClick={() => toggleSubfolder(projectKey)}
                              className="flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer min-w-0"
                            >
                              {isProjOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              )}
                              <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="font-semibold truncate max-w-[130px]" title={projectKey}>
                                {projectLabel}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono shrink-0">
                                ({projectFilesInSub.length})
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onQuickNewFileInFolder(projectKey)}
                              title={`Add new file to ${projSlug}`}
                              className="p-0.5 opacity-0 group-hover/proj:opacity-100 hover:bg-blue-100 text-blue-800 rounded cursor-pointer transition-opacity shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Project Files */}
                          {isProjOpen && (
                            <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                              {projectFilesInSub.map((file) => renderFileItem(file))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Root Project Files if any */}
                    {rootProjectFiles.length > 0 && (
                      <div className="space-y-0.5 pt-0.5">
                        {rootProjectFiles.map((file) => renderFileItem(file))}
                      </div>
                    )}

                    {folderFiles.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-stone-400 italic">
                        Empty projects folder
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Specialized handling for Archive (Year Sub-directories and + Year button)
          if (folder === 'archive') {
            // Find distinct years
            const distinctYears = Array.from(
              new Set(
                folderFiles
                  .filter((f) => f.folder.startsWith('archive/'))
                  .map((f) => f.folder.replace('archive/', '').split('/')[0])
                  .filter(Boolean)
              )
            ).sort((a, b) => b.localeCompare(a));

            // Any archive files at root level (e.g. folder === 'archive')
            const rootArchiveFiles = folderFiles.filter((f) => f.folder === 'archive');

            return (
              <div key={folder} className="space-y-0.5">
                {/* Folder Header */}
                <div className="flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group">
                  <button
                    type="button"
                    id={`folder-btn-${folder}`}
                    onClick={() => toggleFolder(folder)}
                    className="flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )}
                    <Archive className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span>{getFolderLabel(folder)}</span>
                    <span className="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5">
                      ({folderFiles.length})
                    </span>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      title="Add Year sub-directory to archive"
                      onClick={() => setIsAddingYear(true)}
                      className="text-[10px] font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Year
                    </button>
                    <button
                      type="button"
                      id={`quick-add-${folder}`}
                      onClick={() =>
                        onQuickNewFileInFolder(distinctYears[0] ? `archive/${distinctYears[0]}` : 'archive/2025')
                      }
                      title="Quick new archive file"
                      className="p-1 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-directories and Files */}
                {isOpen && (
                  <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                    {/* Inline Year creation input */}
                    {isAddingYear && (
                      <div className="p-2 bg-purple-50/80 border border-purple-200 rounded-lg my-1">
                        <span className="text-[10px] font-semibold text-purple-900 block mb-1">
                          New Archive Year Sub-Directory:
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newYearValue}
                            onChange={(e) => setNewYearValue(e.target.value)}
                            placeholder="e.g. 2025"
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
                            onClick={() => setIsAddingYear(false)}
                            className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Year Sub-directories */}
                    {distinctYears.map((year) => {
                      const yearKey = `archive/${year}`;
                      const isYearOpen = isSubfolderOpen(yearKey);
                      const yearFiles = folderFiles.filter((f) => f.folder === yearKey);

                      return (
                        <div key={yearKey} className="space-y-0.5">
                          {/* Year Sub-directory Header */}
                          <div className="flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/year">
                            <button
                              type="button"
                              onClick={() => toggleSubfolder(yearKey)}
                              className="flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer"
                            >
                              {isYearOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              )}
                              <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span className="font-mono font-semibold">{year}</span>
                              <span className="text-[10px] text-stone-400 font-mono">
                                ({yearFiles.length})
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onQuickNewFileInFolder(yearKey)}
                              title={`Add new file to archive/${year}`}
                              className="p-0.5 opacity-0 group-hover/year:opacity-100 hover:bg-purple-100 text-purple-800 rounded cursor-pointer transition-opacity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Year Files */}
                          {isYearOpen && (
                            <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                              {yearFiles.map((file) => renderFileItem(file))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Root Archive Files if any */}
                    {rootArchiveFiles.length > 0 && (
                      <div className="space-y-0.5 pt-0.5">
                        {rootArchiveFiles.map((file) => renderFileItem(file))}
                      </div>
                    )}

                    {folderFiles.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-stone-400 italic">
                        Empty archive
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Specialized handling for Skills (Sub-directory per skill or capability package)
          if (folder === 'skills') {
            const distinctSkills = Array.from(
              new Set(
                folderFiles
                  .filter((f) => f.folder.toLowerCase().startsWith('skills/') && f.folder.split('/').length > 1)
                  .map((f) => f.folder.replace(/^skills\//i, '').split('/')[0])
                  .filter(Boolean)
              )
            ).sort((a, b) => a.localeCompare(b));

            const rootSkillFiles = folderFiles.filter(
              (f) => f.folder.toLowerCase() === 'skills' || !f.folder.toLowerCase().startsWith('skills/')
            );

            return (
              <div key={folder} className="space-y-0.5">
                {/* Skills Header */}
                <div className="flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group">
                  <button
                    type="button"
                    id={`folder-btn-${folder}`}
                    onClick={() => toggleFolder(folder)}
                    className="flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )}
                    {isOpen ? (
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span>{getFolderLabel(folder)}</span>
                    <span className="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5">
                      ({folderFiles.length})
                    </span>
                  </button>

                  <button
                    type="button"
                    id={`quick-add-${folder}`}
                    onClick={() => onQuickNewFileInFolder('skills')}
                    title="Add new skill file"
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Sub-directories and Files */}
                {isOpen && (
                  <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                    {/* Skill Sub-directories */}
                    {distinctSkills.map((skillSlug) => {
                      const skillKey = `skills/${skillSlug}`;
                      const isSkillOpen = isSubfolderOpen(skillKey);
                      const skillFilesInSub = folderFiles.filter(
                        (f) =>
                          f.folder.toLowerCase() === skillKey.toLowerCase() ||
                          f.folder.toLowerCase().startsWith(`${skillKey.toLowerCase()}/`)
                      );

                      const skillLabel = skillSlug
                        .split(/[-_]/)
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');

                      return (
                        <div key={skillKey} className="space-y-0.5">
                          <div className="flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group/skill">
                            <button
                              type="button"
                              onClick={() => toggleSubfolder(skillKey)}
                              className="flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer min-w-0"
                            >
                              {isSkillOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              )}
                              <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-semibold truncate max-w-[130px]" title={skillKey}>
                                {skillLabel}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono shrink-0">
                                ({skillFilesInSub.length})
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onQuickNewFileInFolder(skillKey)}
                              title={`Add file to ${skillSlug}`}
                              className="p-0.5 opacity-0 group-hover/skill:opacity-100 hover:bg-emerald-100 text-emerald-800 rounded cursor-pointer transition-opacity shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {isSkillOpen && (
                            <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                              {skillFilesInSub.map((file) => renderFileItem(file))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Root Skill Files */}
                    {rootSkillFiles.length > 0 && (
                      <div className="space-y-0.5 pt-0.5">
                        {rootSkillFiles.map((file) => renderFileItem(file))}
                      </div>
                    )}

                    {folderFiles.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-stone-400 italic">
                        Empty skills folder
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // Standard / Goals / Notes / Custom folders
          return (
            <div key={folder} className="space-y-0.5">
              {/* Folder Header */}
              <div className="flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group">
                <button
                  type="button"
                  id={`folder-btn-${folder}`}
                  onClick={() => toggleFolder(folder)}
                  className="flex items-center gap-1.5 font-semibold text-xs tracking-wider uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  )}
                  {isOpen ? (
                    folder === 'goals' ? (
                      <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    ) : folder === 'skills' ? (
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : folder === 'notes' ? (
                      <FolderOpen className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )
                  ) : folder === 'goals' ? (
                    <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : folder === 'skills' ? (
                    <Folder className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : folder === 'notes' ? (
                    <Folder className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  )}
                  <span>{getFolderLabel(folder)}</span>
                  <span className="text-[10px] font-normal text-stone-400 lowercase font-mono ml-0.5">
                    ({folderFiles.length})
                  </span>
                </button>

                <button
                  type="button"
                  id={`quick-add-${folder}`}
                  onClick={() => onQuickNewFileInFolder(folder)}
                  title={`Add new ${folder} file`}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-800 cursor-pointer transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Files in this Folder */}
              {isOpen && (
                <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                  {folderFiles.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-stone-400 italic">
                      Empty folder
                    </div>
                  ) : (
                    folderFiles.map((file) => renderFileItem(file))
                  )}
                </div>
              )}
            </div>
          );
        })}

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
