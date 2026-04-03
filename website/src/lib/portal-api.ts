/**
 * Portal API helper
 * Sends X-Portal-Token header from localStorage for client auth.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('portal_session_token');
}

export function setPortalToken(token: string): void {
  localStorage.setItem('portal_session_token', token);
}

export function clearPortalToken(): void {
  localStorage.removeItem('portal_session_token');
}

export async function portalFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getPortalToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['X-Portal-Token'] = token;
  }

  const res = await fetch(`${BACKEND_URL}/api/portal${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
