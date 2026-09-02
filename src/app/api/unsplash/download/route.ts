import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  triggerUnsplashDownload,
  UnsplashConfigError,
  UnsplashRateLimitError,
} from "@/lib/unsplash/server";

export const dynamic = "force-dynamic";

/**
 * Fires Unsplash's required download-tracking trigger. Called by
 * `<PhotoPicker>` at the moment a user *selects* a photo — never at
 * display time, per the API terms (P6.0 brief). Body carries the exact
 * `downloadLocation` the search route returned for that photo, not a
 * bare photo id, since Unsplash's own guidance is to hit the specific
 * `links.download_location` URL a search/list response gave you.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { downloadLocation?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (typeof body.downloadLocation !== "string" || !body.downloadLocation) {
    return NextResponse.json(
      { error: "downloadLocation is required." },
      { status: 400 },
    );
  }

  try {
    await triggerUnsplashDownload(body.downloadLocation);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnsplashRateLimitError) {
      return NextResponse.json(
        {
          error:
            "Unsplash is busy right now — try searching again in a few minutes.",
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
    console.error("POST /api/unsplash/download failed", error);
    return NextResponse.json(
      { error: "Could not record the photo download." },
      { status: 502 },
    );
  }
}
