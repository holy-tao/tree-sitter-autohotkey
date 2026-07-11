// Thin wrapper around web-tree-sitter: one-time init, grammar load, and a walk that
// turns a parse Tree into a plain serializable model the React tree view can render
// without touching the wasm-backed objects (which must not outlive a re-parse).
import { Parser, Language, Query, type TreeCursor } from "web-tree-sitter";
import coreWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url";
import highlightsQuery from "../../../queries/highlights.scm?raw";

export interface Point {
  row: number;
  column: number;
}

/** Plain, JSON-serializable mirror of a tree-sitter node. */
export interface SyntaxNode {
  /** Stable-per-parse id, used for React keys and selection. */
  id: number;
  type: string;
  /** Field name this node fills in its parent (e.g. "left"), or null. */
  fieldName: string | null;
  isNamed: boolean;
  isError: boolean;
  isMissing: boolean;
  /** UTF-16 offsets into the source - these line up 1:1 with CodeMirror positions. */
  startIndex: number;
  endIndex: number;
  startPosition: Point;
  endPosition: Point;
  children: SyntaxNode[];
}

/** A resolved highlight span: `type` is the tree-sitter capture name (e.g. "function.method"). */
export interface Highlight {
  from: number;
  to: number;
  type: string;
}

/** The full result of a parse: the plain tree plus highlight spans (captures may overlap). */
export interface ParseResult {
  root: SyntaxNode;
  highlights: Highlight[];
}

interface Grammar {
  parser: Parser;
  query: Query;
}

let grammarPromise: Promise<Grammar> | null = null;

/** Lazily initialize the wasm runtime + grammar + highlight query (singleton). */
function getGrammar(): Promise<Grammar> {
  if (!grammarPromise) {
    grammarPromise = (async () => {
      await Parser.init({ locateFile: () => coreWasmUrl });

      const grammarUrl = `${import.meta.env.BASE_URL}tree-sitter-autohotkey.wasm`;
      const language = await Language.load(grammarUrl);
      const parser = new Parser();

      parser.setLanguage(language);
      const query = new Query(language, highlightsQuery);
      return { parser, query };
    })();
  }
  return grammarPromise;
}

/** Parse source and return the root node as a plain model plus highlight spans. */
export async function parse(source: string): Promise<ParseResult> {
  const { parser, query } = await getGrammar();
  const tree = parser.parse(source);

  if (!tree) throw new Error("Parse failed: tree-sitter returned null");

  try {
    const counter = { n: 0 };
    const root = walk(tree.walk(), counter);
    // Captures reference the wasm-backed tree, so pull out plain offsets before it's deleted.
    const highlights = query.captures(tree.rootNode).map((c) => ({
      from: c.node.startIndex,
      to: c.node.endIndex,
      type: c.name,
    }));
    return { root, highlights };
  } finally {
    tree.delete();
  }
}

/** Depth-first cursor walk into the plain model. Cursor is positioned on the node on entry. */
function walk(cursor: TreeCursor, counter: { n: number }): SyntaxNode {
  const node = cursor.currentNode;
  const model: SyntaxNode = {
    id: counter.n++,
    type: node.type,
    fieldName: cursor.currentFieldName ?? null,
    isNamed: node.isNamed,
    isError: node.isError,
    isMissing: node.isMissing,
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    children: [],
  };

  if (cursor.gotoFirstChild()) {
    do {
      model.children.push(walk(cursor, counter));
    } while (cursor.gotoNextSibling());
    cursor.gotoParent();
  }

  return model;
}
