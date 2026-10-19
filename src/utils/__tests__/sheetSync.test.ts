import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../googleAuth', () => ({
  getAccessToken: async () => 'token',
  markTokenExpired: vi.fn(),
}));
vi.mock('../googleDocs', () => ({ openDrivePicker: vi.fn() }));

import { readRows, upsertRow } from '../sheetSync';

/** In-memory Sheets values API for one tab. */
function fakeSheet(initial: string[][]) {
  const values = initial.map((r) => [...r]);
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const range = decodeURIComponent(url.split('/values/')[1].split('?')[0]);
    if (init.method === 'PUT') {
      const row = Number(range.match(/!A(\d+):/)![1]);
      values[row - 1] = body.values[0];
    } else if (init.method === 'POST') {
      values.push(body.values[0]);
    }
    return new Response(JSON.stringify({ values }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { values, fetchMock };
}

describe('sheetSync', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-19T12:00:00Z') }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads rows keyed by header', async () => {
    fakeSheet([
      ['ID', 'Saved At', 'Mood Score'],
      ['mood_1', '2026-10-01', '7'],
    ]);
    const { headers, rows } = await readRows('sheet', 'Mood');
    expect(headers).toEqual(['ID', 'Saved At', 'Mood Score']);
    expect(rows).toEqual([{ rowNumber: 2, values: { ID: 'mood_1', 'Saved At': '2026-10-01', 'Mood Score': '7' } }]);
  });

  it('appends a new row in header order, ignoring unknown keys', async () => {
    const { values } = fakeSheet([['ID', 'Saved At', 'Mood Score', 'Daily Recap']]);
    const id = await upsertRow('sheet', 'Mood', { 'Daily Recap': 'Good day', 'Mood Score': 8, Unknown: 'x' });
    expect(id).toBe(`mood_${Date.now()}`);
    expect(values[1]).toEqual([id, '2026-10-19T12:00:00.000Z', 8, 'Good day']);
  });

  it('updates the matching row and keeps fields not passed', async () => {
    const { values } = fakeSheet([
      ['ID', 'Saved At', 'Name', 'Last Contact'],
      ['people_1', 'old', 'Ana', '2026-01-01'],
      ['people_2', 'old', 'Ben', '2026-02-02'],
    ]);
    await upsertRow('sheet', 'People', { 'Last Contact': '2026-10-19' }, 'people_2');
    expect(values).toHaveLength(3);
    expect(values[1]).toEqual(['people_1', 'old', 'Ana', '2026-01-01']);
    expect(values[2]).toEqual(['people_2', '2026-10-19T12:00:00.000Z', 'Ben', '2026-10-19']);
  });
});
