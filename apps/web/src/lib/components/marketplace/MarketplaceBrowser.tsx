import type { CategoryDefinition, ListingDefinition, MarketplaceOverview } from '@/lib/api/marketplace';
import { Glyph } from '@/lib/components/ui/Glyph';
import { ListingCard } from './ListingCard';

interface Props {
  overview: MarketplaceOverview | null;
  categories: CategoryDefinition[];
  listings: ListingDefinition[];
  selectedListingId: string;
  searchQuery: string;
  selectedCategory: string;
  scoreById: Record<string, number>;
  busy?: boolean;
  onSearchQueryChange: (query: string) => void;
  onCategoryChange: (category: string) => void;
  onSearch: () => void;
  onSelectListing: (listingId: string) => void;
}

export function MarketplaceBrowser({
  overview: _overview,
  categories,
  listings,
  selectedListingId,
  searchQuery,
  selectedCategory,
  scoreById,
  busy = false,
  onSearchQueryChange,
  onCategoryChange,
  onSearch,
  onSelectListing,
}: Props) {
  const totalListings = categories.reduce((sum, cat) => sum + cat.listing_count, 0);
  return (
    <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-panel-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="of-section-title">All listings</span>
          <span className="of-badge">{listings.length}</span>
        </div>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          {totalListings} catalogued across {categories.length} categories
        </span>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 8px',
            background: 'var(--bg-input)',
          }}
        >
          <Glyph name="search" size={14} tone="var(--text-muted)" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
            placeholder="Search listings, publishers, capabilities…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              padding: '6px 0',
              fontSize: 13,
              background: 'transparent',
              color: 'var(--text-strong)',
            }}
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="of-select"
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name} ({category.listing_count})
            </option>
          ))}
        </select>
        <button type="button" onClick={onSearch} disabled={busy} className="of-btn-primary">
          Search
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', minHeight: 360 }}>
        <aside
          style={{
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-muted)',
            padding: '10px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <p className="of-eyebrow" style={{ padding: '4px 8px' }}>
            Categories
          </p>
          <button
            type="button"
            onClick={() => onCategoryChange('all')}
            className={selectedCategory === 'all' ? 'of-tab of-tab-active' : 'of-tab'}
            style={{
              justifyContent: 'space-between',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              borderBottom: 0,
              padding: '6px 10px',
              fontSize: 13,
              borderRadius: 'var(--radius-sm)',
              background: selectedCategory === 'all' ? 'var(--bg-chip-active)' : 'transparent',
              color: selectedCategory === 'all' ? 'var(--status-info)' : 'var(--text-default)',
            }}
          >
            <span>All categories</span>
            <span className="of-badge">{totalListings}</span>
          </button>
          {categories.map((category) => {
            const active = selectedCategory === category.slug;
            return (
              <button
                key={category.slug}
                type="button"
                onClick={() => onCategoryChange(category.slug)}
                title={category.description}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  border: 0,
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--bg-chip-active)' : 'transparent',
                  color: active ? 'var(--status-info)' : 'var(--text-default)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.name}</span>
                <span className="of-badge">{category.listing_count}</span>
              </button>
            );
          })}
        </aside>

        <div style={{ padding: 12, background: 'var(--bg-canvas)' }}>
          {listings.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                alignItems: 'stretch',
              }}
            >
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  selected={selectedListingId === listing.id}
                  score={scoreById[listing.id] ?? null}
                  onSelect={() => onSelectListing(listing.id)}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                border: '1px dashed var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 32,
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--text-muted)',
                background: 'var(--bg-panel)',
              }}
            >
              No listings match the current filters.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
