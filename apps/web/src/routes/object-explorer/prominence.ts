// Stop-gap prominence helper. Foundry's backend marks select object
// types as "prominent" so search results can group them before the
// long tail. Our backend exposes no such flag yet, so we approximate:
//
//   - Favourited types are always prominent.
//   - Types whose latest count is non-zero are prominent.
//   - Hidden / deprecated types are never prominent.
//
// When the backend ships an is_prominent flag, drop the proxy and
// read it directly here.

import type { ObjectType } from '@/lib/api/ontology';

export interface ProminenceContext {
  favorites?: Set<string>;
  counts?: Map<string, number>;
}

export function isProminentType(type: ObjectType, ctx: ProminenceContext = {}): boolean {
  const status = (type.status ?? '').toLowerCase();
  if (status === 'deprecated') return false;
  if ((type.visibility ?? '').toLowerCase() === 'hidden') return false;
  if (ctx.favorites?.has(type.id)) return true;
  const count = ctx.counts?.get(type.id);
  if (typeof count === 'number' && count > 0) return true;
  return false;
}

/**
 * Comparator: prominent first, then by count desc (when available),
 * then by display name alphabetically. Use with `Array.prototype.sort`
 * over an `ObjectType[]` or a `[typeId, items]` tuple via a wrapper.
 */
export function compareTypesByProminence(
  ctx: ProminenceContext = {},
): (left: ObjectType, right: ObjectType) => number {
  return (left, right) => {
    const leftDead = isDead(left);
    const rightDead = isDead(right);
    if (leftDead !== rightDead) return leftDead ? 1 : -1;
    const leftProminent = isProminentType(left, ctx);
    const rightProminent = isProminentType(right, ctx);
    if (leftProminent !== rightProminent) return leftProminent ? -1 : 1;
    const leftCount = ctx.counts?.get(left.id) ?? 0;
    const rightCount = ctx.counts?.get(right.id) ?? 0;
    if (leftCount !== rightCount) return rightCount - leftCount;
    return (left.display_name || left.name).localeCompare(right.display_name || right.name);
  };
}

function isDead(type: ObjectType): boolean {
  const status = (type.status ?? '').toLowerCase();
  if (status === 'deprecated') return true;
  if ((type.visibility ?? '').toLowerCase() === 'hidden') return true;
  return false;
}
