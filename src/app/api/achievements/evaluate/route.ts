import { NextResponse } from "next/server";

import { evaluateAchievements } from "@/lib/achievements/evaluate";
import { createClient } from "@/lib/supabase/server";

// Never statically optimized/cached — every hit must actually run
// app.evaluate_achievements, not serve a cached response.
export const dynamic = "force-dynamic";

/**
 * P7.2's mandated entry point (brief, verbatim: "Call
 * app.evaluate_achievements(auth.uid()) from a route handler"), mirroring
 * /api/llamas/evaluate's own shape exactly — same "kept thin, single
 * canonical entry point" reasoning. The five real call sites (check-in
 * submit, goal/trip completion, ledger entry creation, dashboard load)
 * already have a Supabase client and session in hand server-side, so
 * they import `evaluateAchievements`/`evaluateAchievementsDebounced`
 * directly rather than making a self-referential HTTP round trip through
 * this route; this exists as the documented, directly-callable surface
 * for anything else that only has a session and a fetch (a future
 * client-triggered "check now" action, an external caller).
 */
export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const unlocked = await evaluateAchievements(supabase, auth.claims.sub);

  return NextResponse.json({ unlocked });
}
