// Right pane: a tree-sitter query box, the scrollable s-expression tree, and a
// "show anonymous nodes" toggle.
import { useId } from "react";
import type { SyntaxNode } from "../lib/parser";
import { TreeNode } from "./TreeNode";
import { QueryBox } from "./QueryBox";

interface TreeViewProps {
  root: SyntaxNode | null;
  error: string | null;
  /** If true, show anonymous (_-prefixed) nodes */
  showAnonymous: boolean;
  onToggleAnonymous: (value: boolean) => void;
  selectedId: number | null;
  hoveredId: number | null;
  /** Ids of nodes captured by the active query, or null when no query is active. */
  matchedIds: Set<number> | null;
  query: string;
  onQueryChange: (value: string) => void;
  /** Query compile error to display, or null. */
  queryError: string | null;
  onHover: (node: SyntaxNode | null) => void;
  onSelect: (node: SyntaxNode) => void;
}

/**
 * Right-pane TreeView component shows the parsed file
 */
export function TreeView({
  root,
  error,
  showAnonymous,
  onToggleAnonymous,
  selectedId,
  hoveredId,
  matchedIds,
  query,
  onQueryChange,
  queryError,
  onHover,
  onSelect,
}: TreeViewProps) {
  const showAnonId = useId();

  return (
    <div className="tree-view">
      <QueryBox value={query} onChange={onQueryChange} error={queryError} />
      <div className="tree-toolbar">
        <label htmlFor={showAnonId}>
          <input
            id={showAnonId}
            type="checkbox"
            checked={showAnonymous}
            onChange={(e) => onToggleAnonymous(e.target.checked)}
          />
          Show anonymous nodes
        </label>
      </div>
      <div className="tree-scroll" onMouseLeave={() => onHover(null)}>
        {error ? (
          <div className="tree-error">{error}</div>
        ) : root ? (
          <TreeNode
            node={root}
            depth={0}
            showAnonymous={showAnonymous}
            selectedId={selectedId}
            hoveredId={hoveredId}
            matchedIds={matchedIds}
            onHover={onHover}
            onSelect={onSelect}
          />
        ) : (
          <div className="tree-loading">Parsing…</div>
        )}
      </div>
    </div>
  );
}
