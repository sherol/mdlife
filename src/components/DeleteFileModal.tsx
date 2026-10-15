import React from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { VaultFile } from '../types';

interface DeleteFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  file: VaultFile | null;
  isDeleting?: boolean;
}

export const DeleteFileModal: React.FC<DeleteFileModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  file,
  isDeleting = false,
}) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="rounded-2xl border shadow-2xl max-w-md w-full p-5 space-y-4 bg-white border-stone-200 text-stone-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-xs">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-stone-900">Delete File</h4>
            <p className="text-[11px] text-stone-500">Remove from vault and Google Drive</p>
          </div>
        </div>

        <div className="text-xs text-stone-600 space-y-2 leading-relaxed">
          <p>
            Are you sure you want to permanently delete this file? This will remove it from your workspace and Google Drive.
          </p>
          <div className="p-3 rounded-lg bg-stone-100 border border-stone-200 font-mono text-xs">
            <div className="font-semibold text-stone-900">📄 {file.name}</div>
            <div className="text-stone-500 text-[11px] mt-0.5">
              Path: /Markdown Life Vault/{file.path}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>This action cannot be undone.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-medium cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-confirm-delete-file"
            disabled={isDeleting}
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete File</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
