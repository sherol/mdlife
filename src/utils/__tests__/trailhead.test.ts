import { describe, expect, it } from 'vitest';
import {
  collectOpenTasks,
  createTrailheadFile,
  ensureTrailhead,
  LEGACY_TRAILHEAD_ID,
  TRAILHEAD_ID,
} from '../trailhead';
import { getInitialVaultFiles } from '../../data/initialVault';
import { VaultFile } from '../../types';
import { parseFrontmatter, toggleCheckboxInMarkdown } from '../markdownParser';

const note = (path: string, content: string): VaultFile => ({
  id: path,
  name: path.split('/').pop()!,
  path,
  folder: path.split('/').slice(0, -1).join('/'),
  content,
  frontmatter: parseFrontmatter(content).frontmatter,
  createdAt: 0,
  updatedAt: 0,
});

const legacyReadme = (
  content = '---\ntitle: Trailhead\ncategory: trailhead\n---\n# My home\n',
): VaultFile => ({
  id: LEGACY_TRAILHEAD_ID,
  name: 'README.md',
  path: LEGACY_TRAILHEAD_ID,
  folder: 'trailhead',
  content,
  frontmatter: { title: 'Trailhead', category: 'trailhead' },
  driveFileId: 'drive-readme',
  createdAt: 0,
  updatedAt: 0,
});

describe('Trailhead (trailhead/start.md)', () => {
  it('is part of the starter vault', () => {
    expect(TRAILHEAD_ID).toBe('trailhead/start.md');
    expect(getInitialVaultFiles()[0].id).toBe(TRAILHEAD_ID);
  });

  it('is added to vaults that lack it, at the front', () => {
    const others = getInitialVaultFiles().filter((f) => f.id !== TRAILHEAD_ID);
    const res = ensureTrailhead(others);
    expect(res.startChanged).toBe(true);
    expect(res.files[0].id).toBe(TRAILHEAD_ID);
    expect(res.files).toHaveLength(others.length + 1);
  });

  it('never replaces an existing (edited) start.md, and keeps other notes in the folder', () => {
    const edited = { ...createTrailheadFile(), content: '# My own home page\n' };
    const extra = {
      ...createTrailheadFile(),
      id: 'trailhead/packing-list.md',
      name: 'packing-list.md',
      path: 'trailhead/packing-list.md',
    };
    const res = ensureTrailhead([edited, extra]);
    expect(res.startChanged).toBe(false);
    expect(res.files).toEqual([edited, extra]);
  });

  it("moves the first version's README.md to start.md, keeping its content", () => {
    const res = ensureTrailhead([legacyReadme()]);
    expect(res.files).toHaveLength(1);
    expect(res.files[0]).toMatchObject({
      id: TRAILHEAD_ID,
      name: 'start.md',
      content: legacyReadme().content,
    });
    expect(res.files[0].driveFileId).toBeUndefined();
    expect(res.startChanged).toBe(true);
    expect(res.removedLegacy?.driveFileId).toBe('drive-readme');
  });

  it('drops a leftover README.md once start.md exists', () => {
    const start = createTrailheadFile();
    const res = ensureTrailhead([start, legacyReadme()]);
    expect(res.files).toEqual([start]);
    expect(res.removedLegacy?.id).toBe(LEGACY_TRAILHEAD_ID);
  });

  it('leaves a README.md the user created in the folder alone', () => {
    const own = { ...legacyReadme('# Notes about trails\n'), frontmatter: {} };
    const res = ensureTrailhead([own]);
    expect(res.files.map((f) => f.id)).toEqual([TRAILHEAD_ID, LEGACY_TRAILHEAD_ID]);
    expect(res.removedLegacy).toBeUndefined();
  });
});

describe('collectOpenTasks (open-task list on start.md)', () => {
  const files = [
    createTrailheadFile(),
    note('notes/log.md', '# Log\n- [ ] note task\n'),
    note(
      'goals/fit.md',
      '---\ntitle: Get Fit\n---\n- [x] done\n- [ ] run **5k**\n```\n- [ ] in code\n```\n* [ ] swim\n',
    ),
    note('archive/2025/old.md', '- [ ] archived folder\n'),
    note('projects/p/p.md', '---\nstatus: archived\n---\n- [ ] archived status\n'),
    note('projects/p/data.txt', '- [ ] not markdown\n'),
    note('skills/none.md', '- [x] all done\n'),
  ];

  it('lists unchecked tasks of non-archived markdown files, in folder order', () => {
    const groups = collectOpenTasks(files);
    expect(groups.map((g) => g.file.path)).toEqual(['goals/fit.md', 'notes/log.md']);
    expect(groups[0].tasks).toEqual([
      { taskIndex: 1, text: 'run **5k**' },
      { taskIndex: 2, text: 'swim' },
    ]);
  });

  it('task indexes toggle the matching line in the source file', () => {
    const [fit] = collectOpenTasks(files);
    const toggled = toggleCheckboxInMarkdown(fit.file.content, fit.tasks[1].taskIndex);
    expect(toggled).toContain('* [x] swim');
    expect(toggled).toContain('- [ ] run **5k**');
  });
});
