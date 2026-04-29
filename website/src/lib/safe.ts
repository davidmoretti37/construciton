/**
 * Wrap a Supabase query so missing tables / network errors degrade to a fallback
 * instead of throwing. Used across the cockpit to keep pages rendering when an
 * unverified table is absent (see SPEC.md §3).
 */
const DEFAULT_TIMEOUT_MS = 8_000;

interface QueryResult<T> {
  data: T | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any;
}

export async function safe<T>(
  label: string,
  promise: PromiseLike<QueryResult<T>>,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  try {
    const result = await Promise.race([
      promise,
      new Promise<QueryResult<T>>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), timeoutMs)
      ),
    ]);
    if (result.error) {
      console.warn(`[safe] ${label}:`, result.error.message ?? result.error);
      return fallback;
    }
    return (result.data as T) ?? fallback;
  } catch (e) {
    console.warn(`[safe] ${label} threw:`, e);
    return fallback;
  }
}
