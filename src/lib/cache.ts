/**
 * Tiny in-memory TTL cache for expensive source fetches.
 *
 * Chapter lists (esp. novelfull: 3218 chapters over 81 pages at ~1
 * req/s) cost 30–80s to build. Caching them in-process means that cost
 * is paid once per TTL window instead of on every page load. This is a
 * personal-use reader running a single Node process, so a module-level
 * Map is the right tool — no external store needed.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

/** Cap memory so a long-running server doesn't grow unbounded. */
const MAX_ENTRIES = 500;

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
  // If still oversized, drop oldest-inserted entries (Map preserves order).
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Get a cached value if present and fresh, else undefined. */
export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

/** Store a value with a TTL in milliseconds. */
export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
  prune();
}

/**
 * Return the cached value for `key`, or run `fn()`, store, and return
 * its result. Concurrent calls for the same key share one in-flight
 * promise so a burst of requests doesn't stampede the source.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Hour-scale TTL for metadata + chapter lists. */
export const TTL_CHAPTERS = 60 * 60 * 1000;
/** Shorter TTL for page lists (CDNs rotate). */
export const TTL_PAGES = 15 * 60 * 1000;
