import { Glyph } from '@/lib/components/ui/Glyph';

interface HelperTodoBannerProps {
  /** Gap identifier (master plan §10), e.g. "B1". */
  backendGap: string;
  description: string;
}

/**
 * Shared notice rendered at the top of every helper whose backend is
 * still missing. Keeps the master plan §10 gap visible so anyone
 * inspecting the IDE can correlate the placeholder data with the
 * specific endpoint that has to ship.
 */
export function HelperTodoBanner({ backendGap, description }: HelperTodoBannerProps) {
  return (
    <div className="flex items-start gap-2 mx-2 mt-2 px-3 py-2 rounded-of-sm border border-of-warning-soft bg-of-warning-soft text-of-12 text-of-warning">
      <Glyph name="info" size={14} tone="currentColor" />
      <div>
        <p className="font-of-semibold">Mocked — backend gap {backendGap}</p>
        <p className="mt-0.5 text-of-12">{description}</p>
      </div>
    </div>
  );
}
