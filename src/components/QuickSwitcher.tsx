import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, FileText } from 'lucide-react';
import { VaultFile } from '../types';
import { Modal } from './Modal';

interface QuickSwitcherProps {
  files: VaultFile[];
  onSelectFile: (id: string) => void;
}

const MAX_RESULTS = 50;

const scoreFile = (file: VaultFile, q: string): number => {
  const title = (file.frontmatter.title || '').toLowerCase();
  const name = file.name.toLowerCase();
  const path = file.path.toLowerCase();
  if (title.startsWith(q) || name.startsWith(q)) return 0;
  if (title.includes(q) || name.includes(q)) return 1;
  if (path.includes(q)) return 2;
  return -1;
};

/**
 * Quick file switcher opened with Ctrl/Cmd+K from anywhere while it is mounted.
 * Type to filter, arrow keys to move, Enter to open.
 */
export const QuickSwitcher: React.FC<QuickSwitcherProps> = ({ files, onSelectFile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const listId = useId();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((open) => !open);
        setQuery('');
        setActiveIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...files].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RESULTS);
    }
    return files
      .map((file) => ({ file, score: scoreFile(file, q) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.file.path.localeCompare(b.file.path))
      .slice(0, MAX_RESULTS)
      .map((r) => r.file);
  }, [files, query]);

  // Keep the highlighted option visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const close = () => setIsOpen(false);

  const choose = (file: VaultFile | undefined) => {
    if (!file) return;
    close();
    onSelectFile(file.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[activeIndex] || results[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={close}
      labelledBy={titleId}
      initialFocusRef={inputRef}
      overlayClassName="fixed inset-0 z-60 flex items-start justify-center p-4 pt-[12vh] bg-black/50 backdrop-blur-xs animate-in fade-in duration-100"
      className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden"
    >
      <h2 id={titleId} className="sr-only">
        Quick file switcher
      </h2>
      <div className="relative border-b border-stone-200">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-stone-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Jump to file..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search files"
          className="w-full pl-10 pr-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 bg-white focus:outline-hidden"
        />
      </div>
      <ul ref={listRef} id={listId} role="listbox" aria-label="Files" className="max-h-80 overflow-y-auto p-1.5">
        {results.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-stone-400 italic">No matching files</li>
        ) : (
          results.map((file, idx) => (
            <li
              key={file.id}
              id={`${listId}-${idx}`}
              data-index={idx}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => choose(file)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs ${
                idx === activeIndex ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${idx === activeIndex ? 'text-stone-300' : 'text-stone-400'}`} />
              <span className="truncate font-medium flex-1">{file.frontmatter.title || file.name}</span>
              <span
                className={`text-[10px] font-mono truncate max-w-[45%] ${
                  idx === activeIndex ? 'text-stone-300' : 'text-stone-400'
                }`}
              >
                /{file.path}
              </span>
            </li>
          ))
        )}
      </ul>
      <div className="px-3 py-1.5 border-t border-stone-100 bg-stone-50 text-[10px] text-stone-400 flex items-center gap-3">
        <span>↑↓ to navigate</span>
        <span>Enter to open</span>
        <span>Esc to close</span>
      </div>
    </Modal>
  );
};
