import React, { useEffect, useId, useRef, useState } from 'react';
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

/** After the first draw, wait this long for typing to pause before drawing again. */
export const RERENDER_DELAY_MS = 300;

/**
 * Queues a render. `isStale` is checked when the render's turn comes: a render that was
 * superseded while it waited (the code changed again, or the diagram unmounted) is skipped
 * and resolves to null, so only the latest source of each diagram is drawn.
 */
async function renderDiagram(
  id: string,
  code: string,
  dark: boolean,
  isStale: () => boolean,
): Promise<string | null> {
  const mermaid = await loadMermaid();
  const run = queue.then(async () => {
    if (isStale()) return null;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      // Mermaid 12 defaults to the `neo` look and ELK layout; keep the classic dagre drawings.
      look: 'classic',
      layout: 'dagre',
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
  // Set once the first result (diagram or error) is shown; later changes are debounced.
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    // Each run of this effect is one generation; cleanup marks it superseded.
    let cancelled = false;
    const draw = () => {
      renderDiagram(id, code, dark, () => cancelled).then(
        (out) => {
          if (cancelled || out === null) return;
          hasDrawnRef.current = true;
          setSvg(out);
          setError(null);
        },
        (err) => {
          if (cancelled) return;
          // Mermaid can leave its scratch element behind after a syntax error.
          document.getElementById(`d${id}`)?.remove();
          hasDrawnRef.current = true;
          setSvg(null);
          setError(err?.message || String(err));
        },
      );
    };
    // The first draw starts at once; redraws wait for a pause in typing.
    const timer = hasDrawnRef.current ? setTimeout(draw, RERENDER_DELAY_MS) : undefined;
    if (!timer) draw();
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
