"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

export type GoalFormInput = {
  title: string;
  description: string | null;
  lifeAreaId: string | null;
  kind: Database["public"]["Enums"]["goal_kind"];
  funding: Database["public"]["Enums"]["funding_type"];
  currency: string;
  targetAmountMinor: number | null;
  startDate: string | null;
  targetDate: string | null;
  visibility: Database["public"]["Enums"]["visibility_level"];
};

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

// No `state` here — this phase doesn't build state transitions (see
// P1.2's notes). Every goal is created and stays 'active' at the database
// default until a later package adds that flow.
function toRow(input: GoalFormInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    life_area_id: input.lifeAreaId,
    kind: input.kind,
    funding: input.funding,
    currency: input.currency,
    // funded_goals_need_target only requires this when funding isn't
    // 'none' — but "none" clearing whatever was typed before switching
    // funding type is a deliberate app-level choice, not something the
    // constraint itself demands.
    target_amount_minor:
      input.funding === "none" ? null : input.targetAmountMinor,
    start_date: input.startDate,
    target_date: input.targetDate,
    visibility: input.visibility,
  };
}

export async function createGoal(input: GoalFormInput): Promise<ActionResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "Title can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("goals")
    .insert({ ...toRow(input), owner_id: userId });

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/goals");
  redirect("/goals");
}

export async function updateGoal(
  id: string,
  input: GoalFormInput,
): Promise<ActionResult> {
  if (!input.title.trim()) {
    return { ok: false, error: "Title can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // app.can_edit_goal (the RLS policy's real gate) currently only allows
  // the owner in practice, since participants aren't built yet — this
  // owner_id filter is redundant with RLS today. Revisit once
  // collaborator-edit exists; scoping to owner_id here would then be
  // wrongly restrictive.
  const { data, error } = await supabase
    .from("goals")
    .update(toRow(input))
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That goal couldn't be found." };
  }

  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect(`/goals/${id}`);
}
