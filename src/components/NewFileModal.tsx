import React, { useId, useRef, useState } from 'react';
import {
  X,
  Target,
  Rocket,
  Bot,
  FileText,
  Archive,
  FolderPlus,
  Calendar,
  Folder,
  Sheet,
} from 'lucide-react';
import { FileCategory } from '../types';
import { Modal } from './Modal';

const slugify = (val: string) =>
  val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

interface NewFileModalProps {
  initialFolder?: string;
  existingFolders: string[];
  onClose: () => void;
  onCreateFile: (folder: string, filename: string, title: string) => void;
  onOpenImportGoogleDoc?: () => void;
  /** Shown for Notes: pick the SheetSync spreadsheet and open it as a note. */
  onImportSheetSync?: () => void;
}

export const NewFileModal: React.FC<NewFileModalProps> = ({
  initialFolder = 'goals',
  existingFolders,
  onClose,
  onCreateFile,
  onOpenImportGoogleDoc,
  onImportSheetSync,
}) => {
  // Determine initial state based on initialFolder
  const getInitialState = () => {
    if (initialFolder.startsWith('archive/')) {
      return {
        cat: 'archive' as FileCategory,
        year: initialFolder.split('/')[1] || new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder === 'archive') {
      return {
        cat: 'archive' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder === 'goals' || initialFolder.startsWith('goals/')) {
      return {
        cat: 'goals' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder.startsWith('projects/')) {
      return {
        cat: 'projects' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: initialFolder.split('/')[1] || '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder === 'projects') {
      return {
        cat: 'projects' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder === 'skills') {
      return {
        cat: 'skills' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    if (initialFolder === 'notes') {
      return {
        cat: 'notes' as FileCategory,
        year: new Date().getFullYear().toString(),
        proj: '',
        custom: '',
        isCustom: false,
      };
    }
    return {
      cat: 'custom' as FileCategory,
      year: new Date().getFullYear().toString(),
      proj: '',
      custom: initialFolder,
      isCustom: true,
    };
  };

  const initState = getInitialState();
  const [category, setCategory] = useState<FileCategory>(initState.cat);
  const [archiveYear, setArchiveYear] = useState<string>(initState.year);
  const [projectSubfolder, setProjectSubfolder] = useState<string>(initState.proj);
  // Until the user edits the project sub-directory field (or one was preselected), it is derived from the title.
  const [projectSubfolderTouched, setProjectSubfolderTouched] = useState<boolean>(!!initState.proj);
  const [isCustomFolder, setIsCustomFolder] = useState<boolean>(initState.isCustom);
  const [customFolderName, setCustomFolderName] = useState<string>(initState.custom);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const effectiveProjectSubfolder = projectSubfolderTouched ? projectSubfolder : slugify(title);

  // Extract existing archive years and existing project folders from existingFolders
  const existingArchiveYears = Array.from(
    new Set(
      existingFolders
        .filter((f) => f.startsWith('archive/'))
        .map((f) => f.replace('archive/', '').split('/')[0])
        .filter(Boolean),
    ),
  );
  const currentYearStr = new Date().getFullYear().toString();
  if (!existingArchiveYears.includes(currentYearStr)) existingArchiveYears.push(currentYearStr);
  existingArchiveYears.sort((a, b) => b.localeCompare(a));

  const existingProjectFolders = Array.from(
    new Set(
      existingFolders
        .filter((f) => f.startsWith('projects/'))
        .map((f) => f.replace('projects/', '').split('/')[0])
        .filter(Boolean),
    ),
  );

  const handleTitleChange = (val: string) => {
    setTitle(val);
    // Auto-generate clean markdown slug
    const clean = slugify(val);
    setSlug(clean ? `${clean}.md` : '');
  };

  const handleProjectSubfolderChange = (val: string) => {
    setProjectSubfolderTouched(true);
    setProjectSubfolder(val);
  };

  const computeFinalFolder = () => {
    if (isCustomFolder) {
      return customFolderName.trim().toLowerCase() || 'custom';
    }
    if (category === 'goals') {
      return 'goals';
    }
    if (category === 'projects') {
      const cleanProject = effectiveProjectSubfolder
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return cleanProject ? `projects/${cleanProject}` : 'projects';
    }
    if (category === 'archive') {
      const year = archiveYear.trim() || new Date().getFullYear().toString();
      return `archive/${year}`;
    }
    if (category === 'skills') {
      return 'skills';
    }
    return 'notes';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalFolder = computeFinalFolder();
    const finalFilename = slug.endsWith('.md') ? slug : `${slug || 'untitled'}.md`;
    const finalTitle = title.trim() || slug.replace(/\.md$/, '');

    if (!finalFolder || !finalFilename) return;
    onCreateFile(finalFolder, finalFilename, finalTitle);
    onClose();
  };

  const finalFolderPreview = computeFinalFolder();

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={isCustomFolder ? undefined : titleInputRef}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden"
    >
      {/* Modal Header */}
      <div className="p-4 px-6 border-b border-stone-200 flex items-center justify-between bg-stone-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm">
            +
          </div>
          <div>
            <h3 id={titleId} className="font-bold text-stone-900 text-sm">
              Create Markdown File
            </h3>
            <p className="text-[11px] text-stone-500">
              Organize under structured vault folders and sub-directories
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        {/* Category Selector */}
        <div>
          <span id={`${titleId}-dest`} className="block text-stone-700 font-semibold mb-1.5">
            Vault Destination
          </span>
          <div
            role="group"
            aria-labelledby={`${titleId}-dest`}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
            <button
              type="button"
              onClick={() => {
                setCategory('goals');
                setIsCustomFolder(false);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                !isCustomFolder && category === 'goals'
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Target className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">1. Goals</span>
                <span className="text-[10px] opacity-70">Strategic outcomes</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('projects');
                setIsCustomFolder(false);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                !isCustomFolder && category === 'projects'
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Rocket className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">2. Projects</span>
                <span className="text-[10px] opacity-70">Per-project sub-dir</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('skills');
                setIsCustomFolder(false);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                !isCustomFolder && category === 'skills'
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Bot className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">3. Agent Skills</span>
                <span className="text-[10px] opacity-70">Prompt spec</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('notes');
                setIsCustomFolder(false);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                !isCustomFolder && category === 'notes'
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <FileText className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">4. Notes</span>
                <span className="text-[10px] opacity-70">Daily scratchpad</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('archive');
                setIsCustomFolder(false);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                !isCustomFolder && category === 'archive'
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Archive className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">5. Archive</span>
                <span className="text-[10px] opacity-70">Year sub-directory</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsCustomFolder(true);
              }}
              className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer ${
                isCustomFolder
                  ? 'border-stone-900 bg-stone-900 text-white shadow-xs'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <FolderPlus className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-xs">Custom Folder</span>
                <span className="text-[10px] opacity-70">Arbitrary path</span>
              </div>
            </button>
          </div>

          {/* Dynamic Sub-directory Configuration */}
          {!isCustomFolder && category === 'archive' && (
            <div className="mt-3 p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-purple-900 font-semibold flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                  Archive Year Sub-Directory
                </span>
                <span className="text-[10px] text-purple-700 font-mono">archive/YYYY</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={archiveYear}
                  onChange={(e) => setArchiveYear(e.target.value.trim())}
                  aria-label="Archive year"
                  placeholder={`e.g. ${currentYearStr}, ${Number(currentYearStr) - 1}`}
                  className="flex-1 p-2 bg-white border border-purple-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-hidden focus:border-purple-500"
                />
                <div className="flex items-center gap-1">
                  {existingArchiveYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setArchiveYear(yr)}
                      className={`px-2 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                        archiveYear === yr
                          ? 'bg-purple-600 text-white font-medium'
                          : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isCustomFolder && category === 'projects' && (
            <div className="mt-3 p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-blue-900 font-semibold flex items-center gap-1.5 text-xs">
                  <Folder className="w-3.5 h-3.5 text-blue-600" />
                  Project Sub-Directory
                </span>
                <span className="text-[10px] text-blue-700 font-mono">projects/[name]</span>
              </div>
              <input
                type="text"
                aria-label="Project sub-directory"
                value={effectiveProjectSubfolder}
                onChange={(e) => handleProjectSubfolderChange(e.target.value)}
                placeholder="e.g. autonomous-research-agent, mobile-app"
                className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-hidden focus:border-blue-500"
              />
              {existingProjectFolders.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-stone-400">Existing:</span>
                  {existingProjectFolders.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleProjectSubfolderChange(p)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors truncate max-w-[140px] ${
                        effectiveProjectSubfolder === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-blue-800 border border-blue-200 hover:bg-blue-100'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isCustomFolder && (
            <div className="mt-3 p-3 bg-stone-100 border border-stone-200 rounded-xl space-y-1.5">
              <label
                htmlFor={`${titleId}-custom`}
                className="block text-stone-800 font-semibold text-xs"
              >
                Custom Folder Path
              </label>
              <input
                id={`${titleId}-custom`}
                type="text"
                placeholder="e.g. routines, reading/2026"
                value={customFolderName}
                onChange={(e) => setCustomFolderName(e.target.value)}
                className="w-full p-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-hidden focus:border-stone-500"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="input-new-file-title" className="block text-stone-700 font-semibold mb-1">
            Title or Objective
          </label>
          <input
            ref={titleInputRef}
            type="text"
            id="input-new-file-title"
            required
            placeholder="e.g. Q4 Growth Architecture"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
          />
        </div>

        {/* Destination Path & Slug Preview */}
        <div>
          <label
            htmlFor={`${titleId}-filename`}
            className="block text-stone-700 font-semibold mb-1"
          >
            Markdown Filename (.md)
          </label>
          <div className="flex items-center gap-1 text-stone-500 font-mono">
            <span className="text-[11px] bg-stone-100 px-2 py-2 rounded-lg border border-stone-200 text-stone-600 truncate max-w-[180px]">
              /{finalFolderPreview}/
            </span>
            <input
              id={`${titleId}-filename`}
              type="text"
              required
              placeholder="filename.md"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="flex-1 p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
            />
          </div>
          <p className="text-[10px] text-stone-400 mt-1 font-mono truncate">
            Full vault path: /{finalFolderPreview}/
            {slug ? (slug.endsWith('.md') ? slug : `${slug}.md`) : 'untitled.md'}
          </p>
        </div>

        {/* Submit & Import Actions */}
        <div className="pt-3 border-t border-stone-200 flex items-center justify-between gap-2">
          <div className="flex flex-col items-start gap-1.5">
            {onOpenImportGoogleDoc && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImportGoogleDoc();
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Import from Google Docs</span>
              </button>
            )}
            {category === 'notes' && !isCustomFolder && onImportSheetSync && (
              <button
                type="button"
                id="btn-new-file-import-sheetsync"
                onClick={() => {
                  onClose();
                  onImportSheetSync();
                }}
                className="text-xs text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <Sheet className="w-3.5 h-3.5" />
                <span>Import SheetSync sheet</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 font-medium cursor-pointer text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-confirm-create-file"
              disabled={!slug.trim()}
              className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-semibold shadow-xs disabled:opacity-50 cursor-pointer text-xs"
            >
              Create File
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
