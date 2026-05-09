import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import {
  clearStoredAuthReturnTo,
  getAuthReturnTo,
  getStoredAuthReturnTo,
  withAuthReturnTo,
} from '@/lib/auth/redirects';
import { auth, useAuth } from '@stores/auth';
import { useTranslator } from '@/lib/i18n/store';

type VerificationMode = 'totp' | 'recovery';
type VerificationState = 'idle' | 'loading' | 'success';

function normalizeMfaInput(value: string, mode: VerificationMode) {
  if (mode === 'totp') return value.replace(/\D/g, '').slice(0, 6);
  return value.trimStart().toUpperCase().slice(0, 32);
}

function formatRemainingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function MfaPage() {
  const t = useTranslator();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading: authLoading, pendingChallenge } = useAuth();
  const intendedReturnTo = getAuthReturnTo(location.search) ?? getStoredAuthReturnTo();
  const postAuthRedirect = intendedReturnTo ?? '/';

  const [mode, setMode] = useState<VerificationMode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<VerificationState>('idle');
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const expiresAt = pendingChallenge ? pendingChallenge.received_at + pendingChallenge.expires_in * 1000 : 0;
  const remainingSeconds = pendingChallenge ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const challengeExpired = Boolean(pendingChallenge && remainingSeconds <= 0);
  const loading = status === 'loading';
  const value = code.trim();
  const canSubmit = !loading && !challengeExpired && (mode === 'totp' ? value.length === 6 : value.length > 0);

  useEffect(() => {
    document.title = t('auth.mfa.title');
  }, [t]);

  useEffect(() => {
    if (!authLoading && !pendingChallenge) {
      navigate(withAuthReturnTo('/auth/login', intendedReturnTo), { replace: true });
    }
  }, [authLoading, intendedReturnTo, pendingChallenge, navigate]);

  useEffect(() => {
    if (!pendingChallenge) return;
    inputRef.current?.focus();
  }, [pendingChallenge]);

  useEffect(() => {
    if (!pendingChallenge) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [pendingChallenge]);

  useEffect(() => {
    if (challengeExpired) {
      setError(t('auth.mfa.expired'));
    }
  }, [challengeExpired, t]);

  function handleModeChange(nextMode: VerificationMode) {
    setMode(nextMode);
    setCode('');
    setError('');
    setStatus('idle');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError(challengeExpired ? t('auth.mfa.expired') : t('auth.mfa.required'));
      return;
    }

    setError('');
    setStatus('loading');
    try {
      await auth.completeMfa(mode === 'recovery' ? { recoveryCode: value } : { code: value });
      setStatus('success');
      clearStoredAuthReturnTo();
      navigate(postAuthRedirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.mfa.failed'));
      setStatus('idle');
    }
  }

  if (authLoading && !pendingChallenge) {
    return (
      <div className="of-panel" style={{ width: '100%', maxWidth: 420, padding: 28, textAlign: 'center' }}>
        <p className="of-eyebrow">{t('auth.mfa.badge')}</p>
        <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>
          {t('auth.mfa.loading')}
        </p>
      </div>
    );
  }
  if (!pendingChallenge) return null;

  const inputLabel = mode === 'recovery' ? t('auth.mfa.recoveryCode') : t('auth.mfa.code');
  const inputPlaceholder = mode === 'recovery' ? t('auth.mfa.recoveryPlaceholder') : t('auth.mfa.placeholder');
  const helperText = mode === 'recovery' ? t('auth.mfa.recoveryHelp') : t('auth.mfa.totpHelp');
  const statusMessage =
    status === 'success'
      ? t('auth.mfa.success')
      : t('auth.mfa.expiresIn', { time: formatRemainingTime(remainingSeconds) });

  return (
    <div className="of-panel" style={{ width: '100%', maxWidth: 420, padding: 28 }}>
      <header style={{ marginBottom: 20 }}>
        <p className="of-eyebrow">{t('auth.mfa.badge')}</p>
        <h1 className="of-heading-lg" style={{ marginTop: 6 }}>
          {t('auth.mfa.heading')}
        </h1>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          {t('auth.mfa.subtitle')}
        </p>
      </header>

      <div
        className={status === 'success' ? 'of-status-success' : challengeExpired ? 'of-status-danger' : 'of-status-info'}
        style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 14 }}
        role={challengeExpired || status === 'success' ? 'status' : undefined}
      >
        {statusMessage}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        {error && (
          <div
            className="of-status-danger"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div
          aria-label={t('auth.mfa.methodLabel')}
          role="group"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: 4,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-panel-muted)',
          }}
        >
          <button
            type="button"
            className={mode === 'totp' ? 'of-btn of-btn-primary' : 'of-btn of-btn-ghost'}
            aria-pressed={mode === 'totp'}
            onClick={() => handleModeChange('totp')}
            disabled={loading}
            style={{ minHeight: 32, width: '100%' }}
          >
            {t('auth.mfa.methodTotp')}
          </button>
          <button
            type="button"
            className={mode === 'recovery' ? 'of-btn of-btn-primary' : 'of-btn of-btn-ghost'}
            aria-pressed={mode === 'recovery'}
            onClick={() => handleModeChange('recovery')}
            disabled={loading}
            style={{ minHeight: 32, width: '100%' }}
          >
            {t('auth.mfa.methodRecovery')}
          </button>
        </div>

        <div>
          <label htmlFor="mfa-code" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {inputLabel}
          </label>
          <input
            id="mfa-code"
            ref={inputRef}
            type="text"
            inputMode={mode === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            className="of-input"
            value={code}
            onChange={(e) => setCode(normalizeMfaInput(e.target.value, mode))}
            required
            disabled={loading || challengeExpired}
            placeholder={inputPlaceholder}
            style={{ fontFamily: 'var(--font-mono)', textTransform: mode === 'recovery' ? 'uppercase' : 'none' }}
          />
          <p className="of-text-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {helperText}
          </p>
        </div>

        <button type="submit" className="of-btn of-btn-primary" disabled={!canSubmit} style={{ width: '100%' }}>
          {loading ? t('auth.mfa.verifying') : t('auth.mfa.verify')}
        </button>

        <Link
          to={withAuthReturnTo('/auth/login', intendedReturnTo)}
          className="of-link"
          onClick={() => auth.clearPendingChallenge()}
          style={{ justifySelf: 'center', fontSize: 13, marginTop: 4 }}
        >
          {t('auth.mfa.backToLogin')}
        </Link>
      </form>
    </div>
  );
}
