// Deterministic mapping from an object type id (or any seed string) to
// one of the --oe-icon-N palette slots defined in styles.css. Used to
// give cards a stable, colourful icon background when ObjectType.color
// is null.

const PALETTE_SIZE = 12;

export function pickIconPaletteIndex(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE_SIZE;
}

export function iconBackground(seed: string, override?: string | null): string {
  if (override && override.trim()) return override;
  return `var(--oe-icon-${pickIconPaletteIndex(seed)})`;
}
