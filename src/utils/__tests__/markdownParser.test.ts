import { describe, expect, it } from 'vitest';
import type { FileFrontmatter } from '../../types';
import {
  extractWikiLinks,
  getTaskProgress,
  parseFrontmatter,
  quoteYamlString,
  stringifyWithFrontmatter,
  toggleCheckboxInMarkdown,
  updateWikiLinks,
} from '../markdownParser';

describe('parseFrontmatter', () => {
  it('parses scalars, booleans, numbers, inline and block arrays', () => {
    const md = [
      '---',
      'title: My Goal',
      'status: active',
      'done: false',
      'pinned: true',
      'priority: 2',
      'tags: [health, "fitness"]',
      'aliases:',
      '  - first',
      "  - 'second'",
      '---',
      '# Heading',
      '',
      'Body text',
    ].join('\n');

    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter).toEqual({
      title: 'My Goal',
      status: 'active',
      done: false,
      pinned: true,
      priority: 2,
      tags: ['health', 'fitness'],
      aliases: ['first', 'second'],
    });
    expect(body).toBe('# Heading\n\nBody text');
  });

  it('handles CRLF line endings', () => {
    const { frontmatter, body } = parseFrontmatter('---\r\ntitle: Win\r\n---\r\nhello');
    expect(frontmatter.title).toBe('Win');
    expect(body).toBe('hello');
  });

  it('falls back to the first heading as title when there is no frontmatter', () => {
    const md = 'intro\n# Fallback Title\ntext';
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter).toEqual({ title: 'Fallback Title' });
    expect(body).toBe(md);
  });

  it('uses the first heading when frontmatter has no title', () => {
    const { frontmatter } = parseFrontmatter('---\nstatus: draft\n---\n# From Body\n');
    expect(frontmatter.title).toBe('From Body');
  });

  it('returns undefined title when there is no frontmatter or heading', () => {
    expect(parseFrontmatter('plain text').frontmatter).toEqual({ title: undefined });
  });
});

describe('stringifyWithFrontmatter', () => {
  it('serializes values, quoting strings with special characters', () => {
    const out = stringifyWithFrontmatter(
      { title: 'Plan: Q1 #1', count: 3, done: true, tags: ['a', 'b'], empty: [], skip: undefined },
      'Body',
    );
    expect(out).toBe(
      [
        '---',
        'title: "Plan: Q1 #1"',
        'count: 3',
        'done: true',
        'tags:',
        '  - "a"',
        '  - "b"',
        'empty: []',
        '---',
        '',
        'Body',
      ].join('\n'),
    );
  });

  it('returns the body unchanged when there is no frontmatter to write', () => {
    expect(stringifyWithFrontmatter({}, 'just body')).toBe('just body');
  });

  it('strips an existing frontmatter block from the body', () => {
    const out = stringifyWithFrontmatter({ title: 'New' }, '---\ntitle: Old\n---\n\ncontent');
    expect(out).toBe('---\ntitle: New\n---\n\ncontent');
  });

  it('round-trips through parseFrontmatter', () => {
    const frontmatter: FileFrontmatter = {
      title: 'Roundtrip: test',
      status: 'active',
      progress: 40,
      archived: false,
      tags: ['one', 'two'],
    };
    const body = '# Roundtrip: test\n\n- [ ] task\n';
    const serialized = stringifyWithFrontmatter(frontmatter, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.frontmatter).toEqual(frontmatter);
    // The blank separator line after the closing --- stays on the parsed body...
    expect(parsed.body).toBe(`\n${body}`);
    // ...and is trimmed again on re-serialization, so repeated saves are stable.
    expect(stringifyWithFrontmatter(parsed.frontmatter, parsed.body)).toBe(serialized);
  });
});

describe('getTaskProgress', () => {
  it('counts basic dash checkboxes', () => {
    expect(getTaskProgress('- [x] a\n- [ ] b\n- [X] c\n- [ ] d')).toEqual({
      total: 4,
      completed: 2,
      percentage: 50,
    });
  });

  it('returns zero percentage when there are no tasks', () => {
    expect(getTaskProgress('no tasks')).toEqual({ total: 0, completed: 0, percentage: 0 });
  });
});

describe('toggleCheckboxInMarkdown', () => {
  it('toggles a basic "- [ ]" item by index and back again', () => {
    const md = '- [ ] first\n- [ ] second';
    const toggled = toggleCheckboxInMarkdown(md, 1);
    expect(toggled).toBe('- [ ] first\n- [x] second');
    expect(toggleCheckboxInMarkdown(toggled, 1)).toBe(md);
  });
});

describe('extractWikiLinks', () => {
  it('extracts unique, trimmed link targets', () => {
    expect(extractWikiLinks('See [[Alpha]], [[ Beta ]] and [[Alpha]]; ignore [[ ]].')).toEqual([
      'Alpha',
      'Beta',
    ]);
  });
});

describe('updateWikiLinks', () => {
  it('renames bare links', () => {
    expect(updateWikiLinks('Go to [[old-note]] now', 'old-note.md', 'new-note.md')).toBe(
      'Go to [[new-note]] now',
    );
  });

  it('renames links that include the .md extension', () => {
    expect(updateWikiLinks('[[old-note.md]]', 'old-note.md', 'new-note.md')).toBe(
      '[[new-note.md]]',
    );
  });

  it('preserves aliases', () => {
    expect(updateWikiLinks('[[old-note|My Note]]', 'old-note', 'new-note')).toBe(
      '[[new-note|My Note]]',
    );
  });

  it('preserves folder prefixes', () => {
    expect(
      updateWikiLinks('[[Projects/old-note]] and [[Projects/old-note.md|x]]', 'old-note.md', 'new'),
    ).toBe('[[Projects/new]] and [[Projects/new.md|x]]');
  });

  it('leaves unrelated and partially matching links alone', () => {
    const md = '[[other]] [[old-note-2]] [[my-old-note]]';
    expect(updateWikiLinks(md, 'old-note.md', 'new-note.md')).toBe(md);
  });
});

describe('quoted frontmatter titles', () => {
  const titles = [
    'My "Big" Plan',
    'C:\\Users\\me\\notes',
    'Ends with backslash \\',
    'Escaped quote \\" inside',
    'Plan: Q1 #1 [draft]',
    '"Fully quoted"',
    "It's fine",
  ];

  it.each(titles)(
    'round-trips %s through quoteYamlString (as Google Doc import writes it)',
    (title) => {
      const md = [
        '---',
        `title: ${quoteYamlString(title)}`,
        'category: notes',
        'tags:',
        '  - gdocs-import',
        '---',
        '',
        'Body',
      ].join('\n');
      expect(parseFrontmatter(md).frontmatter.title).toBe(title);
    },
  );

  it.each(titles)('round-trips %s through stringifyWithFrontmatter', (title) => {
    const out = stringifyWithFrontmatter({ title, tags: [title] }, 'Body');
    expect(parseFrontmatter(out).frontmatter).toEqual({ title, tags: [title] });
  });

  it('unescapes YAML double- and single-quoted scalars', () => {
    const md = [
      '---',
      'a: "say \\"hi\\" \\\\ bye"',
      "b: 'it''s'",
      'c: "C:\\temp"',
      'd: plain "text" here',
      '---',
      '',
    ].join('\n');
    expect(parseFrontmatter(md).frontmatter).toMatchObject({
      a: 'say "hi" \\ bye',
      b: "it's",
      // Unknown escapes keep their backslash, so older files stay readable.
      c: 'C:\\temp',
      d: 'plain "text" here',
    });
  });
});
