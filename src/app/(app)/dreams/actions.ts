"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { isSomedayMilestone, type DreamKind } from "@/lib/someday";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import { evaluateAchievements } from "@/lib/achievements/evaluate";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
import { deleteDreamPhotoObjects } from "@/lib/storage/dream-photos-server";
import { DREAM_PHOTOS_BUCKET } from "@/lib/storage/dream-photos";
import type { Database } from "@/types/database";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";

type SomedayItem = Database["public"]["Tables"]["someday_items"]["Row"];
type DreamAffordabilityRow =
  Database["public"]["Views"]["v_dream_affordability"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

// P8.2: the someday list became the Dream Diary at /dreams -- see
// src/app/(app)/someday/page.tsx's own comment on the redirect.
const PATH = "/dreams";
const CURRENCY_RE = /^[A-Z]{3}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

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
 * The place fields a real Mapbox Geocoding client (P6.2) will eventually
 * fill in from a search result — stubbed here as plain manual input per
 * the P6.1 brief ("if doing this first, stub it with manual lat/lng").
 * `mapboxPlaceId` is threaded through already even though nothing sets it
 * yet, so P6.2 only has to start populating this field, not add it.
 */
export type PlaceInput = {
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  countryCode: string | null;
  mapboxPlaceId: string | null;
};

export type CostInput = {
  roughCostMinor: number | null;
  currency: string | null;
};

/**
 * P8.1: a dream's photo now comes from one of two sources, matching
 * `someday_items`' own `image_source` enum (0031) — whatever
 * `<PhotoPicker>` handed back on selection, or the storage path
 * `<ImageUpload>` already finished uploading to (the actual bytes are
 * long since in the bucket by the time this reaches the server; only the
 * path is persisted here — never a signed URL, which expires, per the
 * P8.1 brief). `null` means no photo at all, same as before P8.1.
 */
export type PhotoInput =
  | { source: "unsplash"; photo: UnsplashPhotoResult }
  | { source: "upload"; storagePath: string }
  | null;

export type SomedayItemInput = {
  title: string;
  /** P8.2: place shows the place picker, object/experience hide it and put price forward. Defaults to "place" (the column's own default, unchanged from before P8.0/P8.2) when a form never touches it -- "infer nothing" (brief) means this is always an explicit selector value, never guessed from the other fields. */
  kind: DreamKind;
  notes: string | null;
  lifeAreaId: string | null;
  cost: CostInput;
  place: PlaceInput;
  photo: PhotoInput;
};

/** Trims/uppercases the two fields the DB stores case-sensitively-fixed-width (currency `char(3)`, country `char(2)`) — done once, up front, so validation and the eventual insert/update agree on the exact same normalized value rather than validating one casing and writing another. */
function normalize(input: SomedayItemInput): SomedayItemInput {
  return {
    ...input,
    cost: {
      ...input.cost,
      currency: input.cost.currency?.trim().toUpperCase() || null,
    },
    place: {
      ...input.place,
      countryCode: input.place.countryCode?.trim().toUpperCase() || null,
    },
  };
}

function validateCommon(input: SomedayItemInput): string | null {
  if (!input.title.trim()) {
    return "Title can't be empty.";
  }
  if (input.cost.roughCostMinor != null) {
    if (
      !Number.isInteger(input.cost.roughCostMinor) ||
      input.cost.roughCostMinor < 0
    ) {
      return "Rough cost can't be negative.";
    }
    if (!input.cost.currency || !CURRENCY_RE.test(input.cost.currency)) {
      return "A rough cost needs a currency.";
    }
  }
  if (input.place.countryCode && !COUNTRY_RE.test(input.place.countryCode)) {
    return "Country code must be 2 letters, e.g. JP.";
  }
  if ((input.place.latitude == null) !== (input.place.longitude == null)) {
    return "Enter both latitude and longitude, or neither.";
  }
  if (
    input.place.latitude != null &&
    (input.place.latitude < -90 || input.place.latitude > 90)
  ) {
    return "Latitude must be between -90 and 90.";
  }
  if (
    input.place.longitude != null &&
    (input.place.longitude < -180 || input.place.longitude > 180)
  ) {
    return "Longitude must be between -180 and 180.";
  }
  return null;
}

/**
 * Branches on `photo.source` -- exactly one of the two photo shapes is
 * ever set at a time, the rest explicitly nulled, so a row can never end
 * up with both an `unsplash_photo_id` and a `storage_path` set (which
 * `dream_image_source_consistent`, 0031, would refuse anyway; this is
 * what keeps a normal save from ever reaching that constraint at all).
 * `kind` (P8.2) is taken as-is from the form's own explicit selector --
 * no cross-checking against `place`/`cost` here, per "infer nothing"
 * (brief): a kind='object' dream with place fields somehow still set
 * (e.g. changed from place after already picking one) is saved exactly
 * as entered, not silently cleared -- the form itself hides the place
 * picker once kind isn't 'place', which is what actually keeps this
 * from happening in normal use.
 */
function toRow(input: SomedayItemInput) {
  return {
    title: input.title.trim(),
    kind: input.kind,
    notes: input.notes?.trim() || null,
    life_area_id: input.lifeAreaId,
    rough_cost_minor: input.cost.roughCostMinor,
    currency: input.cost.currency,
    place_name: input.place.placeName?.trim() || null,
    latitude: input.place.latitude,
    longitude: input.place.longitude,
    country_code: input.place.countryCode,
    mapbox_place_id: input.place.mapboxPlaceId,
    image_source: input.photo?.source ?? null,
    storage_path: input.photo?.source === "upload" ? input.photo.storagePath : null,
    unsplash_photo_id:
      input.photo?.source === "unsplash" ? input.photo.photo.id : null,
    unsplash_thumb_url:
      input.photo?.source === "unsplash" ? input.photo.photo.thumbUrl : null,
    unsplash_full_url:
      input.photo?.source === "unsplash" ? input.photo.photo.fullUrl : null,
    unsplash_author_name:
      input.photo?.source === "unsplash" ? input.photo.photo.authorName : null,
    unsplash_author_url:
      input.photo?.source === "unsplash" ? input.photo.photo.authorUrl : null,
  };
}

export async function createDream(
  rawInput: SomedayItemInput,
  /**
   * The id `<ImageUpload>` already used as the storage path's
   * `{dream_id}` segment (see photo-actions.ts's comment on why that's
   * generated client-side, before this row exists). Only meaningful when
   * `rawInput.photo.source === "upload"`; `someday_insert`'s RLS
   * WITH CHECK only constrains `user_id`, not `id`, so a client-supplied
   * primary key on insert is allowed structurally. Omitted (falls back
   * to the column's own default) for every other save, exactly as
   * before P8.1.
   */
  id?: string,
): Promise<ActionResult<SomedayItem>> {
  const input = normalize(rawInput);
  const validationError = validateCommon(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("someday_items")
    .insert({
      user_id: userId,
      ...(id ? { id } : {}),
      ...toRow(input),
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  // "Fluffy delivers a milestone message at every tenth item added"
  // (P6.1 brief) — checked against a fresh count immediately after the
  // insert, the same "exactly once, at the moment" shape goal_completed
  // uses (see CLAUDE.md), rather than a debounced background sweep like
  // evaluate.ts's other triggers: there's no ambiguity about "when" here,
  // the moment is this insert. A failed count read just means a missed
  // (not a wrong) celebration, so it's non-fatal to the save itself.
  const { count, error: countError } = await supabase
    .from("someday_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (countError) {
    console.error("Someday milestone count failed", countError);
  } else if (count != null && isSomedayMilestone(count)) {
    await emitLlamaMessage(
      userId,
      "bucket_list_milestone",
      { count },
      {
        type: "someday_item",
        id: data.id,
      },
    );
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function updateDream(
  id: string,
  rawInput: SomedayItemInput,
): Promise<ActionResult<SomedayItem>> {
  const input = normalize(rawInput);
  const validationError = validateCommon(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // Read the *old* storage_path before overwriting it -- "when... its
  // photo replaced, remove the orphaned objects" (P8.1 brief) needs to
  // know what the row used to point at, which the update's own returned
  // row (the *new* state) can no longer tell us.
  //
  // P8.7: `error` is captured and logged (not thrown) -- unlike the
  // update below, a failure here degrades rather than corrupts: `before`
  // ends up `undefined`, `before?.storage_path` below is falsy, and the
  // save simply skips its orphan-cleanup step instead of deleting the
  // wrong (or a nonexistent) object. Same "log-and-degrade for a
  // non-critical helper, throw for the write that actually matters"
  // split CLAUDE.md documents for money/ledger/actions.ts's
  // getUserContext (P5.5) -- silently dropping the error entirely (the
  // previous shape here) was the one thing actually wrong with it.
  const { data: before, error: beforeError } = await supabase
    .from("someday_items")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (beforeError) {
    console.error("Failed to read a dream's old storage_path before update", beforeError);
  }

  const { data, error } = await supabase
    .from("someday_items")
    .update(toRow(input))
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That item couldn't be found." };
  }

  // The old upload is orphaned the moment the row no longer points at it
  // -- whether the photo was removed, switched to an Unsplash photo, or
  // replaced with a different upload. Runs after the row write commits,
  // logged rather than thrown on failure (deleteDreamPhotoObjects's own
  // contract) so a storage-side hiccup never undoes a successful save.
  if (before?.storage_path && before.storage_path !== data.storage_path) {
    await deleteDreamPhotoObjects(supabase, [before.storage_path]);
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function deleteDream(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // Promoted items are excluded up front rather than relying on the
  // delete itself to fail: someday_delete's own RLS policy has no such
  // carve-out (it's a bare user_id = auth.uid() check — confirmed against
  // the live schema), so an unguarded call here would actually succeed
  // and detach a real trip stop's someday_item_id from its origin. "Stay
  // visible" (P6.1 brief) means promoted items aren't deletable from this
  // list at all, not just hidden from the delete button.
  const { data: existing, error: fetchError } = await supabase
    .from("someday_items")
    .select("id, promoted_at, storage_path, achieved_storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!existing) {
    return { ok: false, error: "That item couldn't be found." };
  }
  if (existing.promoted_at) {
    return {
      ok: false,
      error: "This place is already part of a trip and can't be deleted.",
    };
  }

  const { error } = await supabase
    .from("someday_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  // "Storage does not cascade with the row" (P8.1 brief) -- the row is
  // already gone at this point, so this only ever adds an orphan-cleanup
  // step, never blocks or reverts the delete that already succeeded.
  // achieved_storage_path has no thumbnail of its own (P8.0 gave it a
  // single column, not the storage_path/image_source pairing) -- nothing
  // in this app sets it yet (that's a later package's job), so this is
  // forward-looking, zero-cost defense against an orphan once it can
  // exist, not something exercised by any flow built so far.
  if (existing.storage_path) {
    await deleteDreamPhotoObjects(supabase, [existing.storage_path]);
  }
  if (existing.achieved_storage_path) {
    const { error: achievedRemoveError } = await supabase.storage
      .from(DREAM_PHOTOS_BUCKET)
      .remove([existing.achieved_storage_path]);
    if (achievedRemoveError) {
      console.error(
        "Failed to remove an achieved dream photo object",
        existing.achieved_storage_path,
        achievedRemoveError,
      );
    }
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/**
 * "On a dream with a price, show the months-to-afford figure from
 * v_dream_affordability" (P8.3 brief) -- a thin RLS-scoped read, not a
 * recomputation: `security_invoker` on the view (0033) already means
 * this can only ever return the caller's own row. `null` data (rather
 * than an error) covers every reason the row legitimately doesn't exist
 * -- no price set yet, achieved, or archived (v_dream_affordability's
 * own WHERE clause) -- so the dialog can just render nothing when this
 * comes back empty, no special-casing which of those it was.
 */
export async function getDreamAffordability(
  dreamId: string,
): Promise<ActionResult<DreamAffordabilityRow | null>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("v_dream_affordability")
    .select("*")
    .eq("dream_id", dreamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  return { ok: true, data };
}

/**
 * "A dream with a price and enough intent becomes a goal... keep the
 * link both ways" (P8.3 brief). The actual insert-goal-and-link
 * transaction lives entirely in app.promote_dream_to_goal (0033) --
 * atomicity has to live inside the function, same reasoning
 * create_trip_goal's own comment gives, since PostgREST gives one
 * statement per request. This wrapper's only job is calling it and then
 * reading the *dream* row back fresh, same "a change that ripples
 * beyond the row the caller directly touched returns the full fresh
 * state, not an optimistic patch" shape dependency-actions.ts already
 * established for critical-path ripples -- promoted_goal_id/
 * goal_promoted_at are exactly that kind of side effect here.
 */
export async function promoteDreamToGoal(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error: rpcError } = await supabase.rpc("promote_dream_to_goal", {
    dream_id: dreamId,
  });
  if (rpcError) {
    return { ok: false, error: humanizeDbError(rpcError) };
  }

  const { data, error } = await supabase
    .from("someday_items")
    .select()
    .eq("id", dreamId)
    .eq("user_id", userId)
    .single();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  revalidatePath("/goals");
  return { ok: true, data };
}

export type AchieveDreamResult = {
  dream: SomedayItem;
  unlockedAchievements: NewlyUnlockedAchievement[];
};

/**
 * "A dream is achieved with one action... asks for two optional things
 * and nothing more: a photo of the real thing and a line about it. Both
 * skippable" (P8.4 brief, verbatim). No guard against "already
 * promoted" -- achieving and promoting are independent axes ("achieved
 * is not promoted... a dream can be achieved without ever being
 * promoted"), so a promoted dream reaches this action exactly the same
 * way an unpromoted one does. Does guard against re-achieving an
 * already-achieved dream and against an archived one -- unlike
 * `promote_dream_to_goal`'s guards, these live in application code
 * rather than a DB function, since this is a plain single-table update
 * with nothing else that needs to happen atomically alongside it.
 *
 * Also the shared entry point for the "offer to mark achieved" quick-
 * accept on goal/trip completion (`goals/actions.ts`'s
 * `transitionGoalState`) -- that caller passes `{ note: null,
 * achievedStoragePath: null }`, the same "both skippable" shape this
 * form's own quick path already produces, not a second code path.
 */
export async function achieveDream(
  dreamId: string,
  input: { note: string | null; achievedStoragePath: string | null },
): Promise<ActionResult<AchieveDreamResult>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("someday_items")
    .select("id, achieved_at, archived_at")
    .eq("id", dreamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!existing) {
    return { ok: false, error: "That dream couldn't be found." };
  }
  if (existing.archived_at) {
    return {
      ok: false,
      error: "Unarchive this dream before marking it achieved.",
    };
  }
  if (existing.achieved_at) {
    return { ok: false, error: "This dream is already achieved." };
  }

  const { data, error } = await supabase
    .from("someday_items")
    .update({
      achieved_at: new Date().toISOString(),
      achieved_note: input.note?.trim() || null,
      achieved_storage_path: input.achievedStoragePath,
    })
    .eq("id", dreamId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  // "The moment matters. Fluffy delivers it" (brief) -- fired inline,
  // exactly once, the same "real event, not polled for" shape
  // goal_completed already uses. Never blocks the achieve itself, which
  // has already committed by this point.
  await emitLlamaMessage(
    userId,
    "dream_achieved",
    { dreamTitle: data.title },
    { type: "someday_item", id: data.id },
  );

  // "If it is the first dream achieved, or a tenth, app.evaluate_achievements
  // will return the unlock and the reveal follows the Phase 7 pattern"
  // (brief) -- the dreams_achieved branch (0031) is already in
  // app.evaluate_achievements; this is the same call site shape
  // goal/trip completion already uses.
  let unlockedAchievements: NewlyUnlockedAchievement[] = [];
  try {
    unlockedAchievements = await evaluateAchievements(supabase, userId);
  } catch (evalError) {
    console.error(
      "Achievement evaluation failed after achieving a dream",
      evalError,
    );
  }

  revalidatePath(PATH);
  return { ok: true, data: { dream: data, unlockedAchievements } };
}

/**
 * "Un-achieve must exist and must be quiet. Mis-taps happen." (P8.4
 * brief, verbatim) -- no llama message, no achievement re-evaluation:
 * app.evaluate_achievements only ever grants forward and is idempotent,
 * so there's nothing an un-achieve could take back even if this called
 * it, and calling it anyway would risk a *second*, confusing celebration
 * for something the user is actively undoing. Cleans up the achieved
 * photo object the same reasoning `deleteDream` already applies to this
 * exact column -- storage doesn't cascade with a column being cleared
 * to null any more than it does with a row being deleted.
 */
export async function unachieveDream(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: existing, error: fetchError } = await supabase
    .from("someday_items")
    .select("achieved_storage_path")
    .eq("id", dreamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) {
    return { ok: false, error: humanizeDbError(fetchError) };
  }
  if (!existing) {
    return { ok: false, error: "That dream couldn't be found." };
  }

  const { data, error } = await supabase
    .from("someday_items")
    .update({
      achieved_at: null,
      achieved_note: null,
      achieved_storage_path: null,
    })
    .eq("id", dreamId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  if (existing.achieved_storage_path) {
    const { error: removeError } = await supabase.storage
      .from(DREAM_PHOTOS_BUCKET)
      .remove([existing.achieved_storage_path]);
    if (removeError) {
      console.error(
        "Failed to remove an un-achieved dream's photo object",
        existing.achieved_storage_path,
        removeError,
      );
    }
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

/**
 * P8.5: the weekly check-in's own dream prompt. "Build dream
 * resurfacing on top of the existing check-in engine rather than
 * beside it" (brief) -- this wraps `app.surface_dream_for_checkin`
 * (0035), which is where the actual selection/idempotency logic lives;
 * this action's only job is calling it and fetching the winning row (or
 * returning `null` data when nothing was eligible -- not every user has
 * dreams, and that's a normal, silent case, not an error).
 */
export async function surfaceDreamForCheckin(
  checkInId: string,
): Promise<ActionResult<SomedayItem | null>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: dreamId, error: rpcError } = await supabase.rpc(
    "surface_dream_for_checkin",
    { check_in_id: checkInId },
  );
  if (rpcError) {
    return { ok: false, error: humanizeDbError(rpcError) };
  }
  if (!dreamId) {
    return { ok: true, data: null };
  }

  const { data, error } = await supabase
    .from("someday_items")
    .select()
    .eq("id", dreamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  return { ok: true, data: data ?? null };
}

/**
 * "Still want this — resets nothing, just acknowledges" (brief,
 * verbatim) is deliberately NOT a server action at all -- there is
 * nothing to persist. The prompt component dismisses itself locally;
 * see dream-prompt.tsx's own comment on why that's the whole
 * implementation, not a stub waiting for one.
 *
 * "Keep" in the quarterly prune batch (dreams/prune/page.tsx) is a
 * different thing wearing a similar hat: it *does* reset something
 * (last_surfaced_at, the same "last time a human looked at this dream"
 * signal `app.surface_dream_for_checkin`'s own gap-preference and
 * `v_dream_prune_candidates`'s own staleness threshold both read from,
 * see migration 0035's comment) -- reviewing a dream in the prune batch
 * and deciding to keep it is a genuine acknowledgement the next
 * quarterly sweep should honour, unlike the weekly prompt's single-week
 * "still want this."
 */
export async function keepDream(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("someday_items")
    .update({ last_surfaced_at: new Date().toISOString() })
    .eq("id", dreamId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That dream couldn't be found." };
  }
  revalidatePath(PATH);
  return { ok: true, data };
}

/** "Not right now — snooze for three months" (brief, verbatim). The actual three-months-from-the-user's-own-today math lives in app.snooze_dream (0035), not here — see that function's own comment on why. */
export async function snoozeDream(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error: rpcError } = await supabase.rpc("snooze_dream", {
    dream_id: dreamId,
  });
  if (rpcError) {
    return { ok: false, error: humanizeDbError(rpcError) };
  }

  const { data, error } = await supabase
    .from("someday_items")
    .select()
    .eq("id", dreamId)
    .eq("user_id", userId)
    .single();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  revalidatePath(PATH);
  return { ok: true, data };
}

/**
 * The quiet half of "let it go" -- archives with no llama commentary,
 * same "a batch operation doesn't need N individual notifications"
 * reasoning `unachieveDream`'s own quietness already established for a
 * different action. This is what the quarterly prune batch calls for
 * each dream archived; `letGoDream` below is the weekly prompt's own
 * wrapper around this same update, plus Derek.
 */
export async function archiveDream(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("someday_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", dreamId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That dream couldn't be found." };
  }
  revalidatePath(PATH);
  return { ok: true, data };
}

/**
 * "Let it go — archive, with Derek being decent about it" (brief,
 * verbatim) -- the weekly prompt's own fourth response. Archives via
 * the same `archiveDream` the quarterly batch uses, then adds the one
 * thing that's specific to this single, personal moment: Derek's
 * message, deliberately written to not frame this as a failure (see
 * copy.ts's own comment on dream_let_go).
 */
export async function letGoDream(
  dreamId: string,
): Promise<ActionResult<SomedayItem>> {
  const result = await archiveDream(dreamId);
  if (!result.ok) return result;

  const supabase = await createClient();
  const userId = await getUserId(supabase);
  await emitLlamaMessage(
    userId,
    "dream_let_go",
    { dreamTitle: result.data.title },
    { type: "someday_item", id: result.data.id },
  );

  return result;
}
