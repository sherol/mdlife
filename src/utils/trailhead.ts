import { VaultFile } from '../types';
import { getOpenTasks, parseFrontmatter } from './markdownParser';
import { STANDARD_FOLDERS, getTopLevelFolder, isArchiveFile } from './fileKinds';
import { isMarkdownFile } from './fileFormats';

/**
 * The Trailhead: the vault's first folder ("0. Trailhead" in the sidebar). Its start.md is the
 * vault's home page: always present, opened when the app loads, can't be deleted or renamed.
 * Other notes can live in the folder too.
 */
export const TRAILHEAD_FOLDER = 'trailhead';
export const TRAILHEAD_NAME = 'start.md';
export const TRAILHEAD_ID = `${TRAILHEAD_FOLDER}/${TRAILHEAD_NAME}`;
export const TRAILHEAD_LABEL = '0. Trailhead';
/** Where the home page lived in the first version; moved to start.md on load. */
export const LEGACY_TRAILHEAD_ID = `${TRAILHEAD_FOLDER}/README.md`;

export const isTrailheadFile = (file: Pick<VaultFile, 'id'> | null | undefined): boolean =>
  !!file && file.id === TRAILHEAD_ID;

export const TRAILHEAD_TEMPLATE = `---
title: Start
category: trailhead
---

# 🥾 Trailhead

Welcome to your vault. This page (\`0. Trailhead/start.md\`) is the starting point: it opens every time the app loads.
Make it yours — edit it like any other note.

## Where things live

| Folder | What goes there |
| --- | --- |
| **0. Trailhead** | This start page, plus anything else you want close at hand |
| **1. Goals** | The outcomes you're working toward, with target dates and status |
| **2. Projects** | One sub-folder per project; each project serves a goal |
| **3. Agent Skills** | Reusable prompt templates for AI assistants |
| **4. Notes** | Daily notes, ideas and scratch work |
| **5. Archive** | Finished or paused work, filed by year |

## Today

- [ ] Review active goals
- [ ] Pick the one project that moves things forward most
- [ ] Capture loose notes in **4. Notes**

## Quick links

Link your most important notes here with \`[[note-name]]\` (or the **[[…]]** button in the toolbar),
so this page becomes your map of the vault.

## Handy shortcuts

- **Ctrl/Cmd + K** — jump to any note
- **Ctrl/Cmd + S** — save to Google Drive now
- **@today** — inserts today's date
- **Edit in Google Docs** — share a note with someone who prefers Google Docs
`;

export function createTrailheadFile(now = Date.now()): VaultFile {
  return {
    id: TRAILHEAD_ID,
    name: TRAILHEAD_NAME,
    path: TRAILHEAD_ID,
    folder: TRAILHEAD_FOLDER,
    content: TRAILHEAD_TEMPLATE,
    frontmatter: parseFrontmatter(TRAILHEAD_TEMPLATE).frontmatter,
    createdAt: now,
    updatedAt: now,
  };
}

const isLegacyTrailhead = (file: VaultFile) =>
  file.id === LEGACY_TRAILHEAD_ID && file.frontmatter?.category === 'trailhead';

export interface TrailheadResult {
  files: VaultFile[];
  /** start.md was created or moved and still needs saving to Drive. */
  startChanged: boolean;
  /** The old trailhead/README.md, removed locally (delete it from Drive too). */
  removedLegacy?: VaultFile;
}

/**
 * Makes sure the vault has trailhead/start.md:
 * - keeps an existing one untouched;
 * - moves the first version's trailhead/README.md to start.md (content kept);
 * - otherwise adds the starter page at the front.
 */
export function ensureTrailhead(files: VaultFile[]): TrailheadResult {
  const start = files.find(isTrailheadFile);
  const legacy = files.find(isLegacyTrailhead);

  if (start) {
    return legacy
      ? { files: files.filter((f) => f !== legacy), startChanged: false, removedLegacy: legacy }
      : { files, startChanged: false };
  }
  if (legacy) {
    const moved: VaultFile = {
      ...legacy,
      id: TRAILHEAD_ID,
      name: TRAILHEAD_NAME,
      path: TRAILHEAD_ID,
      folder: TRAILHEAD_FOLDER,
      driveFileId: undefined,
      driveModifiedTime: undefined,
      updatedAt: Date.now(),
    };
    return {
      files: files.map((f) => (f === legacy ? moved : f)),
      startChanged: true,
      removedLegacy: legacy,
    };
  }
  return { files: [createTrailheadFile(), ...files], startChanged: true };
}

export interface FileOpenTasks {
  file: VaultFile;
  tasks: { taskIndex: number; text: string }[];
}

const FOLDER_ORDER: readonly string[] = STANDARD_FOLDERS;
const folderRank = (file: VaultFile) => {
  const i = FOLDER_ORDER.indexOf(getTopLevelFolder(file));
  return i === -1 ? FOLDER_ORDER.length : i;
};

/**
 * The unchecked tasks of every markdown file that isn't archived (not in archive/, status not
 * "archived"), for the list on start.md. start.md's own tasks are left out (they're on the page).
 * Ordered by vault folder (goals, projects, skills, notes, others), then by path.
 */
export function collectOpenTasks(files: VaultFile[]): FileOpenTasks[] {
  return files
    .filter(
      (f) =>
        !isTrailheadFile(f) &&
        isMarkdownFile(f) &&
        !isArchiveFile(f) &&
        f.frontmatter.status !== 'archived',
    )
    .map((file) => ({ file, tasks: getOpenTasks(file.content) }))
    .filter((entry) => entry.tasks.length > 0)
    .sort(
      (a, b) => folderRank(a.file) - folderRank(b.file) || a.file.path.localeCompare(b.file.path),
    );
}
