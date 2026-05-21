import { useEffect, useMemo, useRef, useState } from 'react';

import type { buildObjectExplorerTypeGroups, ObjectType } from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import './ScopeFilter.css';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

export interface ScopeFilterProps {
  groups: ExplorerGroup[];
  visibleObjectTypes: ObjectType[];
  selectedTypeIds: Set<string>;
  onChangeSelected: (next: Set<string>) => void;
  /** Per-type result count. Used both for the trailing count column
   *  and to size the proportion bar; omit to hide both. */
  countsByType?: Map<string, number>;
  /** Number of type rows visible before "Show more" is shown. */
  initialTypePageSize?: number;
}

type ScopeTab = 'groups' | 'types';

const DEFAULT_PAGE_SIZE = 10;
const MAX_GROUP_MEMBER_PREVIEW = 4;

export function ScopeFilter({
  groups,
  visibleObjectTypes,
  selectedTypeIds,
  onChangeSelected,
  countsByType,
  initialTypePageSize = DEFAULT_PAGE_SIZE,
}: ScopeFilterProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ScopeTab>('groups');
  const [filterText, setFilterText] = useState('');
  const [showAllTypes, setShowAllTypes] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary =
    selectedTypeIds.size === 0
      ? 'All'
      : selectedTypeIds.size === 1
      ? visibleObjectTypes.find((type) => selectedTypeIds.has(type.id))?.display_name ?? '1 selected'
      : `${selectedTypeIds.size} selected`;

  function toggleType(typeId: string) {
    const next = new Set(selectedTypeIds);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    onChangeSelected(next);
  }

  function toggleGroup(group: ExplorerGroup) {
    const next = new Set(selectedTypeIds);
    const groupTypeIds = group.object_types.map((type) => type.id);
    const allIn = groupTypeIds.length > 0 && groupTypeIds.every((id) => next.has(id));
    if (allIn) groupTypeIds.forEach((id) => next.delete(id));
    else groupTypeIds.forEach((id) => next.add(id));
    onChangeSelected(next);
  }

  const filteredTypes = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    const sorted = countsByType
      ? [...visibleObjectTypes].sort(
          (left, right) => (countsByType.get(right.id) ?? 0) - (countsByType.get(left.id) ?? 0),
        )
      : visibleObjectTypes;
    if (!needle) return sorted;
    return sorted.filter(
      (type) =>
        (type.display_name || '').toLowerCase().includes(needle) ||
        type.name.toLowerCase().includes(needle),
    );
  }, [filterText, visibleObjectTypes, countsByType]);

  const maxCount = useMemo(() => {
    if (!countsByType) return 0;
    let max = 0;
    for (const value of countsByType.values()) {
      if (value > max) max = value;
    }
    return max;
  }, [countsByType]);

  const typeRows = showAllTypes ? filteredTypes : filteredTypes.slice(0, initialTypePageSize);
  const hasMore = filteredTypes.length > typeRows.length;

  return (
    <div ref={containerRef} className="oe-scope">
      <button
        type="button"
        className="oe-scope__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="oe-scope__trigger-label" title={summary}>
          {summary}
        </span>
        <CaretDownGlyph className="oe-scope__trigger-caret" />
      </button>

      {open && (
        <div className="oe-popover oe-scope__popover" role="dialog" aria-label="Search scope">
          <header className="oe-scope__header">
            <span className="oe-scope__title">
              {selectedTypeIds.size === 0 ? 'Searching all objects' : 'Searching selected'}
            </span>
            <button
              type="button"
              className="oe-scope__clear"
              onClick={() => onChangeSelected(new Set())}
              disabled={selectedTypeIds.size === 0}
            >
              Remove all filters
            </button>
          </header>

          <div className="oe-scope__subtabs" role="tablist" aria-label="Scope filter mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'groups'}
              className="oe-scope__subtab"
              onClick={() => setTab('groups')}
            >
              Groups
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'types'}
              className="oe-scope__subtab"
              onClick={() => setTab('types')}
            >
              Object types
            </button>
          </div>

          {tab === 'types' && (
            <input
              type="text"
              className="oe-scope__search"
              placeholder="Type to search an object type…"
              value={filterText}
              onChange={(event) => {
                setFilterText(event.target.value);
                setShowAllTypes(false);
              }}
              autoFocus
            />
          )}

          {tab === 'groups' ? (
            <ul className="oe-scope__list">
              {groups.length === 0 && <li className="oe-scope__empty">No groups available.</li>}
              {groups.map((group) => {
                const groupTypeIds = group.object_types.map((type) => type.id);
                const fullySelected =
                  groupTypeIds.length > 0 && groupTypeIds.every((id) => selectedTypeIds.has(id));
                const membersPreview = group.object_types
                  .slice(0, MAX_GROUP_MEMBER_PREVIEW)
                  .map((type) => type.display_name || type.name)
                  .join(', ');
                const overflow = group.object_types.length - MAX_GROUP_MEMBER_PREVIEW;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      className="oe-scope__group"
                      data-selected={fullySelected}
                      onClick={() => toggleGroup(group)}
                    >
                      <span className="oe-scope__group-title">{group.display_name}</span>
                      {group.object_types.length > 0 && (
                        <span className="oe-scope__group-members">
                          {membersPreview}
                          {overflow > 0 ? `, …` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <ul className="oe-scope__list">
                {typeRows.length === 0 && <li className="oe-scope__empty">No matching types.</li>}
                {typeRows.map((type) => {
                  const isSelected = selectedTypeIds.has(type.id);
                  const count = countsByType?.get(type.id);
                  const barWidth = maxCount > 0 && count !== undefined ? Math.max(2, (count / maxCount) * 100) : 0;
                  return (
                    <li key={type.id}>
                      <button
                        type="button"
                        className="oe-scope__type"
                        data-selected={isSelected}
                        onClick={() => toggleType(type.id)}
                      >
                        <span
                          className="oe-scope__type-icon"
                          style={{ background: iconBackground(type.id, type.color) }}
                          aria-hidden="true"
                        >
                          {initialFor(type)}
                        </span>
                        <span className="oe-scope__type-label">{type.display_name || type.name}</span>
                        <span className="oe-scope__type-count">{count !== undefined ? formatCount(count) : ''}</span>
                        <span className="oe-scope__type-bar" aria-hidden="true">
                          {barWidth > 0 && (
                            <span className="oe-scope__type-bar-fill" style={{ width: `${barWidth}%` }} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <button type="button" className="oe-scope__more" onClick={() => setShowAllTypes(true)}>
                  Show more ▾
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function initialFor(type: ObjectType) {
  const source = (type.display_name || type.name || '?').replace(/^\[[^\]]+\]\s*/, '');
  return (source.charAt(0) || '?').toUpperCase();
}

function formatCount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace(/\.?0+$/, '')}k`;
  return `${value}`;
}

function CaretDownGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
