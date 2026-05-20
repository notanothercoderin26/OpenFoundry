import { useMemo, useRef, useState, useEffect } from 'react';

import type { ObjectType } from '@/lib/api/ontology';
import type { buildObjectExplorerTypeGroups } from '@/lib/api/ontology';

type ExplorerGroup = ReturnType<typeof buildObjectExplorerTypeGroups>[number];

interface ScopeFilterProps {
  groups: ExplorerGroup[];
  visibleObjectTypes: ObjectType[];
  selectedTypeIds: Set<string>;
  onChangeSelected: (next: Set<string>) => void;
}

type ScopeTab = 'groups' | 'types';

export function ScopeFilter({ groups, visibleObjectTypes, selectedTypeIds, onChangeSelected }: ScopeFilterProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ScopeTab>('groups');
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const summary = selectedTypeIds.size === 0
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
    const allIn = groupTypeIds.every((id) => next.has(id));
    if (allIn) groupTypeIds.forEach((id) => next.delete(id));
    else groupTypeIds.forEach((id) => next.add(id));
    onChangeSelected(next);
  }

  const filteredTypes = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) return visibleObjectTypes;
    return visibleObjectTypes.filter((type) =>
      (type.display_name || '').toLowerCase().includes(needle)
      || type.name.toLowerCase().includes(needle),
    );
  }, [filterText, visibleObjectTypes]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="of-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
          {summary}
        </span>
        <span aria-hidden style={{ fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          className="of-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            width: 'min(360px, calc(100vw - 32px))',
            zIndex: 30,
            padding: 10,
            display: 'grid',
            gap: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>
              {selectedTypeIds.size === 0 ? 'Searching all objects' : 'Searching selected'}
            </p>
            <button
              type="button"
              className="of-button of-button--ghost"
              onClick={() => onChangeSelected(new Set())}
              disabled={selectedTypeIds.size === 0}
              style={{ fontSize: 12 }}
            >
              Remove all filters
            </button>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={tab === 'groups' ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
              onClick={() => setTab('groups')}
            >
              Groups
            </button>
            <button
              type="button"
              className={tab === 'types' ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
              onClick={() => setTab('types')}
            >
              Object types
            </button>
          </div>

          {tab === 'types' && (
            <input
              className="of-input"
              placeholder="Type to search an object type…"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
            />
          )}

          <div style={{ display: 'grid', gap: 4, maxHeight: 280, overflow: 'auto' }}>
            {tab === 'groups'
              ? groups.map((group) => {
                  const groupTypeIds = group.object_types.map((type) => type.id);
                  const selectedCount = groupTypeIds.filter((id) => selectedTypeIds.has(id)).length;
                  const fullySelected = selectedCount === groupTypeIds.length && groupTypeIds.length > 0;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className={fullySelected ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
                      style={{ justifyContent: 'space-between', textAlign: 'left', minHeight: 32, padding: '4px 8px' }}
                    >
                      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {group.display_name}
                        </span>
                        {group.description && (
                          <span className="of-text-muted" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {group.description}
                          </span>
                        )}
                      </span>
                      <span className="of-chip">
                        {selectedCount > 0 ? `${selectedCount}/${groupTypeIds.length}` : groupTypeIds.length}
                      </span>
                    </button>
                  );
                })
              : filteredTypes.map((type) => {
                  const isSelected = selectedTypeIds.has(type.id);
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => toggleType(type.id)}
                      className={isSelected ? 'of-button of-button--primary' : 'of-button of-button--ghost'}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 28, padding: '4px 8px' }}
                    >
                      <span aria-hidden style={{ marginRight: 6 }}>{isSelected ? '☑' : '☐'}</span>
                      {type.display_name || type.name}
                    </button>
                  );
                })}
            {tab === 'types' && filteredTypes.length === 0 && (
              <p className="of-text-muted" style={{ fontSize: 12, margin: '4px 8px' }}>No matching types.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
