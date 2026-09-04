/**
 * P9.2: the coarse half of this app's rate limiting. `proxy.ts` runs on
 * (effectively) every request, including every Server Action POST —
 * Next.js sends those to the same page route with a `Next-Action`
 * header, not a distinct URL, so this is the only single choke point
 * that sees them all uniformly alongside the handful of real `/api/*`
 * route handlers. That's what makes it the right place for "any route
 * that writes" (brief, verbatim) as a blanket backstop, rather than
 * hand-instrumenting every one of this app's several dozen server
 * actions individually.
 *
 * Deliberately NOT Postgres-backed like `src/lib/rate-limit.ts`'s named
 * checks (signup/login/export) — a DB round trip on literally every
 * request, including every GET page load, would be a real, needless
 * latency/cost tax on the overwhelming majority of traffic that isn't
 * a write at all, and PERF-BUDGET.md's own discipline (a budget fixed
 * before measuring, not padded after) is exactly the reason not to
 * introduce one without a specific number to justify it. A plain
 * module-scope map is the same tradeoff Unsplash's `server.ts` already
 * makes for its own cache (CLAUDE.md: "helps for real on a single warm
 * instance, not guaranteed across cold starts or concurrent
 * instances") — good enough to blunt a script hammering the app from
 * one IP, not a precise or distributed guarantee. The four named
 * surfaces that actually need a real, correctness-grade limit
 * (signup/login/export, all low-frequency by nature) get the
 * Postgres-backed check instead, layered on top of this, not in place
 * of it.
 */

type Bucket = { windowStart: number; count: number };

const buckets = new Map<string, Bucket>();

// Loose by design -- this exists to blunt a scripted flood, not to
// throttle a normal person editing several tasks in a row. The named,
// precise limits (rate-limit.ts) are what actually protects
// signup/login/export specifically.
const WRITE_LIMIT = 120;
const WRITE_WINDOW_MS = 60_000;

// Unbounded growth guard -- a genuinely distributed attack from many
// IPs could otherwise grow this map forever between cold starts. Swept
// opportunistically on write, not on a timer (no background tasks in
// this runtime) -- cheap because it only walks entries once the map
// has actually grown large enough to matter.
const MAX_TRACKED_BUCKETS = 5000;

export function isWriteMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function checkEdgeWriteLimit(ip: string): boolean {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_BUCKETS) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > WRITE_WINDOW_MS) {
        buckets.delete(key);
      }
    }
  }

  const existing = buckets.get(ip);
  if (!existing || now - existing.windowStart > WRITE_WINDOW_MS) {
    buckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  existing.count += 1;
  return existing.count <= WRITE_LIMIT;
}
