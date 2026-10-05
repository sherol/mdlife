import React from 'react';
import { RefreshCw, AlertTriangle, CloudUpload, ArrowRight, X } from 'lucide-react';
import { VaultFile } from '../types';

interface ReloadFromDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  unsavedFiles: VaultFile[];
  onSaveAndReload: () => void;
  onDiscardAndReload: () => void;
  isProcessing: boolean;
}

export const ReloadFromDriveModal: React.FC<ReloadFromDriveModalProps> = ({
  isOpen,
  onClose,
  unsavedFiles,
  onSaveAndReload,
  onDiscardAndReload,
  isProcessing,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-start justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5 text-stone-900">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-stone-900">Reload from Google Drive</h3>
              <p className="text-xs text-stone-500">Unsaved local edits detected</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg hover:bg-stone-200/60 text-stone-400 hover:text-stone-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-stone-600">
          <p>
            You have <strong className="text-stone-900">{unsavedFiles.length} file(s)</strong> with edits saved in your local browser that have not been written to Google Drive yet:
          </p>

          <div className="max-h-36 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-2 space-y-1">
            {unsavedFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-[11px] font-mono px-2 py-1 bg-white rounded border border-stone-200/60 text-stone-800">
                <span className="truncate">{f.path}</span>
                <span className="text-[10px] text-amber-700 font-sans font-medium px-1.5 py-0.2 bg-amber-50 rounded">Unsaved</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-stone-500">
            Reloading directly from Google Drive will replace the current workspace with the files stored in Drive. How would you like to proceed?
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 bg-stone-50 border-t border-stone-100 flex flex-col gap-2">
          <button
            type="button"
            id="btn-save-and-reload"
            disabled={isProcessing}
            onClick={onSaveAndReload}
            className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-4 h-4" />
            <span>Save Local Edits to Drive & Reload</span>
          </button>

          <button
            type="button"
            id="btn-discard-and-reload"
            disabled={isProcessing}
            onClick={onDiscardAndReload}
            className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-stone-200 hover:border-rose-200 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <span>Discard Local Changes & Reload from Drive</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-full py-1.5 text-center text-xs text-stone-500 hover:text-stone-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
