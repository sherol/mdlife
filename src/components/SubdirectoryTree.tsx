import React from 'react';
import { ChevronRight, ChevronDown, Plus, Folder, Bot, Rocket, Calendar } from 'lucide-react';
import { VaultFile } from '../types';

interface SubdirectoryTreeProps {
  topFolder: string;
  files: VaultFile[];
  collapsedSubfolders: Record<string, boolean>;
  searchQuery: string;
  onToggleSubfolder: (subfolderKey: string) => void;
  onQuickNewFileInFolder: (folder: string) => void;
  renderFileItem: (file: VaultFile, indent?: boolean) => React.ReactNode;
}

/**
 * Reusable helper component to render nested sub-directories for any top-level vault category
 * (e.g. skills/<skill-name>, projects/<project-name>, archive/<year>, or custom folders)
 */
export const SubdirectoryTree: React.FC<SubdirectoryTreeProps> = ({
  topFolder,
  files,
  collapsedSubfolders,
  searchQuery,
  onToggleSubfolder,
  onQuickNewFileInFolder,
  renderFileItem,
}) => {
  const prefix = `${topFolder.toLowerCase()}/`;

  // Extract distinct sub-directories under this topFolder
  const distinctSubSlugs = Array.from(
    new Set(
      files
        .filter(
          (f) =>
            f.folder.toLowerCase().startsWith(prefix) &&
            f.folder.toLowerCase() !== topFolder.toLowerCase()
        )
        .map((f) => {
          const relative = f.folder.slice(prefix.length);
          return relative.split('/')[0];
        })
        .filter(Boolean)
    )
  ).sort((a, b) => {
    // For archive years, sort descending (e.g. 2026, 2025)
    if (topFolder.toLowerCase() === 'archive') {
      return b.localeCompare(a);
    }
    return a.localeCompare(b);
  });

  // Files directly at topFolder root level
  const rootFiles = files.filter((f) => {
    const folderLower = f.folder.toLowerCase().trim();
    return folderLower === topFolder.toLowerCase() || !folderLower.startsWith(prefix);
  });

  const getSubfolderIcon = (slug: string) => {
    switch (topFolder.toLowerCase()) {
      case 'skills':
        return <Bot className="w-3 h-3 text-emerald-600 shrink-0" />;
      case 'projects':
        return <Rocket className="w-3 h-3 text-blue-600 shrink-0" />;
      case 'archive':
        return <Calendar className="w-3 h-3 text-purple-600 shrink-0" />;
      default:
        return <Folder className="w-3 h-3 text-stone-500 shrink-0" />;
    }
  };

  const getSubfolderTheme = () => {
    switch (topFolder.toLowerCase()) {
      case 'skills':
        return {
          border: 'border-emerald-200/60',
          hoverBg: 'hover:bg-emerald-50/60',
          btnHover: 'hover:bg-emerald-100 text-emerald-800',
        };
      case 'projects':
        return {
          border: 'border-blue-200/60',
          hoverBg: 'hover:bg-blue-50/60',
          btnHover: 'hover:bg-blue-100 text-blue-800',
        };
      case 'archive':
        return {
          border: 'border-purple-200/60',
          hoverBg: 'hover:bg-purple-50/60',
          btnHover: 'hover:bg-purple-100 text-purple-800',
        };
      default:
        return {
          border: 'border-stone-200/60',
          hoverBg: 'hover:bg-stone-100/60',
          btnHover: 'hover:bg-stone-200 text-stone-800',
        };
    }
  };

  const theme = getSubfolderTheme();

  return (
    <div className="space-y-1 pt-0.5 pl-1.5">
      {/* Sub-directories */}
      {distinctSubSlugs.map((slug) => {
        const subKey = `${topFolder}/${slug}`;
        const isCollapsed = !!collapsedSubfolders[subKey] && !searchQuery.trim();
        const subFiles = files.filter(
          (f) =>
            f.folder.toLowerCase() === subKey.toLowerCase() ||
            f.folder.toLowerCase().startsWith(`${subKey.toLowerCase()}/`)
        );

        const formattedLabel = slug
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        return (
          <div key={subKey} className={`ml-2 border-l ${theme.border} pl-1.5 space-y-0.5`}>
            {/* Subfolder Header */}
            <div
              className={`flex items-center justify-between px-2 py-1 text-stone-600 hover:text-stone-900 rounded-md ${theme.hoverBg} group/sub`}
            >
              <button
                type="button"
                onClick={() => onToggleSubfolder(subKey)}
                className="flex items-center gap-1.5 font-medium text-xs text-stone-700 hover:text-stone-900 cursor-pointer min-w-0"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />
                )}
                {getSubfolderIcon(slug)}
                <span className="font-semibold truncate max-w-[130px]" title={subKey}>
                  {formattedLabel}
                </span>
                <span className="text-[10px] text-stone-400 font-mono shrink-0">
                  ({subFiles.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => onQuickNewFileInFolder(subKey)}
                title={`Add file to ${slug}`}
                className={`p-0.5 opacity-0 group-hover/sub:opacity-100 rounded cursor-pointer transition-opacity shrink-0 ${theme.btnHover}`}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Subfolder Files */}
            {!isCollapsed && (
              <div className="space-y-0.5">
                {subFiles.map((file) => renderFileItem(file, true))}
              </div>
            )}
          </div>
        );
      })}

      {/* Root Files under this category */}
      {rootFiles.length > 0 && (
        <div className="space-y-0.5 pt-0.5">
          {rootFiles.map((file) => renderFileItem(file, true))}
        </div>
      )}
    </div>
  );
};
