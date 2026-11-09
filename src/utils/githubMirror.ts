/**
 * Mirrors the vault into a GitHub repo, next to Google Drive (which stays the source of truth).
 *
 * Each run is stateless: it reads the branch's tree, compares every vault file with it by git blob
 * sha, and writes all differences (new, changed, renamed, deleted files) as ONE commit. Nothing to
 * queue or retry: a run that fails or is skipped is simply caught up by the next one.
 */
import { VaultFile } from '../types';
import { GitHubMirrorConfig, normalizeSubfolder } from './githubConfig';
import { isDriveSyncDisabled } from './storageKeys';

const API = 'https://api.github.com';

/** Top-level vault folders the mirror always manages (deletes stale files in). */
export const DEFAULT_MANAGED_FOLDERS = [
  'trailhead',
  'goals',
  'projects',
  'skills',
  'notes',
  'archive',
];
/** Never mirrored: Drive backup snapshots. */
const EXCLUDED_TOP_FOLDERS = new Set(['backup']);
/** Refuse an automatic run that would delete more than this share of the mirrored files. */
const MASS_DELETE_RATIO = 0.5;
/** ...unless it deletes only a handful of files. */
const MASS_DELETE_MIN = 3;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** The token is missing, invalid, expired, or can't access the repo. */
export class GitHubAuthError extends GitHubApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'GitHubAuthError';
  }
}

/** The run would delete many files from the repo; needs an explicit confirmation. */
export class GitHubMassDeleteError extends Error {
  constructor(
    public deleteCount: number,
    public managedCount: number,
  ) {
    super(
      `Pushing would delete ${deleteCount} of ${managedCount} vault files in the GitHub repo. Push manually to confirm.`,
    );
    this.name = 'GitHubMassDeleteError';
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The git blob id of a text file (what `git hash-object` prints). */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The file's path inside the vault, e.g. "goals/run.md". */
export function vaultPath(file: Pick<VaultFile, 'path' | 'folder' | 'name'>): string {
  return file.path || (file.folder ? `${file.folder}/${file.name}` : file.name);
}

const topFolder = (path: string): string | null => (path.includes('/') ? path.split('/')[0] : null);

/** True for vault files the mirror writes (skips backups and hidden folders). */
export function isMirroredPath(path: string): boolean {
  const top = topFolder(path);
  return !top || (!EXCLUDED_TOP_FOLDERS.has(top) && !top.startsWith('.'));
}

export interface MirrorFile {
  /** Path inside the vault. */
  path: string;
  content: string;
  sha: string;
}

export interface MirrorPlan {
  /** Repo paths to write, with their content. */
  upserts: { path: string; content: string }[];
  /** Repo paths to delete. */
  deletes: string[];
  /** Files in the repo inside the managed folders (before this run). */
  managedCount: number;
}

/**
 * Works out what to write and delete so the repo matches the vault.
 * Only files inside the vault's top-level folders (under the subfolder) are ever deleted, so
 * anything else in the repo (README, .github/, other folders) is left alone.
 */
export function planMirror(
  files: MirrorFile[],
  repoBlobs: Map<string, string>,
  subfolder: string,
): MirrorPlan {
  const prefix = normalizeSubfolder(subfolder);
  const toRepo = (p: string) => (prefix ? `${prefix}/${p}` : p);

  const managed = new Set(DEFAULT_MANAGED_FOLDERS);
  const wanted = new Set<string>();
  const upserts: MirrorPlan['upserts'] = [];
  for (const f of files) {
    if (!isMirroredPath(f.path)) continue;
    const top = topFolder(f.path);
    if (top) managed.add(top);
    const repoPath = toRepo(f.path);
    if (wanted.has(repoPath)) continue;
    wanted.add(repoPath);
    if (repoBlobs.get(repoPath) !== f.sha) upserts.push({ path: repoPath, content: f.content });
  }

  const deletes: string[] = [];
  let managedCount = 0;
  for (const repoPath of repoBlobs.keys()) {
    let rel = repoPath;
    if (prefix) {
      if (!repoPath.startsWith(`${prefix}/`)) continue;
      rel = repoPath.slice(prefix.length + 1);
    }
    const top = topFolder(rel);
    if (!top || !managed.has(top)) continue;
    managedCount++;
    if (!wanted.has(repoPath)) deletes.push(repoPath);
  }

  return { upserts, deletes, managedCount };
}

/** True when an automatic run should stop and ask before deleting this much. */
export function isMassDelete(plan: MirrorPlan): boolean {
  return (
    plan.deletes.length > MASS_DELETE_MIN &&
    plan.deletes.length > plan.managedCount * MASS_DELETE_RATIO
  );
}

export function commitMessage(plan: MirrorPlan): string {
  const parts: string[] = [];
  if (plan.upserts.length) parts.push(`update ${plan.upserts.length} file(s)`);
  if (plan.deletes.length) parts.push(`delete ${plan.deletes.length} file(s)`);
  const lines = [...plan.upserts.map((u) => `M ${u.path}`), ...plan.deletes.map((d) => `D ${d}`)];
  const shown = lines.slice(0, 30);
  if (lines.length > shown.length) shown.push(`... and ${lines.length - shown.length} more`);
  return `mdlife: ${parts.join(', ')}\n\n${shown.join('\n')}`;
}

function base64Utf8(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function gh(
  config: GitHubMirrorConfig,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  if (isDriveSyncDisabled()) throw new Error('GitHub sync is disabled in offline mock mode.');
  const res = await fetch(
    `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`,
    {
      method: init.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${config.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
  );
  if (res.status === 401) {
    throw new GitHubAuthError(
      'GitHub rejected the token (expired or revoked). Add a new token in the GitHub mirror settings.',
      401,
    );
  }
  return res;
}

/** Throws unless the response is OK (403/404 mean the token can't reach the repo). */
async function ok<T>(res: Response, what: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const message = await errorMessage(res);
  if (res.status === 403 || res.status === 404) {
    throw new GitHubAuthError(
      `GitHub refused ${what} (${res.status}: ${message}). Check that the token has Contents read and write access to this repo.`,
      res.status,
    );
  }
  throw new GitHubApiError(`GitHub ${what} failed (${res.status}: ${message}).`, res.status);
}

const branchRef = (branch: string) => branch.split('/').map(encodeURIComponent).join('/');

export interface RepoCheck {
  fullName: string;
  isPrivate: boolean;
  canPush: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

/** Checks the token can see the repo; reports whether it's private and writable. */
export async function testGitHubConnection(config: GitHubMirrorConfig): Promise<RepoCheck> {
  const repo = await ok<{
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
    permissions?: { push?: boolean };
  }>(await gh(config, ''), 'access to the repo');
  return {
    fullName: repo.full_name,
    isPrivate: repo.private,
    canPush: repo.permissions?.push !== false,
    defaultBranch: repo.default_branch,
    htmlUrl: repo.html_url,
  };
}

export interface MirrorResult {
  /** Head of the branch after the run. */
  commitSha: string;
  /** Link to the new commit; undefined when nothing changed. */
  commitUrl?: string;
  changed: number;
  deleted: number;
  /** The branch had commits mdlife didn't make since its last run (they were built on). */
  externalChanges: boolean;
}

interface BranchState {
  headSha: string | null;
  treeSha: string | null;
  blobs: Map<string, string>;
}

/** Reads the branch's files; null when the repo has no commits at all. */
async function readBranch(config: GitHubMirrorConfig): Promise<BranchState | null> {
  const refRes = await gh(config, `/git/ref/heads/${branchRef(config.branch)}`);
  if (refRes.status === 409) return null; // empty repository
  if (refRes.status === 404) {
    // Branch missing: is the repo reachable at all (404 also means "no access")?
    await testGitHubConnection(config);
    return { headSha: null, treeSha: null, blobs: new Map() };
  }
  const ref = await ok<{ object: { sha: string } }>(refRes, 'reading the branch');
  const headSha = ref.object.sha;
  const commit = await ok<{ tree: { sha: string } }>(
    await gh(config, `/git/commits/${headSha}`),
    'reading the latest commit',
  );
  const tree = await ok<{
    truncated: boolean;
    tree: { path: string; type: string; sha: string }[];
  }>(await gh(config, `/git/trees/${commit.tree.sha}?recursive=1`), 'reading the files');
  if (tree.truncated) {
    throw new GitHubApiError(
      'The GitHub repo has too many files to compare. Use a smaller repo or a subfolder in a less busy one.',
      0,
    );
  }
  const blobs = new Map<string, string>();
  for (const entry of tree.tree) if (entry.type === 'blob') blobs.set(entry.path, entry.sha);
  return { headSha, treeSha: commit.tree.sha, blobs };
}

/**
 * Makes the branch match the vault in one commit.
 * Throws GitHubMassDeleteError (before writing anything) if it would delete a large share of the
 * repo's vault files, unless `allowMassDelete`.
 */
export async function mirrorVaultToGitHub(
  vaultFiles: VaultFile[],
  config: GitHubMirrorConfig,
  options: { allowMassDelete?: boolean } = {},
): Promise<MirrorResult> {
  const files: MirrorFile[] = await Promise.all(
    vaultFiles
      .map((f) => ({ path: vaultPath(f), content: f.content }))
      .filter((f) => isMirroredPath(f.path))
      .map(async (f) => ({ ...f, sha: await gitBlobSha(f.content) })),
  );

  for (let attempt = 0; ; attempt++) {
    let state = await readBranch(config);
    if (!state) {
      // An empty repo has no git objects to build on; the contents API creates the first commit.
      if (files.length === 0) throw new GitHubApiError('The vault has no files to push.', 0);
      const first = files[0];
      const prefix = normalizeSubfolder(config.subfolder);
      const firstPath = prefix ? `${prefix}/${first.path}` : first.path;
      await ok(
        await gh(config, `/contents/${firstPath.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'PUT',
          body: {
            message: `mdlife: add ${first.path}`,
            content: base64Utf8(first.content),
            branch: config.branch,
          },
        }),
        'creating the first commit',
      );
      state = await readBranch(config);
      if (!state) throw new GitHubApiError('Could not create the first commit.', 0);
    }

    const externalChanges =
      !!config.lastCommitSha && !!state.headSha && state.headSha !== config.lastCommitSha;
    const plan = planMirror(files, state.blobs, config.subfolder);
    if (plan.upserts.length === 0 && plan.deletes.length === 0 && state.headSha) {
      return { commitSha: state.headSha, changed: 0, deleted: 0, externalChanges };
    }
    if (!options.allowMassDelete && isMassDelete(plan)) {
      throw new GitHubMassDeleteError(plan.deletes.length, plan.managedCount);
    }

    const tree = await ok<{ sha: string }>(
      await gh(config, '/git/trees', {
        method: 'POST',
        body: {
          ...(state.treeSha ? { base_tree: state.treeSha } : {}),
          tree: [
            ...plan.upserts.map((u) => ({
              path: u.path,
              mode: '100644',
              type: 'blob',
              content: u.content,
            })),
            ...plan.deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
          ],
        },
      }),
      'saving the files',
    );
    const commit = await ok<{ sha: string; html_url: string }>(
      await gh(config, '/git/commits', {
        method: 'POST',
        body: {
          message: commitMessage(plan),
          tree: tree.sha,
          parents: state.headSha ? [state.headSha] : [],
        },
      }),
      'creating the commit',
    );

    const refRes = state.headSha
      ? await gh(config, `/git/refs/heads/${branchRef(config.branch)}`, {
          method: 'PATCH',
          body: { sha: commit.sha, force: false },
        })
      : await gh(config, '/git/refs', {
          method: 'POST',
          body: { ref: `refs/heads/${config.branch}`, sha: commit.sha },
        });
    // Someone pushed in between (not a fast-forward): start over from the new head, once.
    if ((refRes.status === 422 || refRes.status === 409) && attempt === 0) continue;
    await ok(refRes, 'updating the branch');

    return {
      commitSha: commit.sha,
      commitUrl: commit.html_url,
      changed: plan.upserts.length,
      deleted: plan.deletes.length,
      externalChanges,
    };
  }
}
