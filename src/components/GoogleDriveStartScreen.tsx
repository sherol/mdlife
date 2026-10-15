import React, { useState } from 'react';
import {
  HardDrive,
  Lock,
  FolderSync,
  ArrowRight,
  Loader2,
  AlertCircle,
  FolderCheck,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';

interface GoogleDriveStartScreenProps {
  onSignIn: () => Promise<void>;
  onContinueOffline: () => void;
  isSigningIn: boolean;
  errorMessage: string | null;
}

export const GoogleDriveStartScreen: React.FC<GoogleDriveStartScreenProps> = ({
  onSignIn,
  onContinueOffline,
  isSigningIn,
  errorMessage,
}) => {
  const [copiedDomain, setCopiedDomain] = useState(false);
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isUnauthorizedDomain = errorMessage?.includes('unauthorized-domain');

  const handleCopyHostname = () => {
    if (currentHostname) {
      navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }
  };

  return (
    <div className="min-h-screen w-full bg-stone-100 text-stone-900 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans antialiased">
      {/* Top minimal bar */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            M
          </div>
          <span className="font-semibold text-stone-900 text-sm tracking-tight">
            Markdown Life & Skills Vault
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="./mock.html"
            id="link-explore-offline-mock"
            className="text-xs text-stone-600 hover:text-stone-900 transition-colors py-1 px-2.5 rounded bg-stone-200/50 hover:bg-stone-200 border border-stone-200/80 font-medium inline-flex items-center gap-1 cursor-pointer"
            title="Open dedicated offline mock page (mock.html)"
          >
            <span>Explore Offline (mock.html)</span>
            <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </header>

      {/* Main Centered Gateway Card */}
      <main className="max-w-lg w-full mx-auto my-auto py-8">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
          {/* Logo & Headline */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 mb-2 shadow-2xs">
              <HardDrive className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Connect Your Google Drive
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">
              Organize your 1. Goals, 2. Projects, 3. Agent Skills, 4. Notes, and 5. Archive as portable Markdown files in your Google Drive.
            </p>
          </div>

          {/* Error notification if sign-in fails */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-900 text-xs space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Sign-in notice:</strong>{' '}
                  {isUnauthorizedDomain
                    ? 'This domain is not yet added to Firebase Authorized Domains.'
                    : errorMessage}
                </div>
              </div>

              {isUnauthorizedDomain && (
                <div className="mt-2 pt-2 border-t border-amber-200/70 text-[11px] text-stone-700 space-y-2">
                  <p>
                    Google Sign-In security requires your hosting domain to be registered in Firebase Authentication.
                  </p>
                  <div className="flex items-center justify-between bg-white/80 border border-stone-200 rounded-md px-2.5 py-1.5 font-mono text-[11px] text-stone-800">
                    <span className="truncate mr-2 font-semibold">{currentHostname}</span>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      className="inline-flex items-center gap-1 text-[10px] font-sans px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300 transition-colors cursor-pointer shrink-0"
                    >
                      {copiedDomain ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Domain</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="pt-1 flex flex-col gap-1">
                    <div className="text-[11px] text-stone-600">
                      <strong>To fix:</strong>
                      <ol className="list-decimal list-inside space-y-0.5 mt-1 ml-0.5 text-stone-600">
                        <li>Go to Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains</li>
                        <li>Click <strong>Add domain</strong> and paste <code className="bg-amber-100/80 px-1 rounded font-mono">{currentHostname}</code></li>
                      </ol>
                    </div>
                    <a
                      href="https://console.firebase.google.com/project/gen-lang-client-0609175245/authentication/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium underline"
                    >
                      <span>Open Firebase Console Settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Primary Action Button */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              id="btn-start-google-signin"
              disabled={isSigningIn}
              onClick={onSignIn}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 rounded-xl shadow-xs transition-all font-medium text-sm cursor-pointer disabled:opacity-60 group hover:border-blue-400"
            >
              {isSigningIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              )}
              <span className="group-hover:text-stone-900">
                {isSigningIn ? 'Connecting to Google Drive...' : 'Sign in with Google Drive'}
              </span>
            </button>

            {/* Offline fallback button */}
            <button
              type="button"
              id="btn-start-offline-mode"
              onClick={onContinueOffline}
              className="w-full py-2.5 px-4 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-lg hover:bg-stone-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Continue with local browser storage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Feature Pillars / Architecture explanation */}
          <div className="border-t border-stone-100 pt-5 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 text-center">
              Vault Architecture
            </div>

            <div className="space-y-2.5 text-xs text-stone-600">
              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <FolderCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Direct Drive Storage: </span>
                  Files are saved in <code className="text-[11px] font-mono bg-stone-200/70 px-1 py-0.5 rounded text-stone-800">/Markdown Life Vault/</code> as standard markdown (.md).
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Strict Least Privilege: </span>
                  The app only requests access to files it creates (<code className="text-[11px] font-mono text-stone-700">drive.file</code>). Your other Drive documents remain private.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                <FolderSync className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-stone-800">Cross-Platform Freedom: </span>
                  Sync seamlessly between this web app, Obsidian, VS Code, and mobile markdown editors.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="max-w-4xl w-full mx-auto text-center py-2 text-[11px] text-stone-400">
        Markdown Life & Skills Vault &bull; Google Workspace Drive API &bull; Client-Side Encryption in Memory
      </footer>
    </div>
  );
};
