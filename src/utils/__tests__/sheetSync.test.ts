import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../googleAuth', () => ({
  getAccessToken: async () => 'token',
  markTokenExpired: vi.fn(),
}));
vi.mock('../googleDocs', () => ({ openDrivePicker: vi.fn() }));

import {
  getSheetSyncNoteId,
  markSheetChanged,
  parseLayout,
  readRows,
  sheetSyncNoteContent,
  toCell,
  toDateInput,
  toTimeInput,
  upsertRow,
} from '../sheetSync';
import { parseFrontmatter } from '../markdownParser';

/** In-memory Sheets values API. Stores cells as displayed: USER_ENTERED drops a leading apostrophe. */
function fakeSheets(initial: Record<string, string[][]>) {
  const tabs = new Map(Object.entries(initial).map(([k, v]) => [k, v.map((r) => [...r])]));
  const parse = (range: string) => {
    const m = range.match(/^'((?:[^']|'')*)'(?:!([A-Z]+)(\d+))?/)!;
    const col = m[2] ? m[2].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) : 1;
    return { tab: m[1].replace(/''/g, "'"), col, row: m[3] ? Number(m[3]) : 1 };
  };
  const display = (v: unknown) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : String(v));
  const write = (tab: string, row: number, col: number, values: unknown[]) => {
    const rows = tabs.get(tab)!;
    while (rows.length < row) rows.push([]);
    values.forEach((v, i) => {
      while (rows[row - 1].length < col + i - 1) rows[row - 1].push('');
      rows[row - 1][col + i - 1] = display(v);
    });
  };
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const after = decodeURIComponent(url.split('/spreadsheets/sheet/')[1].split('?')[0]);
    if (after === 'values:batchUpdate') {
      body.data.forEach((d: any) => {
        const { tab, row, col } = parse(d.range);
        write(tab, row, col, d.values[0]);
      });
    } else if (after.endsWith(':append')) {
      const { tab } = parse(after.slice('values/'.length));
      write(tab, tabs.get(tab)!.length + 1, 1, body.values[0]);
    } else if (init.method === 'PUT') {
      const { tab, row, col } = parse(after.slice('values/'.length));
      write(tab, row, col, body.values[0]);
    } else {
      const { tab } = parse(after.slice('values/'.length));
      return new Response(JSON.stringify({ values: tabs.get(tab) }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { tabs, fetchMock };
}

describe('sheetSync', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-23T12:00:00Z') }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads rows keyed by header', async () => {
    fakeSheets({ Mood: [['ID', 'Saved At', 'Mood Score'], ['mood_1', '2026-10-01', '7']] });
    const { headers, rows } = await readRows('sheet', 'Mood');
    expect(headers).toEqual(['ID', 'Saved At', 'Mood Score']);
    expect(rows).toEqual([{ rowNumber: 2, values: { ID: 'mood_1', 'Saved At': '2026-10-01', 'Mood Score': '7' } }]);
  });

  it('appends a new row like SheetSync: category ID prefix, typed cells, unknown keys ignored', async () => {
    const { tabs } = fakeSheets({ Prayer: [['ID', 'Saved At', 'Date', 'Chapters', 'Score']] });
    const id = await upsertRow(
      'sheet',
      'Prayer',
      { Date: '2026-10-23', Chapters: '1-3', Score: '8', Unknown: 'x' },
      undefined,
      { idPrefix: 'prayer', types: { Date: 'date', Chapters: 'text', Score: 'rating' } }
    );
    expect(id).toBe(`prayer_${Date.now()}`);
    expect(tabs.get('Prayer')![1]).toEqual([id, '2026-10-23T12:00:00.000Z', '2026-10-23', '1-3', '8']);
  });

  it('updates only the changed cells and Saved At of the matching row', async () => {
    const { tabs, fetchMock } = fakeSheets({
      People: [
        ['ID', 'Saved At', 'Name', 'Last Contact'],
        ['people_1', 'old', 'Ana', '2026-01-01'],
        ['people_2', 'old', 'Ben', '2026-02-02'],
      ],
    });
    await upsertRow('sheet', 'People', { 'Last Contact': '2026-10-23' }, 'people_2', { types: { 'Last Contact': 'date' } });
    expect(tabs.get('People')).toEqual([
      ['ID', 'Saved At', 'Name', 'Last Contact'],
      ['people_1', 'old', 'Ana', '2026-01-01'],
      ['people_2', '2026-10-23T12:00:00.000Z', 'Ben', '2026-10-23'],
    ]);
    const update = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(update.data.map((d: any) => d.range)).toEqual(["'People'!B3:B3", "'People'!D3:D3"]);
  });

  it('gives a hand-typed row without an ID one when it is edited', async () => {
    const { tabs } = fakeSheets({ Mood: [['ID', 'Saved At', 'Mood Score'], ['', '', '4']] });
    const id = await upsertRow('sheet', 'Mood', { 'Mood Score': '6' }, undefined, { idPrefix: 'mood', rowNumber: 2, types: { 'Mood Score': 'rating' } });
    expect(tabs.get('Mood')).toEqual([['ID', 'Saved At', 'Mood Score'], [id, '2026-10-23T12:00:00.000Z', '6']]);
  });

  it('sets the changed-since-backup flag in App_Config', async () => {
    const { tabs } = fakeSheets({
      App_Config: [['Key', 'JSON Value', 'Last Updated'], ['schema_config', '{}', 'x'], ['changed_since_backup', 'FALSE', 'x']],
    });
    await markSheetChanged('sheet');
    expect(tabs.get('App_Config')![2]).toEqual(['changed_since_backup', 'TRUE', '2026-10-23T12:00:00.000Z']);
  });
});

describe('layout and cells', () => {
  it('parses the layout backup and the changed flag', () => {
    const json = JSON.stringify({
      categories: [
        { id: 'mood', label: 'Mood', sheetName: 'Mood', fields: [{ id: 'score', label: 'Mood Score', type: 'rating', min: 1, max: 10 }] },
        { id: 'broken' },
      ],
      lists: [{ id: 'projects', items: ['mdlife'] }],
    });
    const layout = parseLayout([
      { rowNumber: 2, values: { Key: 'schema_config', 'JSON Value': json } },
      { rowNumber: 3, values: { Key: 'changed_since_backup', 'JSON Value': 'TRUE' } },
    ]);
    expect(layout.categories.map((c) => c.id)).toEqual(['mood']);
    expect(layout.lists).toEqual({ projects: ['mdlife'] });
    expect(layout.changedSinceBackup).toBe(true);
    expect(parseLayout([{ rowNumber: 2, values: { Key: 'schema_config', 'JSON Value': '{oops' } }]).categories).toEqual([]);
  });

  it('encodes cells like SheetSync', () => {
    expect(toCell('rating', '7')).toBe(7);
    expect(toCell('number', '1,000')).toBe(1000);
    expect(toCell('date', '2026-10-23')).toBe('2026-10-23');
    expect(toCell('text', '1-3')).toBe("'1-3");
    expect(toCell(undefined, '=SUM(A1)')).toBe("'=SUM(A1)");
    expect(toCell('text', '')).toBe('');
  });

  it('reads displayed dates and times for form inputs', () => {
    expect(toDateInput('10/9/2026')).toBe('2026-10-09');
    expect(toDateInput('2026-10-23')).toBe('2026-10-23');
    expect(toDateInput('46318')).toBe('2026-10-23');
    expect(toDateInput('soon')).toBe('');
    expect(toTimeInput('2:05 PM')).toBe('14:05');
    expect(toTimeInput('14:05:00')).toBe('14:05');
  });

  it('creates a note that points at the spreadsheet', () => {
    const { frontmatter } = parseFrontmatter(sheetSyncNoteContent({ id: '1AbC_d-9', name: 'SheetSync "Tracker"' }));
    expect(frontmatter.title).toBe('SheetSync "Tracker"');
    expect(frontmatter.category).toBe('notes');
    expect(getSheetSyncNoteId(frontmatter)).toBe('1AbC_d-9');
    expect(getSheetSyncNoteId({ title: 'plain note' })).toBeNull();
  });
});
