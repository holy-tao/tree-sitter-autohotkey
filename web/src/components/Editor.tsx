// Left pane: a CodeMirror 6 editor. Beyond editing, it exposes a single imperative
// affordance the playground needs -- highlighting an arbitrary source range -- driven
// by the `highlight` prop and implemented with a StateField-backed decoration.
import { useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

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

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  highlight: HighlightRange | null;
}

export function Editor({ value, onChange, highlight }: EditorProps) {
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

  return (
    <CodeMirror
      ref={ref}
      className="editor"
      value={value}
      onChange={onChange}
      theme="none"
      extensions={[editorTheme, highlightField, EditorView.lineWrapping]}
      basicSetup={{ foldGutter: false, highlightActiveLine: false }}
    />
  );
}
