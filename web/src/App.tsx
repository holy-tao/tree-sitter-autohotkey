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

const PARSE_DEBOUNCE_MS = 150;

export function App() {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [root, setRoot] = useState<SyntaxNode | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnonymous, setShowAnonymous] = useState(false);

  const [hovered, setHovered] = useState<SyntaxNode | null>(null);
  const [selected, setSelected] = useState<SyntaxNode | null>(null);

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
        <a
          href="https://github.com/holy-tao/tree-sitter-autohotkey"
          target="_blank"
          rel="noopener noreferrer"
          className="push-right"
        >
          GitHub
        </a>
      </header>
      <main className="panes">
        <section className="pane pane-editor">
          <Editor
            value={source}
            onChange={onChange}
            highlight={highlight}
            highlights={highlights}
            queryMatches={queryMatches}
          />
        </section>
        <section className="pane pane-tree">
          <TreeView
            root={root}
            error={error}
            showAnonymous={showAnonymous}
            onToggleAnonymous={setShowAnonymous}
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
