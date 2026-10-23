import React, { useId, useState } from 'react';
import { GitMerge } from 'lucide-react';
import { Modal } from './Modal';
import type { DocConflict } from '../hooks/useDriveSync';
import { ConflictChoice } from '../utils/docMerge';

interface DocConflictModalProps {
  conflict: DocConflict;
  fileName: string;
  /** Choices in conflict order, or null to decide later. */
  onResolve: (choices: ConflictChoice[] | null) => void;
}

const OPTIONS: { value: ConflictChoice; label: string }[] = [
  { value: 'mine', label: 'Keep mine' },
  { value: 'theirs', label: 'Keep Google Doc' },
  { value: 'both', label: 'Keep both' },
];

const Lines: React.FC<{ lines: string[]; tone: 'mine' | 'theirs' }> = ({ lines, tone }) => (
  <pre
    className={`text-[11px] font-mono whitespace-pre-wrap break-words p-2 rounded-md border min-h-8 ${
      tone === 'mine'
        ? 'bg-blue-50 border-blue-200 text-blue-950'
        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
    }`}
  >
    {lines.length ? lines.join('\n') : <span className="italic opacity-60">(deleted)</span>}
  </pre>
);

export const DocConflictModal: React.FC<DocConflictModalProps> = ({
  conflict,
  fileName,
  onResolve,
}) => {
  const titleId = useId();
  const conflicts = conflict.merge.chunks.filter((c) => c.type === 'conflict');
  const [choices, setChoices] = useState<ConflictChoice[]>(() => conflicts.map(() => 'both'));

  return (
    <Modal
      onClose={() => onResolve(null)}
      closeOnBackdrop={false}
      labelledBy={titleId}
      className="rounded-2xl border shadow-2xl max-w-3xl w-full p-5 space-y-4 bg-white border-stone-200 text-stone-900 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <GitMerge className="w-5 h-5" />
        </div>
        <div>
          <h4 id={titleId} className="font-bold text-sm text-stone-900">
            Both of you changed the same part of “{fileName.replace(/\.md$/i, '')}”
          </h4>
          <p className="text-[11px] text-stone-500">
            Everything else was combined automatically. Choose what to keep for{' '}
            {conflicts.length === 1 ? 'this part' : `these ${conflicts.length} parts`}.
          </p>
        </div>
      </div>

      <ol className="space-y-4">
        {conflicts.map((chunk, i) =>
          chunk.type === 'conflict' ? (
            <li key={i} className="space-y-2 p-3 rounded-xl border border-stone-200 bg-stone-50">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    Yours (mdlife)
                  </div>
                  <Lines lines={chunk.mine} tone="mine" />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Google Doc
                  </div>
                  <Lines lines={chunk.theirs} tone="theirs" />
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label={`Choice for change ${i + 1}`}
                className="flex flex-wrap gap-1.5"
              >
                {OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={choices[i] === opt.value}
                    onClick={() =>
                      setChoices((prev) => prev.map((c, j) => (j === i ? opt.value : c)))
                    }
                    className={`px-2.5 py-1 text-xs rounded-md border cursor-pointer ${
                      choices[i] === opt.value
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </li>
          ) : null,
        )}
      </ol>

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-stone-500">
          Until you decide, this note doesn't sync with the Google Doc. Older versions stay in
          Google Docs' version history.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onResolve(null)}
            className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 cursor-pointer"
          >
            Decide later
          </button>
          <button
            type="button"
            onClick={() => onResolve(choices)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 cursor-pointer"
          >
            Apply &amp; sync
          </button>
        </div>
      </div>
    </Modal>
  );
};
