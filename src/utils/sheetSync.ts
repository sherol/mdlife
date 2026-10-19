/**
 * Read and edit the SheetSync spreadsheet (https://sherol.github.io/sheetsync/).
 *
 * mdlife only has drive.file access, so the spreadsheet must be chosen once with the Google Picker
 * (see openSheetSyncPicker); that pick grants mdlife access to that one file. The chosen
 * spreadsheet is remembered in localStorage.
 *
 * SheetSync's layout: one tab per category, row 1 is headers, then each row is
 * [ID, Saved At, ...one column per field in Category Studio order]. Rows are matched by ID.
 */

import { getAccessToken, markTokenExpired } from './googleAuth';
import { openDrivePicker, PickedDriveFile } from './googleDocs';
import { storageKey } from './storageKeys';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const STORAGE_KEY = 'sheetsync_spreadsheet';

export interface SheetSyncSpreadsheet {
  id: string;
  name: string;
}

export interface SheetSyncRow {
  /** 1-based row number in the tab. */
  rowNumber: number;
  /** Values keyed by header text, e.g. { ID: 'mood_123', 'Saved At': '...', 'Mood Score': '7' }. */
  values: Record<string, string>;
}

export function getSavedSpreadsheet(): SheetSyncSpreadsheet | null {
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ? { id: String(parsed.id), name: String(parsed.name || 'SheetSync') } : null;
  } catch {
    return null;
  }
}

export function saveSpreadsheet(sheet: SheetSyncSpreadsheet | null): void {
  try {
    if (sheet) localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(sheet));
    else localStorage.removeItem(storageKey(STORAGE_KEY));
  } catch {
    // ignore
  }
}

/** Opens the Google Picker filtered to spreadsheets. */
export function openSheetSyncPicker(options: {
  accessToken: string;
  onPicked: (file: PickedDriveFile) => void;
  onCancel?: () => void;
  onError?: (err: Error) => void;
}): Promise<void> {
  return openDrivePicker({
    ...options,
    mimeType: SPREADSHEET_MIME,
    title: 'Choose your SheetSync spreadsheet',
  });
}

/** Spreadsheet column letter for a 1-based column index (1 -> A, 27 -> AA). */
function columnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

async function sheetsFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not connected to Google. Sign in to use the SheetSync spreadsheet.');
  const res = await fetch(`${SHEETS_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) {
    markTokenExpired('Google session expired. Reconnect to use the SheetSync spreadsheet.');
    throw new Error('Google session expired (401). Please reconnect.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error(
      `mdlife can't open this spreadsheet (${res.status}). Choose it again with "Choose SheetSync sheet" to grant access.`
    );
  }
  if (!res.ok) {
    throw new Error(`Google Sheets error (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** Returns the spreadsheet title and its tab names. Also confirms mdlife can open it. */
export async function getSpreadsheetInfo(spreadsheetId: string): Promise<{ title: string; tabs: string[] }> {
  const data = await sheetsFetch(
    `${spreadsheetId}?includeGridData=false&fields=properties.title,sheets.properties.title`
  );
  return {
    title: data.properties?.title || 'Untitled spreadsheet',
    tabs: (data.sheets || []).map((s: any) => s.properties.title),
  };
}

/** Reads every row of a tab, keyed by the header row. */
export async function readRows(spreadsheetId: string, tab: string): Promise<{ headers: string[]; rows: SheetSyncRow[] }> {
  const data = await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(quoteTab(tab))}`);
  const [headers = [], ...body]: string[][] = data.values || [];
  const rows = body.map((cells, i) => ({
    rowNumber: i + 2,
    values: Object.fromEntries(headers.map((h, c) => [h, cells[c] ?? ''])),
  }));
  return { headers, rows };
}

/**
 * Adds or updates a row by ID, writing values under the tab's existing headers (unknown keys are
 * ignored; on update, fields not passed keep their current value). ID and Saved At are filled in the way SheetSync does.
 * Returns the row's ID.
 */
export async function upsertRow(
  spreadsheetId: string,
  tab: string,
  values: Record<string, string | number>,
  id?: string
): Promise<string> {
  const { headers, rows } = await readRows(spreadsheetId, tab);
  if (headers.length === 0) throw new Error(`Tab "${tab}" has no header row.`);

  const rowId = id ?? `${tab.toLowerCase()}_${Date.now()}`;
  const existing = rows.find((r) => r.values.ID === rowId);
  const full: Record<string, string | number> = {
    ...existing?.values,
    ...values,
    ID: rowId,
    'Saved At': new Date().toISOString(),
  };
  const row = headers.map((h) => full[h] ?? '');

  if (existing) {
    const range = `${quoteTab(tab)}!A${existing.rowNumber}:${columnLetter(headers.length)}${existing.rowNumber}`;
    await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: [row] }),
    });
  } else {
    await sheetsFetch(
      `${spreadsheetId}/values/${encodeURIComponent(`${quoteTab(tab)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [row] }) }
    );
  }
  return rowId;
}
