/**
 * Isomorphic, dependency-free -- safe to import from `proxy.ts` (Edge
 * runtime) as well as ordinary server code, which is the whole reason
 * this is its own file rather than living inside `rate-limit.ts`
 * (which pulls in the service-role Supabase client, not something the
 * proxy's coarse write-throttle needs or should bundle).
 *
 * `x-forwarded-for`'s first entry is the original client -- Vercel's
 * edge network sets this reliably; every hop after the first (proxies,
 * load balancers) appends its own address rather than overwriting it,
 * so the first is the one worth bucketing on. Next.js dropped the old
 * `request.ip` extension (Vercel-specific, not part of the platform
 * going forward, per the framework's own current docs) -- this header
 * read is the replacement, same as the wider Next.js ecosystem uses.
 * Falls back to a fixed string in local dev, where no proxy sets this
 * header at all -- every local request then shares one bucket, which
 * is a known, harmless dev-only limitation, not a production gap.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
