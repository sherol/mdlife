import { describe, expect, it } from 'vitest';
import { mergeThreeWay, normalizeMarkdown, resolveChunks } from '../docMerge';

const base = '# Groceries\n\n- milk\n- eggs\n- bread\n\n## Notes\n\nBuy on Saturday.\n';

describe('mergeThreeWay', () => {
  it('takes their version when only they changed', () => {
    const theirs = base.replace('- eggs', '- eggs\n- butter');
    expect(mergeThreeWay(base, base, theirs)).toMatchObject({ conflictCount: 0, text: theirs });
  });

  it('keeps my version when only I changed', () => {
    const mine = base.replace('Saturday', 'Sunday');
    expect(mergeThreeWay(base, mine, base)).toMatchObject({ conflictCount: 0, text: mine });
  });

  it('combines edits to different parts of the note', () => {
    const mine = base.replace('Buy on Saturday.', 'Buy on Sunday.');
    const theirs = base.replace('- bread', '- bread\n- coffee');
    const res = mergeThreeWay(base, mine, theirs);
    expect(res.conflictCount).toBe(0);
    expect(res.text).toContain('- coffee');
    expect(res.text).toContain('Buy on Sunday.');
  });

  it('reports a conflict when both change the same line, and resolves by choice', () => {
    const mine = base.replace('- milk', '- oat milk');
    const theirs = base.replace('- milk', '- whole milk');
    const res = mergeThreeWay(base, mine, theirs);
    expect(res.conflictCount).toBe(1);
    const conflict = res.chunks.find((c) => c.type === 'conflict');
    expect(conflict).toMatchObject({ mine: ['- oat milk'], theirs: ['- whole milk'] });
    expect(resolveChunks(res.chunks, ['mine'])).toBe(mine);
    expect(resolveChunks(res.chunks, ['theirs'])).toBe(theirs);
    expect(resolveChunks(res.chunks, ['both'])).toContain('- oat milk\n- whole milk');
  });

  it('does not treat identical edits on both sides as a conflict', () => {
    const both = base.replace('- eggs', '- a dozen eggs');
    expect(mergeThreeWay(base, both, both)).toMatchObject({ conflictCount: 0, text: both });
  });

  it('ignores line-ending and trailing whitespace differences', () => {
    expect(normalizeMarkdown('a  \r\nb\r\n\r\n')).toBe('a\nb\n');
    expect(mergeThreeWay(base, base.replace(/\n/g, '\r\n'), base).conflictCount).toBe(0);
  });
});
