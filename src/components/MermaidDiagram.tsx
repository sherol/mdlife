import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

type Mermaid = typeof import('mermaid').default;

// Mermaid is large, so it's loaded the first time a diagram is shown (its own chunk).
let mermaidPromise: Promise<Mermaid> | null = null;
const loadMermaid = () => (mermaidPromise ??= import('mermaid').then((m) => m.default));

const isDark = () => document.documentElement.classList.contains('dark');

/** Re-renders when the `dark` class on <html> changes (see utils/theme). */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Mermaid keeps one global config, so renders are queued to apply each theme in turn.
let queue: Promise<unknown> = Promise.resolve();

async function renderDiagram(id: string, code: string, dark: boolean): Promise<string> {
  const mermaid = await loadMermaid();
  const run = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    });
    const { svg } = await mermaid.render(id, code);
    return svg;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** A ```mermaid code block rendered as a diagram; shows the code and the error if it can't be drawn. */
export const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
  const dark = useDarkMode();
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderDiagram(id, code, dark).then(
      (out) => {
        if (cancelled) return;
        setSvg(out);
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        // Mermaid can leave its scratch element behind after a syntax error.
        document.getElementById(`d${id}`)?.remove();
        setSvg(null);
        setError(err?.message || String(err));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [id, code, dark]);

  if (error) {
    return (
      <div className="my-3 rounded-lg border border-amber-300 overflow-hidden">
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 text-amber-900 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap break-words">Mermaid diagram couldn't be drawn: {error}</span>
        </div>
        <pre className="keep-light-palette bg-stone-950 text-stone-100 p-3.5 text-xs font-mono overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 flex items-center justify-center gap-2 py-8 rounded-lg border border-stone-200 text-xs text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Drawing diagram…
      </div>
    );
  }

  return (
    <div
      className="my-3 p-3 rounded-lg border border-stone-200 bg-white overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
      role="img"
      aria-label="Mermaid diagram"
      // Mermaid's output with securityLevel 'strict' (no scripts, HTML labels sanitised).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
