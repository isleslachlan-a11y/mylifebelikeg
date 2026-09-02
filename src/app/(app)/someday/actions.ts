"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { isSomedayMilestone } from "@/lib/someday";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import type { Database } from "@/types/database";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";

type SomedayItem = Database["public"]["Tables"]["someday_items"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const PATH = "/someday";
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

export type SomedayItemInput = {
  title: string;
  notes: string | null;
  lifeAreaId: string | null;
  cost: CostInput;
  place: PlaceInput;
  /** Whatever <PhotoPicker> handed back on selection — null if the item has no photo (yet). */
  photo: UnsplashPhotoResult | null;
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

function toRow(input: SomedayItemInput) {
  return {
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    life_area_id: input.lifeAreaId,
    rough_cost_minor: input.cost.roughCostMinor,
    currency: input.cost.currency,
    place_name: input.place.placeName?.trim() || null,
    latitude: input.place.latitude,
    longitude: input.place.longitude,
    country_code: input.place.countryCode,
    mapbox_place_id: input.place.mapboxPlaceId,
    unsplash_photo_id: input.photo?.id ?? null,
    unsplash_thumb_url: input.photo?.thumbUrl ?? null,
    unsplash_full_url: input.photo?.fullUrl ?? null,
    unsplash_author_name: input.photo?.authorName ?? null,
    unsplash_author_url: input.photo?.authorUrl ?? null,
  };
}

export async function createSomedayItem(
  rawInput: SomedayItemInput,
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
    .insert({ user_id: userId, ...toRow(input) })
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

export async function updateSomedayItem(
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

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function deleteSomedayItem(id: string): Promise<ActionResult> {
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
    .select("id, promoted_at")
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

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
