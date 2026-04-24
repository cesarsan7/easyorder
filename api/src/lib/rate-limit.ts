// In-memory sliding-window rate limiter.
// Sufficient for single-instance deployments. For multi-instance, replace
// the Map with a shared Redis counter (INCR + EXPIRE pattern).

const windows = new Map<string, number[]>();
const WINDOW_MS = 60_000; // 1 minute

/**
 * Returns true if the request is within the allowed quota.
 * Returns false (caller must respond 429) if the limit is exceeded.
 */
export function checkRateLimit(key: string, maxPerWindow: number): boolean {
  const now = Date.now();
  const prev = windows.get(key) ?? [];
  const hits = prev.filter((t) => now - t < WINDOW_MS);
  if (hits.length >= maxPerWindow) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  return true;
}
