"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

/** profiles_active_goal_limit_check already enforces 1–20 at the database level; this mirrors it to skip the round trip on an obviously bad value. */
export async function updateActiveGoalLimit(
  limit: number,
): Promise<ActionResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return { ok: false, error: "Choose a number between 1 and 20." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active_goal_limit: limit })
    .eq("id", auth.claims.sub);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/profile");
  revalidatePath("/goals");
  return { ok: true, data: undefined };
}
