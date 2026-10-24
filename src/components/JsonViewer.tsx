import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Wand2 } from 'lucide-react';
import { parseJsonContent } from '../utils/fileFormats';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const isContainer = (v: JsonValue): v is JsonValue[] | { [key: string]: JsonValue } =>
  v !== null && typeof v === 'object';

const Primitive: React.FC<{ value: JsonValue }> = ({ value }) => {
  if (value === null) return <span className="text-stone-400 italic">null</span>;
  if (typeof value === 'string')
    return <span className="text-emerald-700 break-all">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="text-blue-700">{value}</span>;
  return <span className="text-purple-700">{String(value)}</span>;
};

const JsonNode: React.FC<{ label?: string; value: JsonValue; depth: number }> = ({
  label,
  value,
  depth,
}) => {
  // Deeply nested nodes start collapsed so large documents stay readable.
  const [open, setOpen] = useState(depth < 2);
  const keyLabel =
    label !== undefined ? <span className="text-stone-700 font-semibold">{label}: </span> : null;

  if (!isContainer(value)) {
    return (
      <div className="pl-5 py-0.5">
        {keyLabel}
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string, JsonValue][] = isArray
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  const [openBrace, closeBrace] = isArray ? ['[', ']'] : ['{', '}'];
  const summary = `${entries.length} ${isArray ? (entries.length === 1 ? 'item' : 'items') : entries.length === 1 ? 'key' : 'keys'}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 py-0.5 text-left hover:bg-stone-100 rounded cursor-pointer w-full"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        )}
        <span>
          {keyLabel}
          <span className="text-stone-500">{openBrace}</span>
          {!open && (
            <>
              <span className="text-stone-400 text-[11px] mx-1">{summary}</span>
              <span className="text-stone-500">{closeBrace}</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <>
          <div className="ml-[7px] pl-2 border-l border-stone-200">
            {entries.length === 0 ? (
              <div className="pl-5 py-0.5 text-stone-400 italic text-[11px]">empty</div>
            ) : (
              entries.map(([k, v]) => (
                <JsonNode key={k} label={isArray ? undefined : k} value={v} depth={depth + 1} />
              ))
            )}
          </div>
          <div className="pl-5 text-stone-500">{closeBrace}</div>
        </>
      )}
    </div>
  );
};

interface JsonViewerProps {
  content: string;
  /** Rewrites the file with pretty-printed JSON. Omitted = no Format button. */
  onFormat?: (formatted: string) => void;
}

/** Read-only tree view of a JSON file, with the parse error when the JSON is invalid. */
export const JsonViewer: React.FC<JsonViewerProps> = ({ content, onFormat }) => {
  const parsed = parseJsonContent(content);

  if (!parsed.ok) {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div
          role="alert"
          className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block mb-0.5">Invalid JSON</strong>
            <span className="font-mono break-all">{parsed.error}</span>
          </div>
        </div>
      </div>
    );
  }

  const formatted = `${JSON.stringify(parsed.value, null, 2)}\n`;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {onFormat && formatted !== content && (
        <button
          type="button"
          id="btn-json-format"
          onClick={() => onFormat(formatted)}
          className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded font-medium text-xs transition-colors cursor-pointer"
        >
          <Wand2 className="w-3 h-3" />
          <span>Format JSON</span>
        </button>
      )}
      <div className="font-mono text-xs md:text-sm text-stone-900 leading-relaxed">
        <JsonNode value={parsed.value as JsonValue} depth={0} />
      </div>
    </div>
  );
};
