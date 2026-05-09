import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getBootstrapStatus, register } from '@api/auth';
import {
  getAuthReturnTo,
  getStoredAuthReturnTo,
  rememberAuthReturnTo,
  withAuthReturnTo,
} from '@/lib/auth/redirects';
import { useTranslator } from '@/lib/i18n/store';

interface RegisterFieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

function validateRegistrationForm(
  draft: { name: string; email: string; password: string },
  t: ReturnType<typeof useTranslator>,
): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  if (!draft.name) errors.name = t('auth.register.validationName');
  if (!draft.email) errors.email = t('auth.register.validationEmail');
  if (draft.email && !draft.email.includes('@')) errors.email = t('auth.register.validationEmailFormat');
  if (draft.password.length < 8) errors.password = t('auth.register.validationPassword');
  return errors;
}

export function RegisterPage() {
  const t = useTranslator();
  const navigate = useNavigate();
  const location = useLocation();
  const explicitReturnTo = getAuthReturnTo(location.search);
  const intendedReturnTo = explicitReturnTo ?? getStoredAuthReturnTo();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [requiresInitialAdmin, setRequiresInitialAdmin] = useState(false);

  useEffect(() => {
    document.title = t('auth.register.title');
  }, [t]);

  useEffect(() => {
    rememberAuthReturnTo(explicitReturnTo);
  }, [explicitReturnTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getBootstrapStatus();
        if (!cancelled) setRequiresInitialAdmin(status.requires_initial_admin);
      } catch {
        if (!cancelled) setRequiresInitialAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const draft = { name: name.trim(), email: email.trim(), password };
    const validationErrors = validateRegistrationForm(draft, t);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError(t('auth.register.validationSummary'));
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      await register(draft);
      const params = new URLSearchParams({ registered: 'true', email: draft.email });
      navigate(withAuthReturnTo(`/auth/login?${params.toString()}`, intendedReturnTo), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 36, color: 'var(--status-info)' }}>◆</span>
        <h1 className="of-heading-lg" style={{ marginTop: 8 }}>
          {t('auth.register.heading')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        {requiresInitialAdmin && (
          <div className="of-status-info" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            {t('auth.register.bootstrapNotice')}
          </div>
        )}

        {error && (
          <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div>
          <label htmlFor="name" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {t('auth.register.name')}
          </label>
          <input
            id="name"
            type="text"
            className="of-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrors((current) => ({ ...current, name: undefined }));
            }}
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'register-name-error' : undefined}
            disabled={loading}
            style={fieldErrors.name ? { borderColor: 'var(--status-danger)' } : undefined}
            required
            placeholder={t('auth.register.namePlaceholder')}
          />
          {fieldErrors.name && (
            <div id="register-name-error" className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }} role="alert">
              {fieldErrors.name}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="email" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {t('auth.register.email')}
          </label>
          <input
            id="email"
            type="email"
            className="of-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
            disabled={loading}
            style={fieldErrors.email ? { borderColor: 'var(--status-danger)' } : undefined}
            required
            placeholder={t('auth.login.emailPlaceholder')}
          />
          {fieldErrors.email && (
            <div id="register-email-error" className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }} role="alert">
              {fieldErrors.email}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {t('auth.register.password')}
          </label>
          <input
            id="password"
            type="password"
            className="of-input"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            autoComplete="new-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
            disabled={loading}
            style={fieldErrors.password ? { borderColor: 'var(--status-danger)' } : undefined}
            required
            minLength={8}
            placeholder={t('auth.register.passwordPlaceholder')}
          />
          {fieldErrors.password && (
            <div id="register-password-error" className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }} role="alert">
              {fieldErrors.password}
            </div>
          )}
        </div>

        <button type="submit" className="of-btn of-btn-primary" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
          {loading ? t('auth.register.creating') : t('auth.register.create')}
        </button>
      </form>

      <p className="of-text-muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 20 }}>
        {t('auth.register.haveAccount')}{' '}
        <Link to={withAuthReturnTo('/auth/login', intendedReturnTo)} className="of-link">
          {t('auth.register.signIn')}
        </Link>
      </p>
    </div>
  );
}
