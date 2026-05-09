import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

interface WorkshopToolbarProps {
  appName: string;
  status: string;
  versionLabel: string;
  savedAt: string | null;
  branchName: string;
  busy: boolean;
  canPublish: boolean;
  isPublished: boolean;
  hasApp: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onPreview: () => void;
  onOpenRuntime: () => void;
  onShare: () => void;
  sectionControls?: ReactNode;
}

function formatSavedAt(iso: string | null) {
  if (!iso) return 'Not saved yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Autosaved at ${time}`;
}

export function WorkshopToolbar({
  appName,
  status,
  versionLabel,
  savedAt,
  branchName,
  busy,
  canPublish,
  isPublished,
  hasApp,
  onBack,
  onSave,
  onPublish,
  onPreview,
  onOpenRuntime,
  onShare,
  sectionControls,
}: WorkshopToolbarProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [savePublishOpen, setSavePublishOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setViewOpen(false);
        setFileOpen(false);
        setHelpOpen(false);
        setSavePublishOpen(false);
      }
    }
    if (viewOpen || fileOpen || helpOpen || savePublishOpen) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [viewOpen, fileOpen, helpOpen, savePublishOpen]);

  return (
    <div
      ref={containerRef}
      className="of-panel"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto auto',
        gap: 0,
        padding: 0,
        position: 'relative',
        zIndex: 5,
      }}
    >
      {/* Top row: app meta + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            className="of-button of-button--ghost"
            onClick={onBack}
            title="Back to apps gallery"
            aria-label="Back"
            style={{ minHeight: 28, padding: '0 8px' }}
          >
            <Glyph name="chevron-right" size={14} />
            <span style={{ transform: 'rotate(180deg)', display: 'none' }} />
            Back
          </button>

          <span className="of-eyebrow" style={{ margin: 0, color: 'var(--text-muted)' }}>Workshop</span>
          <span style={{ color: 'var(--text-soft)' }}>›</span>
          <strong className="of-heading-sm" style={{ margin: 0, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
            {appName || 'Untitled app'}
          </strong>
          <button
            type="button"
            title="Star app"
            aria-label="Star app"
            className="of-button of-button--ghost"
            style={{ minHeight: 24, padding: '0 4px' }}
          >
            <Glyph name="bookmark" size={14} />
          </button>

          <span style={{ width: 1, height: 18, background: 'var(--border-default)' }} />

          <ToolbarMenu
            label="File"
            open={fileOpen}
            onToggle={() => {
              setFileOpen((current) => !current);
              setHelpOpen(false);
              setViewOpen(false);
              setSavePublishOpen(false);
            }}
          >
            <ToolbarMenuItem onClick={onSave} disabled={busy || !hasApp}>Save draft</ToolbarMenuItem>
            <ToolbarMenuItem onClick={onPreview} disabled={busy}>Preview</ToolbarMenuItem>
            <ToolbarMenuItem onClick={onShare} disabled={!hasApp}>Share…</ToolbarMenuItem>
            <ToolbarMenuDivider />
            <ToolbarMenuItem onClick={onPublish} disabled={!canPublish || busy}>Save and publish</ToolbarMenuItem>
            <ToolbarMenuItem onClick={onOpenRuntime} disabled={!isPublished}>Open runtime</ToolbarMenuItem>
          </ToolbarMenu>
          <ToolbarMenu
            label="Help"
            open={helpOpen}
            onToggle={() => {
              setHelpOpen((current) => !current);
              setFileOpen(false);
              setViewOpen(false);
              setSavePublishOpen(false);
            }}
          >
            <ToolbarMenuItem href="https://www.palantir.com/docs/foundry/workshop/overview/">Documentation</ToolbarMenuItem>
            <ToolbarMenuItem onClick={() => undefined} disabled>Keyboard shortcuts</ToolbarMenuItem>
          </ToolbarMenu>

          <span className="of-chip" style={{ minHeight: 22 }}>
            <Glyph name="bookmark" size={12} />
            <span style={{ marginLeft: 4 }}>{versionLabel}</span>
          </span>

          <span className="of-text-muted" style={{ fontSize: 12 }}>{formatSavedAt(savedAt)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="of-button of-button--ghost"
            title="Branch selector"
            aria-haspopup
            style={{ minHeight: 28 }}
          >
            <Glyph name="link" size={12} />
            <span style={{ marginLeft: 4 }}>{branchName}</span>
            <Glyph name="chevron-down" size={12} />
          </button>

          {/* Save and publish split button */}
          <div style={{ display: 'inline-flex' }}>
            <button
              type="button"
              className="of-button of-button--success"
              onClick={onPublish}
              disabled={!canPublish || busy}
              style={{ minHeight: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              {busy ? 'Working…' : 'Save and publish'}
            </button>
            <button
              type="button"
              className="of-button of-button--success"
              onClick={() => {
                setSavePublishOpen((current) => !current);
                setViewOpen(false);
                setHelpOpen(false);
                setFileOpen(false);
              }}
              aria-label="Save and publish menu"
              disabled={busy}
              style={{
                minHeight: 28,
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: '1px solid rgba(255,255,255,0.35)',
                paddingInline: 6,
              }}
            >
              <Glyph name="chevron-down" size={14} />
            </button>
          </div>
          {savePublishOpen ? (
            <div style={menuPanelStyle({ right: 168 })}>
              <ToolbarMenuItem onClick={onSave} disabled={busy || !hasApp}>Save draft only</ToolbarMenuItem>
              <ToolbarMenuItem onClick={onPublish} disabled={!canPublish || busy}>Save and publish new version</ToolbarMenuItem>
              <ToolbarMenuItem onClick={onPreview} disabled={busy}>Preview without saving</ToolbarMenuItem>
            </div>
          ) : null}

          <ToolbarMenu
            label={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Glyph name="search" size={12} />
                View
                <Glyph name="chevron-down" size={12} />
              </span>
            }
            open={viewOpen}
            onToggle={() => {
              setViewOpen((current) => !current);
              setSavePublishOpen(false);
              setHelpOpen(false);
              setFileOpen(false);
            }}
            buttonClassName="of-button"
          >
            <ToolbarMenuItem onClick={onPreview}>Preview</ToolbarMenuItem>
            <ToolbarMenuItem onClick={onOpenRuntime} disabled={!isPublished}>Open runtime in new tab</ToolbarMenuItem>
          </ToolbarMenu>
          <button
            type="button"
            className="of-button"
            onClick={onShare}
            title="Share app"
            disabled={!hasApp}
            style={{ minHeight: 28 }}
          >
            <Glyph name="users" size={12} />
            <span style={{ marginLeft: 4 }}>Share</span>
          </button>
          <span className={`of-chip ${isPublished ? 'of-chip-active' : ''}`} style={{ minHeight: 22, textTransform: 'capitalize' }}>{status}</span>
        </div>
      </div>

      {/* Bottom row: section controls (canvas-related) */}
      {sectionControls ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-panel-muted)',
            flexWrap: 'wrap',
          }}
        >
          {sectionControls}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarMenu({
  label,
  open,
  onToggle,
  children,
  buttonClassName,
}: {
  label: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  buttonClassName?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        className={buttonClassName ?? 'of-button of-button--ghost'}
        aria-haspopup
        aria-expanded={open}
        style={{ minHeight: 26, padding: '0 8px' }}
      >
        {label}
      </button>
      {open ? <div style={menuPanelStyle()}>{children}</div> : null}
    </div>
  );
}

function ToolbarMenuItem({
  onClick,
  href,
  disabled,
  children,
}: {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={menuItemStyle(disabled)}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled || !onClick) return;
        onClick();
      }}
      disabled={disabled}
      style={{ ...menuItemStyle(disabled), background: 'none', border: 0, width: '100%', textAlign: 'left' }}
    >
      {children}
    </button>
  );
}

function ToolbarMenuDivider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
}

function menuPanelStyle(extra?: { right?: number; left?: number }): React.CSSProperties {
  return {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    minWidth: 220,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
    padding: 4,
    zIndex: 50,
    ...(extra ?? {}),
  };
}

function menuItemStyle(disabled?: boolean): React.CSSProperties {
  return {
    display: 'block',
    padding: '7px 10px',
    fontSize: 13,
    color: disabled ? 'var(--text-muted)' : 'var(--text-default)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    borderRadius: 'var(--radius-sm)',
  };
}
