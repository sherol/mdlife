import { storageKey } from './storageKeys';

/** Where the vault is mirrored on GitHub, and the token used to write there. */
export interface GitHubMirrorConfig {
  owner: string;
  repo: string;
  /** Branch to commit to (created when missing). */
  branch: string;
  /** Folder inside the repo that holds the vault, e.g. "vault" ("" = repo root). */
  subfolder: string;
  /** Fine-grained personal access token (Contents: read and write on this repo only). */
  token: string;
  /** Head commit mdlife last wrote, to notice commits made outside mdlife. */
  lastCommitSha?: string;
}

const CONFIG_KEY = 'md_life_github_mirror_v1';

/** Trims slashes and spaces: " /vault/notes/ " → "vault/notes". */
export function normalizeSubfolder(value: string): string {
  return value
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

/** Accepts "owner/repo" or a github.com URL; null when it isn't one. */
export function parseRepoInput(value: string): { owner: string; repo: string } | null {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const match = cleaned.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function loadGitHubConfig(): GitHubMirrorConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(CONFIG_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GitHubMirrorConfig>;
    if (!parsed.owner || !parsed.repo || !parsed.token) return null;
    return {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch || 'main',
      subfolder: normalizeSubfolder(parsed.subfolder || ''),
      token: parsed.token,
      lastCommitSha: parsed.lastCommitSha,
    };
  } catch {
    return null;
  }
}

export function saveGitHubConfig(config: GitHubMirrorConfig | null): void {
  try {
    if (config) localStorage.setItem(storageKey(CONFIG_KEY), JSON.stringify(config));
    else localStorage.removeItem(storageKey(CONFIG_KEY));
  } catch (err) {
    console.error('Failed to save the GitHub mirror settings:', err);
  }
}
