import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getBootstrapStatus } from '@api/auth';

export type BootstrapStatus = 'unknown' | 'setup_required' | 'ready';

let cached: BootstrapStatus = 'unknown';
let inflight: Promise<BootstrapStatus> | null = null;
const listeners = new Set<(status: BootstrapStatus) => void>();

function setStatus(next: BootstrapStatus) {
  cached = next;
  listeners.forEach((listener) => listener(next));
}

export function getBootstrapStatusCached(): BootstrapStatus {
  return cached;
}

export async function refreshBootstrapStatus(): Promise<BootstrapStatus> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await getBootstrapStatus();
      const next: BootstrapStatus = response.requires_initial_admin ? 'setup_required' : 'ready';
      setStatus(next);
      return next;
    } catch {
      setStatus('ready');
      return 'ready';
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function markSetupCompleted() {
  setStatus('ready');
}

export function useBootstrapGate(): BootstrapStatus {
  const [status, setLocalStatus] = useState<BootstrapStatus>(cached);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const listener = (next: BootstrapStatus) => setLocalStatus(next);
    listeners.add(listener);
    void refreshBootstrapStatus();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (status === 'setup_required' && location.pathname !== '/auth/setup') {
      navigate('/auth/setup', { replace: true });
    } else if (status === 'ready' && location.pathname === '/auth/setup') {
      navigate('/auth/login', { replace: true });
    }
  }, [status, location.pathname, navigate]);

  return status;
}
