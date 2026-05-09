import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { register } from '@api/auth';
import { markSetupCompleted, refreshBootstrapStatus } from '@/lib/auth/bootstrap';
import { useTranslator } from '@/lib/i18n/store';

const REMEMBER_KEY = 'of_setup_remember_email';

type Step = 'email' | 'password';

export function SetupPage() {
  const t = useTranslator();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(() => {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  });
  const [remember, setRemember] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return Boolean(localStorage.getItem(REMEMBER_KEY));
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = t('auth.setup.title');
  }, [t]);

  function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('auth.setup.validationEmail'));
      return;
    }
    if (typeof localStorage !== 'undefined') {
      if (remember) localStorage.setItem(REMEMBER_KEY, trimmed);
      else localStorage.removeItem(REMEMBER_KEY);
    }
    setEmail(trimmed);
    setStep('password');
  }

  async function handlePasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('auth.setup.validationName'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.setup.validationPassword'));
      return;
    }

    setLoading(true);
    try {
      await register({ name: trimmedName, email, password });
      markSetupCompleted();
      void refreshBootstrapStatus();
      const params = new URLSearchParams({ registered: 'true', email });
      navigate(`/auth/login?${params.toString()}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('auth.setup.failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1f2933',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          display: 'grid',
          justifyItems: 'center',
          gap: 28,
        }}
      >
        <img
          src="/empty-logo.png"
          alt="OpenFoundry"
          style={{ width: 96, height: 96, objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
        />

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} style={{ width: '100%', display: 'grid', gap: 14 }}>
            <header style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f3f4f6' }}>
                {t('auth.setup.emailHeading')}
              </h1>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(243, 244, 246, 0.65)', lineHeight: 1.5 }}>
                {t('auth.setup.emailSubtitle')}
              </p>
            </header>

            {error && (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fecaca',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.setup.emailPlaceholder')}
              autoComplete="email"
              autoFocus
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#2c3540',
                color: '#f3f4f6',
                outline: 'none',
              }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(243, 244, 246, 0.78)' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ accentColor: '#3b82f6' }}
              />
              {t('auth.setup.rememberMe')}
            </label>

            <button
              type="submit"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                background: '#2563eb',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t('auth.setup.next')}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} style={{ width: '100%', display: 'grid', gap: 14 }}>
            <header style={{ textAlign: 'center', display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f3f4f6' }}>
                {t('auth.setup.passwordHeading')}
              </h1>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(243, 244, 246, 0.65)', lineHeight: 1.5 }}>
                {t('auth.setup.passwordSubtitle')}
              </p>
              <span style={{ fontSize: 12, color: 'rgba(243, 244, 246, 0.55)', fontFamily: 'var(--font-mono)' }}>{email}</span>
            </header>

            {error && (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fecaca',
                  fontSize: 12.5,
                }}
              >
                {error}
              </div>
            )}

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.setup.namePlaceholder')}
              autoComplete="name"
              autoFocus
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#2c3540',
                color: '#f3f4f6',
                outline: 'none',
              }}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.setup.passwordPlaceholder')}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                background: '#2c3540',
                color: '#f3f4f6',
                outline: 'none',
              }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep('email');
                }}
                disabled={loading}
                style={{
                  flex: '0 0 auto',
                  padding: '10px 14px',
                  fontSize: 13,
                  color: 'rgba(243, 244, 246, 0.78)',
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 4,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {t('auth.setup.back')}
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 4,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? t('auth.setup.creating') : t('auth.setup.create')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
