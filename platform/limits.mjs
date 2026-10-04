/* Rate limits and a concurrency cap.

   The limiter is async on purpose, though the memory store is not: a shared
   store (Redis: INCR + PEXPIRE on the same keys) can replace it once there is
   more than one server process, without touching a single call site. Until
   then counts live in this process and reset on restart.

   take(key, limit, windowMs) counts one hit in a fixed window and resolves
   { ok, retryAfterSec }. */

export function createLimiter() {
  const windows = new Map(); // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }, 60000).unref();

  return {
    async take(key, limit, windowMs) {
      const now = Date.now();
      let w = windows.get(key);
      if (!w || w.resetAt <= now) {
        // Aligned windows, so a day-long window resets at midnight UTC.
        const start = Math.floor(now / windowMs) * windowMs;
        w = { count: 0, resetAt: start + windowMs };
        windows.set(key, w);
      }
      if (w.count >= limit) return { ok: false, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
      w.count++;
      return { ok: true, retryAfterSec: 0 };
    },
  };
}

/* At most `max` tasks at once in this process; past that, callers are turned
   away immediately rather than queued, so a burst cannot pile up memory and
   open sockets. Returns a release function, or null when full. */
export function createConcurrencyGate(max) {
  let active = 0;
  return {
    tryEnter() {
      if (active >= max) return null;
      active++;
      let released = false;
      return () => { if (!released) { released = true; active--; } };
    },
    get active() { return active; },
  };
}
