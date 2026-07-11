// One row of the s-expression tree, rendered recursively. Handles its own collapse
// state and reports hover/selection up so the editor can highlight the matching source.
import { useState } from "react";
import type { SyntaxNode } from "../lib/parser";

interface TreeNodeProps {
  node: SyntaxNode;
  depth: number;
  showAnonymous: boolean;
  selectedId: number | null;
  hoveredId: number | null;
  onHover: (node: SyntaxNode | null) => void;
  onSelect: (node: SyntaxNode) => void;
}

function formatPoint(node: SyntaxNode): string {
  const { startPosition: s, endPosition: e } = node;
  return `[${s.row}, ${s.column}] - [${e.row}, ${e.column}]`;
}

export function TreeNode({
  node,
  depth,
  showAnonymous,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
}: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleChildren = showAnonymous
    ? node.children
    : node.children.filter((c) => c.isNamed || c.isError || c.isMissing);
  const hasChildren = visibleChildren.length > 0;

  const classes = ["tree-row"];
  if (node.id === selectedId) classes.push("selected");
  if (node.id === hoveredId) classes.push("hovered");
  if (node.isError || node.isMissing) classes.push("error");
  else if (!node.isNamed) classes.push("anonymous");

  return (
    <div className="tree-node">
      <div
        className={classes.join(" ")}
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
        onMouseEnter={() => onHover(node)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onSelect(node)}
      >
        <span
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setCollapsed((c) => !c);
          }}
        >
          {hasChildren ? (collapsed ? "▶" : "▼") : "·"}
        </span>
        {node.fieldName && (
          <span className="tree-field">{node.fieldName}: </span>
        )}
        <span className="tree-type">{node.type}</span>
        {node.isMissing && <span className="tree-flag"> MISSING</span>}
        <span className="tree-pos">{formatPoint(node)}</span>
      </div>

      {hasChildren && !collapsed && (
        <div className="tree-children">
          {visibleChildren.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              showAnonymous={showAnonymous}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onHover={onHover}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
