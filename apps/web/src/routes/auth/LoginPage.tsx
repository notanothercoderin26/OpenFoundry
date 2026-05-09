import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { getBootstrapStatus, listPublicSsoProviders, type PublicSsoProvider } from '@api/auth';
import {
  clearStoredAuthReturnTo,
  getAuthReturnTo,
  getStoredAuthReturnTo,
  rememberAuthReturnTo,
  resolveAuthReturnTo,
  withAuthReturnTo,
} from '@/lib/auth/redirects';
import { Glyph } from '@/lib/components/ui/Glyph';
import { auth } from '@stores/auth';
import { useTranslator } from '@/lib/i18n/store';

type LoginUiStatus = 'idle' | 'validating' | 'loading' | 'success' | 'mfa_required' | 'error';

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

function validateLoginForm(
  draft: { email: string; password: string },
  t: ReturnType<typeof useTranslator>,
): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (!draft.email) errors.email = t('auth.login.validationEmail');
  else if (!draft.email.includes('@')) errors.email = t('auth.login.validationEmailFormat');
  if (!draft.password) errors.password = t('auth.login.validationPassword');
  return errors;
}

export function LoginPage() {
  const t = useTranslator();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const registeredEmail = searchParams.get('email')?.trim() ?? '';
  const justRegistered = searchParams.get('registered') === 'true';
  const explicitReturnTo = getAuthReturnTo(location.search);
  const intendedReturnTo = explicitReturnTo ?? getStoredAuthReturnTo();
  const postAuthRedirect = resolveAuthReturnTo(location.search);

  const [email, setEmail] = useState(registeredEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState<LoginUiStatus>('idle');
  const [ssoLoadingSlug, setSsoLoadingSlug] = useState<string | null>(null);
  const [providers, setProviders] = useState<PublicSsoProvider[]>([]);
  const [requiresInitialAdmin, setRequiresInitialAdmin] = useState(false);

  const isBusy = status === 'loading' || status === 'success' || status === 'mfa_required';
  const ssoBusy = Boolean(ssoLoadingSlug);
  const submitDisabled = isBusy || ssoBusy || !email.trim() || !password;

  useEffect(() => {
    document.title = t('auth.login.title');
  }, [t]);

  useEffect(() => {
    if (registeredEmail) setEmail(registeredEmail);
  }, [registeredEmail]);

  useEffect(() => {
    rememberAuthReturnTo(explicitReturnTo);
  }, [explicitReturnTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getBootstrapStatus();
        if (!cancelled) setRequiresInitialAdmin(s.requires_initial_admin);
      } catch {
        if (!cancelled) setRequiresInitialAdmin(false);
      }
      try {
        const list = await listPublicSsoProviders();
        if (!cancelled) setProviders(list);
      } catch {
        if (!cancelled) setProviders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
    if (status === 'error' || status === 'validating') setStatus('idle');
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
    if (status === 'error' || status === 'validating') setStatus('idle');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const draft = { email: email.trim(), password };
    const validationErrors = validateLoginForm(draft, t);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setStatus('validating');
      return;
    }

    setFieldErrors({});
    setStatus('loading');
    try {
      const result = await auth.login(draft.email, draft.password);
      if (result.status === 'mfa_required') {
        setStatus('mfa_required');
        rememberAuthReturnTo(postAuthRedirect);
        window.setTimeout(() => {
          navigate(withAuthReturnTo('/auth/mfa', postAuthRedirect), { replace: true });
        }, 350);
        return;
      }
      setStatus('success');
      clearStoredAuthReturnTo();
      navigate(postAuthRedirect, { replace: true });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : t('auth.login.failed'));
    }
  }

  async function handleSsoLogin(slug: string) {
    setError('');
    setStatus('loading');
    setSsoLoadingSlug(slug);
    rememberAuthReturnTo(postAuthRedirect);
    try {
      await auth.startSsoLogin(slug, postAuthRedirect);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : t('auth.login.ssoFailed'));
      setSsoLoadingSlug(null);
    }
  }

  const submitLabel = useMemo(() => {
    switch (status) {
      case 'loading':
        return t('auth.login.signingIn');
      case 'success':
        return t('auth.login.successCta');
      case 'mfa_required':
        return t('auth.login.mfaRedirecting');
      default:
        return t('auth.login.signIn');
    }
  }, [status, t]);

  return (
    <div
      className="of-panel"
      style={{
        width: '100%',
        maxWidth: 420,
        padding: '32px 32px 28px',
        boxShadow: '0 1px 0 rgba(17, 24, 39, 0.04), 0 6px 18px rgba(17, 24, 39, 0.06)',
      }}
    >
      <header style={{ display: 'grid', justifyItems: 'center', gap: 10, marginBottom: 22 }}>
        <span
          aria-label={t('auth.login.iconLabel')}
          role="img"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-panel-subtle)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-soft)',
          }}
        >
          <Glyph name="login" size={28} strokeWidth={1.6} />
        </span>
        <h1
          className="of-heading-lg"
          style={{ margin: 0, fontSize: 20, textAlign: 'center' }}
        >
          {t('auth.login.heading')}
        </h1>
        <p
          className="of-text-muted"
          style={{ margin: 0, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}
        >
          {t('auth.login.subtitle')}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 12 }}
        aria-busy={isBusy || ssoBusy}
        noValidate
      >
        {requiresInitialAdmin && (
          <div
            className="of-status-info"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
          >
            {t('auth.login.bootstrapNotice')}
          </div>
        )}

        {justRegistered && status !== 'success' && status !== 'mfa_required' && (
          <div
            className="of-status-success"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="status"
          >
            {registeredEmail
              ? t('auth.login.registeredFor', { email: registeredEmail })
              : t('auth.login.registered')}
          </div>
        )}

        {status === 'success' && (
          <div
            className="of-status-success"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="status"
          >
            {t('auth.login.successMessage')}
          </div>
        )}

        {status === 'mfa_required' && (
          <div
            className="of-status-info"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="status"
          >
            {t('auth.login.mfaRequired')}
          </div>
        )}

        {status === 'validating' && (
          <div
            className="of-status-warning"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="alert"
          >
            {t('auth.login.validationSummary')}
          </div>
        )}

        {status === 'error' && error && (
          <div
            className="of-status-danger"
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div
          className="of-eyebrow"
          style={{ marginTop: 4, marginBottom: -4, fontSize: 10 }}
        >
          {t('auth.login.workspaceCredentials')}
        </div>

        <div>
          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-strong)' }}
          >
            {t('auth.login.email')}
          </label>
          <input
            id="email"
            type="email"
            className="of-input"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            disabled={isBusy || ssoBusy}
            required
            placeholder={t('auth.login.emailPlaceholder')}
            style={fieldErrors.email ? { borderColor: 'var(--status-danger)' } : undefined}
          />
          {fieldErrors.email && (
            <div
              id="login-email-error"
              style={{ marginTop: 4, fontSize: 12, color: 'var(--status-danger)' }}
              role="alert"
            >
              {fieldErrors.email}
            </div>
          )}
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <label
              htmlFor="password"
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)' }}
            >
              {t('auth.login.password')}
            </label>
            <button
              type="button"
              className="of-link"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
            </button>
          </div>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className="of-input"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            disabled={isBusy || ssoBusy}
            required
            placeholder={t('auth.login.passwordPlaceholder')}
            style={fieldErrors.password ? { borderColor: 'var(--status-danger)' } : undefined}
          />
          {fieldErrors.password && (
            <div
              id="login-password-error"
              style={{ marginTop: 4, fontSize: 12, color: 'var(--status-danger)' }}
              role="alert"
            >
              {fieldErrors.password}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="of-btn of-btn-primary"
          disabled={submitDisabled}
          style={{
            width: '100%',
            minHeight: 34,
            gap: 8,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          <Glyph name="login" size={16} strokeWidth={2} />
          <span>{submitLabel}</span>
        </button>

        {providers.length > 0 && (
          <div style={{ display: 'grid', gap: 8, paddingTop: 14 }}>
            <div
              role="separator"
              aria-orientation="horizontal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--text-soft)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              {t('auth.login.sso')}
              <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className="of-btn"
                style={{ width: '100%', minHeight: 34, gap: 8, fontSize: 13 }}
                disabled={isBusy || ssoBusy}
                onClick={() => handleSsoLogin(provider.slug)}
              >
                <Glyph name="shield" size={15} strokeWidth={1.8} tone="var(--text-muted)" />
                <span>
                  {ssoLoadingSlug === provider.slug
                    ? t('auth.login.ssoRedirecting')
                    : t('auth.login.continueWith', { provider: provider.name })}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      <p
        className="of-text-muted"
        style={{ textAlign: 'center', fontSize: 12.5, marginTop: 22, marginBottom: 0 }}
      >
        {requiresInitialAdmin ? t('auth.login.bootstrapCta') : t('auth.login.noAccount')}{' '}
        <Link to={withAuthReturnTo('/auth/register', intendedReturnTo)} className="of-link">
          {t('auth.login.register')}
        </Link>
      </p>
    </div>
  );
}
