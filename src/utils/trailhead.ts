import { VaultFile } from '../types';
import { parseFrontmatter } from './markdownParser';

/**
 * The Trailhead: the vault's single home-page note ("0. Trailhead" in the sidebar).
 * It is always present, opens when the app loads, and can't be deleted or renamed.
 */
export const TRAILHEAD_FOLDER = 'trailhead';
export const TRAILHEAD_NAME = 'README.md';
export const TRAILHEAD_ID = `${TRAILHEAD_FOLDER}/${TRAILHEAD_NAME}`;
export const TRAILHEAD_LABEL = '0. Trailhead';

export const isTrailheadFile = (file: Pick<VaultFile, 'id'> | null | undefined): boolean =>
  !!file && file.id === TRAILHEAD_ID;

export const TRAILHEAD_TEMPLATE = `---
title: Trailhead
category: trailhead
---

# 🥾 Trailhead

Welcome to your vault. This page is the starting point: it opens every time the app loads.
Make it yours — edit it like any other note (switch to **Edit** or **Split** above).

## Where things live

| Folder | What goes there |
| --- | --- |
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

/** Returns the files with the Trailhead added at the front when it is missing. */
export function ensureTrailhead(files: VaultFile[]): { files: VaultFile[]; added: boolean } {
  if (files.some(isTrailheadFile)) return { files, added: false };
  return { files: [createTrailheadFile(), ...files], added: true };
}
