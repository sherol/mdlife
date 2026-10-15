import { FileFrontmatter, TaskProgress } from '../types';

/**
 * Parses frontmatter between --- and ---
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: FileFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    // Fallback: extract title from first # heading if available
    const firstHeading = markdown.match(/^#\s+(.+)$/m);
    return {
      frontmatter: {
        title: firstHeading ? firstHeading[1].trim() : undefined,
      },
      body: markdown,
    };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter: FileFrontmatter = {};

  // Simple and robust YAML parser for standard key: value and simple lists
  const lines = rawYaml.split(/\r?\n/);
  let currentArrayKey: string | null = null;
  let currentArray: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item e.g. "  - item" or "- item"
    if (trimmed.startsWith('- ') && currentArrayKey) {
      const val = trimmed.substring(2).trim().replace(/^["']|["']$/g, '');
      currentArray.push(val);
      continue;
    }

    // New key-value pair e.g. "key: value" or "key: [a, b]" or "key:"
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      // Save previous array if any
      if (currentArrayKey) {
        frontmatter[currentArrayKey] = currentArray;
        currentArrayKey = null;
        currentArray = [];
      }

      const key = line.substring(0, colonIdx).trim();
      const rawVal = line.substring(colonIdx + 1).trim();

      if (!rawVal) {
        // Might be starting a multi-line array
        currentArrayKey = key;
        currentArray = [];
      } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        // Inline array: [item1, item2]
        const items = rawVal
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        frontmatter[key] = items;
      } else {
        let val: any = rawVal.replace(/^["']|["']$/g, '');
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        frontmatter[key] = val;
      }
    }
  }

  if (currentArrayKey) {
    frontmatter[currentArrayKey] = currentArray;
  }

  // Ensure title exists
  if (!frontmatter.title) {
    const firstHeading = body.match(/^#\s+(.+)$/m);
    if (firstHeading) {
      frontmatter.title = firstHeading[1].trim();
    }
  }

  return { frontmatter, body };
}

/**
 * Serializes frontmatter back into markdown
 */
export function stringifyWithFrontmatter(
  frontmatter: FileFrontmatter,
  body: string
): string {
  const yamlLines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        yamlLines.push(`${key}: []`);
      } else {
        yamlLines.push(`${key}:`);
        for (const item of value) {
          yamlLines.push(`  - "${item}"`);
        }
      }
    } else if (typeof value === 'string') {
      // Quote if contains special characters
      if (value.includes(':') || value.includes('#') || value.includes('[') || value.includes(']')) {
        yamlLines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        yamlLines.push(`${key}: ${value}`);
      }
    } else {
      yamlLines.push(`${key}: ${value}`);
    }
  }

  if (yamlLines.length === 0) {
    return body;
  }

  return `---\n${yamlLines.join('\n')}\n---\n\n${body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart()}`;
}

/** Matches a leading YAML frontmatter block (same rule the preview uses to hide it). */
const FRONTMATTER_BLOCK_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/**
 * Splits markdown into its leading frontmatter block (verbatim, possibly empty) and the body.
 */
export function splitFrontmatterBlock(markdown: string): { frontmatterBlock: string; body: string } {
  const match = markdown.match(FRONTMATTER_BLOCK_REGEX);
  const frontmatterBlock = match ? match[0] : '';
  return { frontmatterBlock, body: markdown.slice(frontmatterBlock.length) };
}

/**
 * A GFM task list item line: any bullet (`-`, `*`, `+`) or ordered (`1.` / `1)`) marker,
 * optionally inside blockquotes, followed by `[ ]` / `[x]` and some text.
 * Groups: 1 = prefix up to and including `[`, 2 = check state, 3 = rest of the line.
 */
const TASK_LINE_REGEX = /^(\s*(?:>\s?)*\s*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\][ \t]+\S.*)$/;
const FENCE_OPEN_REGEX = /^(?:\s*>)*\s*(`{3,}|~{3,})/;

/**
 * Walks the markdown body (frontmatter excluded) line by line and calls `onTask` for each
 * task checkbox line that is not inside a fenced code block (``` or ~~~).
 * `lineNumber` is 1-based and relative to the body, matching remark's node positions
 * when the body is rendered on its own.
 */
function forEachTaskLine(
  body: string,
  onTask: (info: { lineIndex: number; lineNumber: number; taskIndex: number; checked: boolean; match: RegExpMatchArray }) => void,
  lines: string[] = body.split(/\r?\n/)
): void {
  let fence: { char: string; length: number } | null = null;
  let taskIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_OPEN_REGEX);

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.char &&
        fenceMatch[1].length >= fence.length &&
        line.slice((fenceMatch.index ?? 0) + fenceMatch[0].length).trim() === ''
      ) {
        fence = null;
      }
      continue;
    }

    if (fenceMatch) {
      // Backtick fences may not contain backticks in their info string
      const info = line.slice((fenceMatch.index ?? 0) + fenceMatch[0].length);
      if (fenceMatch[1][0] === '~' || !info.includes('`')) {
        fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
        continue;
      }
    }

    const match = line.match(TASK_LINE_REGEX);
    if (match) {
      onTask({
        lineIndex: i,
        lineNumber: i + 1,
        taskIndex,
        checked: match[2].toLowerCase() === 'x',
        match,
      });
      taskIndex++;
    }
  }
}

/**
 * Maps 1-based body line numbers of task list items to their task index.
 * Used by the preview so each rendered checkbox toggles the matching source line.
 */
export function getTaskLineIndexMap(body: string): Map<number, number> {
  const map = new Map<number, number>();
  forEachTaskLine(body, ({ lineNumber, taskIndex }) => {
    map.set(lineNumber, taskIndex);
  });
  return map;
}

/**
 * Calculates task progress from checkboxes in markdown
 */
export function getTaskProgress(markdown: string): TaskProgress {
  const { body } = splitFrontmatterBlock(markdown);
  let total = 0;
  let completed = 0;

  forEachTaskLine(body, ({ checked }) => {
    total++;
    if (checked) completed++;
  });

  return {
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Toggles the nth checkbox task in the markdown string (same counting rule as
 * getTaskProgress / getTaskLineIndexMap: frontmatter and fenced code are skipped).
 */
export function toggleCheckboxInMarkdown(markdown: string, taskIndex: number): string {
  const { frontmatterBlock, body } = splitFrontmatterBlock(markdown);
  // Keep the original line endings intact
  const parts = body.split(/(\r?\n)/);
  const lines = parts.filter((_, idx) => idx % 2 === 0);
  let changed = false;

  forEachTaskLine(
    body,
    ({ lineIndex, taskIndex: idx, match }) => {
      if (idx !== taskIndex) return;
      const newState = match[2].trim() ? ' ' : 'x';
      parts[lineIndex * 2] = `${match[1]}${newState}${match[3]}`;
      changed = true;
    },
    lines
  );

  return changed ? frontmatterBlock + parts.join('') : markdown;
}

/**
 * Extracts [[WikiLinks]] targets from markdown (aliases after `|` and `#heading`
 * suffixes are dropped), skipping fenced and inline code.
 */
export function extractWikiLinks(markdown: string): string[] {
  const withoutCode = markdown.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\r\n]*`)/g, '');
  const wikiRegex = /\[\[([^\]\r\n]+)\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = wikiRegex.exec(withoutCode)) !== null) {
    const target = match[1].split('|')[0].split('#')[0].trim();
    if (target && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}

/**
 * Whether a wiki-link target (e.g. "ai-mastery", "ai-mastery.md", "goals/ai-mastery" or a title)
 * refers to the given file. Case-insensitive.
 */
export function wikiTargetMatchesFile(
  target: string,
  file: { name: string; path: string; frontmatter: { title?: string } }
): boolean {
  const t = target.trim().toLowerCase();
  if (!t) return false;
  const name = file.name.toLowerCase();
  const path = file.path.toLowerCase();
  return (
    name === t ||
    name === `${t}.md` ||
    path === t ||
    path === `${t}.md` ||
    file.frontmatter.title?.toLowerCase() === t
  );
}

/**
 * Updates wiki-links in markdown content when a file is renamed.
 * Supports [[fileName]], [[fileName.md]], [[fileName|Alias]], [[folder/fileName]] etc.
 */
export function updateWikiLinks(
  markdown: string,
  oldFileName: string,
  newFileName: string
): string {
  const oldBase = oldFileName.replace(/\.md$/, '');
  const newBase = newFileName.replace(/\.md$/, '');
  const oldMd = oldFileName.endsWith('.md') ? oldFileName : `${oldFileName}.md`;
  const newMd = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;

  return markdown.replace(/\[\[(.*?)\]\]/g, (fullMatch, inner) => {
    const parts = inner.split('|');
    const target = parts[0].trim();
    const alias = parts.length > 1 ? `|${parts.slice(1).join('|')}` : '';

    if (target === oldBase) {
      return `[[${newBase}${alias}]]`;
    }
    if (target === oldMd) {
      return `[[${newMd}${alias}]]`;
    }
    if (target.endsWith(`/${oldBase}`)) {
      const prefix = target.slice(0, target.length - oldBase.length);
      return `[[${prefix}${newBase}${alias}]]`;
    }
    if (target.endsWith(`/${oldMd}`)) {
      const prefix = target.slice(0, target.length - oldMd.length);
      return `[[${prefix}${newMd}${alias}]]`;
    }

    return fullMatch;
  });
}
