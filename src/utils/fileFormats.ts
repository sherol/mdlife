import { FileFrontmatter } from '../types';
import { parseFrontmatter } from './markdownParser';

/** How a vault file's content is stored and shown. */
export type FileFormat = 'markdown' | 'json' | 'text';

const EXTENSION_FORMATS: Record<string, FileFormat> = {
  '.md': 'markdown',
  '.json': 'json',
  '.txt': 'text',
};

const FORMAT_EXTENSIONS: Record<FileFormat, string> = {
  markdown: '.md',
  json: '.json',
  text: '.txt',
};

const FORMAT_MIME_TYPES: Record<FileFormat, string> = {
  markdown: 'text/markdown',
  json: 'application/json',
  text: 'text/plain',
};

export const FORMAT_LABELS: Record<FileFormat, string> = {
  markdown: 'Markdown',
  json: 'JSON',
  text: 'Plain Text',
};

/** The extension of a file name that selects a non-markdown format (".json" / ".txt"), if any. */
const altExtension = (fileName: string): string | null => {
  const match = fileName.toLowerCase().match(/\.(json|txt)$/);
  return match ? `.${match[1]}` : null;
};

/** JSON and plain-text files are allowed only inside the Projects folder (and its sub-folders). */
export const folderAllowsAltFormats = (folder: string): boolean => {
  const top = (folder || '').trim().split('/')[0].toLowerCase();
  return top === 'projects';
};

/** The format of a file, from its name. Anything that isn't .json / .txt is markdown. */
export const getFileFormat = (fileName: string): FileFormat => {
  const ext = altExtension(fileName);
  return ext ? EXTENSION_FORMATS[ext] : 'markdown';
};

export const isMarkdownFile = (file: { name: string }): boolean =>
  getFileFormat(file.name) === 'markdown';

export const extensionForFormat = (format: FileFormat): string => FORMAT_EXTENSIONS[format];

export const mimeTypeForFile = (fileName: string): string =>
  FORMAT_MIME_TYPES[getFileFormat(fileName)];

/** The file name without its format extension (".md", ".json" or ".txt"). */
export const stripFileExtension = (fileName: string): string =>
  fileName.replace(/\.(md|json|txt)$/i, '');

/**
 * The vault file name for `rawName` in `folder`: keeps a ".json" / ".txt" extension where the
 * folder allows those formats, and otherwise makes sure the name ends in ".md".
 */
export const normalizeFileName = (rawName: string, folder: string): string => {
  const name = rawName.trim();
  if (altExtension(name) && folderAllowsAltFormats(folder)) return name;
  return name.endsWith('.md') ? name : `${name}.md`;
};

/** The file's extension as it appears in its name (".md" for markdown files). */
export const fileExtension = (fileName: string): string =>
  extensionForFormat(getFileFormat(fileName));

/**
 * A file's frontmatter. Only markdown files have one: JSON and plain-text content is never read
 * as YAML or markdown (a "# line" in a text file is not a title).
 */
export const getFileFrontmatter = (fileName: string, content: string): FileFrontmatter =>
  getFileFormat(fileName) === 'markdown' ? parseFrontmatter(content).frontmatter : {};

/** The starting content of a new JSON or plain-text file. */
export const getTemplateForFormat = (format: 'json' | 'text', title: string): string =>
  format === 'json' ? `${JSON.stringify({ title }, null, 2)}\n` : `${title}\n`;

/** Parses JSON content for the viewer: the value, or the parse error message. */
export const parseJsonContent = (
  content: string,
): { ok: true; value: unknown } | { ok: false; error: string } => {
  if (!content.trim()) return { ok: false, error: 'The file is empty.' };
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
