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
import { quoteYamlString } from './markdownParser';
import type { FileFrontmatter } from '../types';

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

/** Calls the Sheets API; `T` is the shape of the JSON response the caller reads. */
async function sheetsFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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
    const text = await res.text();
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
      throw new Error(
        'The Google Sheets API is turned off for mdlife. Enable it in Google Cloud Console → APIs & Services, then try again.',
      );
    }
    throw new Error(
      `mdlife can't open this spreadsheet (${res.status}). Choose it again with the Google Picker ("Import SheetSync sheet" under Notes) to grant access.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Google Sheets error (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Returns the spreadsheet title and its tab names. Also confirms mdlife can open it. */
export async function getSpreadsheetInfo(
  spreadsheetId: string,
): Promise<{ title: string; tabs: string[] }> {
  const data = await sheetsFetch<{
    properties?: { title?: string };
    sheets?: { properties: { title: string } }[];
  }>(`${spreadsheetId}?includeGridData=false&fields=properties.title,sheets.properties.title`);
  return {
    title: data.properties?.title || 'Untitled spreadsheet',
    tabs: (data.sheets || []).map((s) => s.properties.title),
  };
}

/** Reads every row of a tab, keyed by the header row. */
export async function readRows(
  spreadsheetId: string,
  tab: string,
): Promise<{ headers: string[]; rows: SheetSyncRow[] }> {
  const data = await sheetsFetch<{ values?: string[][] }>(
    `${spreadsheetId}/values/${encodeURIComponent(quoteTab(tab))}`,
  );
  const [headers = [], ...body]: string[][] = data.values || [];
  const rows = body.map((cells, i) => ({
    rowNumber: i + 2,
    values: Object.fromEntries(headers.map((h, c) => [h, cells[c] ?? ''])),
  }));
  return { headers, rows };
}

/** A SheetSync field, as saved in the spreadsheet's layout backup. */
export interface SheetSyncField {
  id: string;
  label: string;
  type: string; // text | notes | number | rating | select | date | time | links | relation | list
  options?: string[];
  unit?: string;
  min?: number;
  max?: number;
  listId?: string;
  multiple?: boolean;
  required?: boolean;
}

/** A SheetSync category: one tab of the spreadsheet. */
export interface SheetSyncCategory {
  id: string;
  label: string;
  title?: string;
  sheetName: string;
  color?: string;
  dateFieldId?: string;
  titleFieldId?: string;
  fields: SheetSyncField[];
}

export interface SheetSyncLayout {
  categories: SheetSyncCategory[];
  /** Shared pick lists (e.g. Projects), by list ID. */
  lists: Record<string, string[]>;
  /** Whether SheetSync's changed-since-backup flag is already set. */
  changedSinceBackup: boolean;
}

const LAYOUT_KEY = 'schema_config';
const CHANGED_KEY = 'changed_since_backup';
const CONFIG_TAB = 'App_Config';
const META_HEADERS = new Set(['ID', 'Saved At']);

/** Parses the App_Config rows (Key, JSON Value, Last Updated) into SheetSync's tabs and fields. */
export function parseLayout(rows: SheetSyncRow[]): SheetSyncLayout {
  const layout: SheetSyncLayout = { categories: [], lists: {}, changedSinceBackup: false };
  for (const row of rows) {
    const key = row.values.Key;
    const value = row.values['JSON Value'] ?? '';
    if (key === CHANGED_KEY) layout.changedSinceBackup = value.trim().toUpperCase() !== 'FALSE';
    if (key !== LAYOUT_KEY) continue;
    try {
      const parsed: { categories?: unknown; lists?: unknown } = JSON.parse(value);
      if (Array.isArray(parsed.categories)) {
        layout.categories = parsed.categories.filter(
          (c: Partial<SheetSyncCategory> | null): c is SheetSyncCategory =>
            Boolean(c?.sheetName && Array.isArray(c.fields)),
        );
      }
      if (Array.isArray(parsed.lists)) {
        layout.lists = Object.fromEntries(
          parsed.lists
            .filter(
              (l: { id?: string; items?: unknown } | null): l is { id: string; items?: unknown } =>
                Boolean(l?.id),
            )
            .map((l) => [l.id, Array.isArray(l.items) ? l.items : []]),
        );
      }
    } catch {
      // unreadable backup: fall back to plain text fields
    }
  }
  return layout;
}

/** Reads SheetSync's layout backup. Missing App_Config tab gives an empty layout. */
export async function readLayout(spreadsheetId: string, tabs: string[]): Promise<SheetSyncLayout> {
  if (!tabs.includes(CONFIG_TAB)) return { categories: [], lists: {}, changedSinceBackup: false };
  return parseLayout((await readRows(spreadsheetId, CONFIG_TAB)).rows);
}

/** Sets SheetSync's changed-since-backup flag so its backups know the sheet was edited. */
export async function markSheetChanged(spreadsheetId: string): Promise<void> {
  const { rows } = await readRows(spreadsheetId, CONFIG_TAB);
  const values = [CHANGED_KEY, "'TRUE", `'${new Date().toISOString()}`];
  const existing = rows.find((r) => r.values.Key === CHANGED_KEY);
  if (existing) {
    await sheetsFetch(
      `${spreadsheetId}/values/${encodeURIComponent(`${quoteTab(CONFIG_TAB)}!A${existing.rowNumber}:C${existing.rowNumber}`)}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify({ values: [values] }) },
    );
  } else {
    await appendValues(spreadsheetId, CONFIG_TAB, values);
  }
}

/** Days since 1899-12-30 (the Google Sheets epoch) to YYYY-MM-DD. */
function serialToDate(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
}

/** A displayed date ("2026-10-19", "10/19/2026" or a serial) as YYYY-MM-DD, or '' if unreadable. */
export function toDateInput(cell: string): string {
  const s = cell.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d+(\.\d+)?$/.test(s)) return serialToDate(Number(s));
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}

/** A displayed time ("14:05", "2:05 PM", "14:05:00") as HH:MM, or '' if unreadable. */
export function toTimeInput(cell: string): string {
  const m = cell.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return '';
  let h = Number(m[1]) % 24;
  if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * Encodes a value for a cell the way SheetSync writes it: numbers as numbers, dates and times as
 * typed (so Sheets treats them as dates), and other text with a leading apostrophe so Sheets keeps
 * it as typed ("1-3" stays text, "=" can't start a formula).
 */
export function toCell(type: string | undefined, value: string): string | number {
  if (value === '') return '';
  if (type === 'number' || type === 'rating') {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : value;
  }
  if (type === 'date' || type === 'time') return value;
  return `'${value}`;
}

async function appendValues(
  spreadsheetId: string,
  tab: string,
  row: (string | number)[],
): Promise<void> {
  await sheetsFetch(
    `${spreadsheetId}/values/${encodeURIComponent(`${quoteTab(tab)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [row] }) },
  );
}

export interface UpsertOptions {
  /** Row ID prefix for new rows; SheetSync uses the category ID (e.g. "mood_1729..."). */
  idPrefix?: string;
  /** Field type by header label, used to encode cells (see toCell). */
  types?: Record<string, string>;
  /** Update this row when it has no ID yet (typed into the sheet by hand); it gets one. */
  rowNumber?: number;
}

/**
 * Adds a row, or updates the row with this ID. Values are keyed by header label; unknown labels
 * are ignored. On update only the given cells and Saved At are written, so other cells keep
 * their formatting. ID and Saved At are filled in the way SheetSync does. Returns the row's ID.
 */
export async function upsertRow(
  spreadsheetId: string,
  tab: string,
  values: Record<string, string>,
  id?: string,
  options: UpsertOptions = {},
): Promise<string> {
  const { headers, rows } = await readRows(spreadsheetId, tab);
  if (headers.length === 0) throw new Error(`Tab "${tab}" has no header row.`);

  const savedAt = new Date().toISOString();
  const rowId = id ?? `${options.idPrefix ?? tab.toLowerCase()}_${Date.now()}`;
  const cell = (header: string, value: string) =>
    header === 'ID' || header === 'Saved At' ? `'${value}` : toCell(options.types?.[header], value);
  const existing = id
    ? rows.find((r) => r.values.ID === id)
    : options.rowNumber
      ? rows.find((r) => r.rowNumber === options.rowNumber && !r.values.ID)
      : undefined;

  if (existing) {
    const meta: Record<string, string> = {
      'Saved At': savedAt,
      ...(existing.values.ID ? {} : { ID: rowId }),
    };
    const data = headers
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h in meta || (!META_HEADERS.has(h) && h in values))
      .map(({ h, i }) => {
        const a1 = `${columnLetter(i + 1)}${existing.rowNumber}`;
        return {
          range: `${quoteTab(tab)}!${a1}:${a1}`,
          values: [[cell(h, h in meta ? meta[h] : values[h])]],
        };
      });
    await sheetsFetch(`${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
    });
  } else {
    const full: Record<string, string> = { ...values, ID: rowId, 'Saved At': savedAt };
    await appendValues(
      spreadsheetId,
      tab,
      headers.map((h) => (h in full ? cell(h, full[h]) : '')),
    );
  }
  return rowId;
}

/** True for a note created by "Import SheetSync sheet": it shows the spreadsheet instead of markdown. */
export function getSheetSyncNoteId(frontmatter: FileFrontmatter): string | null {
  const id = frontmatter.spreadsheet_id;
  return frontmatter.type === 'sheetsync' && id ? String(id) : null;
}

/** Markdown for a note that opens the given spreadsheet in mdlife's SheetSync view. */
export function sheetSyncNoteContent(sheet: SheetSyncSpreadsheet): string {
  return `---
title: ${quoteYamlString(sheet.name)}
category: notes
type: sheetsync
spreadsheet_id: ${sheet.id}
tags: [sheetsync]
---

# ${sheet.name}

This note opens your SheetSync spreadsheet so you can view and edit its entries in mdlife.

[Open in Google Sheets](https://docs.google.com/spreadsheets/d/${sheet.id}/edit)
`;
}
