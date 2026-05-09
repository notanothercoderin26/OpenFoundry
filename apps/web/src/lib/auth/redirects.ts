export const AUTH_RETURN_TO_PARAM = 'returnTo';

const LAST_AUTH_ROUTE_KEY = 'of_last_auth_route';
const LOCAL_REDIRECT_BASE = 'https://openfoundry.local';
const DEFAULT_POST_AUTH_ROUTE = '/';

function isAuthRoute(pathname: string) {
  return pathname === '/auth' || pathname.startsWith('/auth/');
}

function safeSessionStorage() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

export function sanitizeAuthReturnTo(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }

  try {
    const url = new URL(trimmed, LOCAL_REDIRECT_BASE);
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (!next.startsWith('/') || next.startsWith('//') || isAuthRoute(url.pathname)) {
      return null;
    }
    return next;
  } catch {
    return null;
  }
}

export function buildAuthReturnToPath(location: { pathname: string; search?: string; hash?: string }) {
  return sanitizeAuthReturnTo(`${location.pathname}${location.search ?? ''}${location.hash ?? ''}`);
}

export function getAuthReturnTo(search: string) {
  return sanitizeAuthReturnTo(new URLSearchParams(search).get(AUTH_RETURN_TO_PARAM));
}

export function getStoredAuthReturnTo() {
  try {
    return sanitizeAuthReturnTo(safeSessionStorage()?.getItem(LAST_AUTH_ROUTE_KEY));
  } catch {
    return null;
  }
}

export function rememberAuthReturnTo(returnTo: string | null | undefined) {
  const sanitized = sanitizeAuthReturnTo(returnTo);
  if (!sanitized) return null;

  try {
    safeSessionStorage()?.setItem(LAST_AUTH_ROUTE_KEY, sanitized);
  } catch {
    // Storage can be unavailable in private browsing or SSR-like tests.
  }

  return sanitized;
}

export function clearStoredAuthReturnTo() {
  try {
    safeSessionStorage()?.removeItem(LAST_AUTH_ROUTE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function resolveAuthReturnTo(search: string, fallback = DEFAULT_POST_AUTH_ROUTE) {
  return getAuthReturnTo(search) ?? getStoredAuthReturnTo() ?? fallback;
}

export function withAuthReturnTo(path: string, returnTo: string | null | undefined) {
  const sanitized = sanitizeAuthReturnTo(returnTo);
  if (!sanitized) return path;

  const url = new URL(path, LOCAL_REDIRECT_BASE);
  url.searchParams.set(AUTH_RETURN_TO_PARAM, sanitized);
  return `${url.pathname}${url.search}${url.hash}`;
}
