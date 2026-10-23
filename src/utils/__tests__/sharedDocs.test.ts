import { describe, expect, it } from 'vitest';
import {
  DocApi,
  DocSyncState,
  setLinkedDocId,
  syncNoteWithDoc,
  withNoteBody,
  getNoteBody,
} from '../sharedDocs';

/** In-memory Google Doc. Like Google's converter, it re-writes "- " bullets as "* ". */
function fakeDoc(initial: string) {
  let content = initial;
  let version = 1;
  let writes = 0;
  const api: DocApi = {
    getMeta: async (id) => ({ id, name: 'Doc', version: String(version) }),
    exportMarkdown: async () => content,
    replaceContent: async (id, md) => {
      writes++;
      content = md.replace(/^- /gm, '* ');
      version++;
      return { id, name: 'Doc', version: String(version) };
    },
  };
  return {
    api,
    /** Simulates the other person editing in Google Docs. */
    edit(fn: (s: string) => string) {
      content = fn(content);
      version++;
    },
    get content() {
      return content;
    },
    get writes() {
      return writes;
    },
  };
}

const FRONT = '---\ntitle: Groceries\ngoogle_doc: doc1\n---\n';
const note = (body: string) => FRONT + body;

async function sync(
  doc: ReturnType<typeof fakeDoc>,
  content: string,
  state?: DocSyncState,
  unsaved = false,
) {
  const res = await syncNoteWithDoc('doc1', content, state, unsaved, doc.api);
  if (res.kind !== 'synced') throw new Error(`expected synced, got ${res.kind}`);
  return { res, content: res.body !== undefined ? withNoteBody(content, res.body) : content };
}

describe('syncNoteWithDoc', () => {
  it('first sync on a new browser takes the doc content when there are no local edits', async () => {
    const doc = fakeDoc('* milk\n* eggs\n');
    const { res, content } = await sync(doc, note('old\n'));
    expect(getNoteBody(content)).toBe('* milk\n* eggs\n');
    expect(res.pushed).toBe(false);
    expect(content.startsWith(FRONT)).toBe(true);
  });

  it('pushes my edits once and does not keep re-writing the doc', async () => {
    const doc = fakeDoc('* milk\n');
    let { res, content } = await sync(doc, note('* milk\n'));
    content = withNoteBody(content, '* milk\n- bread\n'); // I add a line in my own style
    ({ res, content } = await sync(doc, content, res.state));
    expect(res.pushed).toBe(true);
    expect(doc.content).toBe('* milk\n* bread\n');
    ({ res, content } = await sync(doc, content, res.state));
    ({ content } = await sync(doc, content, res.state));
    expect(doc.writes).toBe(1);
    expect(getNoteBody(content)).toBe('* milk\n- bread\n'); // my text is left alone
  });

  it('pulls his edits when only the doc changed', async () => {
    const doc = fakeDoc('* milk\n');
    let { res, content } = await sync(doc, note('* milk\n'));
    doc.edit((s) => `${s}* coffee\n`);
    ({ res, content } = await sync(doc, content, res.state));
    expect(getNoteBody(content)).toBe('* milk\n* coffee\n');
    expect(res.pushed).toBe(false);
  });

  it('merges edits to different parts and writes the result to the doc', async () => {
    const doc = fakeDoc('# List\n\n* milk\n* eggs\n\nBuy Saturday.\n');
    let { res, content } = await sync(doc, note('# List\n\n* milk\n* eggs\n\nBuy Saturday.\n'));
    doc.edit((s) => s.replace('* eggs', '* eggs\n* coffee'));
    content = withNoteBody(content, getNoteBody(content).replace('Saturday', 'Sunday'));
    ({ res, content } = await sync(doc, content, res.state));
    expect(getNoteBody(content)).toBe('# List\n\n* milk\n* eggs\n* coffee\n\nBuy Sunday.\n');
    expect(res.pushed).toBe(true);
    expect(doc.content).toContain('Buy Sunday.');
    expect(doc.content).toContain('* coffee');
  });

  it('reports a conflict (and writes nothing) when both change the same line', async () => {
    const doc = fakeDoc('* milk\n');
    const first = await sync(doc, note('* milk\n'));
    doc.edit(() => '* whole milk\n');
    const mine = withNoteBody(first.content, '* oat milk\n');
    const res = await syncNoteWithDoc('doc1', mine, first.res.state, true, doc.api);
    expect(res.kind).toBe('conflict');
    expect(doc.content).toBe('* whole milk\n');
  });

  it('reports a missing doc', async () => {
    const api: DocApi = {
      getMeta: async () => null,
      exportMarkdown: async () => '',
      replaceContent: async () => ({ id: 'x', name: 'x', version: '1' }),
    };
    expect((await syncNoteWithDoc('doc1', note('x\n'), undefined, false, api)).kind).toBe(
      'missing',
    );
  });
});

describe('setLinkedDocId', () => {
  it('adds, replaces and removes the google_doc line without touching other frontmatter', () => {
    const base = '---\ntitle: A\ntags:\n  - x\n---\nBody\n';
    const linked = setLinkedDocId(base, 'abc');
    expect(linked).toBe('---\ntitle: A\ntags:\n  - x\ngoogle_doc: abc\n---\nBody\n');
    expect(setLinkedDocId(linked, 'def')).toBe(
      '---\ntitle: A\ntags:\n  - x\ngoogle_doc: def\n---\nBody\n',
    );
    expect(setLinkedDocId(linked, null)).toBe(base);
  });

  it('creates a frontmatter block when there is none', () => {
    expect(setLinkedDocId('Body\n', 'abc')).toBe('---\ngoogle_doc: abc\n---\nBody\n');
  });
});
