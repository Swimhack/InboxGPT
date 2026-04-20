/**
 * In-memory sliding window rate limiter.
 * Stores per-key timestamps in a module-level Map so the limit persists
 * across requests within a single Next.js process lifetime.
 *
 * Suitable for single-instance deployments. For multi-instance/edge
 * deployments, swap the Map for an Upstash Redis store.
 */

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the oldest request ages out of the window */
  retryAfter: number;
  /** Requests remaining in this window */
  remaining: number;
}

// Module-level store — survives across requests in the same process
const store = new Map<string, number[]>();

/**
 * Check whether `key` (e.g. userId) is within the rate limit.
 * Mutates the store on each call; call only once per request.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const { limit, windowMs } = options;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Retrieve existing timestamps, drop those outside the window
  const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    // Oldest request in the window determines when a slot frees up
    const oldestInWindow = timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  // Record this request
  timestamps.push(now);
  store.set(key, timestamps);

  return { allowed: true, retryAfter: 0, remaining: limit - timestamps.length };
}

/** Remove stale entries to prevent memory growth in long-running processes. */
export function pruneRateLimitStore(): void {
  const cutoff = Date.now() - 60_000; // 1 minute
  store.forEach((timestamps: number[], key: string) => {
    const fresh = timestamps.filter((t: number) => t > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
  });
}
