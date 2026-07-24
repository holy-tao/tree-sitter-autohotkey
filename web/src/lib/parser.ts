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

/** Result of running the user's playground query against a parse. */
export interface QueryResult {
  /** Query compile error message, or null if the query compiled. */
  error: string | null;
  /** Model-node ids (SyntaxNode.id) captured by the query, for tree emphasis. */
  matchedIds: Set<number>;
  /** Captured source spans for editor highlighting; `type` is the capture name. */
  matches: Highlight[];
}

/** The full result of a parse: the plain tree plus highlight spans (captures may overlap). */
export interface ParseResult {
  root: SyntaxNode;
  highlights: Highlight[];
  /** Result of the user's playground query, or null when no query was supplied. */
  query: QueryResult | null;
}

interface Grammar {
  parser: Parser;
  language: Language;
  query: Query;
}

let grammarPromise: Promise<Grammar> | null = null;

// Compiled user query, cached by its source text so identical re-parses don't recompile.
let userQueryCache: { text: string; query: Query | null; error: string | null } | null = null;

/** Compile (or reuse a cached) user query. Returns the query and any compile error. */
function getUserQuery(
  language: Language,
  text: string,
): { query: Query | null; error: string | null } {
  if (!userQueryCache || userQueryCache.text !== text) {
    try {
      userQueryCache = { text, query: new Query(language, text), error: null };
    } catch (err) {
      userQueryCache = {
        text,
        query: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return userQueryCache;
}

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
      return { parser, language, query };
    })();
  }
  return grammarPromise;
}

/**
 * Parse source and return the root node as a plain model plus highlight spans. When `queryText`
 * is a non-empty query, it's run against the same tree and its result returned in `query`.
 */
export async function parse(
  source: string,
  queryText?: string,
): Promise<ParseResult> {
  const { parser, language, query } = await getGrammar();
  const tree = parser.parse(source);

  if (!tree) throw new Error("Parse failed: tree-sitter returned null");

  try {
    const counter = { n: 0 };
    // Maps each real tree-sitter node id to its per-parse model id, so query captures
    // (which reference the wasm tree) can be mapped back onto the plain tree nodes.
    const tsIdToModelId = new Map<number, number>();
    const root = walk(tree.walk(), counter, tsIdToModelId);
    // Captures reference the wasm-backed tree, so pull out plain offsets before it's deleted.
    const highlights = query.captures(tree.rootNode).map((c) => ({
      from: c.node.startIndex,
      to: c.node.endIndex,
      type: c.name,
    }));

    let queryResult: QueryResult | null = null;
    if (queryText && queryText.trim() !== "") {
      const { query: userQuery, error } = getUserQuery(language, queryText);
      const matchedIds = new Set<number>();
      const matches: Highlight[] = [];
      if (userQuery) {
        for (const c of userQuery.captures(tree.rootNode)) {
          const modelId = tsIdToModelId.get(c.node.id);
          if (modelId !== undefined) matchedIds.add(modelId);
          matches.push({ from: c.node.startIndex, to: c.node.endIndex, type: c.name });
        }
      }
      queryResult = { error, matchedIds, matches };
    }

    return { root, highlights, query: queryResult };
  } finally {
    tree.delete();
  }
}

/** Depth-first cursor walk into the plain model. Cursor is positioned on the node on entry. */
function walk(
  cursor: TreeCursor,
  counter: { n: number },
  tsIdToModelId: Map<number, number>,
): SyntaxNode {
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
  tsIdToModelId.set(node.id, model.id);

  if (cursor.gotoFirstChild()) {
    do {
      model.children.push(walk(cursor, counter, tsIdToModelId));
    } while (cursor.gotoNextSibling());
    cursor.gotoParent();
  }

  return model;
}
