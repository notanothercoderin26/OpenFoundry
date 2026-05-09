import { describe, expect, it } from 'vitest';

import { sanitizeAuthReturnTo, withAuthReturnTo } from './redirects';

describe('auth redirects', () => {
  it('keeps local application paths with query and hash', () => {
    expect(sanitizeAuthReturnTo('/settings?tab=users#roles')).toBe('/settings?tab=users#roles');
    expect(sanitizeAuthReturnTo('/authorization-policy')).toBe('/authorization-policy');
  });

  it('rejects external and auth-loop redirects', () => {
    expect(sanitizeAuthReturnTo('https://example.com/settings')).toBeNull();
    expect(sanitizeAuthReturnTo('//example.com/settings')).toBeNull();
    expect(sanitizeAuthReturnTo('/auth/login')).toBeNull();
    expect(sanitizeAuthReturnTo('/auth/mfa?returnTo=/settings')).toBeNull();
  });

  it('adds the sanitized return target to auth routes', () => {
    expect(withAuthReturnTo('/auth/login?registered=true', '/settings?tab=users')).toBe(
      '/auth/login?registered=true&returnTo=%2Fsettings%3Ftab%3Dusers',
    );
  });
});
