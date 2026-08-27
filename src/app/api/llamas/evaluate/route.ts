import { NextResponse } from "next/server";

import { evaluateLlamaTriggers } from "@/lib/llamas/evaluate";
import { createClient } from "@/lib/supabase/server";

// Never statically optimized/cached — every hit must actually run the
// checks (subject to evaluateLlamaTriggers's own hourly debounce), not
// serve a cached response.
export const dynamic = "force-dynamic";

/**
 * P4.6's wiring endpoint. Always evaluates for the caller's own session
 * — there's no cross-user/admin case here, unlike /api/fx/refresh's
 * shared reference data, so "authenticated" is both the authorization
 * check and the scope. The two real call sites (check-in submit,
 * dashboard load) both already have a session in hand and could call
 * evaluateLlamaTriggers directly without an HTTP round trip, but the
 * brief asks for a route handler specifically — this is that single
 * canonical entry point, kept thin on purpose.
 */
export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await evaluateLlamaTriggers(supabase, auth.claims.sub);

  return NextResponse.json({ ok: true });
}
