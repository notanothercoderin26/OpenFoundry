// Foundry's PreviewTab renders different shapes depending on the resource
// type. For media sets we list the first few items in the set and render
// each according to its MIME type: PDFs as iframe thumbnails (matching
// Foundry's grid layout), audio with an inline <audio> player, images as
// thumbnails, and a fallback row for everything else (csv, json, ...).

import { useEffect, useState, type CSSProperties } from 'react';

import { getDownloadUrl, listItems, type MediaItem } from '@/lib/api/mediaSets';

interface MediaSetPreviewProps {
  mediaSetRid: string;
  branch?: string;
  /** Per-page item cap; Foundry caps the in-panel grid at ~12. */
  limit?: number;
}

interface PreviewableItem {
  item: MediaItem;
  url: string | null;
}

type Category = 'pdf' | 'audio' | 'image' | 'video' | 'text' | 'other';

function categorize(mime: string): Category {
  if (!mime) return 'other';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv') return 'text';
  return 'other';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function MediaSetPreview({ mediaSetRid, branch, limit = 12 }: MediaSetPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewableItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    (async () => {
      try {
        const list = await listItems(mediaSetRid, { branch, limit });
        if (cancelled) return;
        const enriched: PreviewableItem[] = list.map((item) => ({ item, url: null }));
        setItems(enriched);
        // Fetch download URLs in parallel; non-fatal if a URL fails.
        const urlResults = await Promise.allSettled(
          list.map((item) => getDownloadUrl(item.rid, { expires_in_seconds: 600 })),
        );
        if (cancelled) return;
        setItems((prev) =>
          prev.map((row, idx) => {
            const result = urlResults[idx];
            if (result.status === 'fulfilled') return { ...row, url: result.value.url };
            return row;
          }),
        );
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load media items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaSetRid, branch, limit]);

  if (loading && items.length === 0) {
    return <div style={hint}>Loading media items…</div>;
  }
  if (error) {
    return <div style={errorBanner}>{error}</div>;
  }
  if (items.length === 0) {
    return <div style={hint}>No media items in this set.</div>;
  }

  const pdfItems = items.filter((row) => categorize(row.item.mime_type) === 'pdf');
  const audioItems = items.filter((row) => categorize(row.item.mime_type) === 'audio');
  const imageItems = items.filter((row) => categorize(row.item.mime_type) === 'image');
  const videoItems = items.filter((row) => categorize(row.item.mime_type) === 'video');
  const otherItems = items.filter((row) =>
    ['text', 'other'].includes(categorize(row.item.mime_type)),
  );

  return (
    <div style={panelRoot}>
      {pdfItems.length > 0 && (
        <section style={section}>
          <h4 style={sectionTitle}>PDF documents ({pdfItems.length})</h4>
          <div style={pdfGrid}>
            {pdfItems.map(({ item, url }) => (
              <article key={item.rid} style={pdfCard}>
                {url ? (
                  <iframe
                    title={item.path}
                    src={`${url}#toolbar=0&navpanes=0`}
                    style={pdfFrame}
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : (
                  <div style={pdfPlaceholder}>Generating preview…</div>
                )}
                <div style={pdfCaption} title={item.path}>{basename(item.path)}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      {audioItems.length > 0 && (
        <section style={section}>
          <h4 style={sectionTitle}>Audio files ({audioItems.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {audioItems.map(({ item, url }) => (
              <article key={item.rid} style={audioRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={audioName} title={item.path}>{basename(item.path)}</div>
                  <div style={audioMeta}>
                    {item.mime_type} · {formatSize(item.size_bytes)}
                  </div>
                </div>
                {url ? (
                  <audio controls src={url} preload="metadata" style={{ width: 360, maxWidth: '100%' }}>
                    <track kind="captions" />
                  </audio>
                ) : (
                  <div className="of-text-muted" style={{ fontSize: 11 }}>Generating URL…</div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {imageItems.length > 0 && (
        <section style={section}>
          <h4 style={sectionTitle}>Images ({imageItems.length})</h4>
          <div style={imageGrid}>
            {imageItems.map(({ item, url }) => (
              <article key={item.rid} style={imageCard}>
                {url ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img src={url} alt={basename(item.path)} style={imageFrame} />
                ) : (
                  <div style={pdfPlaceholder}>Generating preview…</div>
                )}
                <div style={pdfCaption} title={item.path}>{basename(item.path)}</div>
              </article>
            ))}
          </div>
        </section>
      )}

      {videoItems.length > 0 && (
        <section style={section}>
          <h4 style={sectionTitle}>Videos ({videoItems.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {videoItems.map(({ item, url }) => (
              <article key={item.rid} style={audioRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={audioName} title={item.path}>{basename(item.path)}</div>
                  <div style={audioMeta}>
                    {item.mime_type} · {formatSize(item.size_bytes)}
                  </div>
                </div>
                {url && (
                  <video controls src={url} preload="metadata" style={{ width: 360, maxWidth: '100%' }} />
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {otherItems.length > 0 && (
        <section style={section}>
          <h4 style={sectionTitle}>Other ({otherItems.length})</h4>
          <ul style={otherList}>
            {otherItems.map(({ item, url }) => (
              <li key={item.rid} style={otherRow}>
                <div style={{ minWidth: 0 }}>
                  <div style={audioName} title={item.path}>{basename(item.path)}</div>
                  <div style={audioMeta}>{item.mime_type} · {formatSize(item.size_bytes)}</div>
                </div>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" style={downloadLink}>Download</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const hint: CSSProperties = {
  padding: 12,
  fontSize: 12,
  color: 'var(--text-muted)',
};
const errorBanner: CSSProperties = {
  padding: 12,
  fontSize: 12,
  color: 'var(--status-danger)',
};
const panelRoot: CSSProperties = {
  height: '100%',
  overflow: 'auto',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const section: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const pdfGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 12,
};
const pdfCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  background: '#fafbfc',
};
const pdfFrame: CSSProperties = {
  width: '100%',
  height: 220,
  border: 'none',
  background: '#fff',
};
const pdfPlaceholder: CSSProperties = {
  width: '100%',
  height: 220,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-canvas)',
  color: 'var(--text-muted)',
  fontSize: 11,
};
const pdfCaption: CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: 'var(--text-default)',
  borderTop: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const audioRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: 8,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};
const audioName: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-default)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 320,
};
const audioMeta: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  marginTop: 2,
};
const imageGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: 8,
};
const imageCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  background: '#fff',
};
const imageFrame: CSSProperties = {
  width: '100%',
  height: 120,
  objectFit: 'cover',
  display: 'block',
};
const otherList: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const otherRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '6px 8px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
};
const downloadLink: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-link)',
  textDecoration: 'none',
};
