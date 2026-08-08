import { useEffect, useMemo, useRef, useState } from "react";
import { Editor, type HighlightRange } from "./components/Editor";
import { TreeView } from "./components/TreeView";
import {
  parse,
  type Highlight,
  type QueryResult,
  type SyntaxNode,
} from "./lib/parser";
import { decodeSource, encodeSource } from "./lib/urlState";
import { SAMPLE_AHK } from "./sample";
import "./App.css";
import useLocalStorageState from "./hooks/useLocalStorageState";

const PARSE_DEBOUNCE_MS = 150;

// Fraction of pane width given to the editor. The tree view needs less
// horizontal space than code, so the draggable range favors the editor.
const DEFAULT_SPLIT = 0.6;
const MIN_SPLIT = 0.3;
const MAX_SPLIT = 0.85;
const clampSplit = (ratio: number) => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, ratio));

type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];

export function App() {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [root, setRoot] = useState<SyntaxNode | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnonymous, setShowAnonymous] = useLocalStorageState("showAnonymous", false);
  const [showSourceRanges, setShowSourceRanges] = useLocalStorageState("showSourceRanges", false);
  const [theme, setTheme] = useLocalStorageState<Theme>("theme", "system");

  const [hovered, setHovered] = useState<SyntaxNode | null>(null);
  const [selected, setSelected] = useState<SyntaxNode | null>(null);

  const [split, setSplit] = useLocalStorageState("split", DEFAULT_SPLIT);
  const panesRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const onDividerPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDividerPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !panesRef.current) return;
    const rect = panesRef.current.getBoundingClientRect();
    setSplit(clampSplit((e.clientX - rect.left) / rect.width));
  };

  const onDividerPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onDividerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setSplit((r) => clampSplit(r - 0.02));
    else if (e.key === "ArrowRight") setSplit((r) => clampSplit(r + 0.02));
    else if (e.key === "Home") setSplit(MIN_SPLIT);
    else if (e.key === "End") setSplit(MAX_SPLIT);
    else return;
    e.preventDefault();
  };

  // Reflect the chosen theme onto the root element; index.css keys its light/dark
  // variable overrides off this attribute (falling back to the OS preference when unset).
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Read text off the 'src' key in the URL fragment if we have one. The
  // fragment (never sent to the server) sidesteps request-line length limits.
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));

    // The query is stored as a plain fragment value (short enough to need no compression).
    setQuery(fragment.get("query") ?? "");

    const encoded = fragment.get("src");
    if (encoded) {
      const decoded = decodeSource(encoded);
      if (decoded !== null) {
        setSource(decoded);
        return;
      }
    }

    // No source or failed to decode
    setSource(SAMPLE_AHK);
  }, []);

  // Debounced, race-safe parsing: each run tags itself and only the latest applies.
  const runId = useRef(0);
  useEffect(() => {
    const id = ++runId.current;
    const timer = setTimeout(async () => {
      try {
        const { root: tree, highlights: hl, query: qr } = await parse(source, query);
        if (id === runId.current) {
          setRoot(tree);
          setHighlights(hl);
          setQueryResult(qr);
          setError(null);
        }
      } catch (err) {
        if (id === runId.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }

      // Save state in the URL fragment regardless of success, without
      // re-rendering or reloading.
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      fragment.set("src", encodeSource(source));
      if (query) fragment.set("query", query);
      else fragment.delete("query");
      const url = new URL(window.location.href);
      url.hash = fragment.toString();
      window.history.replaceState({}, "", url.toString());
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source, query]);

  // Editing invalidates the previously selected/hovered nodes (their ids are per-parse).
  const onChange = (value: string) => {
    setSource(value);
    setHovered(null);
    setSelected(null);
  };

  // Hover wins over click for what the editor highlights.
  const active = hovered ?? selected;
  const highlight = useMemo<HighlightRange | null>(
    () => (active ? { from: active.startIndex, to: active.endIndex } : null),
    [active],
  );

  const scrollTo = useMemo<HighlightRange | null>(
    () => (selected ? { from: selected.startIndex, to: selected.endIndex } : null),
    [selected],
  );

  // Query outputs, with stable references so the editor doesn't re-dispatch every render.
  const queryMatches = useMemo(
    () => queryResult?.matches ?? [],
    [queryResult],
  );
  const matchedIds = queryResult?.matchedIds ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>AutoHottree</h1>
        <span className="app-subtitle">
          Parse tree playground · hover or click a node to highlight its source
        </span>
        <div className="theme-toggle push-right" role="group" aria-label="Color theme">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? "active" : ""}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <a
          href="https://github.com/holy-tao/tree-sitter-autohotkey"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </header>
      <main
        className="panes"
        ref={panesRef}
        style={{ "--split": `${split * 100}%` } as React.CSSProperties}
      >
        <section className="pane pane-editor">
          <Editor
            value={source}
            onChange={onChange}
            highlight={highlight}
            highlights={highlights}
            queryMatches={queryMatches}
            scrollTo={scrollTo}
          />
        </section>
        <div
          className="pane-divider"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(split * 100)}
          aria-valuemin={Math.round(MIN_SPLIT * 100)}
          aria-valuemax={Math.round(MAX_SPLIT * 100)}
          aria-label="Resize editor and tree panes"
          tabIndex={0}
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={onDividerPointerUp}
          onKeyDown={onDividerKeyDown}
        />
        <section className="pane pane-tree">
          <TreeView
            root={root}
            error={error}
            showAnonymous={showAnonymous}
            onToggleAnonymous={setShowAnonymous}
            showSourceRanges={showSourceRanges}
            onToggleSourceRanges={setShowSourceRanges}
            selectedId={selected?.id ?? null}
            hoveredId={hovered?.id ?? null}
            matchedIds={matchedIds}
            query={query}
            onQueryChange={setQuery}
            queryError={queryResult?.error ?? null}
            onHover={setHovered}
            onSelect={setSelected}
          />
        </section>
      </main>
    </div>
  );
}
