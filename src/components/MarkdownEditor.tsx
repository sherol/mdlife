import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Link as LinkIcon,
  Table,
  Globe,
  Sliders,
  Columns2,
  Eye,
  Edit3,
  CloudUpload,
  Loader2,
  Pencil,
  AlertTriangle,
  Search,
  Calendar,
  Share2,
  FileText,
  Copy,
  Trash2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { VaultFile, FileFrontmatter, DriveConnectionStatus } from '../types';
import { MarkdownPreview } from './MarkdownPreview';
import { parseFrontmatter, stringifyWithFrontmatter } from '../utils/markdownParser';
import { getTodayYYMMDD } from '../utils/date';
import { expandTodayTokens } from '../utils/expandToday';
import { isProjectFile } from '../utils/fileKinds';
import { fileExtension, getFileFormat, stripFileExtension } from '../utils/fileFormats';
import { JsonViewer } from './JsonViewer';

const parseTags = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );

interface MarkdownEditorProps {
  file: VaultFile;
  allFiles: VaultFile[];
  onChangeContent: (newContent: string) => void;
  onNavigateToFile: (filenameOrPath: string) => void;
  onToggleCheckbox: (index: number) => void;
  onOpenSkillPlayground: (file: VaultFile) => void;
  onRenameFile?: (fileId: string, newFileName: string) => Promise<boolean> | boolean;
  onSaveToDrive?: (file: VaultFile) => void;
  onCopyDrivePath?: (file: VaultFile) => void;
  onDeleteFile?: (fileId: string) => void;
  isSavingToDrive?: boolean;
  isDriveSyncing?: boolean;
  driveStatus?: DriveConnectionStatus;
  isUnsavedToDrive?: boolean;
  onReconnectDrive?: () => void;
  googleUser?: User | null;
  onShareProject?: (projectFolder: string) => void;
  /** Sync state when this note is shared as a Google Doc (undefined = feature unavailable). */
  sharedDoc?: { linked: boolean; syncing?: boolean; hasConflict: boolean; error?: string };
  onOpenSharedDoc?: () => void;
  onResolveDocConflict?: () => void;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  file,
  allFiles,
  onChangeContent,
  onNavigateToFile,
  onToggleCheckbox,
  onOpenSkillPlayground,
  onRenameFile,
  onSaveToDrive,
  onCopyDrivePath,
  onDeleteFile,
  isSavingToDrive = false,
  isDriveSyncing = false,
  driveStatus = 'disconnected',
  isUnsavedToDrive = false,
  onReconnectDrive,
  googleUser,
  onShareProject,
  sharedDoc,
  onOpenSharedDoc,
  onResolveDocConflict,
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [showMetadataDrawer, setShowMetadataDrawer] = useState(false);
  const [showWikiDropdown, setShowWikiDropdown] = useState(false);
  const [wikiFilter, setWikiFilter] = useState('');
  const [wikiActiveIndex, setWikiActiveIndex] = useState(0);
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [editingFilenameVal, setEditingFilenameVal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last known caret/selection and scroll position of the source textarea. Some browsers
  // (notably Safari/Firefox) reset these when focus moves to a toolbar control or when React
  // rewrites the textarea value, which made the caret jump to the top after formatting.
  const lastSelectionRef = useRef({ start: 0, end: 0, scrollTop: 0 });
  // Caret/scroll to re-apply after React commits a programmatic content change.
  const pendingCaretRef = useRef<{ start: number; end: number; scrollTop: number } | null>(null);
  const wikiPickerRef = useRef<HTMLDivElement>(null);
  const wikiButtonRef = useRef<HTMLButtonElement>(null);
  // Set when Escape is pressed in the editor so the next Tab moves focus instead of indenting
  const escapePressedRef = useRef(false);

  // Tags are edited as a raw string and only parsed on blur / Enter, so typing "a, " keeps the comma
  const currentTagsString = (file.frontmatter.tags || []).join(', ');
  const [tagsDraft, setTagsDraft] = useState(currentTagsString);
  const isEditingTagsRef = useRef(false);
  useEffect(() => {
    if (!isEditingTagsRef.current) setTagsDraft(currentTagsString);
  }, [file.id, currentTagsString]);

  const commitTags = () => {
    const tags = parseTags(tagsDraft);
    setTagsDraft(tags.join(', '));
    if (tags.join(', ') !== currentTagsString) {
      updateFrontmatterProperty({ tags });
    }
  };

  // Wiki-link picker: filtered list of other files
  const wikiCandidates = useMemo(() => {
    const q = wikiFilter.trim().toLowerCase();
    return allFiles
      .filter((f) => f.id !== file.id)
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          f.path.toLowerCase().includes(q) ||
          (f.frontmatter.title || '').toLowerCase().includes(q),
      );
  }, [allFiles, file.id, wikiFilter]);

  const closeWikiPicker = (returnFocus = false) => {
    setShowWikiDropdown(false);
    setWikiFilter('');
    setWikiActiveIndex(0);
    if (returnFocus) wikiButtonRef.current?.focus();
  };

  // Close the picker on outside click
  useEffect(() => {
    if (!showWikiDropdown) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (wikiPickerRef.current && !wikiPickerRef.current.contains(e.target as Node)) {
        closeWikiPicker();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showWikiDropdown]);

  const handleStartRename = () => {
    setEditingFilenameVal(stripFileExtension(file.name));
    setIsEditingFilename(true);
  };

  const handleSaveFilename = async () => {
    const trimmed = editingFilenameVal.trim();
    if (!trimmed || !onRenameFile) {
      setIsEditingFilename(false);
      return;
    }
    await onRenameFile(file.id, trimmed);
    setIsEditingFilename(false);
  };

  // Quick stats
  const words = file.content.trim() ? file.content.trim().split(/\s+/).length : 0;
  const chars = file.content.length;
  const lines = file.content.split('\n').length;
  const isProject = isProjectFile(file);
  const format = getFileFormat(file.name);
  const isMarkdown = format === 'markdown';

  // Insert markdown snippet at current cursor or selection
  // Only record while the textarea is focused: during/after blur some browsers report a
  // reset selection (0) or scroll position, which must not overwrite the real one.
  const rememberSelection = () => {
    const t = textareaRef.current;
    if (t && document.activeElement === t) {
      lastSelectionRef.current = {
        start: t.selectionStart,
        end: t.selectionEnd,
        scrollTop: t.scrollTop,
      };
    }
  };

  // Re-apply caret and scroll after React has written a new value into the textarea,
  // before the browser paints (so there is no visible jump).
  // Content last sent from this editor; anything else arriving in file.content came from outside
  // (e.g. the other person's edits merged in from a shared Google Doc).
  const lastLocalContentRef = useRef(file.content);
  const prevContentRef = useRef(file.content);

  useLayoutEffect(() => {
    const prev = prevContentRef.current;
    prevContentRef.current = file.content;
    const pending = pendingCaretRef.current;
    const t = textareaRef.current;
    if (!t) return;
    if (pending) {
      pendingCaretRef.current = null;
      t.focus({ preventScroll: true });
      t.setSelectionRange(pending.start, pending.end);
      t.scrollTop = pending.scrollTop;
      rememberSelection();
      return;
    }
    if (file.content === lastLocalContentRef.current || file.content === prev) return;
    lastLocalContentRef.current = file.content;
    // External change: keep the caret on the same text by mapping it through the edit
    // (unchanged prefix/suffix), instead of letting it jump to the end.
    if (document.activeElement !== t) return;
    const next = file.content;
    let prefix = 0;
    while (prefix < prev.length && prefix < next.length && prev[prefix] === next[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < prev.length - prefix &&
      suffix < next.length - prefix &&
      prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) {
      suffix++;
    }
    const delta = next.length - prev.length;
    const mapPos = (pos: number) =>
      pos <= prefix ? pos : pos >= prev.length - suffix ? pos + delta : next.length - suffix;
    const saved = lastSelectionRef.current;
    t.setSelectionRange(mapPos(saved.start), mapPos(saved.end));
    t.scrollTop = saved.scrollTop;
  }, [file.content]);

  const insertText = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // If the textarea still has focus its live selection is authoritative; otherwise use the
    // position remembered before focus moved away (e.g. to the wiki-link picker).
    const live = document.activeElement === textarea;
    const saved = lastSelectionRef.current;
    const max = textarea.value.length;
    const start = Math.min(live ? textarea.selectionStart : saved.start, max);
    const end = Math.min(live ? textarea.selectionEnd : saved.end, max);
    const scrollTop = live ? textarea.scrollTop : saved.scrollTop;

    const selection = textarea.value.substring(start, end) || defaultText;
    const replacement = `${before}${selection}${after}`;
    const selStart = start + before.length;
    const selEnd = selStart + selection.length;

    // Prefer execCommand('insertText') so the edit lands on the browser's native undo stack.
    // It fires a regular input event, which flows through onChange.
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
    let inserted: boolean;
    try {
      inserted =
        typeof document.execCommand === 'function' &&
        document.execCommand('insertText', false, replacement);
    } catch {
      inserted = false;
    }

    if (inserted) {
      // React may still re-sync the value after this input event; restore once it commits too.
      pendingCaretRef.current = { start: selStart, end: selEnd, scrollTop };
      textarea.setSelectionRange(selStart, selEnd);
      textarea.scrollTop = scrollTop;
      rememberSelection();
      return;
    }

    // Fallback: replace the content directly (no native undo); caret restored in the layout effect.
    pendingCaretRef.current = { start: selStart, end: selEnd, scrollTop };
    onChangeContent(
      textarea.value.substring(0, start) + replacement + textarea.value.substring(end),
    );
  };

  // Handles textarea content changes and expands @today to YY-MM-DD string.
  // The caret is mapped through the replacement (it may arrive with trailing text from
  // autocorrect/predictive input or a paste), so it never jumps to the end of the file.
  const handleContentChangeWithToday = (val: string, cursor?: number | null) => {
    if (!isMarkdown || !/@today/i.test(val)) {
      lastLocalContentRef.current = val;
      onChangeContent(val);
      return;
    }
    const textarea = textareaRef.current;
    const caret = typeof cursor === 'number' ? cursor : (textarea?.selectionStart ?? val.length);
    const { text, cursor: newCursor } = expandTodayTokens(val, caret, getTodayYYMMDD());
    pendingCaretRef.current = {
      start: newCursor,
      end: newCursor,
      scrollTop: textarea?.scrollTop ?? 0,
    };
    lastLocalContentRef.current = text;
    onChangeContent(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;

    // Formatting shortcuts (markdown only)
    if (isMarkdown && mod && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      insertText('**', '**', 'bold text');
      return;
    }
    if (isMarkdown && mod && !e.altKey && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      insertText('*', '*', 'italic text');
      return;
    }

    if (e.key === 'Escape') {
      // Escape, then Tab: leave the editor with the keyboard instead of indenting
      escapePressedRef.current = true;
      return;
    }

    // Plain Tab indents (Shift+Tab and modified Tab keep their native focus behaviour)
    if (e.key === 'Tab' && !e.shiftKey && !mod && !e.altKey) {
      if (escapePressedRef.current) {
        escapePressedRef.current = false;
        return;
      }
      e.preventDefault();
      insertText('  ');
      return;
    }

    escapePressedRef.current = false;
  };

  // Update frontmatter properties cleanly
  const updateFrontmatterProperty = (updates: Partial<FileFrontmatter>) => {
    const { frontmatter, body } = parseFrontmatter(file.content);
    const updatedFrontmatter = { ...frontmatter, ...updates };
    const newContent = stringifyWithFrontmatter(updatedFrontmatter, body);
    onChangeContent(newContent);
  };

  const handleInsertWikiLink = (targetFile: VaultFile) => {
    closeWikiPicker();
    insertText(`[[${targetFile.name}]]`);
  };

  const handleWikiFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeWikiPicker(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setWikiActiveIndex((i) => Math.min(i + 1, Math.max(wikiCandidates.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setWikiActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = wikiCandidates[wikiActiveIndex] || wikiCandidates[0];
      if (target) handleInsertWikiLink(target);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {/* Editor Sub-Header & Formatting Toolbar */}
      <div
        className="border-b border-stone-200 bg-stone-50/70 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
        onMouseDown={(e) => {
          // Keep focus (and the caret) in the textarea when toolbar buttons are pressed.
          // Inputs inside the toolbar (e.g. the wiki-link filter) still receive focus normally.
          if ((e.target as HTMLElement).closest('button')) e.preventDefault();
        }}
      >
        {/* Left: Toolbar Actions */}
        <div className="flex items-center gap-1 flex-wrap">
          {isMarkdown && (
            <>
              <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  id="btn-h1"
                  title="Heading 1"
                  aria-label="Heading 1"
                  onClick={() => insertText('# ', '', 'Heading')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Heading1 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-h2"
                  title="Heading 2"
                  aria-label="Heading 2"
                  onClick={() => insertText('## ', '', 'Heading')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Heading2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-h3"
                  title="Heading 3"
                  aria-label="Heading 3"
                  onClick={() => insertText('### ', '', 'Heading')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Heading3 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  id="btn-bold"
                  title="Bold (Ctrl/Cmd+B)"
                  aria-label="Bold"
                  onClick={() => insertText('**', '**', 'bold text')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700 font-bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-italic"
                  title="Italic (Ctrl/Cmd+I)"
                  aria-label="Italic"
                  onClick={() => insertText('*', '*', 'italic text')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  id="btn-task"
                  title="Task Checkbox"
                  aria-label="Task Checkbox"
                  onClick={() => insertText('- [ ] ', '', 'Task description')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-stone-800" />
                </button>
                <button
                  type="button"
                  id="btn-bullet"
                  title="Bullet List"
                  aria-label="Bullet List"
                  onClick={() => insertText('- ', '', 'List item')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-ordered"
                  title="Numbered List"
                  aria-label="Numbered List"
                  onClick={() => insertText('1. ', '', 'Numbered item')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  id="btn-quote"
                  title="Quote"
                  aria-label="Quote"
                  onClick={() => insertText('> ', '', 'Quote')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Quote className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-code"
                  title="Code Block"
                  aria-label="Code Block"
                  onClick={() => insertText('```\n', '\n```', 'code block')}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  id="btn-table"
                  title="Insert Markdown Table"
                  aria-label="Insert Markdown Table"
                  onClick={() =>
                    insertText(
                      '\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Item 1 | Details | Active |\n| Item 2 | Details | Pending |\n\n',
                      '',
                      '',
                    )
                  }
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
                >
                  <Table className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Links Group */}
              <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs gap-0.5">
                <button
                  type="button"
                  id="btn-web-link"
                  title="Insert Web Link"
                  onClick={() => insertText('[', '](https://example.com)', 'Link title')}
                  className="flex items-center gap-1 px-2 py-1 hover:bg-stone-100 rounded text-stone-700 text-xs"
                >
                  <Globe className="w-3.5 h-3.5 text-stone-500" />
                  <span>URL</span>
                </button>

                {/* Link / Wiki-Link Dropdown */}
                <div className="relative" ref={wikiPickerRef}>
                  <button
                    ref={wikiButtonRef}
                    type="button"
                    id="btn-insert-wikilink"
                    title="Insert [[Link]] to another file"
                    aria-haspopup="listbox"
                    aria-expanded={showWikiDropdown}
                    onClick={() =>
                      showWikiDropdown ? closeWikiPicker() : setShowWikiDropdown(true)
                    }
                    className="flex items-center gap-1 px-2 py-1 hover:bg-stone-100 rounded text-stone-700 text-xs"
                  >
                    <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>[[...]]</span>
                  </button>

                  {showWikiDropdown && (
                    <div
                      className="absolute top-full left-0 mt-1 w-64 bg-white border border-stone-200 rounded-lg shadow-lg z-30 p-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          closeWikiPicker(true);
                        }
                      }}
                    >
                      <div className="relative mb-1">
                        <Search className="w-3 h-3 absolute left-2 top-2 text-stone-400" />
                        <input
                          type="text"
                          autoFocus
                          value={wikiFilter}
                          onChange={(e) => {
                            setWikiFilter(e.target.value);
                            setWikiActiveIndex(0);
                          }}
                          onKeyDown={handleWikiFilterKeyDown}
                          placeholder="Filter files to link..."
                          aria-label="Filter files to link"
                          aria-controls="wikilink-picker-list"
                          aria-activedescendant={
                            wikiCandidates[wikiActiveIndex]
                              ? `wikilink-option-${wikiActiveIndex}`
                              : undefined
                          }
                          className="w-full pl-6 pr-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-stone-400"
                        />
                      </div>
                      <div
                        id="wikilink-picker-list"
                        role="listbox"
                        aria-label="Files"
                        className="max-h-56 overflow-y-auto"
                      >
                        {wikiCandidates.length === 0 ? (
                          <div className="px-2 py-1.5 text-[11px] text-stone-400 italic">
                            No matching files
                          </div>
                        ) : (
                          wikiCandidates.map((target, idx) => (
                            <button
                              key={target.id}
                              id={`wikilink-option-${idx}`}
                              type="button"
                              role="option"
                              aria-selected={idx === wikiActiveIndex}
                              tabIndex={-1}
                              onMouseEnter={() => setWikiActiveIndex(idx)}
                              onClick={() => handleInsertWikiLink(target)}
                              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-stone-100 rounded flex items-center justify-between text-stone-800 ${
                                idx === wikiActiveIndex ? 'bg-stone-100' : ''
                              }`}
                            >
                              <span className="truncate">
                                {target.frontmatter.title || target.name}
                              </span>
                              <span className="text-[10px] font-mono text-stone-400 ml-1">
                                /{target.folder}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Today's Date Button (YY-MM-DD string) */}
                <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
                  <button
                    type="button"
                    id="btn-insert-today"
                    title={`Insert today's date (${getTodayYYMMDD()}) or type @today`}
                    onClick={() => insertText(getTodayYYMMDD())}
                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-stone-100 rounded text-stone-700 text-xs font-mono group"
                  >
                    <Calendar className="w-3.5 h-3.5 text-stone-500 group-hover:text-blue-600 transition-colors" />
                    <span className="font-semibold text-stone-800">{getTodayYYMMDD()}</span>
                    <span className="text-[10px] text-stone-400 group-hover:text-stone-600 font-sans">
                      (@today)
                    </span>
                  </button>
                </div>
              </div>

              {/* Metadata Quick Edit Drawer Toggle */}
              <button
                type="button"
                id="btn-toggle-frontmatter-editor"
                onClick={() => setShowMetadataDrawer(!showMetadataDrawer)}
                className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-md transition-colors ${
                  showMetadataDrawer
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Frontmatter</span>
              </button>
            </>
          )}

          {/* Save to Google Drive button */}
          {onSaveToDrive && (
            <button
              type="button"
              id="btn-editor-save-drive"
              disabled={isSavingToDrive || isDriveSyncing}
              onClick={() => {
                if (driveStatus === 'expired' && onReconnectDrive) {
                  onReconnectDrive();
                } else {
                  onSaveToDrive(file);
                }
              }}
              title={
                driveStatus === 'expired'
                  ? 'Drive session expired. Click to reconnect and push local edits to Drive.'
                  : isUnsavedToDrive
                    ? 'Edits exist locally that need saving to Google Drive'
                    : googleUser
                      ? 'Save this file to Google Drive'
                      : 'Connect Google Drive to save'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors shadow-2xs font-medium cursor-pointer disabled:opacity-75 ${
                driveStatus === 'expired'
                  ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                  : isUnsavedToDrive
                    ? 'border-amber-300 bg-amber-50/80 hover:bg-amber-100 text-amber-900'
                    : 'border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700'
              }`}
            >
              {isSavingToDrive || isDriveSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : driveStatus === 'expired' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <CloudUpload
                  className={`w-3.5 h-3.5 ${isUnsavedToDrive ? 'text-amber-600' : 'text-blue-600'}`}
                />
              )}
              <span>
                {isSavingToDrive
                  ? 'Saving...'
                  : isDriveSyncing
                    ? 'Syncing...'
                    : driveStatus === 'expired'
                      ? 'Drive Expired – Reconnect'
                      : isUnsavedToDrive
                        ? 'Save to Drive (Unsaved)'
                        : 'Save to Drive'}
              </span>
              {isUnsavedToDrive && driveStatus !== 'expired' && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
                  title="Unsaved changes pending"
                />
              )}
            </button>
          )}

          {/* Edit together via a shared Google Doc */}
          {sharedDoc && onOpenSharedDoc && (
            <button
              type="button"
              id="btn-editor-shared-doc"
              onClick={onOpenSharedDoc}
              aria-label={sharedDoc.linked ? 'Google Doc' : 'Edit in Google Docs'}
              title={
                sharedDoc.linked
                  ? 'This note syncs with a shared Google Doc. Click for details and sharing.'
                  : 'Share this note as a Google Doc that someone else can edit in Google Docs'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-colors shadow-2xs font-medium cursor-pointer ${
                sharedDoc.linked
                  ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800'
                  : 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 ${sharedDoc.syncing ? 'animate-pulse' : ''}`} />
              {sharedDoc.linked && (sharedDoc.hasConflict || sharedDoc.error) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Needs attention" />
              )}
            </button>
          )}

          {/* Share Project with other Google Accounts button */}
          {isProject && onShareProject && (
            <button
              type="button"
              id="btn-editor-share-project"
              onClick={() => onShareProject(file.folder || 'projects')}
              aria-label="Share Project"
              title="Share this project with other Google Accounts via Google Drive"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-800 rounded-md transition-colors shadow-2xs font-medium cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
            </button>
          )}

          {/* Delete File button */}
          {onDeleteFile && (
            <button
              type="button"
              id="btn-editor-delete-file"
              onClick={() => onDeleteFile(file.id)}
              aria-label="Delete"
              title="Delete this file permanently from vault and Google Drive"
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-red-200 bg-red-50/80 hover:bg-red-100 text-red-700 rounded-md transition-colors shadow-2xs font-medium cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-600" />
            </button>
          )}
        </div>

        {/* Right: View Mode Toggle (Split, Edit, Preview) */}
        <div className="flex items-center bg-stone-200/70 p-0.5 rounded-lg border border-stone-300/60">
          <button
            type="button"
            id="btn-view-edit"
            onClick={() => setViewMode('edit')}
            title="Editor only"
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'edit'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Edit3 className="w-3 h-3" />
            Edit
          </button>
          <button
            type="button"
            id="btn-view-split"
            onClick={() => setViewMode('split')}
            title="Split view"
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'split'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Columns2 className="w-3 h-3" />
            Split
          </button>
          <button
            type="button"
            id="btn-view-preview"
            onClick={() => setViewMode('preview')}
            title="Rendered preview only"
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
              viewMode === 'preview'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Optional Metadata Quick-Editor Bar */}
      {showMetadataDrawer && (
        <div className="bg-stone-50 border-b border-stone-200 px-4 py-3 text-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-150">
          {/* Status */}
          <div>
            <label
              htmlFor="frontmatter-status-select"
              className="block text-stone-500 font-medium mb-1"
            >
              Status
            </label>
            <select
              id="frontmatter-status-select"
              value={file.frontmatter.status || 'active'}
              onChange={(e) =>
                updateFrontmatterProperty({
                  status: e.target.value as FileFrontmatter['status'],
                })
              }
              className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 text-xs"
            >
              <option value="active">Active</option>
              <option value="in-progress">In Progress</option>
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="frontmatter-priority-select"
              className="block text-stone-500 font-medium mb-1"
            >
              Priority
            </label>
            <select
              id="frontmatter-priority-select"
              value={file.frontmatter.priority || 'medium'}
              onChange={(e) =>
                updateFrontmatterProperty({
                  priority: e.target.value as FileFrontmatter['priority'],
                })
              }
              className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 text-xs"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Target Date */}
          <div>
            <label
              htmlFor="frontmatter-target-date"
              className="block text-stone-500 font-medium mb-1"
            >
              Target Date
            </label>
            <input
              id="frontmatter-target-date"
              type="date"
              value={file.frontmatter.target_date || ''}
              onChange={(e) => updateFrontmatterProperty({ target_date: e.target.value })}
              className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 text-xs"
            />
          </div>

          {/* Tags */}
          <div>
            <label
              htmlFor="frontmatter-tags-input"
              className="block text-stone-500 font-medium mb-1"
            >
              Tags (comma separated)
            </label>
            <input
              id="frontmatter-tags-input"
              type="text"
              placeholder="goals, 2026, tech"
              value={tagsDraft}
              onFocus={() => {
                isEditingTagsRef.current = true;
              }}
              onChange={(e) => setTagsDraft(e.target.value)}
              onBlur={() => {
                isEditingTagsRef.current = false;
                commitTags();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTags();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setTagsDraft(currentTagsString);
                }
              }}
              className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 text-xs"
            />
          </div>

          {/* Quick Filename Rename in Drawer */}
          {onRenameFile && (
            <div className="sm:col-span-2 lg:col-span-4 pt-2 border-t border-stone-200/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-stone-500 font-medium">Filename:</span>
                <code className="font-mono text-stone-800 bg-white border border-stone-200 px-2 py-0.5 rounded">
                  {file.path}
                </code>
              </div>
              <button
                type="button"
                onClick={handleStartRename}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded font-medium text-xs transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                <span>Rename File</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Connection Expired or Disconnected Banner */}
      {(driveStatus === 'expired' || (driveStatus === 'disconnected' && !!googleUser)) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Google Drive disconnected.</strong>{' '}
              {isUnsavedToDrive
                ? 'Your latest edits are safe in browser storage. Click to reconnect and sync.'
                : 'Your files are safe in local storage. Click Reconnect to resume sync.'}
            </span>
          </div>
          {onReconnectDrive && (
            <button
              type="button"
              id="btn-reconnect-drive-banner"
              onClick={onReconnectDrive}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              Reconnect Drive
            </button>
          )}
        </div>
      )}

      {/* Main Split Body: Editor | Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Source Markdown Editor */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div
            className={`flex-1 flex flex-col h-full bg-stone-50/30 ${
              viewMode === 'split' ? 'border-r border-stone-200' : ''
            }`}
          >
            <div className="px-4 py-1.5 bg-stone-100/60 border-b border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
              {isEditingFilename ? (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="font-mono text-stone-500">/{file.folder}/</span>
                  <input
                    type="text"
                    value={editingFilenameVal}
                    onChange={(e) => setEditingFilenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveFilename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsEditingFilename(false);
                      }
                    }}
                    autoFocus
                    className="font-mono text-xs px-2 py-0.5 bg-white border border-stone-300 rounded text-stone-900 focus:outline-hidden focus:border-stone-500 min-w-48"
                  />
                  <span className="font-mono text-stone-500">{fileExtension(file.name)}</span>
                  <button
                    type="button"
                    onClick={handleSaveFilename}
                    className="px-2 py-0.5 bg-stone-900 text-white hover:bg-stone-800 rounded text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingFilename(false)}
                    className="px-2 py-0.5 bg-stone-200 text-stone-700 hover:bg-stone-300 rounded text-[11px] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <span className="font-mono text-stone-700 font-semibold">{file.path}</span>
                  {onCopyDrivePath && (
                    <button
                      type="button"
                      onClick={() => onCopyDrivePath(file)}
                      title="Copy file path in Google Drive (/Markdown Life Vault/...)"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-stone-500 hover:text-stone-800 hover:bg-stone-200/80 rounded transition-colors cursor-pointer"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>Copy Path</span>
                    </button>
                  )}
                  {onRenameFile && (
                    <button
                      type="button"
                      onClick={handleStartRename}
                      title={`Rename this ${fileExtension(file.name)} file`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-stone-500 hover:text-stone-800 hover:bg-stone-200/80 rounded transition-colors cursor-pointer"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      <span>Rename</span>
                    </button>
                  )}
                  {onDeleteFile && (
                    <button
                      type="button"
                      id="btn-editor-path-delete"
                      onClick={() => onDeleteFile(file.id)}
                      title="Delete this file permanently"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              )}
              <span className="hidden sm:inline">
                {format === 'json'
                  ? 'Source JSON'
                  : format === 'text'
                    ? 'Plain Text'
                    : 'Source Markdown (YAML Frontmatter + Content)'}
              </span>
            </div>
            {sharedDoc?.hasConflict && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">
                  You and the other editor changed the same lines in the shared Google Doc. Syncing
                  is paused for this note.
                </span>
                {onResolveDocConflict && (
                  <button
                    type="button"
                    onClick={onResolveDocConflict}
                    className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 cursor-pointer"
                  >
                    Resolve
                  </button>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              id="markdown-source-textarea"
              value={file.content}
              onChange={(e) =>
                handleContentChangeWithToday(e.target.value, e.target.selectionStart)
              }
              onKeyDown={handleKeyDown}
              onSelect={rememberSelection}
              onKeyUp={rememberSelection}
              onMouseUp={rememberSelection}
              onScroll={rememberSelection}
              spellCheck={false}
              aria-label={`${format === 'json' ? 'JSON' : format === 'text' ? 'Text' : 'Markdown'} source of ${file.path}`}
              aria-describedby="editor-keyboard-hint"
              placeholder={
                format === 'json'
                  ? 'Write JSON here...'
                  : format === 'text'
                    ? 'Write plain text here...'
                    : 'Write markdown here... (type @today for date)'
              }
              className="flex-1 p-4 md:p-6 font-mono text-xs md:text-sm text-stone-900 bg-transparent resize-none focus:outline-hidden leading-relaxed"
            />
          </div>
        )}

        {/* Rendered Live Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            <div className="px-4 py-1.5 bg-stone-100/60 border-b border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
              <span>
                {format === 'json'
                  ? 'JSON Viewer'
                  : format === 'text'
                    ? 'Plain Text View'
                    : 'Rendered Preview'}
              </span>
              <span className="text-[10px] text-stone-400">
                {format === 'json'
                  ? 'Click a node to expand or collapse'
                  : format === 'text'
                    ? ''
                    : 'Click task checkboxes to toggle'}
              </span>
            </div>
            {format === 'json' ? (
              <JsonViewer content={file.content} onFormat={onChangeContent} />
            ) : format === 'text' ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <pre className="font-mono text-xs md:text-sm text-stone-900 whitespace-pre-wrap break-words leading-relaxed">
                  {file.content}
                </pre>
              </div>
            ) : (
              <MarkdownPreview
                file={file}
                allFiles={allFiles}
                onNavigateToFile={onNavigateToFile}
                onToggleCheckbox={onToggleCheckbox}
                onOpenSkillPlayground={onOpenSkillPlayground}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="border-t border-stone-200 px-4 py-1.5 bg-white text-[11px] text-stone-500 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span>{lines} lines</span>
          <span>•</span>
          <span>{words} words</span>
          <span>•</span>
          <span>{chars} characters</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-stone-400">
          <span id="editor-keyboard-hint" className="hidden md:inline font-sans">
            {isMarkdown
              ? 'Tab indents · Esc then Tab leaves the editor · Ctrl/Cmd+B / I / K'
              : 'Tab indents · Esc then Tab leaves the editor'}
          </span>
          <span className="hidden md:inline">•</span>
          {format === 'json' ? (
            <span>JSON</span>
          ) : format === 'text' ? (
            <span>Plain Text</span>
          ) : (
            <>
              <span>Markdown GFM</span>
              <span>•</span>
              <span>YAML Frontmatter</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
