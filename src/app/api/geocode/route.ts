import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { geocodePlace, MapboxConfigError } from "@/lib/mapbox/server";

// Live proxied search, never statically optimized — same reasoning as
// /api/unsplash/search.
export const dynamic = "force-dynamic";

/**
 * Proxied Mapbox forward geocoding — `MAPBOX_SECRET_TOKEN` never reaches
 * the browser. Gated on any signed-in session, same bar as
 * /api/unsplash/search: not admin-only, but not anonymous either, so an
 * unauthenticated caller can't spend this app's geocoding quota on
 * demand (see DEPLOYMENT.md's note on setting a Mapbox billing alert —
 * there's no hard spending cap to fall back on if that quota is abused).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await geocodePlace(q);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof MapboxConfigError) {
      console.error(error.message);
      return NextResponse.json(
        { error: "Place search isn't configured yet." },
        { status: 500 },
      );
    }
    console.error("GET /api/geocode failed", error);
    return NextResponse.json(
      { error: "Place search failed. Try again." },
      { status: 502 },
    );
  }
}
