import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Folder,
  LogIn,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Modal } from './Modal';
import { VaultFile, FileCategory } from '../types';
import { getAccessToken } from '../utils/googleAuth';
import { quoteYamlString } from '../utils/markdownParser';
import {
  extractGoogleDocId,
  openGoogleDocsPicker,
  fetchGoogleDocData,
  GoogleDocMetadata,
} from '../utils/googleDocs';
import { getErrorMessage } from '../utils/errors';

interface ImportGoogleDocModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (file: VaultFile) => void;
  googleUser: User | null;
  onSignIn: () => Promise<void>;
  defaultFolder?: string;
}

export const ImportGoogleDocModal: React.FC<ImportGoogleDocModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  googleUser,
  onSignIn,
  defaultFolder = 'notes',
}) => {
  const [docInput, setDocInput] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<GoogleDocMetadata | null>(null);
  const [targetCategory, setTargetCategory] = useState<FileCategory>('notes');
  const [customTitle, setCustomTitle] = useState('');
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-open (intentional, see eslint.config.js)
      setDocInput('');
      setSelectedDoc(null);
      setCustomTitle('');
      setErrorMessage(null);
      setSuccessMessage(null);
      if (['goals', 'projects', 'skills', 'notes', 'archive'].includes(defaultFolder)) {
        setTargetCategory(defaultFolder as FileCategory);
      } else {
        setTargetCategory('notes');
      }
    }
  }, [isOpen, defaultFolder]);

  // Handle direct Google Picker launch
  const handleOpenPicker = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage('Please sign in with Google to browse and import your Google Docs.');
      return;
    }

    setIsOpeningPicker(true);
    try {
      await openGoogleDocsPicker({
        accessToken: token,
        onDocSelected: (picked) => {
          setSelectedDoc(picked);
          setDocInput(`https://docs.google.com/document/d/${picked.id}/edit`);
          setCustomTitle(picked.name);
          setIsOpeningPicker(false);
        },
        onCancel: () => {
          setIsOpeningPicker(false);
        },
        onError: (err) => {
          setIsOpeningPicker(false);
          setErrorMessage(
            err.message ||
              'Could not open Google Picker. You can still paste the Google Doc link or ID below.',
          );
        },
      });
    } catch (err) {
      setIsOpeningPicker(false);
      setErrorMessage(
        getErrorMessage(err) ||
          'Could not initialize Google Picker. You can paste your document URL directly into the field below.',
      );
    }
  };

  const handleSignInAndProceed = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      await onSignIn();
    } catch (err) {
      setErrorMessage(getErrorMessage(err) || 'Google sign-in failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Process the import
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const docId = selectedDoc?.id || extractGoogleDocId(docInput);
    if (!docId) {
      setErrorMessage(
        'Please provide a valid Google Doc URL or ID, or choose one using the file picker.',
      );
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMessage('No active Google session found. Please sign in with Google.');
      return;
    }

    setIsImporting(true);
    try {
      const { title, markdown } = await fetchGoogleDocData(docId, token);

      const finalTitle = customTitle.trim() || title || 'Google Doc Import';
      const cleanSlug = finalTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const filename = `${cleanSlug || 'imported-doc'}.md`;
      const path = `${targetCategory}/${filename}`;

      // Build file with YAML frontmatter
      const today = new Date().toISOString().split('T')[0];
      const frontmatterContent = [
        '---',
        `title: ${quoteYamlString(finalTitle)}`,
        `category: ${targetCategory}`,
        `tags:`,
        `  - gdocs-import`,
        `source_doc_id: "${docId}"`,
        `imported_at: "${today}"`,
        '---',
        '',
        markdown,
      ].join('\n');

      const importedFile: VaultFile = {
        id: path,
        name: filename,
        path,
        folder: targetCategory,
        content: frontmatterContent,
        frontmatter: {
          title: finalTitle,
          category: targetCategory,
          tags: ['gdocs-import'],
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setSuccessMessage(`Successfully imported "${finalTitle}"!`);
      setTimeout(() => {
        onImportComplete(importedFile);
        onClose();
      }, 500);
    } catch (err) {
      console.error('Import error:', err);
      setErrorMessage(
        getErrorMessage(err) ||
          'Failed to import document. Ensure the Google Doc exists and is accessible.',
      );
    } finally {
      setIsImporting(false);
    }
  };

  const parsedDocId = extractGoogleDocId(docInput);

  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Import Google Doc to Vault">
      <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Import from Google Docs
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Convert a Google Doc into a Markdown note in your vault
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleImport} className="p-6 space-y-5 overflow-y-auto">
          {/* Sign-in Banner if user not connected */}
          {!googleUser && (
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center justify-between gap-3">
              <div className="text-xs text-blue-900 dark:text-blue-200">
                <span className="font-medium">Google Account Required:</span> Sign in to access your
                documents with Google Docs permission.
              </div>
              <button
                type="button"
                onClick={handleSignInAndProceed}
                disabled={isSigningIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
              >
                {isSigningIn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                <span>Sign in</span>
              </button>
            </div>
          )}

          {/* Primary Picker Action Button */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-stone-700 dark:text-stone-300">
              Select Document
            </label>
            <button
              type="button"
              onClick={handleOpenPicker}
              disabled={isOpeningPicker || isImporting || !googleUser}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium transition-all group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isOpeningPicker ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <Search className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
              )}
              <span>Browse with Google Drive Picker</span>
            </button>
          </div>

          {/* Or Divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-stone-200 dark:border-stone-800"></div>
            <span className="shrink-0 px-2.5 text-[11px] font-medium text-stone-400 uppercase tracking-wider">
              Or paste URL / ID
            </span>
            <div className="flex-grow border-t border-stone-200 dark:border-stone-800"></div>
          </div>

          {/* Document Link Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="gdoc-url-input"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300"
            >
              Google Doc Link or Document ID
            </label>
            <div className="relative">
              <input
                id="gdoc-url-input"
                type="text"
                value={docInput}
                onChange={(e) => {
                  setDocInput(e.target.value);
                  setSelectedDoc(null);
                }}
                placeholder="https://docs.google.com/document/d/.../edit"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-stone-900 dark:text-stone-100 placeholder-stone-400 transition-all"
              />
              {parsedDocId && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md font-mono">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>ID detected</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-stone-400">
              Paste any Google Doc share URL or raw ID (e.g., <code>1ABC...xyz</code>).
            </p>
          </div>

          {/* Target Folder Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="target-folder-select"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300"
            >
              Save into Vault Folder
            </label>
            <div className="relative">
              <select
                id="target-folder-select"
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value as FileCategory)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-stone-900 dark:text-stone-100 appearance-none cursor-pointer"
              >
                <option value="notes">Notes & Rituals (notes/)</option>
                <option value="goals">Goals & OKRs (goals/)</option>
                <option value="projects">Projects & Initiatives (projects/)</option>
                <option value="skills">Agent Skills (skills/)</option>
                <option value="archive">Archive (archive/)</option>
              </select>
              <Folder className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Optional Title Override */}
          <div className="space-y-1.5">
            <label
              htmlFor="custom-title-input"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300"
            >
              Note Title <span className="text-stone-400 font-normal">(optional override)</span>
            </label>
            <input
              id="custom-title-input"
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Defaults to Google Doc title"
              className="w-full px-3 py-2 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-stone-900 dark:text-stone-100 placeholder-stone-400 transition-all"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isImporting || (!parsedDocId && !selectedDoc)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Converting & Importing...</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5" />
                  <span>Import into Vault</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
