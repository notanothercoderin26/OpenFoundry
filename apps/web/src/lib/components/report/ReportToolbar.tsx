import { useEffect, useRef, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import type { ReportDefinition } from '@/lib/api/reports';

export type ReportMode = 'editing' | 'preview';

interface ReportToolbarProps {
  report: ReportDefinition | null;
  mode: ReportMode;
  busy?: boolean;
  outlinePinned: boolean;
  savedLabel: string;
  starred: boolean;
  onModeChange: (mode: ReportMode) => void;
  onToggleOutline: () => void;
  onToggleStar: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  onGenerate: () => void;
  onExport: (kind: 'pdf' | 'pptx' | 'csv' | 'html' | 'excel') => void;
  onCopyMarkdown: () => void;
  onDuplicate: () => void;
  onExploreLineage: () => void;
}

export function ReportToolbar({
  report,
  mode,
  busy = false,
  outlinePinned,
  savedLabel,
  starred,
  onModeChange,
  onToggleOutline,
  onToggleStar,
  onOpenSettings,
  onOpenShare,
  onGenerate,
  onExport,
  onCopyMarkdown,
  onDuplicate,
  onExploreLineage,
}: ReportToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'mode' | 'settings' | 'actions' | 'file' | 'help' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const projectLabel = report?.tags[0] ? report.tags[0].toUpperCase() : 'REPORTS';
  const folderLabel = report?.dataset_name ? report.dataset_name : 'Library';
  const reportName = report?.name ?? 'Untitled report';

  function close(action: () => void) {
    return () => {
      action();
      setOpenMenu(null);
    };
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 56 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            background: '#f3e8ff',
            borderRight: '1px solid var(--border-default)',
          }}
          aria-hidden
        >
          <ReportIcon />
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-default)', minWidth: 0 }}>
            <Glyph name="folder" size={14} tone="var(--text-muted)" />
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{projectLabel}</span>
            <Chevron />
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{folderLabel}</span>
            <Chevron />
            <strong
              style={{
                color: 'var(--text-strong)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={reportName}
            >
              {reportName}
            </strong>
            <button
              type="button"
              onClick={onToggleStar}
              aria-label={starred ? 'Unstar report' : 'Star report'}
              style={{
                background: 'transparent',
                border: 0,
                padding: 4,
                marginLeft: 2,
                color: starred ? '#eab308' : 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              {starred ? '★' : '☆'}
            </button>
          </div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            <ToolbarMenuButton
              label="File"
              open={openMenu === 'file'}
              onToggle={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
            >
              <MenuItem icon="plus" label="New report" onClick={close(onDuplicate)} />
              <MenuItem icon="document" label="Make a copy" onClick={close(onDuplicate)} />
              <MenuItem icon="run" label="Generate now" onClick={close(onGenerate)} disabled={busy || !report} />
              <MenuDivider />
              <MenuItem icon="artifact" label="Export to PDF" onClick={close(() => onExport('pdf'))} disabled={!report} />
              <MenuItem icon="artifact" label="Export to PowerPoint" onClick={close(() => onExport('pptx'))} disabled={!report} />
              <MenuItem icon="spreadsheet" label="Export data to CSV" onClick={close(() => onExport('csv'))} disabled={!report} />
            </ToolbarMenuButton>
            <ToolbarMenuButton
              label="Help"
              open={openMenu === 'help'}
              onToggle={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
            >
              <MenuItem icon="help" label="Reports documentation" onClick={close(() => undefined)} />
              <MenuItem icon="bell" label="What's new" onClick={close(() => undefined)} />
              <MenuItem icon="users" label="Contact support" onClick={close(() => undefined)} />
            </ToolbarMenuButton>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-default)' }} aria-hidden />
            <span style={{ color: 'var(--text-muted)' }}>{savedLabel}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
          <ToolbarPillButton
            icon={mode === 'editing' ? 'code' : 'document'}
            tone={mode === 'editing' ? '#2d72d2' : 'var(--text-strong)'}
            label={mode === 'editing' ? 'Editing mode' : 'Preview mode'}
            open={openMenu === 'mode'}
            onToggle={() => setOpenMenu(openMenu === 'mode' ? null : 'mode')}
          >
            <MenuItem
              icon="code"
              label="Editing mode"
              checked={mode === 'editing'}
              onClick={close(() => onModeChange('editing'))}
            />
            <MenuItem
              icon="document"
              label="Preview mode"
              checked={mode === 'preview'}
              onClick={close(() => onModeChange('preview'))}
            />
          </ToolbarPillButton>
          <ToolbarPillButton
            icon="settings"
            label="Settings"
            open={openMenu === 'settings'}
            onToggle={() => setOpenMenu(openMenu === 'settings' ? null : 'settings')}
          >
            <MenuItem icon="settings" label="Definition settings" onClick={close(onOpenSettings)} />
            <MenuItem icon="cube" label="Generator catalog" onClick={close(onOpenSettings)} />
            <MenuItem icon="users" label="Distribution recipients" onClick={close(onOpenShare)} />
          </ToolbarPillButton>
          <ToolbarPillButton
            label="Actions"
            open={openMenu === 'actions'}
            onToggle={() => setOpenMenu(openMenu === 'actions' ? null : 'actions')}
          >
            <MenuItem
              icon="list"
              label="Show outline"
              toggle
              checked={outlinePinned}
              onClick={close(onToggleOutline)}
            />
            <MenuDivider />
            <MenuItem icon="run" label="Generate report" onClick={close(onGenerate)} disabled={busy || !report} />
            <MenuItem icon="artifact" label="Export to PDF…" onClick={close(() => onExport('pdf'))} disabled={!report} />
            <MenuItem icon="artifact" label="Export to PowerPoint" onClick={close(() => onExport('pptx'))} disabled={!report} />
            <MenuItem icon="document" label="Copy text as Markdown" onClick={close(onCopyMarkdown)} disabled={!report} />
            <MenuItem icon="document" label="Duplicate report" onClick={close(onDuplicate)} disabled={!report} />
            <MenuItem icon="graph" label="Explore data lineage" onClick={close(onExploreLineage)} disabled={!report} />
          </ToolbarPillButton>
          <button type="button" className="of-btn" onClick={onOpenShare} disabled={!report}>
            <Glyph name="users" size={14} />
            Share
          </button>
          <button
            type="button"
            className="of-btn-ghost of-btn"
            onClick={onToggleOutline}
            aria-pressed={outlinePinned}
            title={outlinePinned ? 'Hide outline' : 'Show outline'}
            style={{ minWidth: 30, padding: '0 6px' }}
          >
            <Glyph name="list" size={16} tone={outlinePinned ? 'var(--status-info)' : 'var(--text-muted)'} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarMenuButton({
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
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 0,
          padding: '2px 4px',
          color: 'var(--text-default)',
          fontSize: 12,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {label}
        <Chevron down />
      </button>
      {open && <MenuPanel>{children}</MenuPanel>}
    </span>
  );
}

function ToolbarPillButton({
  icon,
  label,
  tone,
  open,
  onToggle,
  children,
}: {
  icon?: 'code' | 'document' | 'settings';
  label: string;
  tone?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="of-btn"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ color: tone, gap: 6 }}
      >
        {icon ? <Glyph name={icon} size={14} tone={tone ?? 'currentColor'} /> : null}
        {label}
        <Chevron down small />
      </button>
      {open && <MenuPanel>{children}</MenuPanel>}
    </span>
  );
}

function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        right: 0,
        minWidth: 220,
        background: '#ffffff',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-popover)',
        padding: 4,
        zIndex: 30,
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  checked,
  toggle,
  disabled,
  onClick,
}: {
  icon?: Parameters<typeof Glyph>[0]['name'];
  label: string;
  checked?: boolean;
  toggle?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        padding: '7px 10px',
        border: 0,
        background: 'transparent',
        textAlign: 'left',
        color: disabled ? 'var(--text-soft)' : 'var(--text-default)',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius-sm)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        {icon ? <Glyph name={icon} size={14} tone={disabled ? 'var(--text-soft)' : 'var(--text-default)'} /> : null}
        {label}
      </span>
      {toggle ? (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 28,
            height: 16,
            borderRadius: 999,
            background: checked ? '#2d72d2' : '#cbd3dc',
            position: 'relative',
            transition: 'background 0.15s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 14 : 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s ease',
            }}
          />
        </span>
      ) : checked ? (
        <span aria-hidden style={{ color: 'var(--status-info)' }}>✓</span>
      ) : null}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} aria-hidden />;
}

function Chevron({ down = true, small = false }: { down?: boolean; small?: boolean }) {
  return (
    <svg
      width={small ? 10 : 12}
      height={small ? 10 : 12}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: down ? undefined : 'rotate(-90deg)' }}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" stroke="#7c3aed" strokeWidth={1.6} />
      <path d="M8 9h6" stroke="#7c3aed" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M8 13h8" stroke="#a855f7" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M8 17h5" stroke="#a855f7" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}
