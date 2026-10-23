import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  FileCode,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sheet,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import {
  SheetSyncCategory,
  SheetSyncField,
  SheetSyncLayout,
  SheetSyncRow,
  getSpreadsheetInfo,
  markSheetChanged,
  readLayout,
  readRows,
  toDateInput,
  toTimeInput,
  upsertRow,
} from '../utils/sheetSync';

interface SheetSyncViewProps {
  spreadsheetId: string;
  /** Signed in with a usable Google token. */
  isConnected: boolean;
  onConnect: () => void;
  /** Show the note's markdown instead. */
  onEditNote: () => void;
  /** Choose the spreadsheet again with the Google Picker (re-grants access). */
  onChooseAgain: () => void;
}

/** A tab of the spreadsheet; category is set when SheetSync's layout describes it. */
interface TabInfo {
  name: string;
  label: string;
  category?: SheetSyncCategory;
}

interface EditState {
  id?: string; // undefined for a new entry or a row without an ID
  rowNumber?: number; // the row being edited
  initial: Record<string, string>;
  values: Record<string, string>;
}

const HIDDEN_TABS = new Set(['App_Config']);
const META = new Set(['ID', 'Saved At']);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** A cell as shown in the sheet, converted to what the form input expects. */
function toInput(field: SheetSyncField | undefined, display: string): string {
  if (field?.type === 'date') return toDateInput(display) || display;
  if (field?.type === 'time') return toTimeInput(display) || display;
  if (field?.type === 'number' || field?.type === 'rating') return display.replace(/,/g, '');
  return display;
}

const formatSavedAt = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : iso;
};

export const SheetSyncView: React.FC<SheetSyncViewProps> = ({
  spreadsheetId,
  isConnected,
  onConnect,
  onEditNote,
  onChooseAgain,
}) => {
  const [title, setTitle] = useState('SheetSync');
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [layout, setLayout] = useState<SheetSyncLayout | null>(null);
  const [hasConfigTab, setHasConfigTab] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SheetSyncRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const formTitleId = useId();

  const tab = tabs.find((t) => t.name === activeTab);
  const fieldFor = useCallback(
    (header: string) => tab?.category?.fields.find((f) => f.label === header),
    [tab],
  );

  // Load the spreadsheet's tabs and SheetSync's layout.
  const loadSpreadsheet = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await getSpreadsheetInfo(spreadsheetId);
      const nextLayout = await readLayout(spreadsheetId, info.tabs);
      const known = nextLayout.categories
        .filter((c) => info.tabs.includes(c.sheetName))
        .map((c) => ({ name: c.sheetName, label: c.title || c.label, category: c }));
      const others = info.tabs
        .filter((t) => !HIDDEN_TABS.has(t) && !known.some((k) => k.name === t))
        .map((t) => ({ name: t, label: t.replace(/_/g, ' ') }));
      setTitle(info.title);
      setLayout(nextLayout);
      setHasConfigTab(info.tabs.includes('App_Config'));
      setTabs([...known, ...others]);
      setActiveTab((current) =>
        current && info.tabs.includes(current) ? current : ((known[0] ?? others[0])?.name ?? null),
      );
    } catch (err: any) {
      setError(err?.message || 'Could not open the spreadsheet.');
    } finally {
      setIsLoading(false);
    }
  }, [spreadsheetId]);

  const loadRows = useCallback(async () => {
    if (!activeTab) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await readRows(spreadsheetId, activeTab);
      setHeaders(data.headers);
      setRows(data.rows);
    } catch (err: any) {
      setError(err?.message || `Could not read ${activeTab}.`);
    } finally {
      setIsLoading(false);
    }
  }, [spreadsheetId, activeTab]);

  useEffect(() => {
    if (isConnected) void loadSpreadsheet();
  }, [isConnected, loadSpreadsheet]);

  useEffect(() => {
    if (isConnected) void loadRows();
  }, [isConnected, loadRows]);

  // Columns to show: every field, then Saved At. Newest first, by the tab's date field if it has one.
  const columns = useMemo(() => headers.filter((h) => !META.has(h)), [headers]);
  const visibleRows = useMemo(() => {
    const dateLabel = tab?.category?.fields.find((f) => f.id === tab.category?.dateFieldId)?.label;
    const sortKey = (r: SheetSyncRow) =>
      `${toDateInput(dateLabel ? (r.values[dateLabel] ?? '') : '')}|${r.values['Saved At'] ?? ''}`;
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (r.values.ID ?? '') !== '' || columns.some((c) => r.values[c]))
      .filter((r) => !q || Object.values(r.values).some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.rowNumber - a.rowNumber);
  }, [rows, query, tab, columns]);

  const openEditor = (row?: SheetSyncRow) => {
    const initial: Record<string, string> = {};
    for (const h of columns) {
      const field = fieldFor(h);
      if (row) initial[h] = toInput(field, row.values[h] ?? '');
      else if (field?.type === 'date' && field.id === tab?.category?.dateFieldId)
        initial[h] = today();
      else if (field?.type === 'time') initial[h] = nowTime();
      else initial[h] = '';
    }
    setFormError(null);
    setEditing({
      id: row?.values.ID || undefined,
      rowNumber: row?.rowNumber,
      initial: row ? initial : {},
      values: { ...initial },
    });
  };

  const handleSave = async () => {
    if (!editing || !activeTab) return;
    const missing = columns.filter((h) => fieldFor(h)?.required && !editing.values[h]?.trim());
    if (missing.length > 0) {
      setFormError(`Fill in ${missing.join(', ')}.`);
      return;
    }
    // Only cells that changed are written; a new entry writes everything filled in.
    const changes = Object.fromEntries(
      columns
        .filter((h) => (editing.values[h] ?? '') !== (editing.initial[h] ?? ''))
        .map((h) => [h, editing.values[h] ?? '']),
    );
    if (editing.rowNumber && Object.keys(changes).length === 0) {
      setEditing(null);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      if (layout && hasConfigTab && !layout.changedSinceBackup) {
        await markSheetChanged(spreadsheetId);
        setLayout({ ...layout, changedSinceBackup: true });
      }
      const types = Object.fromEntries(
        columns.map((h) => [h, fieldFor(h)?.type ?? '']).filter(([, t]) => t),
      );
      await upsertRow(spreadsheetId, activeTab, changes, editing.id, {
        idPrefix: tab?.category?.id,
        types,
        rowNumber: editing.rowNumber,
      });
      setNotice(editing.rowNumber ? 'Entry updated in the sheet.' : 'Entry added to the sheet.');
      setEditing(null);
      await loadRows();
    } catch (err: any) {
      setFormError(err?.message || 'Could not save to the sheet.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const accent = tab?.category?.color;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Sheet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-stone-900 truncate">{title}</h2>
            <p className="text-[11px] text-stone-500">
              SheetSync spreadsheet · edits are saved to Google Sheets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => void (activeTab ? loadRows() : loadSpreadsheet())}
            disabled={!isConnected || isLoading}
            title="Reload from the sheet"
            aria-label="Reload from the sheet"
            className="p-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 text-stone-600 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Sheets"
            aria-label="Open in Google Sheets"
            className="p-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 text-stone-600"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onEditNote}
            title="Edit this note's markdown"
            aria-label="Edit this note's markdown"
            className="p-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-100 text-stone-600 cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isConnected ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-stone-600">
          <p>Connect Google to load this spreadsheet.</p>
          <button
            type="button"
            onClick={onConnect}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Connect Google
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div
            className="flex items-center gap-1 px-3 pt-2 border-b border-stone-200 overflow-x-auto no-scrollbar"
            role="tablist"
          >
            {tabs.map((t) => {
              const selected = t.name === activeTab;
              return (
                <button
                  key={t.name}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveTab(t.name);
                    setQuery('');
                  }}
                  className={`px-3 py-1.5 text-xs whitespace-nowrap rounded-t-md border-b-2 cursor-pointer ${
                    selected
                      ? 'font-semibold text-stone-900'
                      : 'border-transparent text-stone-500 hover:text-stone-800'
                  }`}
                  style={selected ? { borderColor: t.category?.color || '#1c1917' } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-stone-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab?.label ?? 'entries'}`}
                aria-label="Search entries"
                className="w-full pl-8 pr-2 py-1.5 bg-stone-100 focus:bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-hidden focus:border-stone-400"
              />
            </div>
            <span className="text-[11px] text-stone-400 whitespace-nowrap">
              {visibleRows.length} {visibleRows.length === 1 ? 'entry' : 'entries'}
            </span>
            <button
              type="button"
              onClick={() => openEditor()}
              disabled={!activeTab || columns.length === 0}
              className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
              style={accent ? { backgroundColor: accent } : undefined}
            >
              <Plus className="w-3.5 h-3.5" />
              New entry
            </button>
          </div>

          {(error || notice) && (
            <div
              className={`mx-3 mt-2 p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                error
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {error && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span className="flex-1">{error || notice}</span>
              {error && /can't open this spreadsheet/.test(error) && (
                <button
                  type="button"
                  onClick={onChooseAgain}
                  className="font-semibold underline cursor-pointer whitespace-nowrap"
                >
                  Choose it again
                </button>
              )}
            </div>
          )}

          {/* Entries */}
          <div className="flex-1 overflow-auto p-3">
            {isLoading && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : columns.length === 0 ? (
              <p className="py-12 text-center text-xs text-stone-500">This tab is empty.</p>
            ) : visibleRows.length === 0 ? (
              <p className="py-12 text-center text-xs text-stone-500">
                {query ? 'No entries match.' : 'No entries yet.'}
              </p>
            ) : (
              <table className="min-w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th
                      className="sticky top-0 bg-white w-8 border-b border-stone-200"
                      aria-label="Edit"
                    />
                    {columns.map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 bg-white text-left font-semibold text-stone-600 px-2 py-1.5 border-b border-stone-200 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="sticky top-0 bg-white text-left font-semibold text-stone-400 px-2 py-1.5 border-b border-stone-200 whitespace-nowrap">
                      Saved
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      onClick={() => openEditor(r)}
                      className="hover:bg-stone-50 cursor-pointer align-top"
                    >
                      <td className="px-1 py-1.5 border-b border-stone-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(r);
                          }}
                          aria-label="Edit entry"
                          title="Edit entry"
                          className="p-1 rounded text-stone-400 hover:text-stone-800 hover:bg-stone-200 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </td>
                      {columns.map((h) => (
                        <td
                          key={h}
                          className="px-2 py-1.5 border-b border-stone-100 text-stone-800 max-w-[16rem]"
                        >
                          <div className="line-clamp-3 whitespace-pre-wrap break-words">
                            {fieldFor(h)?.type === 'date'
                              ? toDateInput(r.values[h] ?? '') || r.values[h]
                              : r.values[h]}
                          </div>
                        </td>
                      ))}
                      <td className="px-2 py-1.5 border-b border-stone-100 text-stone-400 whitespace-nowrap">
                        {formatSavedAt(r.values['Saved At'] ?? '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="px-3 py-2 border-t border-stone-100 text-[11px] text-stone-400">
            Changes go straight to the Google Sheet. The SheetSync app keeps its own copy of entries
            on each device, so it won't show edits made here.
          </p>
        </>
      )}

      {/* Entry form */}
      {editing && (
        <Modal
          onClose={() => !isSaving && setEditing(null)}
          labelledBy={formTitleId}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          className="rounded-2xl border shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col bg-white border-stone-200 text-stone-900"
        >
          <form
            className="flex flex-col min-h-0"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
              <h3 id={formTitleId} className="font-semibold text-sm">
                {editing.rowNumber ? 'Edit entry' : 'New entry'} · {tab?.label}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto text-xs">
              {columns.map((h) => (
                <FieldInput
                  key={h}
                  label={h}
                  field={fieldFor(h)}
                  listItems={layout?.lists[fieldFor(h)?.listId ?? ''] ?? []}
                  value={editing.values[h] ?? ''}
                  onChange={(v) =>
                    setEditing((s) => (s ? { ...s, values: { ...s.values, [h]: v } } : s))
                  }
                />
              ))}
              {formError && (
                <div className="p-2.5 rounded-lg border bg-red-50 border-red-200 text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3.5 py-2 rounded-lg text-xs text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editing.rowNumber ? 'Save changes' : 'Add entry'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

/** One form field, shaped by its SheetSync field type (plain text when the layout doesn't know it). */
const FieldInput: React.FC<{
  label: string;
  field?: SheetSyncField;
  listItems: string[];
  value: string;
  onChange: (value: string) => void;
}> = ({ label, field, listItems, value, onChange }) => {
  const id = useId();
  const input =
    'w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden';
  const type = field?.type;
  let control: React.ReactNode;

  if (type === 'rating') {
    const min = field?.min ?? 1;
    const max = field?.max ?? 10;
    control = (
      <div className="flex flex-wrap gap-1" role="group" aria-labelledby={`${id}-label`}>
        {Array.from({ length: max - min + 1 }, (_, i) => String(min + i)).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? '' : n)}
            className={`w-8 h-8 rounded-md border text-xs font-semibold cursor-pointer ${
              value === n
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  } else if (type === 'select') {
    const options = field?.options ?? [];
    control = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        <option value="">—</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (type === 'notes' || type === 'links') {
    control = (
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={type === 'links' ? 2 : 4}
        placeholder={type === 'links' ? 'One link per line' : undefined}
        className={input}
      />
    );
  } else {
    const htmlType =
      type === 'date' && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value))
        ? 'date'
        : type === 'time' && (value === '' || /^\d{2}:\d{2}$/.test(value))
          ? 'time'
          : type === 'number'
            ? 'number'
            : 'text';
    const listId = `${id}-list`;
    control = (
      <>
        <input
          id={id}
          type={htmlType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          list={listItems.length > 0 ? listId : undefined}
          step={htmlType === 'number' ? 'any' : undefined}
          placeholder={type === 'list' && field?.multiple ? 'Comma-separated' : undefined}
          className={input}
        />
        {listItems.length > 0 && (
          <datalist id={listId}>
            {listItems.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <div>
      <label
        htmlFor={type === 'rating' ? undefined : id}
        id={`${id}-label`}
        className="block font-medium text-stone-600 mb-1"
      >
        {label}
        {field?.unit && <span className="text-stone-400 font-normal"> ({field.unit})</span>}
        {field?.required && <span className="text-red-500"> *</span>}
      </label>
      {control}
    </div>
  );
};
