// OntologyEditsButton lives in the ontology-manager top bar. It shows
// the running edit counter ("1 edit", "2 edits", …), surfaces error
// and conflict badges, and opens the Review-edits modal.
//
// Drop-in usage:
//
//   <OntologyEditsButton />
//
// Renders nothing when there are zero edits — the top bar stays clean
// for the read-only state, matching Palantir's behaviour where Save /
// Discard appear only when something is staged.

import { useState } from "react";

import {
  useOntologyWorkingState,
} from "../../stores/ontologyWorkingState";
import { ReviewEditsModal } from "./ReviewEditsModal";

interface Props {
  /**
   * Optional callback fired after a successful save (every edit
   * committed). Hosting pages typically invalidate their TanStack
   * Query caches in here.
   */
  onSaved?: (batchId: string) => void;
  /**
   * When true, render the button even with zero edits so the top bar
   * has a stable layout. The button is still disabled in that state.
   */
  alwaysVisible?: boolean;
}

export function OntologyEditsButton({ onSaved, alwaysVisible = false }: Props) {
  const state = useOntologyWorkingState();
  const [open, setOpen] = useState(false);

  const editCount = state.edits.length;
  const errorCount = state.edits.filter((e) => e.errors.length > 0).length;
  const conflictCount = state.edits.filter((e) => e.status === "conflict").length;

  if (editCount === 0 && !alwaysVisible) return null;

  const tone = conflictCount > 0 ? "conflict" : errorCount > 0 ? "error" : "info";

  return (
    <>
      <button
        type="button"
        className="of-btn of-btn-ghost"
        onClick={() => setOpen(true)}
        disabled={editCount === 0}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 10px",
        }}
        aria-label="Review edits"
      >
        <span style={{ fontWeight: 600 }}>
          {editCount} {editCount === 1 ? "edit" : "edits"}
        </span>
        {(errorCount > 0 || conflictCount > 0) && (
          <span style={pillStyle(tone)}>
            {conflictCount > 0 ? conflictCount : errorCount}
          </span>
        )}
      </button>

      <ReviewEditsModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(batchId) => {
          setOpen(false);
          onSaved?.(batchId);
        }}
      />
    </>
  );
}

function pillStyle(tone: "info" | "error" | "conflict"): React.CSSProperties {
  const palette = {
    info: { bg: "rgba(41, 101, 204, 0.1)", fg: "var(--accent-primary, #2965cc)" },
    error: { bg: "rgba(196, 49, 75, 0.12)", fg: "var(--status-error, #c4314b)" },
    conflict: { bg: "rgba(120, 80, 180, 0.12)", fg: "var(--status-conflict, #7a4ea4)" },
  }[tone];
  return {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 8,
    background: palette.bg,
    color: palette.fg,
    fontWeight: 700,
  };
}
