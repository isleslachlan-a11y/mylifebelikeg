import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { DREAM_PHOTOS_BUCKET, SIGNED_URL_TTL_SECONDS, deriveThumbPath } from "./dream-photos";

/**
 * Server-only. Nothing here should ever be imported from a Client
 * Component. Every function takes the *caller's own* authenticated
 * server client (src/lib/supabase/server.ts) rather than a service-role
 * one -- signing a URL or removing an object for a user's own path only
 * ever succeeds because their own auth.uid() already passes migration
 * 0032's storage policies, which is already the exact authorization
 * surface wanted (same "which client, which authorization surface"
 * reasoning CLAUDE.md's Server action conventions section documents for
 * table RLS) -- there's no case here where RLS is broader than what the
 * UI should allow, the way service.ts exists for elsewhere.
 */

type SupabaseServerClient = SupabaseClient<Database>;

/**
 * Batched -- "the grid will show dozens at once" (brief). One Storage
 * API call for every path rather than one round trip per thumbnail.
 * A path that fails to sign (RLS refusal, a since-deleted object) is
 * simply absent from the returned map rather than throwing -- a missing
 * signed URL degrades to `<SomedayCard>`'s existing no-photo gradient
 * fallback, the same graceful-degradation shape P6.1/P6.2 already use
 * when Unsplash/Mapbox aren't configured.
 */
export async function getSignedDreamPhotoUrls(
  supabase: SupabaseServerClient,
  paths: string[],
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from(DREAM_PHOTOS_BUCKET)
    .createSignedUrls(unique, expiresIn);

  if (error) {
    console.error("Failed to sign dream photo URLs", unique, error);
    return new Map();
  }

  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.signedUrl && !row.error && row.path) {
      result.set(row.path, row.signedUrl);
    } else if (row.error) {
      console.error("Failed to sign one dream photo URL", row.path, row.error);
    }
  }
  return result;
}

/**
 * Single-path convenience wrapper -- the detail view's own "only the
 * detail view loads the full image" (brief) path: called once when
 * `<SomedayFormDialog>` opens on an item with an uploaded photo, its
 * result cached in that dialog's own component state for the dialog's
 * lifetime rather than re-signed on every render (brief, verbatim).
 */
export async function getSignedDreamPhotoUrl(
  supabase: SupabaseServerClient,
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DREAM_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    console.error("Failed to sign dream photo URL", path, error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Removes both the full image and its derived thumbnail for every path
 * given. "Log failures rather than swallowing them -- orphaned objects
 * are a slow leak that only shows up as a bill" (brief, verbatim): a
 * failed removal is logged loudly and reported back to the caller, but
 * never thrown -- by the time this runs, the row deletion or photo
 * replacement it's cleaning up after has already committed, so a
 * storage-side failure here shouldn't roll that back or block the
 * response, only avoid being invisible. (A target that was never
 * actually uploaded -- e.g. a thumb that failed mid-upload -- also shows
 * up as "not removed" here; that's an intentional false-positive-leaning
 * log, not a masked real bug, per the same "log failures" instruction.)
 */
export async function deleteDreamPhotoObjects(
  supabase: SupabaseServerClient,
  fullPaths: string[],
): Promise<{ removed: string[]; failed: string[] }> {
  const targets = [...new Set(fullPaths.filter(Boolean))].flatMap((path) => [
    path,
    deriveThumbPath(path),
  ]);
  if (targets.length === 0) return { removed: [], failed: [] };

  const { data, error } = await supabase.storage
    .from(DREAM_PHOTOS_BUCKET)
    .remove(targets);

  if (error) {
    console.error("Failed to remove dream photo objects", targets, error);
    return { removed: [], failed: targets };
  }

  const removed = (data ?? []).map((row) => row.name);
  const failed = targets.filter((path) => !removed.includes(path));
  if (failed.length > 0) {
    console.error("Some dream photo objects were not removed", failed);
  }
  return { removed, failed };
}
