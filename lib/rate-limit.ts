// Simple in-memory sliding-window rate limiter.
//
// Suitable for a single-process Next.js deployment (local dev, single Vercel
// instance). Resets on restart; does not coordinate across multiple instances.
// Upgrade to Redis-backed rate limiting (e.g. @upstash/ratelimit) if you add
// horizontal scaling.

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Sweep expired entries every minute to prevent unbounded memory growth.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000).unref?.();
}

/**
 * Check whether `key` has exceeded `limit` calls within `windowMs`.
 *
 * Returns `{ ok: true }` when the request is allowed.
 * Returns `{ ok: false, retryAfterMs }` when the limit is exceeded.
 *
 * @param key       Unique identifier (e.g. `"picks:${userId}"`)
 * @param limit     Maximum allowed calls in the window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { ok: true, retryAfterMs: 0 };
}
