import { useEffect, useMemo, useRef, useState } from "react";
import { Editor, type HighlightRange } from "./components/Editor";
import { TreeView } from "./components/TreeView";
import { parse, type SyntaxNode } from "./lib/parser";
import { SAMPLE_AHK } from "./sample";
import "./App.css";

const PARSE_DEBOUNCE_MS = 150;

export function App() {
  const [source, setSource] = useState(SAMPLE_AHK);
  const [root, setRoot] = useState<SyntaxNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAnonymous, setShowAnonymous] = useState(false);

  const [hovered, setHovered] = useState<SyntaxNode | null>(null);
  const [selected, setSelected] = useState<SyntaxNode | null>(null);

  // Debounced, race-safe parsing: each run tags itself and only the latest applies.
  const runId = useRef(0);
  useEffect(() => {
    const id = ++runId.current;
    const timer = setTimeout(async () => {
      try {
        const tree = await parse(source);
        if (id === runId.current) {
          setRoot(tree);
          setError(null);
        }
      } catch (err) {
        if (id === runId.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }, PARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [source]);

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>AutoHottree</h1>
        <span className="app-subtitle">
          Parse tree playground · hover or click a node to highlight its source
        </span>
      </header>
      <main className="panes">
        <section className="pane pane-editor">
          <Editor value={source} onChange={onChange} highlight={highlight} />
        </section>
        <section className="pane pane-tree">
          <TreeView
            root={root}
            error={error}
            showAnonymous={showAnonymous}
            onToggleAnonymous={setShowAnonymous}
            selectedId={selected?.id ?? null}
            hoveredId={hovered?.id ?? null}
            onHover={setHovered}
            onSelect={setSelected}
          />
        </section>
      </main>
    </div>
  );
}
