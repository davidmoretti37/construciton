/**
 * Portal API helper
 * Auth token is stored in an httpOnly cookie set by the backend.
 * The cookie is sent automatically via credentials: 'include'.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

export async function portalFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BACKEND_URL}/api/portal${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
