import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  searchUnsplashPhotos,
  UnsplashConfigError,
  UnsplashRateLimitError,
} from "@/lib/unsplash/server";

// A live proxied search, never statically optimized — same reasoning as
// /api/fx/refresh: this must actually hit Unsplash (or the in-memory
// cache) on every distinct query, not serve a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Proxied Unsplash search — the API key never reaches the browser (P6.0
 * brief: "all calls go through Next.js route handlers, never the
 * browser"). Gated on any signed-in session, same bar as
 * /api/fx/refresh's in-app path: not admin-only, but not anonymous
 * either — an unauthenticated caller shouldn't be able to spend this
 * app's shared 50/hour quota on demand.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  const pageParam = Number(params.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  try {
    const results = await searchUnsplashPhotos(q, page);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof UnsplashRateLimitError) {
      // "Never a generic error... image search is briefly unavailable,
      // try again shortly, upload a photo instead" (brief, verbatim) —
      // the exact wording lives here, at the source, rather than being
      // reconstructed client-side from a generic message + a status
      // code check.
      return NextResponse.json(
        {
          error:
            "Image search is briefly unavailable — try again shortly, or upload a photo instead.",
          rateLimited: true,
        },
        { status: 429 },
      );
    }
    if (error instanceof UnsplashConfigError) {
      console.error(error.message);
      return NextResponse.json(
        { error: "Photo search isn't configured yet." },
        { status: 500 },
      );
    }
    console.error("GET /api/unsplash/search failed", error);
    return NextResponse.json(
      { error: "Photo search failed. Try again." },
      { status: 502 },
    );
  }
}
