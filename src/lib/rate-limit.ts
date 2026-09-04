import { createServiceClient } from "@/lib/supabase/service";

export { getClientIp } from "@/lib/get-client-ip";

/**
 * P9.2: the precise half of this app's rate limiting — Postgres-backed
 * (migration 0042's `app.rate_limits` + `check_rate_limit`), used on
 * the handful of named surfaces the brief calls out specifically
 * (signup, login, export) where the limit has to be exact and survive
 * across serverless instances/cold starts. The coarse half —
 * `src/lib/rate-limit-edge.ts`'s in-memory blanket throttle in
 * `proxy.ts`, covering every write path (server actions included) as a
 * backstop — is deliberately a separate, lighter mechanism; see that
 * file's own header for why one Postgres round trip per request
 * everywhere would be the wrong tradeoff.
 *
 * Always goes through the service client, never the request-scoped one
 * — rate limiting has to work identically whether or not a session
 * exists yet (signup and login attempts have none), and
 * `public.check_rate_limit`'s own gate refuses anything but
 * service_role regardless (0042's own comment explains why: a
 * caller-suppliable bucket name reachable by anon/authenticated would
 * let one user grief another's bucket).
 */
export type RateLimitResult = { allowed: boolean };

export async function checkRateLimit(
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fails open, loudly logged -- a rate-limiter outage blocking every
    // signup/login/export would be a worse incident than the abuse this
    // exists to catch. Matches this codebase's existing "log-and-degrade
    // for a non-critical helper" precedent (money/ledger/actions.ts's
    // getUserContext, per CLAUDE.md's P7.5 note) rather than the
    // "throw on a real error" one, since this genuinely isn't the
    // request's own critical path.
    console.error(`checkRateLimit(${bucket}) failed, failing open`, error);
    return { allowed: true };
  }

  return { allowed: data === true };
}
