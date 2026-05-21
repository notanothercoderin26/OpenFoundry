import { Glyph } from '@components/ui/Glyph';

interface OntologySelectorProps {
  name: string;
  /** Space slug / placement path shown as the muted second line. */
  spacePath: string;
  /** Opens the ontology picker. */
  onClick?: () => void;
  /** Marks the selector as the active surface (highlighted border). */
  active?: boolean;
  className?: string;
}

/**
 * Foundry-style ontology selector card. Sits below the top-bar logo as the
 * first element of the sidebar — name on top with a caret affordance,
 * folder + space path muted below. Truncates both rows so long names don't
 * push the sidebar wider than its column.
 *
 * The click handler is the hook for opening the ontology picker; the picker
 * itself is out of scope for this primitive.
 */
export function OntologySelector({
  name,
  spacePath,
  onClick,
  active,
  className,
}: OntologySelectorProps) {
  const classes = [
    'group flex w-full items-center gap-2 px-2.5 py-2 text-left',
    'bg-of-surface-raised border border-of-border rounded-of-md shadow-of-sm',
    'transition-colors',
  ];
  if (onClick) classes.push('hover:border-of-border-strong');
  if (active) classes.push('border-of-accent');
  if (className) classes.push(className);

  const content = (
    <>
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className="text-of-13 font-of-semibold text-of-text truncate"
          title={name}
        >
          {name}
        </span>
        <span
          className="mt-0.5 inline-flex items-center gap-1 min-w-0 text-of-12 text-of-text-muted"
          title={spacePath}
        >
          <Glyph name="folder" size={11} tone="var(--of-text-muted)" />
          <span className="truncate">{spacePath}</span>
        </span>
      </div>
      <span
        className="shrink-0 text-of-text-muted group-hover:text-of-text"
        aria-hidden
      >
        <Glyph name="chevron-down" size={12} tone="currentColor" />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classes.join(' ')}
        aria-label={`Switch ontology, current: ${name}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={classes.join(' ')} role="group" aria-label={name}>
      {content}
    </div>
  );
}
