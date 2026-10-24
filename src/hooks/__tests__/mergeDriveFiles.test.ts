import { describe, expect, it } from 'vitest';
import { mergeDriveFiles } from '../useDriveSync';
import { VaultFile } from '../../types';

const file = (path: string, driveFileId?: string, content = 'x'): VaultFile => ({
  id: path,
  name: path.split('/').pop()!,
  path,
  folder: path.split('/').slice(0, -1).join('/'),
  content,
  frontmatter: {},
  driveFileId,
  createdAt: 0,
  updatedAt: 0,
});

describe('mergeDriveFiles: a Drive file listed under a new local name', () => {
  // Before .txt files were allowed in projects, Drive's "notes.txt" was imported as
  // "notes.txt.md"; the same Drive file is now listed as "notes.txt".
  const legacy = file('projects/x/notes.txt.md', 'D1', 'local edits');
  const relisted = file('projects/x/notes.txt', 'D1', 'drive text');

  it('keeps an unsaved local file and skips the duplicate, so one Drive file has one owner', () => {
    const { merged } = mergeDriveFiles([legacy], [relisted], new Set([legacy.id]), {
      pruneMissing: true,
    });
    expect(merged.map((f) => f.id)).toEqual([legacy.id]);
    expect(merged[0].content).toBe('local edits');
  });

  it('moves a saved local file to the new name on a complete listing', () => {
    const { merged } = mergeDriveFiles([legacy], [relisted], new Set(), { pruneMissing: true });
    expect(merged.map((f) => f.id)).toEqual([relisted.id]);
  });

  it('leaves unrelated files alone', () => {
    const other = file('notes/a.md', 'D2');
    const { merged } = mergeDriveFiles([other], [relisted], new Set([other.id]), {
      pruneMissing: true,
    });
    expect(merged.map((f) => f.id).sort()).toEqual([other.id, relisted.id].sort());
  });
});
