import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import type { ListingDefinition, PackageType } from '@/lib/api/marketplace';

interface Props {
  listing: ListingDefinition;
  selected?: boolean;
  score: number | null;
  onSelect: () => void;
}

const KIND_META: Record<PackageType, { glyph: GlyphName; tone: string; label: string; bg: string }> = {
  connector: { glyph: 'link', tone: '#0e7490', label: 'Connector', bg: '#ecfeff' },
  transform: { glyph: 'code', tone: '#16a34a', label: 'Transform', bg: '#ecfdf5' },
  widget: { glyph: 'app', tone: '#7c3aed', label: 'Widget', bg: '#f3e8ff' },
  app_template: { glyph: 'app', tone: '#1f5ea8', label: 'App template', bg: '#e8f1ff' },
  ml_model: { glyph: 'cube', tone: '#0ea5e9', label: 'ML model', bg: '#e0f2fe' },
  ai_agent: { glyph: 'sparkles', tone: '#db2777', label: 'AI agent', bg: '#fce7f3' },
};

function ratingStars(value: number) {
  const filled = Math.round(value);
  return '★★★★★'.slice(0, filled).padEnd(5, '☆');
}

export function ListingCard({ listing, selected = false, score, onSelect }: Props) {
  const meta = KIND_META[listing.package_kind] ?? KIND_META.widget;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="of-card"
      style={{
        textAlign: 'left',
        padding: 12,
        gap: 10,
        cursor: 'pointer',
        border: `1px solid ${selected ? '#1f5ea8' : 'var(--border-default)'}`,
        background: selected ? '#f5f9ff' : 'var(--bg-panel)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 4,
            background: meta.bg,
            border: `1px solid ${meta.tone}33`,
            flexShrink: 0,
          }}
        >
          <Glyph name={meta.glyph} size={20} tone={meta.tone} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
            <p
              style={{
                margin: 0,
                color: 'var(--text-strong)',
                fontWeight: 600,
                fontSize: 13.5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={listing.name}
            >
              {listing.name}
            </p>
            {score !== null && (
              <span
                className="of-chip"
                style={{
                  background: 'var(--status-info-bg)',
                  color: 'var(--status-info)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  padding: '0 6px',
                  minHeight: 18,
                }}
              >
                {score.toFixed(2)}
              </span>
            )}
          </div>
          <p
            className="of-text-muted"
            style={{ margin: '2px 0 0', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={`${listing.publisher} · ${meta.label}`}
          >
            {listing.publisher} · {meta.label}
          </p>
        </div>
      </div>

      <p
        className="of-text-muted"
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.45,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {listing.summary}
      </p>

      {listing.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {listing.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="of-chip" style={{ minHeight: 20, padding: '0 6px', fontSize: 11 }}>
              {tag}
            </span>
          ))}
          {listing.tags.length > 4 && (
            <span className="of-chip" style={{ minHeight: 20, padding: '0 6px', fontSize: 11 }}>
              +{listing.tags.length - 4}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginTop: 'auto',
          paddingTop: 6,
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          fontSize: 11.5,
        }}
      >
        <span>{listing.install_count.toLocaleString()} installs</span>
        <span style={{ color: '#b45309', letterSpacing: 1 }} title={`${listing.average_rating.toFixed(1)} / 5`}>
          {ratingStars(listing.average_rating)}
        </span>
        <span style={{ color: 'var(--text-link)', fontWeight: 600 }}>View →</span>
      </div>
    </button>
  );
}
