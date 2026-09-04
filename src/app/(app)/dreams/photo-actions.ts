"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSignedDreamPhotoUrl as signDreamPhotoUrl } from "@/lib/storage/dream-photos-server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Same reasoning as every other actions.ts in this app: every action here
// runs from an already-gated (app) route, so a missing session means it
// expired mid-use, not a first visit.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * The detail view's "only the detail view loads the full image" path
 * (brief) -- called once, client-side, when `<DreamFormDialog>` opens
 * on an item whose photo is an upload, and cached in that dialog's own
 * component state for its lifetime rather than re-signed per render.
 * The `getUserId` guard here is defense in depth, not the real
 * authorization: `getSignedDreamPhotoUrl` already only succeeds when the
 * caller's own auth.uid() passes migration 0032's SELECT policy, so an
 * unauthenticated request would fail there regardless -- this just keeps
 * the same shape every other action in this file (there being only one
 * so far) already follows.
 */
export async function getDreamPhotoSignedUrl(
  path: string,
): Promise<string | null> {
  const supabase = await createClient();
  await getUserId(supabase);
  return signDreamPhotoUrl(supabase, path);
}

// A fresh id for the *next* dream a user is about to create, needed
// before the row exists so <ImageUpload> has somewhere to put the object
// -- someday_items' path convention is {user_id}/{dream_id}/{uuid}.webp,
// and create mode has no dream_id yet. `crypto.randomUUID()` is a plain
// Web Crypto API call available directly in the browser, so this is
// generated client-side in dream-form-dialog.tsx itself rather than a
// server round trip just to mint a random id -- `createDream`
// (actions.ts) is given that same id explicitly on insert, so the folder
// a photo was actually uploaded to and the dream's real id are the same
// value from the start, no post-save reconciliation. If the dialog is
// closed without saving, whatever was uploaded under that id is an
// orphan nothing cleans up -- the same small, accepted edge case P4.6's
// own debounce race is ("not worth" building a create-time
// reservation/expiry system for a wishlist photo).
