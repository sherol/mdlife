import React, { useRef, useState } from 'react';
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
  Bot,
  Tag,
  HardDrive,
  CloudUpload,
  Loader2,
  Pencil,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { VaultFile, FileFrontmatter, DriveConnectionStatus } from '../types';
import { MarkdownPreview } from './MarkdownPreview';
import { parseFrontmatter, stringifyWithFrontmatter } from '../utils/markdownParser';

interface MarkdownEditorProps {
  file: VaultFile;
  allFiles: VaultFile[];
  onChangeContent: (newContent: string) => void;
  onNavigateToFile: (filenameOrPath: string) => void;
  onToggleCheckbox: (index: number) => void;
  onOpenSkillPlayground: (file: VaultFile) => void;
  onRenameFile?: (fileId: string, newFileName: string) => Promise<boolean> | boolean;
  onSaveToDrive?: (file: VaultFile) => void;
  isSavingToDrive?: boolean;
  isDriveSyncing?: boolean;
  driveStatus?: DriveConnectionStatus;
  isUnsavedToDrive?: boolean;
  onReconnectDrive?: () => void;
  googleUser?: User | null;
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
  isSavingToDrive = false,
  isDriveSyncing = false,
  driveStatus = 'disconnected',
  isUnsavedToDrive = false,
  onReconnectDrive,
  googleUser,
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [showMetadataDrawer, setShowMetadataDrawer] = useState(false);
  const [showWikiDropdown, setShowWikiDropdown] = useState(false);
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [editingFilenameVal, setEditingFilenameVal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleStartRename = () => {
    setEditingFilenameVal(file.name.replace(/\.md$/, ''));
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

  // Insert markdown snippet at current cursor or selection
  const insertText = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = file.content.substring(start, end) || defaultText;
    const replacement = `${before}${selection}${after}`;
    const newContent =
      file.content.substring(0, start) + replacement + file.content.substring(end);

    onChangeContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selection.length
      );
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Support Tab indenting
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('  ');
    }
  };

  // Update frontmatter properties cleanly
  const updateFrontmatterProperty = (updates: Partial<FileFrontmatter>) => {
    const { frontmatter, body } = parseFrontmatter(file.content);
    const updatedFrontmatter = { ...frontmatter, ...updates };
    const newContent = stringifyWithFrontmatter(updatedFrontmatter, body);
    onChangeContent(newContent);
  };

  const handleInsertWikiLink = (targetFile: VaultFile) => {
    insertText(`[[${targetFile.name}]]`);
    setShowWikiDropdown(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
      {/* Editor Sub-Header & Formatting Toolbar */}
      <div className="border-b border-stone-200 bg-stone-50/70 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Left: Toolbar Actions */}
        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center border border-stone-200 rounded-md bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              id="btn-h1"
              title="Heading 1"
              onClick={() => insertText('# ', '', 'Heading')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-h2"
              title="Heading 2"
              onClick={() => insertText('## ', '', 'Heading')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-h3"
              title="Heading 3"
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
              title="Bold"
              onClick={() => insertText('**', '**', 'bold text')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700 font-bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-italic"
              title="Italic"
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
              onClick={() => insertText('- [ ] ', '', 'Task description')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <CheckSquare className="w-3.5 h-3.5 text-stone-800" />
            </button>
            <button
              type="button"
              id="btn-bullet"
              title="Bullet List"
              onClick={() => insertText('- ', '', 'List item')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-ordered"
              title="Numbered List"
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
              onClick={() => insertText('> ', '', 'Quote')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-code"
              title="Code Block"
              onClick={() => insertText('```\n', '\n```', 'code block')}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-700"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              id="btn-table"
              title="Insert Markdown Table"
              onClick={() =>
                insertText(
                  '\n| Column 1 | Column 2 | Column 3 |\n| :--- | :--- | :--- |\n| Item 1 | Details | Active |\n| Item 2 | Details | Pending |\n\n',
                  '',
                  ''
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
            <div className="relative">
              <button
                type="button"
                id="btn-insert-wikilink"
                title="Insert [[Link]] to another file"
                onClick={() => setShowWikiDropdown(!showWikiDropdown)}
                className="flex items-center gap-1 px-2 py-1 hover:bg-stone-100 rounded text-stone-700 text-xs"
              >
                <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>[[...]]</span>
              </button>

            {showWikiDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-stone-200 rounded-lg shadow-lg z-30 p-1 max-h-56 overflow-y-auto">
                <div className="px-2 py-1 text-[11px] font-semibold text-stone-400 uppercase">
                  Select file to link:
                </div>
                {allFiles
                  .filter((f) => f.id !== file.id)
                  .map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => handleInsertWikiLink(target)}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-stone-100 rounded flex items-center justify-between text-stone-800"
                    >
                      <span className="truncate">{target.frontmatter.title || target.name}</span>
                      <span className="text-[10px] font-mono text-stone-400 ml-1">
                        /{target.folder}
                      </span>
                    </button>
                  ))}
              </div>
            )}
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
                <CloudUpload className={`w-3.5 h-3.5 ${isUnsavedToDrive ? 'text-amber-600' : 'text-blue-600'}`} />
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
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes pending" />
              )}
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
            <label className="block text-stone-500 font-medium mb-1">Status</label>
            <select
              value={file.frontmatter.status || 'active'}
              onChange={(e) =>
                updateFrontmatterProperty({ status: e.target.value as any })
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
            <label className="block text-stone-500 font-medium mb-1">Priority</label>
            <select
              value={file.frontmatter.priority || 'medium'}
              onChange={(e) =>
                updateFrontmatterProperty({ priority: e.target.value as any })
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
            <label className="block text-stone-500 font-medium mb-1">Target Date</label>
            <input
              type="date"
              value={file.frontmatter.target_date || ''}
              onChange={(e) =>
                updateFrontmatterProperty({ target_date: e.target.value })
              }
              className="w-full bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 text-xs"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-stone-500 font-medium mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              placeholder="goals, 2026, tech"
              value={(file.frontmatter.tags || []).join(', ')}
              onChange={(e) => {
                const tags = e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean);
                updateFrontmatterProperty({ tags });
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
              <strong>Google Drive disconnected.</strong> {isUnsavedToDrive ? 'Your latest edits are safe in browser storage. Click to reconnect and sync.' : 'Your files are safe in local storage. Click Reconnect to resume sync.'}
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
                  <span className="font-mono text-stone-500">.md</span>
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
                  {onRenameFile && (
                    <button
                      type="button"
                      onClick={handleStartRename}
                      title="Rename this .md file"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-stone-500 hover:text-stone-800 hover:bg-stone-200/80 rounded transition-colors cursor-pointer"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      <span>Rename</span>
                    </button>
                  )}
                </div>
              )}
              <span className="hidden sm:inline">Source Markdown (YAML Frontmatter + Content)</span>
            </div>
            <textarea
              ref={textareaRef}
              id="markdown-source-textarea"
              value={file.content}
              onChange={(e) => onChangeContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              placeholder="Write markdown here..."
              className="flex-1 p-4 md:p-6 font-mono text-xs md:text-sm text-stone-900 bg-transparent resize-none focus:outline-hidden leading-relaxed"
            />
          </div>
        )}

        {/* Rendered Live Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
            <div className="px-4 py-1.5 bg-stone-100/60 border-b border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
              <span>Rendered Preview</span>
              <span className="text-[10px] text-stone-400">
                Click task checkboxes to toggle
              </span>
            </div>
            <MarkdownPreview
              file={file}
              allFiles={allFiles}
              onNavigateToFile={onNavigateToFile}
              onToggleCheckbox={onToggleCheckbox}
              onOpenSkillPlayground={onOpenSkillPlayground}
            />
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
          <span>Markdown GFM</span>
          <span>•</span>
          <span>YAML Frontmatter</span>
        </div>
      </div>
    </div>
  );
};
