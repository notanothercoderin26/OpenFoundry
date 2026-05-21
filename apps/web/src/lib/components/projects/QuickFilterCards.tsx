import { useEffect, useState, type ReactNode } from 'react';

export type QuickFilterKind = 'portfolios' | 'projects' | 'promoted';

interface QuickFilterCardsProps {
  onApply: (kind: QuickFilterKind) => void;
}

const HIDE_STORAGE_KEY = 'compass.quickFilters.hidden';

interface CardSpec {
  kind: QuickFilterKind;
  title: string;
  description: string;
  icon: ReactNode;
}

const CARDS: CardSpec[] = [
  {
    kind: 'portfolios',
    title: 'Portfolios',
    description:
      'Portfolios are groupings of projects which allow you to organize related projects into a use case or area of interest.',
    icon: <FolderTwoStacksIcon />,
  },
  {
    kind: 'projects',
    title: 'Projects',
    description:
      'Projects are secure containers of related files which allow you to permission access to the work unit uniformly.',
    icon: <BriefcaseFilledIcon />,
  },
  {
    kind: 'promoted',
    title: 'Promoted items',
    description:
      'A catalog of the most useful projects, folders and files to jumpstart your work.',
    icon: <PromotedCheckIcon />,
  },
];

export function QuickFilterCards({ onApply }: QuickFilterCardsProps) {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(HIDE_STORAGE_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HIDE_STORAGE_KEY, hidden ? '1' : '0');
  }, [hidden]);

  return (
    <section
      aria-label="Quick filters"
      style={{
        padding: '12px 22px 16px',
        background: '#f5f7fa',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: hidden ? 0 : 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-strong)',
          }}
        >
          Quick filters
        </h2>
        <button
          type="button"
          onClick={() => setHidden((value) => !value)}
          style={{
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            color: '#2D72D2',
            fontSize: 12,
            fontWeight: 500,
            padding: 0,
          }}
        >
          {hidden ? 'Show' : 'Hide'}
        </button>
      </header>
      {hidden ? null : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {CARDS.map((card) => (
            <article
              key={card.kind}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                border: '1px solid #e1e6ed',
                borderRadius: 4,
                background: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {card.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                    }}
                  >
                    {card.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onApply(card.kind)}
                    style={{
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      color: '#2D72D2',
                      fontSize: 12,
                      fontWeight: 500,
                      padding: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Apply
                  </button>
                </div>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: '#5f6b7a',
                  }}
                >
                  {card.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FolderTwoStacksIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7.5h5.2l1.6 1.7H17V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
        stroke="#5f6b7a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 5.5h5.2l1.6 1.7H21V16"
        stroke="#5f6b7a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BriefcaseFilledIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7.5" width="18" height="11" rx="1.5" stroke="#5f6b7a" strokeWidth="1.5" />
      <path
        d="M9 7.5V6.2a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v1.3"
        stroke="#5f6b7a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M3 12.5h18" stroke="#5f6b7a" strokeWidth="1.5" />
    </svg>
  );
}

function PromotedCheckIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#7c5dd6" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
