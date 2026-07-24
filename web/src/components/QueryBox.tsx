// Top of the right pane: a text box for a tree-sitter query. Matches are highlighted in the
// editor and emphasized in the tree; a compile error (if any) is shown beneath the box.
import { useId } from "react";

interface QueryBoxProps {
  value: string;
  onChange: (value: string) => void;
  /** Query compile error to display, or null. */
  error: string | null;
}

const PLACEHOLDER = "(function_call function: (identifier) @name)";

export function QueryBox({ value, onChange, error }: QueryBoxProps) {
  const id = useId();

  return (
    <div className="query-box">
      <label htmlFor={id} className="query-label">
        Query
      </label>
      <textarea
        id={id}
        className="query-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        rows={2}
      />
      {error && <div className="query-error">{error}</div>}
    </div>
  );
}
