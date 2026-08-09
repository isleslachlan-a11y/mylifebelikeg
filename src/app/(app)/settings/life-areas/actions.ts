"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import {
  DEFAULT_LIFE_AREA_COLOUR,
  isLifeAreaColour,
} from "@/lib/life-area-colours";
import type { Database } from "@/types/database";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const PATH = "/settings/life-areas";

// Every action below runs from an already-gated (app) route, so a missing
// session here means it expired mid-use, not a first visit — send back to
// /login the same way proxy.ts would, rather than surfacing a form error.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

export async function renameLifeArea(
  id: string,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Name can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // is_system is checked here, not just hidden in the UI — nothing at the
  // database level stops Uncategorised from being renamed, so this filter
  // is the actual enforcement, not a redundant belt-and-braces check.
  const { data, error } = await supabase
    .from("life_areas")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_system", false)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That life area can't be renamed." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function recolourLifeArea(
  id: string,
  colour: string,
): Promise<ActionResult> {
  // The eight-colour restriction isn't a database check constraint (colour
  // is plain text) — this is the actual enforcement. Allowed for
  // is_system rows too: the rule only protects the name.
  if (!isLifeAreaColour(colour)) {
    return { ok: false, error: "Pick one of the available colours." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("life_areas")
    .update({ colour })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That life area couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function createLifeArea(
  name: string,
): Promise<ActionResult<LifeArea>> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Name can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // New areas append after the current highest sort_order (Uncategorised
  // sits at 99 and is excluded, so it stays last).
  const { data: existing, error: existingError } = await supabase
    .from("life_areas")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("is_system", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: humanizeDbError(existingError) };
  }

  const nextSortOrder = (existing?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("life_areas")
    .insert({
      user_id: userId,
      name: trimmed,
      colour: DEFAULT_LIFE_AREA_COLOUR,
      sort_order: nextSortOrder,
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function reorderLifeAreas(
  orderedIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // sort_order is a per-row column, not an array — there's no single bulk
  // "set this order" call. An upsert can't stand in for it either: it
  // would need every NOT NULL column (name, colour, ...) supplied, not
  // just id + sort_order, since Postgres validates the candidate row
  // before ON CONFLICT DO UPDATE ever gets consulted. So: one update per
  // row. The list is small (a handful of life areas per user), so this is
  // cheap in practice.
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("life_areas")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("user_id", userId),
    ),
  );

  const failure = results.find((r) => r.error);
  if (failure?.error) {
    return { ok: false, error: humanizeDbError(failure.error) };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function deleteLifeArea(
  id: string,
): Promise<ActionResult<{ reassignedCount: number }>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: area, error: areaError } = await supabase
    .from("life_areas")
    .select("is_system")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (areaError) {
    return { ok: false, error: humanizeDbError(areaError) };
  }
  if (!area) {
    return { ok: false, error: "That life area couldn't be found." };
  }
  if (area.is_system) {
    return { ok: false, error: "The Uncategorised area can't be deleted." };
  }

  const { data: uncategorised, error: uncategorisedError } = await supabase
    .from("life_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("is_system", true)
    .single();

  if (uncategorisedError || !uncategorised) {
    return {
      ok: false,
      error: "Couldn't find the Uncategorised area to reassign goals to.",
    };
  }

  // goals.life_area_id is ON DELETE SET NULL, but that FK action only
  // fires on a real DELETE — this app soft-deletes (sets deleted_at), an
  // UPDATE the FK never sees. So goals have to be moved explicitly, before
  // the area itself is marked deleted, or a failure here could leave them
  // pointing at a row that's about to disappear from every listing.
  //
  // someday_items.life_area_id has the same FK and isn't touched here —
  // the someday list isn't built yet (see Schema.MD's "Built but not yet
  // wired"). Reassign it too once that page exists.
  const { data: reassigned, error: reassignError } = await supabase
    .from("goals")
    .update({ life_area_id: uncategorised.id })
    .eq("owner_id", userId)
    .eq("life_area_id", id)
    .select("id");

  if (reassignError) {
    return { ok: false, error: humanizeDbError(reassignError) };
  }

  const { error: deleteError } = await supabase
    .from("life_areas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    return { ok: false, error: humanizeDbError(deleteError) };
  }

  revalidatePath(PATH);
  return { ok: true, data: { reassignedCount: reassigned?.length ?? 0 } };
}
