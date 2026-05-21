import type { ReactNode } from 'react';

interface RailItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const ITEMS: RailItem[] = [
  { id: 'info', label: 'Info', icon: <InfoIcon /> },
  { id: 'permissions', label: 'Permissions', icon: <LockIcon /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <FeedIcon /> },
  { id: 'markings', label: 'Markings', icon: <FlagIcon /> },
  { id: 'references', label: 'References', icon: <BranchIcon /> },
];

export function WorkspaceRightRail() {
  return (
    <aside
      aria-label="Resource side panels"
      style={{
        width: 36,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 2,
      }}
    >
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-label={item.label}
          title={item.label}
          style={{
            width: 28,
            height: 28,
            border: 0,
            borderRadius: 3,
            background: 'transparent',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#5f6b7a',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = '#eef1f5';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'transparent';
          }}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  );
}

function InfoIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="8.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 10a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5 5a14 14 0 0 1 14 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="6" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4.5v15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6 5.2c4-1.6 6 1 10 0v7c-4 1-6-1.6-10 0z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="7" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M7 12a5 5 0 0 0 5-5h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
