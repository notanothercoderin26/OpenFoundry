import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { objectExplorerLinkedTargetForType, type LinkType, type ObjectType } from '@/lib/api/ontology';

import { iconBackground } from '../iconPalette';
import './SearchAroundPopover.css';

export interface SearchAroundOption {
  linkType: LinkType;
  targetTypeId: string;
  targetType: ObjectType | null;
  label: string;
}

export interface SearchAroundPopoverProps {
  anchor: HTMLElement | null;
  sourceObjectTypeId: string | null | undefined;
  linkTypes: LinkType[];
  typeById: Map<string, ObjectType>;
  onSelect: (option: SearchAroundOption) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT_CAP = 360;
const ANCHOR_GAP = 6;

export function SearchAroundPopover({
  anchor,
  sourceObjectTypeId,
  linkTypes,
  typeById,
  onSelect,
  onClose,
}: SearchAroundPopoverProps) {
  const [filterText, setFilterText] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => buildOptions(sourceObjectTypeId, linkTypes, typeById), [
    sourceObjectTypeId,
    linkTypes,
    typeById,
  ]);
  const filtered = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [filterText, options]);

  useEffect(() => {
    setFilterText('');
    setActiveIndex(0);
  }, [sourceObjectTypeId, anchor]);

  useEffect(() => {
    if (anchor) inputRef.current?.focus();
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anchor, onClose]);

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      const target = event.target as Node;
      if (containerRef.current.contains(target)) return;
      if (anchor && anchor.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [anchor, onClose]);

  if (!anchor) return null;

  const position = computePosition(anchor.getBoundingClientRect());

  function commitActive() {
    const option = filtered[activeIndex];
    if (option) onSelect(option);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commitActive();
    }
  }

  const popover = (
    <>
      <div className="oe-search-around__backdrop" onMouseDown={onClose} />
      <div
        className="oe oe-search-around"
        ref={containerRef}
        style={{ left: position.left, top: position.top }}
        role="dialog"
        aria-label="Search around"
      >
        <div className="oe-search-around__search">
          <span className="oe-search-around__search-icon" aria-hidden="true">
            <SearchGlyph />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="oe-search-around__search-input"
            placeholder="Select a type below or type to filter"
            value={filterText}
            onChange={(event) => {
              setFilterText(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="oe-search-around__empty">
            {options.length === 0 ? 'No linked types available.' : 'No matching link types.'}
          </p>
        ) : (
          <ul className="oe-search-around__list" role="listbox">
            {filtered.map((option, index) => (
              <li key={option.linkType.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className="oe-search-around__row"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(option)}
                >
                  <span
                    className="oe-search-around__row-icon"
                    style={{ background: iconBackground(option.targetTypeId, option.targetType?.color ?? null) }}
                    aria-hidden="true"
                  >
                    {initialFor(option.label)}
                  </span>
                  <span className="oe-search-around__row-label">{option.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return createPortal(popover, document.body);
}

function buildOptions(
  sourceObjectTypeId: string | null | undefined,
  linkTypes: LinkType[],
  typeById: Map<string, ObjectType>,
): SearchAroundOption[] {
  if (!sourceObjectTypeId) return [];
  const out: SearchAroundOption[] = [];
  const seen = new Set<string>();
  for (const linkType of linkTypes) {
    const context = objectExplorerLinkedTargetForType(linkType, sourceObjectTypeId);
    if (!context) continue;
    if (seen.has(linkType.id)) continue;
    seen.add(linkType.id);
    const targetType = typeById.get(context.target_object_type_id) ?? null;
    const label = linkType.display_name || linkType.name || targetType?.display_name || context.target_object_type_id;
    out.push({
      linkType,
      targetTypeId: context.target_object_type_id,
      targetType,
      label,
    });
  }
  return out.sort((left, right) => left.label.localeCompare(right.label));
}

function computePosition(rect: DOMRect) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  let left = rect.right + ANCHOR_GAP;
  if (left + POPOVER_WIDTH > viewportWidth - 8) {
    left = Math.max(8, rect.left - POPOVER_WIDTH - ANCHOR_GAP);
  }
  let top = rect.top;
  if (top + POPOVER_HEIGHT_CAP > viewportHeight - 8) {
    top = Math.max(8, viewportHeight - POPOVER_HEIGHT_CAP - 8);
  }
  return { left, top };
}

function initialFor(value: string) {
  const cleaned = (value || '?').replace(/^\[[^\]]+\]\s*/, '').trim();
  return (cleaned.charAt(0) || '?').toUpperCase();
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
