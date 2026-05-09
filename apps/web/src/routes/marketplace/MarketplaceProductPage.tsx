import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  createInstall,
  createReview,
  getListing,
  listFleets,
  type ListingDetail,
  type PackageVersion,
  type PackagedResource,
  type ProductFleetRecord,
} from '@/lib/api/marketplace';
import {
  previewInstallSchedules,
  type ProductScheduleManifest,
} from '@/lib/api/marketplace-schedules';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

type Section =
  | 'overview'
  | 'versions'
  | 'resources'
  | 'reviews'
  | 'install'
  | 'schedules';

interface SectionDef {
  id: Section;
  label: string;
  icon: GlyphName;
  count?: number;
}

const PACKAGE_GLYPH: Record<string, GlyphName> = {
  connector: 'database',
  transform: 'code',
  widget: 'view-grid',
  app_template: 'app',
  ml_model: 'sparkles',
  ai_agent: 'sparkles',
};

function formatDate(input: string | null | undefined) {
  if (!input) return '—';
  try {
    return new Date(input).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return input;
  }
}

function fullStars(rating: number) {
  return Math.max(0, Math.min(5, Math.round(rating)));
}

export function MarketplaceProductPage() {
  const params = useParams();
  const navigate = useNavigate();
  const productId = params.id ?? '';

  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [fleets, setFleets] = useState<ProductFleetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [selectedResource, setSelectedResource] = useState<PackagedResource | null>(null);

  const [installVersion, setInstallVersion] = useState('');
  const [installWorkspace, setInstallWorkspace] = useState('OpenFoundry Workspace');
  const [installChannel, setInstallChannel] = useState('stable');
  const [installFleetId, setInstallFleetId] = useState('');
  const [installBranch, setInstallBranch] = useState('');

  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewRating, setReviewRating] = useState('5');
  const [reviewHeadline, setReviewHeadline] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewRecommended, setReviewRecommended] = useState(true);

  const [productVersionId, setProductVersionId] = useState('');
  const [manifests, setManifests] = useState<ProductScheduleManifest[]>([]);
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [materialised, setMaterialised] = useState<ProductScheduleManifest[] | null>(null);

  async function refresh() {
    if (!productId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [listingResp, fleetsResp] = await Promise.all([getListing(productId), listFleets()]);
      setDetail(listingResp);
      setFleets(fleetsResp.items);
      const initialVersion =
        listingResp.latest_version?.version ?? listingResp.versions[0]?.version ?? '';
      setSelectedVersion(initialVersion);
      setInstallVersion(initialVersion);
      setInstallChannel(
        listingResp.latest_version?.release_channel ??
          listingResp.versions[0]?.release_channel ??
          'stable',
      );
      const fleetForListing = fleetsResp.items.find((f) => f.listing_id === listingResp.listing.id);
      if (fleetForListing) setInstallFleetId(fleetForListing.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load marketplace product';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const versions = detail?.versions ?? [];
  const resolvedVersion: PackageVersion | null = useMemo(() => {
    if (!detail) return null;
    return (
      detail.versions.find((v) => v.version === selectedVersion) ??
      detail.latest_version ??
      detail.versions[0] ??
      null
    );
  }, [detail, selectedVersion]);

  const sections: SectionDef[] = [
    { id: 'overview', label: 'Overview', icon: 'document' },
    { id: 'versions', label: 'Versions', icon: 'history', count: versions.length },
    {
      id: 'resources',
      label: 'Resources',
      icon: 'cube',
      count: resolvedVersion?.packaged_resources.length ?? 0,
    },
    { id: 'reviews', label: 'Reviews', icon: 'star', count: detail?.reviews.length ?? 0 },
    { id: 'install', label: 'Install', icon: 'shield-plus' },
    { id: 'schedules', label: 'Schedules', icon: 'autosaved' },
  ];

  async function installPackage() {
    if (!detail) return;
    setBusy('install');
    setErrorMsg(null);
    try {
      await createInstall({
        listing_id: detail.listing.id,
        version: installVersion,
        workspace_name: installWorkspace,
        release_channel: installChannel,
        fleet_id: installFleetId || null,
        enrollment_branch: installBranch || null,
      });
      notifications.success(`Installed ${detail.listing.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to install package';
      setErrorMsg(message);
      notifications.error(message);
    } finally {
      setBusy('');
    }
  }

  async function publishReview() {
    if (!detail) return;
    setBusy('review');
    setErrorMsg(null);
    try {
      await createReview(detail.listing.id, {
        author: reviewAuthor || 'Anonymous',
        rating: Number(reviewRating) || 0,
        headline: reviewHeadline,
        body: reviewBody,
        recommended: reviewRecommended,
      });
      setReviewHeadline('');
      setReviewBody('');
      await refresh();
      notifications.success('Published review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to publish review';
      setErrorMsg(message);
      notifications.error(message);
    } finally {
      setBusy('');
    }
  }

  async function previewSchedules() {
    setErrorMsg(null);
    try {
      const res = await previewInstallSchedules(productId, {
        product_version_id: productVersionId,
        activate_manifests: Array.from(activated),
      });
      setMaterialised(res.materialised);
      setManifests(res.materialised);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleManifest(name: string) {
    setActivated((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading && !detail) {
    return (
      <main className="of-page" data-testid="marketplace-product-page">
        <p className="of-text-muted" style={{ padding: 24 }}>
          Loading product…
        </p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="of-page" data-testid="marketplace-product-page">
        <div
          className="of-panel"
          style={{ padding: 24, margin: 24, display: 'grid', gap: 12 }}
        >
          <h1 className="of-heading-lg">Marketplace product not found</h1>
          <p className="of-text-muted">
            We could not load <code style={{ fontFamily: 'var(--font-mono)' }}>{productId}</code>.
          </p>
          {errorMsg && (
            <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {errorMsg}
            </div>
          )}
          <Link to="/marketplace" className="of-button" style={{ width: 'fit-content' }}>
            Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  const listing = detail.listing;
  const packageGlyph: GlyphName = PACKAGE_GLYPH[listing.package_kind] ?? 'cube';

  return (
    <main
      className="of-page"
      data-testid="marketplace-product-page"
      style={{ display: 'grid', gap: 10 }}
    >
      {/* Top bar with breadcrumb and primary actions */}
      <div
        className="of-toolbar"
        style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <button
            type="button"
            className="of-btn-ghost of-button"
            onClick={() => navigate('/marketplace')}
            style={{ padding: '0 6px' }}
            aria-label="Back to marketplace"
          >
            <Glyph name="chevron-left" size={16} />
            Back
          </button>
          <span style={{ color: 'var(--text-soft)' }}>·</span>
          <Link to="/marketplace" className="of-link">
            Marketplace
          </Link>
          <Glyph name="chevron-right" size={12} tone="var(--text-soft)" />
          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{listing.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="of-chip of-status-success"
            style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}
          >
            <Glyph name="badge-check" size={12} />
            Ready to publish
          </span>
          <button
            type="button"
            className="of-button"
            onClick={() => setActiveSection('schedules')}
          >
            <Glyph name="autosaved" size={14} />
            Schedules
          </button>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={() => setActiveSection('install')}
          >
            <Glyph name="shield-plus" size={14} />
            Install
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="of-status-danger"
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            border: '1px solid #f3c3c3',
          }}
        >
          {errorMsg}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 300px) minmax(0, 1fr) minmax(0, 320px)',
          gap: 10,
          alignItems: 'start',
        }}
      >
        {/* LEFT: product card + section nav */}
        <aside className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: 14,
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-chip)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
              aria-hidden
            >
              <Glyph name={packageGlyph} size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p
                className="of-eyebrow"
                style={{ marginBottom: 4 }}
                title={listing.publisher}
              >
                {listing.publisher}
              </p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-strong)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={listing.name}
              >
                {listing.name}
              </p>
              <p
                className="of-text-muted"
                style={{ fontSize: 12, marginTop: 2, textTransform: 'capitalize' }}
              >
                {listing.package_kind.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          <nav
            aria-label="Product sections"
            style={{ display: 'flex', flexDirection: 'column', padding: 6 }}
          >
            {sections.map((section) => {
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  data-testid={`section-${section.id}`}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    border: 0,
                    borderRadius: 'var(--radius-sm)',
                    background: active ? 'var(--bg-chip-active)' : 'transparent',
                    color: active ? 'var(--status-info)' : 'var(--text-default)',
                    fontWeight: active ? 600 : 500,
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <Glyph
                    name={section.icon}
                    size={14}
                    tone={active ? 'var(--status-info)' : 'var(--text-muted)'}
                  />
                  <span style={{ flex: 1 }}>{section.label}</span>
                  {typeof section.count === 'number' && section.count > 0 && (
                    <span className="of-badge">{section.count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div
            style={{
              padding: 12,
              borderTop: '1px solid var(--border-subtle)',
              display: 'grid',
              gap: 4,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="of-text-muted">Repository</span>
              <span style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                {listing.repository_slug}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="of-text-muted">Visibility</span>
              <span style={{ color: 'var(--text-strong)', textTransform: 'capitalize' }}>
                {listing.visibility}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="of-text-muted">Updated</span>
              <span style={{ color: 'var(--text-strong)' }}>{formatDate(listing.updated_at)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="of-text-muted">Product ID</span>
              <span
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}
                title={productId}
              >
                {productId.slice(0, 8)}…
              </span>
            </div>
          </div>
        </aside>

        {/* CENTER: section content */}
        <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          {/* Hero */}
          <header
            className="of-panel"
            style={{
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                  Marketplace product
                </p>
                <h1 className="of-heading-xl" style={{ margin: 0 }}>
                  {listing.name}
                </h1>
                <p className="of-text-muted" style={{ marginTop: 6, maxWidth: 720, fontSize: 13 }}>
                  {listing.summary}
                </p>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--bg-panel-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                }}
                aria-label={`Average rating ${listing.average_rating.toFixed(1)} out of 5`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Glyph
                    key={n}
                    name={n <= fullStars(listing.average_rating) ? 'star-filled' : 'star'}
                    size={14}
                    tone={n <= fullStars(listing.average_rating) ? '#d97706' : 'var(--text-soft)'}
                    filled={n <= fullStars(listing.average_rating)}
                  />
                ))}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-strong)',
                  }}
                >
                  {listing.average_rating.toFixed(1)}
                </span>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  ({detail.reviews.length})
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
              }}
            >
              {[
                { label: 'Installs', value: listing.install_count },
                { label: 'Versions', value: versions.length },
                { label: 'Reviews', value: detail.reviews.length },
                { label: 'Capabilities', value: listing.capabilities.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="of-panel-muted"
                  style={{ padding: 10 }}
                >
                  <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                    {stat.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                    }}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </header>

          {activeSection === 'overview' && (
            <OverviewSection detail={detail} resolvedVersion={resolvedVersion} />
          )}

          {activeSection === 'versions' && (
            <VersionsSection
              versions={versions}
              latestVersionId={detail.latest_version?.id ?? null}
              selectedVersion={selectedVersion}
              onSelectVersion={(v) => setSelectedVersion(v)}
            />
          )}

          {activeSection === 'resources' && (
            <ResourcesSection
              version={resolvedVersion}
              versions={versions}
              selectedVersion={selectedVersion}
              onSelectVersion={(v) => setSelectedVersion(v)}
              onSelectResource={(r) => setSelectedResource(r)}
            />
          )}

          {activeSection === 'reviews' && (
            <ReviewsSection
              detail={detail}
              busy={busy === 'review'}
              author={reviewAuthor}
              rating={reviewRating}
              headline={reviewHeadline}
              body={reviewBody}
              recommended={reviewRecommended}
              onAuthorChange={setReviewAuthor}
              onRatingChange={setReviewRating}
              onHeadlineChange={setReviewHeadline}
              onBodyChange={setReviewBody}
              onRecommendedChange={setReviewRecommended}
              onPublish={() => void publishReview()}
            />
          )}

          {activeSection === 'install' && (
            <InstallSection
              versions={versions.map((v) => v.version)}
              fleets={fleets.filter((f) => f.listing_id === listing.id)}
              version={installVersion}
              workspace={installWorkspace}
              channel={installChannel}
              fleetId={installFleetId}
              branch={installBranch}
              busy={busy === 'install'}
              onVersionChange={setInstallVersion}
              onWorkspaceChange={setInstallWorkspace}
              onChannelChange={setInstallChannel}
              onFleetChange={setInstallFleetId}
              onBranchChange={setInstallBranch}
              onInstall={() => void installPackage()}
            />
          )}

          {activeSection === 'schedules' && (
            <SchedulesSection
              productVersionId={productVersionId}
              onProductVersionIdChange={setProductVersionId}
              manifests={manifests}
              activated={activated}
              materialised={materialised}
              onPreview={() => void previewSchedules()}
              onToggle={toggleManifest}
            />
          )}
        </section>

        {/* RIGHT: contextual details drawer */}
        <DetailsDrawer
          listing={listing}
          version={resolvedVersion}
          resource={selectedResource}
          onClearResource={() => setSelectedResource(null)}
        />
      </div>
    </main>
  );
}

/* -------------------- Overview -------------------- */

function OverviewSection({
  detail,
  resolvedVersion,
}: {
  detail: ListingDetail;
  resolvedVersion: PackageVersion | null;
}) {
  const listing = detail.listing;
  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div>
        <p className="of-eyebrow" style={{ marginBottom: 6 }}>
          Description
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.55 }}>
          {listing.description || 'No description provided for this product.'}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <p className="of-eyebrow" style={{ marginBottom: 6 }}>
            Capabilities
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {listing.capabilities.length === 0 ? (
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                None declared
              </span>
            ) : (
              listing.capabilities.map((c) => (
                <span key={c} className="of-chip">
                  {c}
                </span>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="of-eyebrow" style={{ marginBottom: 6 }}>
            Tags
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {listing.tags.length === 0 ? (
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                No tags
              </span>
            ) : (
              listing.tags.map((t) => (
                <span key={t} className="of-chip">
                  #{t}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {resolvedVersion && (
        <div className="of-panel-muted" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                Latest version
              </p>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                {resolvedVersion.version}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <span className="of-chip of-status-info" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                {resolvedVersion.release_channel}
              </span>
              <span className="of-chip" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                {resolvedVersion.dependency_mode}
              </span>
            </div>
          </div>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
            {resolvedVersion.changelog || 'No changelog provided.'}
          </p>
          <p className="of-text-muted" style={{ marginTop: 6, fontSize: 11 }}>
            Published {formatDate(resolvedVersion.published_at)}
          </p>
        </div>
      )}
    </section>
  );
}

/* -------------------- Versions -------------------- */

function VersionsSection({
  versions,
  latestVersionId,
  selectedVersion,
  onSelectVersion,
}: {
  versions: PackageVersion[];
  latestVersionId: string | null;
  selectedVersion: string;
  onSelectVersion: (v: string) => void;
}) {
  if (versions.length === 0) {
    return (
      <section className="of-panel" style={{ padding: 16 }}>
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          No versions published for this product yet.
        </p>
      </section>
    );
  }

  return (
    <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span className="of-section-title">Published versions</span>
          <span className="of-badge" style={{ marginLeft: 8 }}>
            {versions.length}
          </span>
        </div>
      </header>
      <table className="of-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Version</th>
            <th style={{ textAlign: 'left' }}>Channel</th>
            <th style={{ textAlign: 'left' }}>Dependency mode</th>
            <th style={{ textAlign: 'left' }}>Published</th>
            <th style={{ textAlign: 'left' }}>Resources</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const active = version.version === selectedVersion;
            const isLatest = version.id === latestVersionId;
            return (
              <tr
                key={version.id}
                onClick={() => onSelectVersion(version.version)}
                style={{
                  cursor: 'pointer',
                  background: active ? 'var(--bg-chip-active)' : 'transparent',
                }}
              >
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)', fontWeight: 600 }}>
                    {version.version}
                  </span>
                  {isLatest && (
                    <span
                      className="of-chip of-status-success"
                      style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                    >
                      latest
                    </span>
                  )}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="of-chip" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
                    {version.release_channel}
                  </span>
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ textTransform: 'capitalize' }}>{version.dependency_mode}</span>
                </td>
                <td
                  style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  {formatDate(version.published_at)}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  {version.packaged_resources.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* -------------------- Resources -------------------- */

function ResourcesSection({
  version,
  versions,
  selectedVersion,
  onSelectVersion,
  onSelectResource,
}: {
  version: PackageVersion | null;
  versions: PackageVersion[];
  selectedVersion: string;
  onSelectVersion: (v: string) => void;
  onSelectResource: (r: PackagedResource) => void;
}) {
  if (versions.length === 0) {
    return (
      <section className="of-panel" style={{ padding: 16 }}>
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          No versions to inspect.
        </p>
      </section>
    );
  }

  return (
    <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="of-section-title">Packaged resources</span>
          <span className="of-badge">{version?.packaged_resources.length ?? 0}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span className="of-text-muted">Version</span>
          <select
            value={selectedVersion}
            onChange={(e) => onSelectVersion(e.target.value)}
            className="of-select"
            style={{ width: 'auto', minWidth: 120 }}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.version}>
                {v.version}
              </option>
            ))}
          </select>
        </label>
      </header>
      {version && version.packaged_resources.length > 0 ? (
        <table className="of-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Kind</th>
              <th style={{ textAlign: 'left' }}>Reference</th>
              <th style={{ textAlign: 'left' }}>Required</th>
            </tr>
          </thead>
          <tbody>
            {version.packaged_resources.map((resource, idx) => (
              <tr
                key={`${resource.kind}-${resource.name}-${idx}`}
                onClick={() => onSelectResource(resource)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Glyph name="artifact" size={14} tone="var(--text-muted)" />
                    <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>{resource.name}</span>
                  </div>
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span
                    className="of-chip"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}
                  >
                    {resource.kind}
                  </span>
                </td>
                <td
                  style={{
                    padding: '7px 8px',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  {resource.resource_ref}
                </td>
                <td style={{ padding: '7px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                  {resource.required ? (
                    <span className="of-chip of-status-info" style={{ fontSize: 11 }}>
                      Required
                    </span>
                  ) : (
                    <span className="of-text-muted" style={{ fontSize: 12 }}>
                      Optional
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="of-text-muted" style={{ padding: 18, fontSize: 13 }}>
          This version does not declare any packaged resources.
        </p>
      )}

      {version && version.dependencies.length > 0 && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <p className="of-eyebrow" style={{ marginBottom: 6 }}>
            Dependencies
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {version.dependencies.map((dep, idx) => (
              <span
                key={`${dep.package_slug}-${idx}`}
                className="of-chip"
                title={dep.required ? 'Required' : 'Optional'}
              >
                {dep.package_slug} {dep.version_req}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------- Reviews -------------------- */

function ReviewsSection(props: {
  detail: ListingDetail;
  busy: boolean;
  author: string;
  rating: string;
  headline: string;
  body: string;
  recommended: boolean;
  onAuthorChange: (v: string) => void;
  onRatingChange: (v: string) => void;
  onHeadlineChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onRecommendedChange: (v: boolean) => void;
  onPublish: () => void;
}) {
  const { detail } = props;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <header
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-muted)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span className="of-section-title">Reviews</span>
            <span className="of-badge" style={{ marginLeft: 8 }}>
              {detail.reviews.length}
            </span>
          </div>
          <span className="of-text-muted" style={{ fontSize: 12 }}>
            Average {detail.listing.average_rating.toFixed(1)} / 5
          </span>
        </header>
        {detail.reviews.length === 0 ? (
          <p className="of-text-muted" style={{ padding: 18, fontSize: 13 }}>
            No reviews yet. Share your feedback below.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {detail.reviews.map((review) => (
              <li
                key={review.id}
                style={{
                  padding: 14,
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                      {review.headline || '—'}
                    </p>
                    <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                      {review.author} · {formatDate(review.created_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Glyph
                        key={n}
                        name={n <= review.rating ? 'star-filled' : 'star'}
                        size={12}
                        tone={n <= review.rating ? '#d97706' : 'var(--text-soft)'}
                        filled={n <= review.rating}
                      />
                    ))}
                    {review.recommended && (
                      <span className="of-chip of-status-success" style={{ marginLeft: 6, fontSize: 11 }}>
                        Recommended
                      </span>
                    )}
                  </div>
                </div>
                {review.body && (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
                    {review.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="of-panel" style={{ padding: 16 }}>
        <p className="of-eyebrow" style={{ marginBottom: 10 }}>
          Add a review
        </p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ fontSize: 12 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Author</span>
            <input
              value={props.author}
              onChange={(e) => props.onAuthorChange(e.target.value)}
              className="of-input"
              placeholder="Your name"
            />
          </label>
          <label style={{ fontSize: 12 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Rating</span>
            <select
              value={props.rating}
              onChange={(e) => props.onRatingChange(e.target.value)}
              className="of-select"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} star{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, gridColumn: 'span 2' }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Headline</span>
            <input
              value={props.headline}
              onChange={(e) => props.onHeadlineChange(e.target.value)}
              className="of-input"
              placeholder="Summarize your experience"
            />
          </label>
          <label style={{ fontSize: 12, gridColumn: 'span 2' }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Details</span>
            <textarea
              value={props.body}
              onChange={(e) => props.onBodyChange(e.target.value)}
              className="of-textarea"
              placeholder="What did you like or want changed?"
            />
          </label>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              gridColumn: 'span 2',
            }}
          >
            <input
              type="checkbox"
              checked={props.recommended}
              onChange={(e) => props.onRecommendedChange(e.target.checked)}
            />
            Recommend this product
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={props.onPublish}
            disabled={props.busy}
          >
            <Glyph name="check" size={14} />
            {props.busy ? 'Publishing…' : 'Publish review'}
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Install -------------------- */

function InstallSection(props: {
  versions: string[];
  fleets: ProductFleetRecord[];
  version: string;
  workspace: string;
  channel: string;
  fleetId: string;
  branch: string;
  busy: boolean;
  onVersionChange: (v: string) => void;
  onWorkspaceChange: (v: string) => void;
  onChannelChange: (v: string) => void;
  onFleetChange: (v: string) => void;
  onBranchChange: (v: string) => void;
  onInstall: () => void;
}) {
  return (
    <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
        }}
      >
        <span className="of-section-title">Install package</span>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Pick a version and target workspace, then optionally route through a fleet and enrollment branch.
        </p>
      </header>
      <div style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Version</span>
          <select
            value={props.version}
            onChange={(e) => props.onVersionChange(e.target.value)}
            className="of-select"
            data-testid="install-version"
          >
            {props.versions.length === 0 && <option value="">No versions available</option>}
            {props.versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Workspace</span>
          <input
            value={props.workspace}
            onChange={(e) => props.onWorkspaceChange(e.target.value)}
            className="of-input"
            placeholder="Workspace name"
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Release channel</span>
          <input
            value={props.channel}
            onChange={(e) => props.onChannelChange(e.target.value)}
            className="of-input"
            placeholder="stable"
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Fleet</span>
          <select
            value={props.fleetId}
            onChange={(e) => props.onFleetChange(e.target.value)}
            className="of-select"
          >
            <option value="">Direct install</option>
            {props.fleets.map((fleet) => (
              <option key={fleet.id} value={fleet.id}>
                {fleet.name} · {fleet.release_channel}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, gridColumn: 'span 2' }}>
          <span style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Enrollment branch</span>
          <input
            value={props.branch}
            onChange={(e) => props.onBranchChange(e.target.value)}
            className="of-input"
            placeholder="feature/ops-branch (optional)"
          />
        </label>
      </div>
      <footer
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 6,
        }}
      >
        <button
          type="button"
          className="of-button of-button--primary"
          onClick={props.onInstall}
          disabled={props.busy || props.versions.length === 0}
          data-testid="install-button"
        >
          <Glyph name="shield-plus" size={14} />
          {props.busy ? 'Installing…' : 'Install package'}
        </button>
      </footer>
    </section>
  );
}

/* -------------------- Schedules -------------------- */

function SchedulesSection(props: {
  productVersionId: string;
  onProductVersionIdChange: (v: string) => void;
  manifests: ProductScheduleManifest[];
  activated: Set<string>;
  materialised: ProductScheduleManifest[] | null;
  onPreview: () => void;
  onToggle: (name: string) => void;
}) {
  return (
    <section
      className="of-panel"
      style={{ padding: 0, overflow: 'hidden' }}
      data-testid="product-schedules"
    >
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
        }}
      >
        <span className="of-section-title">Schedule manifests</span>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Preview which schedules will be materialised for the selected product version.
        </p>
      </header>
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Product version id</span>
          <input
            type="text"
            value={props.productVersionId}
            onChange={(e) => props.onProductVersionIdChange(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            data-testid="product-version-input"
            className="of-input"
          />
        </label>
        <button
          type="button"
          data-testid="preview-install-button"
          onClick={props.onPreview}
          disabled={!props.productVersionId}
          className="of-button of-button--primary"
          style={{ width: 'fit-content' }}
        >
          <Glyph name="run" size={14} />
          Preview install
        </button>

        {props.manifests.length === 0 ? (
          <p className="of-text-muted" style={{ fontSize: 13, fontStyle: 'italic' }}>
            No schedule manifests resolved yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {props.manifests.map((m) => (
              <li
                key={m.name}
                data-testid="manifest-row"
                className="of-panel-muted"
                style={{ padding: '8px 12px' }}
              >
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 13,
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={props.activated.has(m.name)}
                    onChange={() => props.onToggle(m.name)}
                    data-testid="manifest-activate-checkbox"
                  />
                  <strong style={{ color: 'var(--text-strong)' }}>{m.name}</strong>
                  <span
                    className="of-chip of-status-info"
                    style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  >
                    {m.scope_kind || 'USER'}
                  </span>
                  <span className="of-text-muted">{m.description}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {props.materialised && (
          <section
            data-testid="materialised-preview"
            className="of-panel-muted"
            style={{ padding: 12 }}
          >
            <p className="of-eyebrow" style={{ marginBottom: 6 }}>
              Resolved manifests
            </p>
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-default)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(props.materialised, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </section>
  );
}

/* -------------------- Right details drawer -------------------- */

function DetailsDrawer({
  listing,
  version,
  resource,
  onClearResource,
}: {
  listing: ListingDetail['listing'];
  version: PackageVersion | null;
  resource: PackagedResource | null;
  onClearResource: () => void;
}) {
  return (
    <aside
      className="of-panel"
      style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 10 }}
    >
      <header
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-panel-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="of-section-title">Details</span>
        {resource && (
          <button
            type="button"
            className="of-btn-ghost of-button"
            onClick={onClearResource}
            aria-label="Clear selection"
            style={{ padding: '0 4px' }}
          >
            <Glyph name="x" size={14} />
          </button>
        )}
      </header>
      <div style={{ padding: 14, display: 'grid', gap: 12, fontSize: 12 }}>
        {resource ? (
          <>
            <div>
              <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                Resource
              </p>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                {resource.name}
              </p>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 11, textTransform: 'capitalize' }}>
                {resource.kind}
              </p>
            </div>
            <DetailRow label="Reference" value={resource.resource_ref} mono />
            <DetailRow label="Required" value={resource.required ? 'Yes' : 'No'} />
            {resource.source_branch && (
              <DetailRow label="Source branch" value={resource.source_branch} mono />
            )}
          </>
        ) : (
          <>
            <div>
              <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                Listing
              </p>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)' }}>
                {listing.name}
              </p>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
                {listing.publisher}
              </p>
            </div>
            <DetailRow label="Slug" value={listing.slug} mono />
            <DetailRow label="Category" value={listing.category_slug} />
            <DetailRow label="Package kind" value={listing.package_kind.replace(/_/g, ' ')} />
            <DetailRow label="Repository" value={listing.repository_slug} mono />
            <DetailRow label="Visibility" value={listing.visibility} />
            <DetailRow label="Installs" value={String(listing.install_count)} />
            <DetailRow label="Created" value={formatDate(listing.created_at)} />
            <DetailRow label="Updated" value={formatDate(listing.updated_at)} />
            {version && (
              <>
                <hr style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
                <div>
                  <p className="of-eyebrow" style={{ marginBottom: 4 }}>
                    Selected version
                  </p>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    {version.version}
                  </p>
                </div>
                <DetailRow label="Channel" value={version.release_channel} />
                <DetailRow label="Mode" value={version.dependency_mode} />
                <DetailRow label="Resources" value={String(version.packaged_resources.length)} />
                <DetailRow label="Dependencies" value={String(version.dependencies.length)} />
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span className="of-text-muted">{label}</span>
      <span
        style={{
          color: 'var(--text-strong)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          textAlign: 'right',
          wordBreak: 'break-word',
          textTransform: mono ? 'none' : 'capitalize',
        }}
      >
        {value}
      </span>
    </div>
  );
}
