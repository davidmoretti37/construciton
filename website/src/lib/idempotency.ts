/**
 * Generate a client-side Idempotency-Key for bulk Money II endpoints.
 * The Teller bulk-edit / batch-assign routes deduplicate by this header so
 * accidental double-submits (toolbar double-click, retry on flaky network)
 * don't double-apply the same action.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes — non-cryptographic but unique enough to
  // dedupe a single user's accidental retries within a session.
  const rand = Math.random().toString(36).slice(2, 10);
  return `idem-${Date.now().toString(36)}-${rand}`;
}
