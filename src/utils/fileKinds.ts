import { VaultFile } from '../types';

/** The standard top-level vault folders, in display order. */
export const STANDARD_FOLDERS = ['goals', 'projects', 'skills', 'notes', 'archive'] as const;
export type StandardFolder = (typeof STANDARD_FOLDERS)[number];

type ClassifiableFile = Pick<VaultFile, 'folder' | 'frontmatter'>;

/**
 * The top-level vault folder a file belongs to.
 * Uses the first path segment of its folder (exact match for standard folders);
 * files without a folder fall back to their frontmatter category, then to 'notes'.
 */
export const getTopLevelFolder = (file: ClassifiableFile): string => {
  const folder = (file.folder || '').trim();
  if (folder) {
    const top = folder.split('/')[0];
    const lower = top.toLowerCase();
    return (STANDARD_FOLDERS as readonly string[]).includes(lower) ? lower : top;
  }
  const cat = (file.frontmatter.category || '').trim().toLowerCase();
  if ((STANDARD_FOLDERS as readonly string[]).includes(cat)) return cat;
  return 'notes';
};

const isKind = (file: ClassifiableFile, kind: StandardFolder) => getTopLevelFolder(file) === kind;

export const isGoalFile = (file: ClassifiableFile) => isKind(file, 'goals');
export const isProjectFile = (file: ClassifiableFile) => isKind(file, 'projects');
export const isSkillFile = (file: ClassifiableFile) => isKind(file, 'skills');
export const isArchiveFile = (file: ClassifiableFile) => isKind(file, 'archive');
