import { useState } from 'react';

import type { CatalogOwnerFacet, CatalogTagFacet } from '@/lib/api/datasets';

interface DatasetCatalogFacetsProps {
  tags: CatalogTagFacet[];
  owners: CatalogOwnerFacet[];
  formats: { value: string; count: number }[];
  selectedTag: string;
  selectedOwner: string;
  selectedFormat: string;
  onTagChange: (tag: string) => void;
  onOwnerChange: (ownerId: string) => void;
  onFormatChange: (format: string) => void;
  disabled?: boolean;
}

export function DatasetCatalogFacets({
  tags,
  owners,
  formats,
  selectedTag,
  selectedOwner,
  selectedFormat,
  onTagChange,
  onOwnerChange,
  onFormatChange,
  disabled = false,
}: DatasetCatalogFacetsProps) {
  const [tagsOpen, setTagsOpen] = useState(true);
  const [typeOpen, setTypeOpen] = useState(true);
  const [ownersOpen, setOwnersOpen] = useState(false);

  return (
    <aside className="of-catalog-filters">
      <p className="of-catalog-filters__heading">Filters</p>

      <FilterGroup label="Tags" open={tagsOpen} onToggle={() => setTagsOpen((v) => !v)}>
        {tags.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', fontSize: 11, padding: '4px 6px', margin: 0 }}>No tags indexed yet.</p>
        ) : (
          tags.slice(0, 16).map((tag) => (
            <FilterItem
              key={tag.value}
              active={selectedTag === tag.value}
              count={tag.count}
              disabled={disabled}
              onClick={() => onTagChange(selectedTag === tag.value ? '' : tag.value)}
            >
              {tag.value}
            </FilterItem>
          ))
        )}
      </FilterGroup>

      <FilterGroup label="Type" open={typeOpen} onToggle={() => setTypeOpen((v) => !v)}>
        {formats.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', fontSize: 11, padding: '4px 6px', margin: 0 }}>No formats yet.</p>
        ) : (
          formats.slice(0, 12).map((format) => (
            <FilterItem
              key={format.value}
              active={selectedFormat === format.value}
              count={format.count}
              disabled={disabled}
              onClick={() => onFormatChange(selectedFormat === format.value ? '' : format.value)}
            >
              {format.value}
            </FilterItem>
          ))
        )}
      </FilterGroup>

      <FilterGroup label="Owner" open={ownersOpen} onToggle={() => setOwnersOpen((v) => !v)}>
        {owners.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', fontSize: 11, padding: '4px 6px', margin: 0 }}>No owners indexed yet.</p>
        ) : (
          owners.slice(0, 12).map((owner) => (
            <FilterItem
              key={owner.owner_id}
              active={selectedOwner === owner.owner_id}
              count={owner.count}
              disabled={disabled}
              onClick={() => onOwnerChange(selectedOwner === owner.owner_id ? '' : owner.owner_id)}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{shortOwner(owner.owner_id)}</span>
            </FilterItem>
          ))
        )}
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="of-catalog-filter-group">
      <button type="button" className="of-catalog-filter-group__toggle" onClick={onToggle} aria-expanded={open}>
        <span>{label}</span>
        <span className="of-catalog-filter-group__sign" aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open ? <div className="of-catalog-filter-group__list">{children}</div> : null}
    </section>
  );
}

function FilterItem({
  active,
  count,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`of-catalog-filter-item ${active ? 'of-catalog-filter-item--active' : ''}`}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span className="of-catalog-filter-item__count">{count}</span>
    </button>
  );
}

function shortOwner(ownerId: string) {
  return ownerId.length > 18 ? `${ownerId.slice(0, 8)}...${ownerId.slice(-6)}` : ownerId;
}
