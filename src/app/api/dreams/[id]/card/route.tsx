import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { createClient } from "@/lib/supabase/server";
import { describeWantedDuration } from "@/lib/someday";
import { getSignedDreamPhotoUrl } from "@/lib/storage/dream-photos-server";

// P8.6: "server-rendered image generation via next/og — it runs on
// Vercel's edge runtime without a headless browser" (brief). That
// framing is accurate for older Next.js versions, but this project's
// installed Next.js (16.3.0) has deprecated the `runtime = 'edge'`
// route segment export outright -- "Remove the `runtime` export from
// your route files," per its own docs (node_modules/next/dist/docs,
// checked directly rather than assumed, per this repo's own standing
// "this is not the Next.js you know" rule). No `runtime` export here as
// a result: ImageResponse works the same way on the default (nodejs)
// runtime this version now uses, and that default is what actually lets
// this route read the bundled font file via `node:fs` below -- edge
// runtime never supported that at all.

const FONT_PATH = join(process.cwd(), "src/app/api/dreams/[id]/card/InstrumentSerif-Regular.ttf");
let fontDataPromise: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  // Read once, module scope, reused across every request this instance
  // serves -- same "the font doesn't depend on request data" guidance
  // the ImageResponse docs give for exactly this. Instrument Serif is
  // this app's own --font-display (src/app/layout.tsx), OFL-licensed
  // (InstrumentSerif-OFL.txt, alongside this file) -- the card's title
  // uses the same brand face the rest of the app does, not a generic
  // fallback.
  fontDataPromise ??= readFile(FONT_PATH);
  return fontDataPromise;
}

const SIZES = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;
type CardFormat = keyof typeof SIZES;

function isCardFormat(value: string | null): value is CardFormat {
  return value === "feed" || value === "story";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format");
  const format: CardFormat = isCardFormat(formatParam) ? formatParam : "feed";
  const { width, height } = SIZES[format];

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = auth.claims.sub;

  // "Never anyone else's data" (brief) -- an explicit owner filter on
  // top of someday_select's own RLS, the same "RLS alone is broader
  // than what the UI should allow" reasoning /api/export's own comment
  // documents: someday_select also permits a share-grant *viewer*, but
  // sharing a card is the *owner's* act, not something a viewer with
  // read access should be able to trigger on someone else's dream.
  // Achieved-only ("build shareable images for achieved dreams," brief,
  // verbatim) is enforced the same way, in the same query, not as a
  // second check after the fact.
  const { data: dream, error } = await supabase
    .from("someday_items")
    .select(
      "id, title, created_at, achieved_at, achieved_storage_path, image_source, storage_path",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("achieved_at", "is", null)
    .maybeSingle();

  if (error) {
    console.error("Share card: dream lookup failed", error);
    return new Response("Something went wrong.", { status: 500 });
  }
  // A plain 404, not a 403 distinguishing "not yours" from "doesn't
  // exist" -- the same reasoning a stranger being refused a signed URL
  // for someone else's storage object already gets in this app (P8.1),
  // applied here: no oracle for probing which dream ids are real.
  if (!dream) {
    return new Response("Not found.", { status: 404 });
  }

  // Unsplash correction (P6.0/Unsplash package): "generating an image
  // that bakes an Unsplash photo into a new composition is
  // redistribution, and it conflicts with the hotlinking guideline
  // regardless of intent" (brief, verbatim) -- a previous version of
  // this route fetched `unsplash_full_url`, re-encoded it via `sharp`,
  // and embedded the result as a data URI in the generated card, which
  // is exactly that. Fixed by removing the fallback entirely rather
  // than trying to keep it "a little" -- there's no partial-compliance
  // version of baking a hotlinked photo into a new file. `share-card-button.tsx`'s
  // own caller (dream-form-dialog.tsx) is expected to not even render
  // the button in this case (see that file's own comment), so reaching
  // this branch at all means a stale client or a direct request --
  // refused outright, not degraded to a photo-less card, so the
  // restriction is visible rather than silently swallowed.
  const isUnsplashOnly =
    !dream.achieved_storage_path && dream.image_source === "unsplash";
  if (isUnsplashOnly) {
    return new Response(
      "This dream's only photo is from Unsplash, which can't be baked into a generated image. Add an achieved photo, or an uploaded photo, to share a card for it.",
      { status: 422 },
    );
  }

  // The achieved photo first (always an upload -- P8.0's own design,
  // "an achieved photo is definitionally always a real upload, never
  // Unsplash-sourced" -- see image-upload.tsx's comment). Only when
  // there isn't one (both photo and note are optional at achieve time,
  // P8.4) does this fall back to the dream's *own* photo -- which, now
  // that `isUnsplashOnly` has already refused the Unsplash case above,
  // can only ever be an upload here too.
  let photoUrl: string | null = null;

  if (dream.achieved_storage_path) {
    // Full-resolution image, not the grid's thumbnail -- this is a
    // full-bleed card background, not a list tile.
    photoUrl = await getSignedDreamPhotoUrl(
      supabase,
      dream.achieved_storage_path,
    );
  } else if (dream.image_source === "upload" && dream.storage_path) {
    photoUrl = await getSignedDreamPhotoUrl(supabase, dream.storage_path);
  }

  // P8.7: found live -- Satori (what `ImageResponse` renders `<img>`
  // through) can only decode PNG/JPEG, never WebP, and every uploaded
  // dream photo in this app *is* WebP (image-processing.ts's own
  // canvas-re-encode pipeline, P8.1) -- confirmed against the dev
  // server's own console ("Can't load image ... Unsupported image
  // type: image/webp") the first time this route was actually exercised
  // against an uploaded (not Unsplash) photo end to end. Every card
  // built during P8.6's own verification happened to use the Unsplash-
  // fallback path (a JPEG), which is exactly why this went unnoticed
  // until now. Fetched and re-encoded to JPEG here, server-side, via
  // `sharp` (already a transitive dependency of `next` itself, now a
  // direct one) rather than handing Satori the remote URL directly --
  // this also sidesteps relying on Satori's own internal fetch
  // succeeding at all, and the resize keeps the embedded data URI well
  // under next/og's asset-size ceiling regardless of how large the
  // original upload was. A failure here (a dead signed URL, a network
  // blip) degrades to "no photo" rather than failing the whole card --
  // the title/interval/mark are still worth having on their own.
  let photoDataUri: string | null = null;
  if (photoUrl) {
    try {
      const res = await fetch(photoUrl);
      if (!res.ok) {
        throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
      }
      const sourceBytes = Buffer.from(await res.arrayBuffer());
      const jpeg = await sharp(sourceBytes)
        .resize({ width: 1400, height: 1900, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      photoDataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    } catch (photoError) {
      console.error("Share card: photo fetch/convert failed", photoError);
    }
  }

  const interval = describeWantedDuration(dream.created_at, dream.achieved_at!);
  const fontData = await loadFont();

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            backgroundColor: "#0a0918",
            fontFamily: "Instrument Serif",
          }}
        >
          {photoDataUri && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoDataUri}
              alt=""
              width={width}
              height={height}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background:
                "linear-gradient(to bottom, rgba(10,9,24,0) 45%, rgba(10,9,24,0.55) 70%, rgba(10,9,24,0.96) 100%)",
            }}
          />

          {/* The mark -- this app's own established brand identity is
              just the wordmark itself (src/components/app-shell/sidebar.tsx),
              not a separate icon, so that's what travels onto the card too.
              The star is drawn as inline SVG (Lucide's own "sparkles" path --
              the exact mark the achieved-section badge already uses,
              dream-form-dialog.tsx) rather than a Unicode "✦" glyph: verified
              live against a real render that Instrument Serif has no glyph
              for U+2726, which Satori renders as an empty box rather than
              falling back to another font the way a browser would -- the
              same "hand-draw it, don't rely on font/library coverage"
              instinct the avatar system's own backdrop/accessory layers
              already follow for the same underlying reason. */}
          <div
            style={{
              position: "absolute",
              top: 56,
              left: 64,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 34,
              color: "#f5d89e",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#f5d89e">
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            </svg>
            <span style={{ color: "#edebfa" }}>Starmap</span>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              padding: "0 64px 88px 64px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 76,
                lineHeight: 1.08,
                color: "#edebfa",
              }}
            >
              {dream.title}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontFamily: "sans-serif",
                color: "#f5d89e",
              }}
            >
              {interval}
            </div>
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: [
          {
            name: "Instrument Serif",
            data: fontData,
            style: "normal",
            weight: 400,
          },
        ],
      },
    );
  } catch (renderError) {
    console.error("Share card: render failed", renderError);
    return new Response("Couldn't generate the card.", { status: 500 });
  }
}
