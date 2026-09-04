import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

// Never statically optimized/cached — every hit must actually reach
// the database, not serve a stale "ok" from build time.
export const dynamic = "force-dynamic";

/**
 * P9.2: "an authenticated health route that touches the database"
 * (brief, verbatim) — a plain 200 from Next.js/Vercel only proves the
 * process is running, which is a meaningfully weaker signal than "the
 * app actually works." An outage where the Node process is healthy but
 * Postgres is unreachable (a Supabase incident, an exhausted
 * connection pool, a revoked key) would show green to a monitor that
 * only checks the former.
 *
 * Bearer-secret gated, not open — a public, unauthenticated
 * `/api/health` is a standing invitation for exactly the kind of
 * scripted traffic `src/lib/rate-limit-edge.ts`'s blanket write
 * throttle exists to blunt elsewhere, except this route is meant to be
 * hit *far* more often (every few minutes, forever) than any write
 * path, so it gets its own secret (`HEALTH_CHECK_SECRET`) rather than
 * reusing `CRON_SECRET` — the two have different rotation needs and
 * different holders (an uptime-monitoring third party here, Vercel's
 * own cron infrastructure there).
 *
 * Deliberately the service-role client, not a request-scoped one —
 * there is no user session to scope this check to, and the point is
 * to verify the database itself is reachable, not to exercise RLS.
 * The query is as cheap as a real table read gets (`select id ...
 * limit 1`, no filtering, no join) — this is a liveness probe, not a
 * data check.
 */
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.HEALTH_CHECK_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service.from("profiles").select("id").limit(1);

  if (error) {
    console.error("GET /api/health: database check failed", error);
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    database: "reachable",
    timestamp: new Date().toISOString(),
  });
}
