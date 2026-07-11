// Left pane: a CodeMirror 6 editor. Beyond editing, it exposes a single imperative
// affordance the playground needs -- highlighting an arbitrary source range -- driven
// by the `highlight` prop and implemented with a StateField-backed decoration.
import { useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import type { Highlight } from "../lib/parser";

export interface HighlightRange {
  from: number;
  to: number;
}

// The editor's colors are driven by the same CSS variables as the app chrome
// (see index.css), so it follows the OS light/dark preference automatically.
const editorTheme = EditorView.theme({
  "&": {
    color: "var(--text)",
    backgroundColor: "var(--editor-bg)",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--text)",
    fontFamily: '"Cascadia Code", "Consolas", ui-monospace, monospace',
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--selection)" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--text-dim)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
});

const setHighlight = StateEffect.define<HighlightRange | null>();

const highlightMark = Decoration.mark({ class: "cm-node-highlight" });

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHighlight)) {
        const range = effect.value;
        deco =
          range && range.to > range.from
            ? Decoration.set([highlightMark.range(range.from, range.to)])
            : Decoration.none;
      }
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// Tree-sitter captures can overlap (a parent node and its child both match). Flatten them
// into non-overlapping spans where the narrower - and, for equal spans, later - capture wins,
// matching the usual tree-sitter highlighting precedence.
function resolveHighlights(highlights: Highlight[]): Highlight[] {
  if (highlights.length === 0) return [];
  let maxTo = 0;
  for (const h of highlights) if (h.to > maxTo) maxTo = h.to;

  const winner = new Int32Array(maxTo).fill(-1);
  const order = highlights
    .map((_, i) => i)
    .sort((a, b) => {
      const span =
        highlights[b].to -
        highlights[b].from -
        (highlights[a].to - highlights[a].from);

      return span || a - b; // longest first; ties keep original (earlier) order so later paints last
    });
  for (const i of order) {
    const { from, to } = highlights[i];
    for (let p = from; p < to; p++) winner[p] = i;
  }

  // Coalesce contiguous runs of the same winning capture into single spans.
  const out: Highlight[] = [];
  for (let p = 0; p < maxTo;) {
    const w = winner[p];
    if (w === -1) {
      p++;
      continue;
    }

    let q = p + 1;
    while (q < maxTo && winner[q] === w) q++;

    out.push({ from: p, to: q, type: highlights[w].type });
    p = q;
  }

  return out;
}

// "function.method" -> "tok-function tok-function-method": cumulative classes so a base color
// always applies and dotted sub-kinds can refine it (see index.css).
const classCache = new Map<string, string>();
function classesFor(type: string): string {
  let cls = classCache.get(type);
  if (cls === undefined) {
    const parts = type.split(".");
    cls = parts
      .map((_, i) => "tok-" + parts.slice(0, i + 1).join("-"))
      .join(" ");

    classCache.set(type, cls);
  }
  return cls;
}

const markCache = new Map<string, Decoration>();
function markFor(type: string): Decoration {
  let mark = markCache.get(type);
  if (!mark) {
    mark = Decoration.mark({ class: classesFor(type) });
    markCache.set(type, mark);
  }
  return mark;
}

const setSyntax = StateEffect.define<Highlight[]>();

const syntaxField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSyntax)) {
        const len = tr.state.doc.length;
        const builder = new RangeSetBuilder<Decoration>();
        for (const h of resolveHighlights(effect.value)) {
          // Clamp: highlights are from the last completed parse and may lag the live doc.
          const from = Math.min(h.from, len);
          const to = Math.min(h.to, len);
          if (to > from) builder.add(from, to, markFor(h.type));
        }
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  highlight: HighlightRange | null;
  highlights: Highlight[];
}

export function Editor({
  value,
  onChange,
  highlight,
  highlights,
}: EditorProps) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  // Push highlight changes into CodeMirror imperatively; clamp to the current doc
  // length so a stale range (mid-edit) can never dispatch an out-of-bounds decoration.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    const len = view.state.doc.length;
    const clamped: HighlightRange | null = highlight
      ? { from: Math.min(highlight.from, len), to: Math.min(highlight.to, len) }
      : null;
    view.dispatch({ effects: setHighlight.of(clamped) });
  }, [highlight]);

  // Repaint syntax highlighting whenever a new parse produces fresh captures.
  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    view.dispatch({ effects: setSyntax.of(highlights) });
  }, [highlights]);

  return (
    <CodeMirror
      ref={ref}
      className="editor"
      value={value}
      onChange={onChange}
      theme="none"
      extensions={[
        editorTheme,
        syntaxField,
        highlightField,
        EditorView.lineWrapping,
      ]}
      basicSetup={{ foldGutter: false, highlightActiveLine: false }}
    />
  );
}
