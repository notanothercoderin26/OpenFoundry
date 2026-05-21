/**
 * Deterministic group/ontology entity color picker.
 *
 * Foundry colors entities by group (CRM pink, Marketing purple, Operations
 * blue, …). When the backend doesn't pin a colour, we derive one from a
 * stable string key (group name or RID) so the same entity always lands on
 * the same hue across sessions.
 */

const PALETTE = [
  { name: 'pink', base: '#db2777', soft: '#fce7f3' },
  { name: 'rose', base: '#e11d48', soft: '#ffe4e6' },
  { name: 'purple', base: '#9333ea', soft: '#f3e8ff' },
  { name: 'indigo', base: '#4f46e5', soft: '#e0e7ff' },
  { name: 'blue', base: '#2563eb', soft: '#dbeafe' },
  { name: 'sky', base: '#0284c7', soft: '#e0f2fe' },
  { name: 'teal', base: '#0d9488', soft: '#ccfbf1' },
  { name: 'green', base: '#16a34a', soft: '#dcfce7' },
  { name: 'lime', base: '#65a30d', soft: '#ecfccb' },
  { name: 'amber', base: '#d97706', soft: '#fef3c7' },
  { name: 'orange', base: '#ea580c', soft: '#ffedd5' },
  { name: 'brown', base: '#a16207', soft: '#fef3c7' },
] as const;

export type ChipColors = [string, string, string, string];

export interface GroupColor {
  name: string;
  base: string;
  soft: string;
  fg: string;
  chipColors: ChipColors;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function groupColor(key: string | null | undefined): GroupColor {
  const k = (key ?? '').trim() || 'default';
  const idx = hash(k) % PALETTE.length;
  const slot = PALETTE[idx];
  const chipColors: ChipColors = [
    PALETTE[idx].base,
    PALETTE[(idx + 3) % PALETTE.length].base,
    PALETTE[(idx + 7) % PALETTE.length].base,
    PALETTE[(idx + 5) % PALETTE.length].base,
  ];
  return {
    name: slot.name,
    base: slot.base,
    soft: slot.soft,
    fg: '#ffffff',
    chipColors,
  };
}
