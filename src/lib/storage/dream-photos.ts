/**
 * Isomorphic -- safe to import from a Client Component. Just the path
 * convention itself (`{user_id}/{dream_id}/{uuid}.webp`, thumbnails as a
 * `_thumb` suffix on the same uuid) and the bucket name/signed-URL TTL
 * constants, mirroring the `types.ts`/`server.ts` split P6.0's Unsplash
 * integration and P6.2's Mapbox integration already use for the same
 * reason: nothing that actually touches a Supabase client or does I/O
 * lives here, only pure derivations both `<ImageUpload>` (building the
 * path it's about to upload to) and `src/lib/storage/dream-photos-server.ts`
 * (signing/removing that same path later) need to agree on.
 */

export const DREAM_PHOTOS_BUCKET = "dream-photos";

// "Short expiry" (P8.1 brief) -- long enough that a URL minted once per
// Server Component render survives a normal browsing session of the
// someday grid (scrolling, a tab left open a while), short enough that a
// copied or leaked URL doesn't stay valid indefinitely. Re-minted fresh
// on every page load/navigation regardless of this value.
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

export function buildDreamPhotoPath(
  userId: string,
  dreamId: string,
  fileId: string,
): string {
  return `${userId}/${dreamId}/${fileId}.webp`;
}

/**
 * `{path}.webp` -> `{path}_thumb.webp`. A pure derivation, not a second
 * stored column -- migration 0032's own header explains why: two
 * independently-stored paths could drift apart (one column updated
 * without the other); a derived one structurally can't. Both this
 * function and `buildDreamPhotoPath` are the one place that convention
 * is encoded -- every other call site (upload, sign, delete) goes
 * through them rather than re-deriving the pattern inline.
 */
export function deriveThumbPath(fullPath: string): string {
  return fullPath.replace(/\.webp$/, "_thumb.webp");
}
