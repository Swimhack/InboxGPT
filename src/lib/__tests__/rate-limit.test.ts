import { checkRateLimit, pruneRateLimitStore } from '../rate-limit';

// The store is module-level — reset between tests by advancing time or using unique keys.
// Using unique keys per test avoids interference without needing to reach into the module.

function uniqueKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const key = uniqueKey('under');
    const opts = { limit: 3, windowMs: 60_000 };

    const r1 = checkRateLimit(key, opts);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(key, opts);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(key, opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks the request exactly at the limit', () => {
    const key = uniqueKey('at-limit');
    const opts = { limit: 2, windowMs: 60_000 };

    checkRateLimit(key, opts);
    checkRateLimit(key, opts);

    const blocked = checkRateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('returns a positive retryAfter when blocked', () => {
    const key = uniqueKey('retry-after');
    const opts = { limit: 1, windowMs: 60_000 };

    checkRateLimit(key, opts); // consumes the slot

    const blocked = checkRateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it('returns retryAfter=0 and remaining>0 when allowed', () => {
    const key = uniqueKey('allowed-meta');
    const opts = { limit: 5, windowMs: 60_000 };

    const result = checkRateLimit(key, opts);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBe(0);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('slides the window — old timestamps age out and allow new requests', () => {
    const key = uniqueKey('sliding');
    const opts = { limit: 2, windowMs: 100 }; // 100ms window

    // Fill the window
    checkRateLimit(key, opts);
    checkRateLimit(key, opts);
    expect(checkRateLimit(key, opts).allowed).toBe(false);

    // Wait for the window to expire, then new requests should be allowed again
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = checkRateLimit(key, opts);
        expect(result.allowed).toBe(true);
        resolve();
      }, 150);
    });
  });

  it('tracks separate limits per key', () => {
    const opts = { limit: 1, windowMs: 60_000 };
    const keyA = uniqueKey('key-a');
    const keyB = uniqueKey('key-b');

    checkRateLimit(keyA, opts); // exhausts keyA
    const resultB = checkRateLimit(keyB, opts); // keyB untouched
    expect(resultB.allowed).toBe(true);
    expect(checkRateLimit(keyA, opts).allowed).toBe(false);
  });
});

describe('pruneRateLimitStore', () => {
  it('runs without error (smoke test)', () => {
    expect(() => pruneRateLimitStore()).not.toThrow();
  });
});
