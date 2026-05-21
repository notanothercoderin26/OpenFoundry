import { useEffect, useRef, useState } from 'react';

import type { ExplorerTab } from '../tabs';
import './AppTabsBar.css';

export interface AppTabsBarSavedItem {
  id: string;
  label: string;
  meta?: string;
}

export interface AppTabsBarProps {
  tabs: ExplorerTab[];
  activeTabId: string;
  savedExplorations: AppTabsBarSavedItem[];
  savedLists: AppTabsBarSavedItem[];
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewExploration: () => void;
  onOpenExploration: (item: AppTabsBarSavedItem) => void;
  onOpenList: (item: AppTabsBarSavedItem) => void;
}

export function AppTabsBar({
  tabs,
  activeTabId,
  savedExplorations,
  savedLists,
  onActivate,
  onClose,
  onNewExploration,
  onOpenExploration,
  onOpenList,
}: AppTabsBarProps) {
  return (
    <div className="oe-appbar" role="tablist" aria-label="Explorer workspaces">
      <div className="oe-appbar__tabs">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            selected={tab.id === activeTabId}
            onActivate={onActivate}
            onClose={onClose}
          />
        ))}
        <button type="button" className="oe-appbar__new" onClick={onNewExploration} title="New exploration">
          <PlusIcon />
          New exploration
        </button>
      </div>

      <div className="oe-appbar__actions">
        <SavedMenu
          label="Explorations"
          icon={<SearchIcon />}
          items={savedExplorations}
          emptyText="No saved explorations yet."
          onSelect={onOpenExploration}
        />
        <SavedMenu
          label="Lists"
          icon={<ListIcon />}
          items={savedLists}
          emptyText="No saved lists yet."
          onSelect={onOpenList}
        />
      </div>
    </div>
  );
}

function TabButton({
  tab,
  selected,
  onActivate,
  onClose,
}: {
  tab: ExplorerTab;
  selected: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const closable = tab.kind !== 'overview';
  return (
    <div
      role="tab"
      aria-selected={selected}
      className="oe-appbar__tab"
      onClick={() => onActivate(tab.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(tab.id);
        }
      }}
      tabIndex={0}
    >
      <TabKindIcon kind={tab.kind} />
      <span className="oe-appbar__tab-label" title={tab.label}>
        {tab.label}
      </span>
      {closable && (
        <button
          type="button"
          className="oe-appbar__tab-close"
          aria-label={`Close ${tab.label}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose(tab.id);
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

function TabKindIcon({ kind }: { kind: ExplorerTab['kind'] }) {
  if (kind === 'search') return <SearchIcon className="oe-appbar__tab-icon" />;
  if (kind === 'exploration') return <SearchIcon className="oe-appbar__tab-icon" />;
  if (kind === 'list') return <ListIcon className="oe-appbar__tab-icon" />;
  return <PlusIcon className="oe-appbar__tab-icon" />;
}

function SavedMenu({
  label,
  icon,
  items,
  emptyText,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  items: AppTabsBarSavedItem[];
  emptyText: string;
  onSelect: (item: AppTabsBarSavedItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="oe-appbar__menu" ref={ref}>
      <button
        type="button"
        className="oe-appbar__menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="oe-appbar__menu-trigger-icon">{icon}</span>
        {label}
        <CaretDownIcon className="oe-appbar__menu-trigger-caret" />
      </button>
      {open && (
        <div className="oe-popover oe-appbar__menu-panel" role="menu">
          {items.length === 0 ? (
            <div className="oe-appbar__menu-empty">{emptyText}</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="oe-appbar__menu-item"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <span className="oe-appbar__menu-item-label">{item.label}</span>
                {item.meta && <span className="oe-appbar__menu-item-meta">{item.meta}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="m2 2 6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CaretDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
