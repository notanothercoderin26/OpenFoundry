import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

export type LeftPanelId = 'files' | 'search';

interface LeftRailProps {
  active: LeftPanelId;
  onChange: (next: LeftPanelId) => void;
}

interface RailItem {
  id: LeftPanelId;
  glyph: GlyphName;
  label: string;
}

const ITEMS: ReadonlyArray<RailItem> = [
  { id: 'files', glyph: 'code', label: 'Files' },
  { id: 'search', glyph: 'search', label: 'Search' },
];

/**
 * Foundry-style 48px vertical rail with one icon per left-side panel.
 * Click toggles which panel is visible; the active icon shows the accent
 * color and a leading bar to match the IDE convention.
 */
export function LeftRail({ active, onChange }: LeftRailProps) {
  return (
    <nav
      aria-label="Code Repositories side panels"
      className="flex flex-col items-stretch w-12 shrink-0 border-r border-of-border bg-of-surface-raised py-1.5"
    >
      {ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={isActive}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center justify-center h-10 mx-0.5 rounded-of-sm transition-colors ${
              isActive
                ? 'text-of-accent bg-of-accent-soft'
                : 'text-of-text-muted hover:text-of-text hover:bg-of-surface-muted'
            }`}
          >
            {isActive ? (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-of-accent"
              />
            ) : null}
            <Glyph name={item.glyph} size={18} tone="currentColor" />
          </button>
        );
      })}
    </nav>
  );
}
