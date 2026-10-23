import { diff3Merge } from 'node-diff3';

/**
 * Line-based three-way merge used to combine edits made in mdlife ("mine") with edits made in
 * the shared Google Doc ("theirs"), relative to the version both last agreed on ("base").
 */

export type MergeChunk =
  | { type: 'ok'; lines: string[] }
  | { type: 'conflict'; mine: string[]; theirs: string[]; base: string[] };

export type ConflictChoice = 'mine' | 'theirs' | 'both';

export interface MergeResult {
  chunks: MergeChunk[];
  conflictCount: number;
  /** The merged text; only meaningful when conflictCount === 0. */
  text: string;
}

/** Normalizes line endings and trailing whitespace so cosmetic differences don't count as edits. */
export function normalizeMarkdown(text: string): string {
  const body = text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\s+$/, '');
  return body ? `${body}\n` : '';
}

const toLines = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));
const fromLines = (lines: string[]) => (lines.length ? `${lines.join('\n')}\n` : '');

export function mergeThreeWay(base: string, mine: string, theirs: string): MergeResult {
  const b = normalizeMarkdown(base);
  const m = normalizeMarkdown(mine);
  const t = normalizeMarkdown(theirs);

  // Fast paths: only one side changed, or both made the same change.
  if (m === t || t === b)
    return { chunks: [{ type: 'ok', lines: toLines(m) }], conflictCount: 0, text: m };
  if (m === b) return { chunks: [{ type: 'ok', lines: toLines(t) }], conflictCount: 0, text: t };

  const regions = diff3Merge<string>(toLines(m), toLines(b), toLines(t), {
    excludeFalseConflicts: true,
  });
  const chunks: MergeChunk[] = [];
  let conflictCount = 0;
  for (const region of regions) {
    if (region.ok) {
      const last = chunks[chunks.length - 1];
      if (last?.type === 'ok') last.lines.push(...region.ok);
      else chunks.push({ type: 'ok', lines: [...region.ok] });
    } else if (region.conflict) {
      conflictCount++;
      chunks.push({
        type: 'conflict',
        mine: region.conflict.a,
        theirs: region.conflict.b,
        base: region.conflict.o,
      });
    }
  }

  return { chunks, conflictCount, text: conflictCount === 0 ? resolveChunks(chunks, []) : '' };
}

/** Builds the final text from merge chunks, applying one choice per conflict (in order). */
export function resolveChunks(chunks: MergeChunk[], choices: ConflictChoice[]): string {
  const out: string[] = [];
  let i = 0;
  for (const chunk of chunks) {
    if (chunk.type === 'ok') {
      out.push(...chunk.lines);
      continue;
    }
    const choice = choices[i++] ?? 'both';
    if (choice === 'mine') out.push(...chunk.mine);
    else if (choice === 'theirs') out.push(...chunk.theirs);
    else out.push(...chunk.mine, ...chunk.theirs);
  }
  return fromLines(out);
}
