import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { deleteDreamPhotoObjects } from "@/lib/storage/dream-photos-server";

// Never statically optimized/cached -- every hit must actually call
// Storage's remove endpoint, not serve a cached response.
export const dynamic = "force-dynamic";

/**
 * P8.1's mandated entry point (brief, verbatim: "Write this as a route
 * handler the delete path calls"), kept thin -- the same
 * "documented, directly-callable surface" shape /api/achievements/evaluate
 * and /api/llamas/evaluate already establish (see their own comments):
 * `someday/actions.ts`'s `deleteSomedayItem` and the photo-replacement
 * branch of `updateSomedayItem` already have a Supabase client and
 * session in hand server-side, so they import `deleteDreamPhotoObjects`
 * directly rather than making a self-referential HTTP round trip through
 * this route (constructing an absolute URL and forwarding auth cookies
 * from inside a server action for a same-process call is exactly the
 * kind of self-fetch that pattern deliberately avoids). This route is
 * the surface for anything else that only has a session and a fetch --
 * a future client-triggered retry, an external cleanup sweep -- and is
 * where a *caller-supplied* cleanup request would need to land regardless
 * of who's asking, so `deleteDreamPhotoObjects`'s own "log failures
 * loudly" behaviour is exercised the same way from every caller.
 *
 * No ownership check beyond RLS itself: the storage policies (0032)
 * already refuse to remove any path whose first segment isn't the
 * caller's own auth.uid(), so a caller passing someone else's path here
 * just gets it back in `failed` -- the same refusal `deleteDreamPhotoObjects`
 * already logs for any other removal failure, not a special case.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const paths =
    typeof body === "object" &&
    body !== null &&
    "paths" in body &&
    Array.isArray((body as { paths: unknown }).paths)
      ? (body as { paths: unknown[] }).paths.filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
      : null;

  if (!paths || paths.length === 0) {
    return NextResponse.json(
      { error: "Request body must include a non-empty `paths` array." },
      { status: 400 },
    );
  }

  const result = await deleteDreamPhotoObjects(supabase, paths);
  return NextResponse.json(result);
}
