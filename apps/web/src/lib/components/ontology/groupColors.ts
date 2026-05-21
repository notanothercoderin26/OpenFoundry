import {
  groupColor as deriveGroupColor,
  type ChipColors,
  type GroupColor,
} from '@components/ui/groupColors';

export type { ChipColors, GroupColor };

/**
 * Curated palette for well-known ontology group names so the calque matches
 * Foundry pixel-for-pixel (CRM → pink, Marketing → purple, Operations →
 * blue, …). Unknown names fall back to the deterministic hash picker in
 * `@components/ui/groupColors`, so colour is always stable across sessions.
 *
 * Add a new entry here only when a group's hue is a recognisable brand
 * signal — otherwise let the hash assign one.
 */

const c = (
  base: string,
  soft: string,
  chipColors: ChipColors,
  fg = '#ffffff',
  name = '',
): GroupColor => ({ name, base, soft, fg, chipColors });

const CURATED: Record<string, GroupColor> = {
  crm: c('#db2777', '#fce7f3', ['#db2777', '#f472b6', '#be185d', '#fbcfe8'], '#ffffff', 'pink'),
  marketing: c(
    '#9333ea',
    '#f3e8ff',
    ['#9333ea', '#c084fc', '#6d28d9', '#a855f7'],
    '#ffffff',
    'purple',
  ),
  operations: c(
    '#2563eb',
    '#dbeafe',
    ['#2563eb', '#60a5fa', '#1d4ed8', '#3b82f6'],
    '#ffffff',
    'blue',
  ),
  equipment: c(
    '#a16207',
    '#fef3c7',
    ['#a16207', '#d97706', '#78350f', '#f59e0b'],
    '#ffffff',
    'brown',
  ),
  'human resources': c(
    '#e11d48',
    '#ffe4e6',
    ['#e11d48', '#fb7185', '#9f1239', '#fda4af'],
    '#ffffff',
    'rose',
  ),
  logistics: c(
    '#92400e',
    '#fef3c7',
    ['#92400e', '#b45309', '#78350f', '#d97706'],
    '#ffffff',
    'brown',
  ),
  reporting: c(
    '#4f46e5',
    '#e0e7ff',
    ['#4f46e5', '#818cf8', '#3730a3', '#6366f1'],
    '#ffffff',
    'indigo',
  ),
  case: c('#a16207', '#fef3c7', ['#a16207', '#7c3aed', '#d97706', '#f59e0b'], '#ffffff', 'brown'),
  cogs: c('#16a34a', '#dcfce7', ['#16a34a', '#22c55e', '#15803d', '#4ade80'], '#ffffff', 'green'),
  carbon: c(
    '#ea580c',
    '#ffedd5',
    ['#ea580c', '#fb923c', '#9a3412', '#fdba74'],
    '#ffffff',
    'orange',
  ),
  aviation: c(
    '#0284c7',
    '#e0f2fe',
    ['#0284c7', '#38bdf8', '#075985', '#7dd3fc'],
    '#ffffff',
    'sky',
  ),
  'common contact data': c(
    '#0d9488',
    '#ccfbf1',
    ['#0d9488', '#2dd4bf', '#115e59', '#5eead4'],
    '#ffffff',
    'teal',
  ),
};

/**
 * Strip common decoration like `[Example Data]` or `[CSS]` prefixes and
 * lowercase so the lookup is forgiving to display names.
 */
function normalize(name: string): string {
  return name
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a group/object-type name to a stable {fg, bg, chipColors[4]}.
 * Falls back to the deterministic hash picker when the name is unknown.
 */
export function ontologyGroupColor(name: string | null | undefined): GroupColor {
  const key = normalize(name ?? '');
  if (key && CURATED[key]) return CURATED[key];
  return deriveGroupColor(name ?? '');
}

/**
 * Lower-level escape hatch: derive a colour by hash without consulting the
 * curated overrides. Useful when callers want stable variety regardless of
 * the entity's display name.
 */
export { deriveGroupColor };
