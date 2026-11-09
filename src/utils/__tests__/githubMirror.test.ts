import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultFile } from '../../types';
import {
  commitMessage,
  gitBlobSha,
  GitHubAuthError,
  GitHubMassDeleteError,
  isMassDelete,
  MirrorFile,
  mirrorVaultToGitHub,
  planMirror,
  testGitHubConnection,
} from '../githubMirror';
import { GitHubMirrorConfig, normalizeSubfolder, parseRepoInput } from '../githubConfig';

const vf = (path: string, content: string): VaultFile => {
  const i = path.lastIndexOf('/');
  return {
    id: path,
    path,
    folder: i === -1 ? '' : path.slice(0, i),
    name: path.slice(i + 1),
    content,
    frontmatter: {},
    createdAt: 0,
    updatedAt: 0,
  };
};

const mf = async (path: string, content: string): Promise<MirrorFile> => ({
  path,
  content,
  sha: await gitBlobSha(content),
});

describe('gitBlobSha', () => {
  it('matches git hash-object', async () => {
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(await gitBlobSha('# Café ☕\n')).toBe('6f89adbadbe957939f3003864f19542f9e8e1f49');
  });
});

describe('githubConfig helpers', () => {
  it('parses repo input', () => {
    expect(parseRepoInput('sherol/me')).toEqual({ owner: 'sherol', repo: 'me' });
    expect(parseRepoInput('https://github.com/sherol/me.git')).toEqual({
      owner: 'sherol',
      repo: 'me',
    });
    expect(parseRepoInput('just-a-name')).toBeNull();
  });
  it('normalizes the subfolder', () => {
    expect(normalizeSubfolder(' /vault/notes/ ')).toBe('vault/notes');
    expect(normalizeSubfolder('')).toBe('');
  });
});

describe('planMirror', () => {
  it('writes new and changed files, skips unchanged ones', async () => {
    const files = [
      await mf('goals/a.md', 'A'),
      await mf('goals/b.md', 'B2'),
      await mf('notes/c.md', 'C'),
    ];
    const repo = new Map([
      ['goals/a.md', await gitBlobSha('A')],
      ['goals/b.md', await gitBlobSha('B1')],
    ]);
    const plan = planMirror(files, repo, '');
    expect(plan.upserts.map((u) => u.path)).toEqual(['goals/b.md', 'notes/c.md']);
    expect(plan.deletes).toEqual([]);
  });

  it('deletes only stale files inside vault folders', async () => {
    const files = [await mf('goals/a.md', 'A'), await mf('custom/x.md', 'X')];
    const repo = new Map([
      ['goals/a.md', await gitBlobSha('A')],
      ['goals/old.md', 'x'],
      ['custom/gone.md', 'x'], // custom top folder present in the vault → managed
      ['other/keep.md', 'x'], // not a vault folder → untouched
      ['README.md', 'x'],
      ['.github/workflows/ci.yml', 'x'],
      ['backup/2026/goals/a.md', 'x'],
    ]);
    const plan = planMirror(files, repo, '');
    expect(plan.deletes.sort()).toEqual(['custom/gone.md', 'goals/old.md']);
    expect(plan.managedCount).toBe(3);
  });

  it('works inside a subfolder and leaves the rest of the repo alone', async () => {
    const files = [await mf('notes/n.md', 'N')];
    const repo = new Map([
      ['vault/notes/old.md', 'x'],
      ['notes/outside.md', 'x'],
      ['reports/r.md', 'x'],
    ]);
    const plan = planMirror(files, repo, 'vault/');
    expect(plan.upserts.map((u) => u.path)).toEqual(['vault/notes/n.md']);
    expect(plan.deletes).toEqual(['vault/notes/old.md']);
  });

  it('never mirrors backup snapshots', async () => {
    const plan = planMirror([await mf('backup/2026/a.md', 'A')], new Map(), '');
    expect(plan.upserts).toEqual([]);
  });

  it('flags runs that delete most files', () => {
    expect(isMassDelete({ upserts: [], deletes: ['1', '2', '3', '4'], managedCount: 5 })).toBe(
      true,
    );
    expect(isMassDelete({ upserts: [], deletes: ['1', '2', '3'], managedCount: 3 })).toBe(false);
    expect(isMassDelete({ upserts: [], deletes: ['1', '2', '3', '4'], managedCount: 20 })).toBe(
      false,
    );
  });

  it('lists the changes in the commit message', () => {
    const msg = commitMessage({
      upserts: [{ path: 'goals/a.md', content: '' }],
      deletes: ['notes/b.md'],
      managedCount: 2,
    });
    expect(msg).toMatch(/^mdlife: update 1 file\(s\), delete 1 file\(s\)/);
    expect(msg).toContain('M goals/a.md');
    expect(msg).toContain('D notes/b.md');
  });
});

// ---- Minimal in-memory GitHub (just the endpoints the mirror uses) ----
interface Commit {
  tree: string;
  parents: string[];
  message: string;
}
let trees: Map<string, Map<string, { sha: string; content: string }>>;
let commits: Map<string, Commit>;
let head: string | null;
let repoEmpty: boolean;
let nextId: number;
let beforeRefUpdate: (() => Promise<void>) | null;
const config: GitHubMirrorConfig = {
  owner: 'me',
  repo: 'notes',
  branch: 'main',
  subfolder: '',
  token: 't',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const newId = (kind: string) => `${kind}${nextId++}`;

async function addCommit(files: Map<string, { sha: string; content: string }>, message: string) {
  const treeId = newId('tree');
  trees.set(treeId, files);
  const id = newId('commit');
  commits.set(id, { tree: treeId, parents: head ? [head] : [], message });
  head = id;
  repoEmpty = false;
  return id;
}

async function fakeGitHub(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const method = (init.method || 'GET').toUpperCase();
  const auth = new Headers(init.headers).get('Authorization');
  if (auth !== 'Bearer t') return json({ message: 'Bad credentials' }, 401);
  const path = url.pathname.replace('/repos/me/notes', '');
  const body = init.body ? JSON.parse(String(init.body)) : undefined;

  if (method === 'GET' && path === '')
    return json({
      full_name: 'me/notes',
      private: true,
      default_branch: 'main',
      html_url: 'https://github.com/me/notes',
      permissions: { push: true },
    });
  if (method === 'GET' && path === '/git/ref/heads/main') {
    if (repoEmpty) return json({ message: 'Git Repository is empty.' }, 409);
    if (!head) return json({ message: 'Not Found' }, 404);
    return json({ object: { sha: head } });
  }
  if (method === 'GET' && path.startsWith('/git/commits/')) {
    return json({ tree: { sha: commits.get(path.split('/').pop()!)!.tree } });
  }
  if (method === 'GET' && path.startsWith('/git/trees/')) {
    const t = trees.get(path.split('/').pop()!)!;
    return json({
      truncated: false,
      tree: [...t].map(([p, v]) => ({ path: p, type: 'blob', sha: v.sha })),
    });
  }
  if (method === 'POST' && path === '/git/trees') {
    const t = new Map(body.base_tree ? trees.get(body.base_tree)! : []);
    for (const e of body.tree) {
      if (e.sha === null) t.delete(e.path);
      else t.set(e.path, { sha: await gitBlobSha(e.content), content: e.content });
    }
    const id = newId('tree');
    trees.set(id, t);
    return json({ sha: id }, 201);
  }
  if (method === 'POST' && path === '/git/commits') {
    const id = newId('commit');
    commits.set(id, { tree: body.tree, parents: body.parents, message: body.message });
    return json({ sha: id, html_url: `https://github.com/me/notes/commit/${id}` }, 201);
  }
  if (method === 'PATCH' && path === '/git/refs/heads/main') {
    if (beforeRefUpdate) {
      const fn = beforeRefUpdate;
      beforeRefUpdate = null;
      await fn();
    }
    if (commits.get(body.sha)!.parents[0] !== head)
      return json({ message: 'Update is not a fast forward' }, 422);
    head = body.sha;
    return json({ object: { sha: head } });
  }
  if (method === 'POST' && path === '/git/refs') {
    head = body.sha;
    return json({ object: { sha: head } }, 201);
  }
  if (method === 'PUT' && path.startsWith('/contents/')) {
    const p = decodeURIComponent(path.slice('/contents/'.length));
    const content = new TextDecoder().decode(
      Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)),
    );
    await addCommit(new Map([[p, { sha: await gitBlobSha(content), content }]]), body.message);
    return json({}, 201);
  }
  return json({ message: `unhandled ${method} ${path}` }, 500);
}

const repoFiles = () =>
  Object.fromEntries([...trees.get(commits.get(head!)!.tree)!].map(([p, v]) => [p, v.content]));

describe('mirrorVaultToGitHub', () => {
  beforeEach(() => {
    trees = new Map();
    commits = new Map();
    head = null;
    repoEmpty = false;
    nextId = 1;
    beforeRefUpdate = null;
    vi.stubGlobal('fetch', vi.fn(fakeGitHub));
  });

  it('puts all changes in one commit, then does nothing when clean', async () => {
    await addCommit(
      new Map([
        ['README.md', { sha: await gitBlobSha('readme'), content: 'readme' }],
        ['goals/old.md', { sha: await gitBlobSha('old'), content: 'old' }],
      ]),
      'init',
    );
    const vault = [vf('goals/a.md', 'A'), vf('notes/b.md', 'B ☕')];
    const res = await mirrorVaultToGitHub(vault, config);
    expect(res).toMatchObject({ changed: 2, deleted: 1, externalChanges: false });
    expect(repoFiles()).toEqual({ 'README.md': 'readme', 'goals/a.md': 'A', 'notes/b.md': 'B ☕' });
    expect(commits.get(head!)!.parents).toHaveLength(1);

    const again = await mirrorVaultToGitHub(vault, { ...config, lastCommitSha: res.commitSha });
    expect(again).toMatchObject({ changed: 0, deleted: 0, commitSha: res.commitSha });
    expect(again.commitUrl).toBeUndefined();
  });

  it('creates the branch when it does not exist', async () => {
    const res = await mirrorVaultToGitHub([vf('goals/a.md', 'A')], {
      ...config,
      subfolder: 'vault',
    });
    expect(res.changed).toBe(1);
    expect(repoFiles()).toEqual({ 'vault/goals/a.md': 'A' });
    expect(commits.get(head!)!.parents).toEqual([]);
  });

  it('bootstraps an empty repo', async () => {
    repoEmpty = true;
    await mirrorVaultToGitHub([vf('goals/a.md', 'A'), vf('notes/b.md', 'B')], config);
    expect(repoFiles()).toEqual({ 'goals/a.md': 'A', 'notes/b.md': 'B' });
  });

  it('retries once when someone pushed in between, and reports outside commits', async () => {
    const first = await mirrorVaultToGitHub([vf('goals/a.md', 'A')], config);
    beforeRefUpdate = async () => {
      const files = new Map(trees.get(commits.get(head!)!.tree)!);
      files.set('notes/web.md', { sha: await gitBlobSha('web'), content: 'web' });
      await addCommit(files, 'edit on github');
    };
    const res = await mirrorVaultToGitHub([vf('goals/a.md', 'A2')], {
      ...config,
      lastCommitSha: first.commitSha,
    });
    expect(res.externalChanges).toBe(true);
    // Drive is the source of truth: the GitHub-only note is removed (kept in history).
    expect(repoFiles()).toEqual({ 'goals/a.md': 'A2' });
  });

  it('refuses mass deletions unless confirmed', async () => {
    await mirrorVaultToGitHub(
      ['a', 'b', 'c', 'd', 'e'].map((n) => vf(`notes/${n}.md`, n)),
      config,
    );
    const before = head;
    await expect(mirrorVaultToGitHub([vf('notes/a.md', 'a')], config)).rejects.toBeInstanceOf(
      GitHubMassDeleteError,
    );
    expect(head).toBe(before);
    const res = await mirrorVaultToGitHub([vf('notes/a.md', 'a')], config, {
      allowMassDelete: true,
    });
    expect(res.deleted).toBe(4);
  });

  it('reports a bad token as GitHubAuthError', async () => {
    await expect(
      mirrorVaultToGitHub([vf('goals/a.md', 'A')], { ...config, token: 'nope' }),
    ).rejects.toBeInstanceOf(GitHubAuthError);
    await expect(testGitHubConnection({ ...config, token: 'nope' })).rejects.toBeInstanceOf(
      GitHubAuthError,
    );
  });

  it('checks the repo', async () => {
    expect(await testGitHubConnection(config)).toMatchObject({ isPrivate: true, canPush: true });
  });
});
