import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultFile } from '../../types';

vi.mock('../googleAuth', () => ({
  getAccessToken: async () => 'test-token',
  markTokenExpired: () => {},
}));

import { backupSnapshotName, backupVaultToDrive, importVaultFromDrive, resetDriveCaches } from '../googleDrive';

// ---- Minimal in-memory Google Drive (just what these code paths use) ----
interface Item { id: string; name: string; mimeType: string; parents: string[]; content?: string }
const FOLDER = 'application/vnd.google-apps.folder';
let items: Item[] = [];
let nextId = 1;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function fakeDrive(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const method = (init.method || 'GET').toUpperCase();
  if (method === 'GET' && url.pathname.endsWith('/files')) {
    const q = url.searchParams.get('q') || '';
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    const folderOnly = q.includes(`mimeType = '${FOLDER}'`);
    const noFolders = q.includes(`mimeType != '${FOLDER}'`);
    const files = items.filter(
      (i) =>
        (!parent || i.parents.includes(parent)) &&
        (!folderOnly || i.mimeType === FOLDER) &&
        (!noFolders || i.mimeType !== FOLDER)
    );
    return Promise.resolve(json({ files }));
  }
  if (method === 'GET' && url.searchParams.get('alt') === 'media') {
    const id = decodeURIComponent(url.pathname.split('/').pop()!);
    return Promise.resolve(new Response(items.find((i) => i.id === id)?.content ?? ''));
  }
  if (method === 'POST' && url.pathname.endsWith('/upload/drive/v3/files')) {
    const body = String(init.body);
    const meta = JSON.parse(body.match(/\r\n\r\n(\{.*?\})\r\n--/s)![1]);
    const content = body.split('\r\n\r\n')[2].replace(/\r\n--[^\r\n]*--$/, '');
    const item = { id: `f${nextId++}`, name: meta.name, mimeType: meta.mimeType, parents: meta.parents, content };
    items.push(item);
    return Promise.resolve(json({ id: item.id }));
  }
  if (method === 'POST' && url.pathname.endsWith('/drive/v3/files')) {
    const meta = JSON.parse(String(init.body));
    const item = { id: `d${nextId++}`, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || ['root'] };
    items.push(item);
    return Promise.resolve(json({ id: item.id }));
  }
  return Promise.resolve(new Response('not handled', { status: 500 }));
}

const childNamed = (parentId: string, name: string) => items.find((i) => i.parents.includes(parentId) && i.name === name);
const vaultFile = (path: string, content: string): VaultFile => ({
  id: path,
  path,
  name: path.split('/').pop()!,
  folder: path.split('/').slice(0, -1).join('/'),
  content,
  frontmatter: {},
  createdAt: 0,
  updatedAt: 0,
});

beforeEach(() => {
  items = [];
  nextId = 1;
  resetDriveCaches();
  vi.stubGlobal('fetch', vi.fn(fakeDrive));
});

describe('backupVaultToDrive', () => {
  it('names snapshots by local date and time so they sort chronologically', () => {
    expect(backupSnapshotName(new Date(2026, 9, 20, 9, 5, 7))).toBe('2026-10-20 09-05-07');
  });

  it('copies every file into backup/<date time>/ keeping the folder structure', async () => {
    const files = [
      vaultFile('trailhead/start.md', '# Start\n'),
      vaultFile('goals/run.md', '# Run (unsaved local edit)\n'),
      vaultFile('projects/house/plan.md', '# Plan\n'),
    ];
    const progress: number[] = [];
    const res = await backupVaultToDrive(files, (done) => progress.push(done));

    expect(res.saved).toBe(3);
    expect(res.failed).toEqual([]);
    expect(res.path).toMatch(/^backup\/\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/);
    expect(progress.sort()).toEqual([1, 2, 3]);

    const root = childNamed('root', 'Markdown Life Vault')!;
    const backup = childNamed(root.id, 'backup')!;
    const snapshot = childNamed(backup.id, res.snapshotName)!;
    expect(snapshot.id).toBe(res.snapshotFolderId);
    const goals = childNamed(snapshot.id, 'goals')!;
    expect(childNamed(goals.id, 'run.md')?.content).toBe('# Run (unsaved local edit)\n');
    const house = childNamed(childNamed(snapshot.id, 'projects')!.id, 'house')!;
    expect(childNamed(house.id, 'plan.md')?.content).toBe('# Plan\n');
  });

  it('keeps earlier snapshots and never loads backups into the vault', async () => {
    // A real vault file next to the backup folder
    const rootFolderRes = await fakeDrive('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      body: JSON.stringify({ name: 'Markdown Life Vault', mimeType: FOLDER }),
    });
    const rootId = (await rootFolderRes.json()).id;
    items.push({ id: 'g', name: 'goals', mimeType: FOLDER, parents: [rootId] });
    items.push({ id: 'g1', name: 'run.md', mimeType: 'text/markdown', parents: ['g'], content: '# Run\n' });

    await backupVaultToDrive([vaultFile('goals/run.md', '# Run\n')]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 2000));
    await backupVaultToDrive([vaultFile('goals/run.md', '# Run v2\n')]);
    vi.useRealTimers();

    const backup = childNamed(rootId, 'backup')!;
    expect(items.filter((i) => i.parents.includes(backup.id))).toHaveLength(2);

    const snapshot = await importVaultFromDrive();
    expect(snapshot.files.map((f) => f.path)).toEqual(['goals/run.md']);
  });
});
