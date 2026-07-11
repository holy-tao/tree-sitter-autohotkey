// Right pane: the scrollable s-expression tree plus its "show anonymous nodes" toggle.
import { useId } from "react";
import type { SyntaxNode } from "../lib/parser";
import { TreeNode } from "./TreeNode";

interface TreeViewProps {
  root: SyntaxNode | null;
  error: string | null;
  /** If true, show anonymous (_-prefixed) nodes */
  showAnonymous: boolean;
  onToggleAnonymous: (value: boolean) => void;
  selectedId: number | null;
  hoveredId: number | null;
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
  onHover,
  onSelect,
}: TreeViewProps) {
  const showAnonId = useId();

  return (
    <div className="tree-view">
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
