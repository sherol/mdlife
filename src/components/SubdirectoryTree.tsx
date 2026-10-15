import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { VaultFile } from '../types';

/**
 * Per-folder look of the second-level sub-directory rows (projects/<name>, archive/<year>, skills/<name>).
 * Class names are passed in full so Tailwind can see the literal `group/<name>` variants.
 */
export interface SubfolderVariant {
  rowClassName: string;
  toggleClassName: string;
  countClassName: string;
  renderIcon: (isOpen: boolean) => React.ReactNode;
  renderLabel: (slug: string, subKey: string) => React.ReactNode;
  renderActions: (subKey: string, slug: string) => React.ReactNode;
  sort?: (a: string, b: string) => number;
}

interface SubdirectoryTreeProps {
  /** Top-level folder key, e.g. "projects". */
  folder: string;
  /** Files that belong to this top-level folder. */
  files: VaultFile[];
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  headerIcon: React.ReactNode;
  headerToggleClassName: string;
  headerLabelClassName?: string;
  headerCountClassName: string;
  headerActions?: React.ReactNode;
  /** Optional inline form shown at the top of the expanded folder (e.g. "new year"). */
  inlineForm?: React.ReactNode;
  /** When given, files are grouped by their second path segment; otherwise listed flat. */
  subfolders?: SubfolderVariant;
  isSubfolderOpen: (subKey: string) => boolean;
  onToggleSubfolder: (subKey: string) => void;
  /** Heading shown above files directly in the folder when sub-directories exist. */
  rootFilesHeading?: React.ReactNode;
  emptyText: string;
  renderFileItem: (file: VaultFile) => React.ReactNode;
}

const Chevron: React.FC<{ isOpen: boolean }> = ({ isOpen }) =>
  isOpen ? (
    <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
  ) : (
    <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
  );

/** The second path segment of a folder below `folder` ("projects/foo/bar" -> "foo"), or '' for root files. */
const getSubSlug = (fileFolder: string, folder: string): string => {
  const parts = (fileFolder || '').split('/');
  if (parts.length < 2 || parts[0].toLowerCase() !== folder.toLowerCase()) return '';
  return parts[1];
};

/**
 * One top-level vault folder in the sidebar: header row with actions, optional inline form,
 * optional second-level sub-directories (files nested deeper stay inside their sub-directory)
 * and the files directly in the folder. Every file passed in is rendered somewhere.
 */
export const SubdirectoryTree: React.FC<SubdirectoryTreeProps> = ({
  folder,
  files,
  label,
  isOpen,
  onToggle,
  headerIcon,
  headerToggleClassName,
  headerLabelClassName,
  headerCountClassName,
  headerActions,
  inlineForm,
  subfolders,
  isSubfolderOpen,
  onToggleSubfolder,
  rootFilesHeading,
  emptyText,
  renderFileItem,
}) => {
  const groups = new Map<string, { slug: string; files: VaultFile[] }>();
  const rootFiles: VaultFile[] = [];

  if (subfolders) {
    for (const file of files) {
      const slug = getSubSlug(file.folder, folder);
      if (!slug) {
        rootFiles.push(file);
        continue;
      }
      const groupKey = slug.toLowerCase();
      const group = groups.get(groupKey);
      if (group) group.files.push(file);
      else groups.set(groupKey, { slug, files: [file] });
    }
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) =>
    subfolders?.sort ? subfolders.sort(a.slug, b.slug) : a.slug.localeCompare(b.slug)
  );

  return (
    <div className="space-y-0.5">
      {/* Folder Header */}
      <div className="flex items-center justify-between px-2 py-1.5 text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-100/80 group">
        <button
          type="button"
          id={`folder-btn-${folder}`}
          onClick={onToggle}
          aria-expanded={isOpen}
          className={headerToggleClassName}
        >
          <Chevron isOpen={isOpen} />
          {headerIcon}
          <span className={headerLabelClassName}>{label}</span>
          <span className={headerCountClassName}>({files.length})</span>
        </button>
        {headerActions}
      </div>

      {/* Sub-directories and Files */}
      {isOpen && (
        <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
          {inlineForm}

          {!subfolders ? (
            files.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-stone-400 italic">{emptyText}</div>
            ) : (
              files.map((file) => renderFileItem(file))
            )
          ) : (
            <>
              {sortedGroups.map(({ slug, files: subFiles }) => {
                const subKey = `${folder}/${slug}`;
                const isSubOpen = isSubfolderOpen(subKey);
                return (
                  <div key={subKey} className="space-y-0.5">
                    <div className={subfolders.rowClassName}>
                      <button
                        type="button"
                        onClick={() => onToggleSubfolder(subKey)}
                        aria-expanded={isSubOpen}
                        className={subfolders.toggleClassName}
                      >
                        <Chevron isOpen={isSubOpen} />
                        {subfolders.renderIcon(isSubOpen)}
                        {subfolders.renderLabel(slug, subKey)}
                        <span className={subfolders.countClassName}>({subFiles.length})</span>
                      </button>
                      {subfolders.renderActions(subKey, slug)}
                    </div>

                    {isSubOpen && (
                      <div className="ml-3 pl-2 border-l border-stone-200/80 space-y-0.5 pt-0.5">
                        {subFiles.map((file) => renderFileItem(file))}
                      </div>
                    )}
                  </div>
                );
              })}

              {rootFiles.length > 0 && (
                <div className="space-y-0.5 pt-0.5">
                  {sortedGroups.length > 0 && rootFilesHeading}
                  {rootFiles.map((file) => renderFileItem(file))}
                </div>
              )}

              {files.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-stone-400 italic">{emptyText}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
