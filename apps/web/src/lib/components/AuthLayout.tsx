import { Outlet } from 'react-router-dom';

import { useBootstrapGate } from '@/lib/auth/bootstrap';
import { useTranslator } from '@/lib/i18n/store';

export function AuthLayout() {
  const t = useTranslator();
  const year = new Date().getFullYear();
  useBootstrapGate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        background: 'var(--bg-canvas)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minHeight: 52,
          padding: '8px 18px 8px 14px',
          background: 'var(--bg-sidebar)',
          color: '#fff',
          borderBottom: '1px solid rgba(0, 0, 0, 0.32)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 2,
              background: '#11171d',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ◆
          </span>
          <span
            style={{
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.1,
            }}
          >
            OpenFoundry
          </span>
          <span
            aria-hidden
            style={{
              width: 1,
              height: 16,
              background: 'rgba(255, 255, 255, 0.18)',
              margin: '0 4px',
            }}
          />
          <span
            style={{
              color: 'rgba(255, 255, 255, 0.62)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {t('auth.layout.context')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(255, 255, 255, 0.66)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 0 2px rgba(34, 197, 94, 0.18)',
              }}
            />
            {t('auth.layout.statusOperational')}
          </span>
          <a
            href="https://github.com/DioCrafts/OpenFoundry"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'rgba(255, 255, 255, 0.82)',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            {t('auth.layout.documentation')}
          </a>
        </div>
      </header>

      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          backgroundImage:
            'radial-gradient(circle at 18% -8%, rgba(45, 114, 210, 0.10), transparent 55%), radial-gradient(circle at 88% 110%, rgba(45, 114, 210, 0.08), transparent 55%)',
        }}
      >
        <Outlet />
      </main>

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 22px',
          background: 'var(--bg-default)',
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        <span>{t('auth.layout.copyright', { year: String(year) })}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 16 }}>
          <span>{t('auth.layout.tagline')}</span>
        </span>
      </footer>
    </div>
  );
}
