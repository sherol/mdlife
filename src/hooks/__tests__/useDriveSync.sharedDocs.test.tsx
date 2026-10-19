// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { VaultFile } from '../../types';
import { useRefState } from '../useRefState';
import { useDriveSync } from '../useDriveSync';
import { parseFrontmatter } from '../../utils/markdownParser';

// ---- Fake Google Drive -----------------------------------------------------
const drive = vi.hoisted(() => ({
  docs: new Map<string, { content: string; version: number }>(),
  shares: [] as { id: string; email: string; role: string }[],
  mdSaves: [] as string[],
  nextId: 1,
}));

vi.mock('../../utils/googleAuth', () => ({
  subscribeDriveStatus: (fn: (s: string) => void) => {
    fn('connected');
    return () => {};
  },
  testDriveConnection: async () => ({ ok: true }),
}));

vi.mock('../../utils/googleDrive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/googleDrive')>();
  const meta = (id: string) => ({ id, name: 'Doc', version: String(drive.docs.get(id)!.version) });
  return {
    ...actual,
    withDriveFileLock: (_k: string, fn: () => Promise<unknown>) => fn(),
    saveFileToDrive: async (file: VaultFile) => {
      drive.mdSaves.push(file.content);
      return { fileId: `md-${file.id}`, isNew: false, modifiedTime: new Date().toISOString() };
    },
    subscribeDriveSaves: () => () => {},
    importVaultFromDrive: async () => ({ files: [], failedPaths: new Set() }),
    createSharedDoc: async (_title: string, _folder: string, md: string) => {
      const id = `doc${drive.nextId++}`;
      drive.docs.set(id, { content: md, version: 1 });
      return meta(id);
    },
    getSharedDocMeta: async (id: string) => (drive.docs.has(id) ? meta(id) : null),
    exportDocAsMarkdown: async (id: string) => drive.docs.get(id)!.content,
    replaceSharedDocContent: async (id: string, md: string) => {
      const d = drive.docs.get(id)!;
      d.content = md;
      d.version++;
      return meta(id);
    },
    shareProjectWithGoogleAccount: async (id: string, email: string, role: string) => {
      drive.shares.push({ id, email, role });
      return { id: 'perm1', type: 'user', role, emailAddress: email };
    },
  };
});

// ---- Harness ---------------------------------------------------------------
const NOTE: VaultFile = {
  id: 'notes/groceries.md',
  name: 'groceries.md',
  path: 'notes/groceries.md',
  folder: 'notes',
  content: '---\ntitle: Groceries\nstatus: active\n---\n# Groceries\n\n- milk\n- eggs\n',
  frontmatter: { title: 'Groceries', status: 'active' },
  createdAt: 0,
  updatedAt: 0,
};

function useHarness() {
  const [files, updateFiles, filesRef] = useRefState<VaultFile[]>(() => [NOTE]);
  const [unsavedFileIds, updateUnsaved, unsavedRef] = useRefState<Set<string>>(() => new Set());
  const [, setSelected] = useState<string | null>(NOTE.id);
  const sync = useDriveSync({
    enabled: true,
    driveStatus: 'connected',
    setDriveStatus: () => {},
    files,
    filesRef,
    updateFiles,
    unsavedFileIds,
    unsavedRef,
    updateUnsaved,
    setSelectedFileId: setSelected,
    notify: () => {},
    activeFileId: null, // drive syncs explicitly in tests
  });
  const edit = (fn: (c: string) => string) => {
    updateFiles((prev) => prev.map((f) => (f.id === NOTE.id ? { ...f, content: fn(f.content) } : f)));
    sync.markUnsaved([NOTE.id]);
  };
  return { ...sync, files, filesRef, edit };
}

const content = (h: { current: ReturnType<typeof useHarness> }) => h.current.filesRef.current[0].content;

async function setupShared() {
  const { result } = renderHook(() => useHarness());
  await act(async () => {
    await result.current.shareNoteAsGoogleDoc(NOTE.id, 'partner@example.com', true);
  });
  await act(async () => {
    await result.current.flushSaves();
  });
  return result;
}

beforeEach(() => {
  drive.docs.clear();
  drive.shares.length = 0;
  drive.mdSaves.length = 0;
  drive.nextId = 1;
  localStorage.clear();
});

describe('notes shared via Google Docs (useDriveSync)', () => {
  it('creates the doc from the note body, links it and shares it as editor', async () => {
    const result = await setupShared();
    expect(drive.docs.get('doc1')!.content).toBe('# Groceries\n\n- milk\n- eggs\n');
    expect(drive.shares).toEqual([{ id: 'doc1', email: 'partner@example.com', role: 'writer' }]);
    expect(parseFrontmatter(content(result)).frontmatter.google_doc).toBe('doc1');
    expect(content(result)).toContain('status: active');
    expect(drive.mdSaves.at(-1)).toContain('google_doc: doc1'); // vault copy saved with the link
  });

  it("pulls the other person's edits into the note, keeping its metadata", async () => {
    const result = await setupShared();
    drive.docs.set('doc1', { content: '# Groceries\n\n- milk\n- eggs\n- coffee\n', version: 5 });
    await act(async () => {
      await result.current.syncSharedDocNow(NOTE.id);
    });
    expect(content(result)).toContain('- coffee');
    expect(content(result)).toContain('status: active');
    await act(async () => {
      await result.current.flushSaves();
    });
    expect(drive.mdSaves.at(-1)).toContain('- coffee');
  });

  it('pushes my edits to the doc when I save', async () => {
    const result = await setupShared();
    act(() => result.current.edit((c) => c.replace('- eggs', '- eggs\n- bread')));
    await act(async () => {
      await result.current.flushSaves();
    });
    expect(drive.docs.get('doc1')!.content).toBe('# Groceries\n\n- milk\n- eggs\n- bread\n');
    expect(drive.docs.get('doc1')!.content).not.toContain('status:');
  });

  it('merges edits to different lines from both sides', async () => {
    const result = await setupShared();
    drive.docs.set('doc1', { content: '# Groceries\n\n- milk\n- eggs\n- coffee\n', version: 5 });
    act(() => result.current.edit((c) => c.replace('# Groceries', '# Groceries for Saturday')));
    await act(async () => {
      await result.current.flushSaves();
    });
    const expected = '# Groceries for Saturday\n\n- milk\n- eggs\n- coffee\n';
    expect(drive.docs.get('doc1')!.content).toBe(expected);
    expect(content(result)).toContain(expected);
  });

  it('asks when both change the same line, and applies the choice', async () => {
    const result = await setupShared();
    drive.docs.set('doc1', { content: '# Groceries\n\n- whole milk\n- eggs\n', version: 5 });
    act(() => result.current.edit((c) => c.replace('- milk', '- oat milk')));
    await act(async () => {
      await result.current.flushSaves();
    });
    await waitFor(() => expect(result.current.docConflict).not.toBeNull());
    expect(result.current.docConflictIds.has(NOTE.id)).toBe(true);
    expect(drive.docs.get('doc1')!.content).toContain('- whole milk'); // nothing overwritten

    await act(async () => {
      result.current.resolveDocConflict(['mine']);
    });
    await act(async () => {
      await result.current.flushSaves();
    });
    expect(result.current.docConflict).toBeNull();
    expect(content(result)).toContain('- oat milk');
    expect(drive.docs.get('doc1')!.content).toBe('# Groceries\n\n- oat milk\n- eggs\n');
  });

  it('unlinking removes the link but leaves the doc alone', async () => {
    const result = await setupShared();
    act(() => result.current.unlinkSharedDoc(NOTE.id));
    expect(parseFrontmatter(content(result)).frontmatter.google_doc).toBeUndefined();
    expect(drive.docs.has('doc1')).toBe(true);
  });
});
