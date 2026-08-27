"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { ActionResult } from "../actions";
import {
  OVERRIDE_MAX_EXPIRY_DAYS,
  OVERRIDE_MIN_EXPIRY_DAYS,
  type OverridableStatus,
} from "./override-constants";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Sets (or replaces) the goal's live override. `override_needs_reason`
 * (the DB constraint) requires a reason and an expiry whenever
 * rag_override is non-null — this always supplies both, so a partial
 * override is never attempted. Authorization is `goals_update`'s RLS
 * (`app.can_edit_goal`) — the same surface that gates every other
 * goal-level edit, so no extra ownership check is layered on top here
 * (CLAUDE.md's per-table filter guidance).
 *
 * Doesn't touch either existing expiry mechanism (P4.3 brief: "don't
 * rebuild either") — `app.on_checkin_submitted`'s stale-override clear
 * and `app.effective_goal_rag`'s expiry check both key off the columns
 * this writes, untouched. History is 0017's job: `goals_log_rag_override`
 * fires on this update automatically and logs it — this action never
 * writes to `rag_override_history` itself.
 */
export async function setGoalOverride(
  goalId: string,
  status: OverridableStatus,
  reason: string,
  expiryDays: number,
): Promise<ActionResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "An override needs a reason." };
  }
  if (
    !Number.isInteger(expiryDays) ||
    expiryDays < OVERRIDE_MIN_EXPIRY_DAYS ||
    expiryDays > OVERRIDE_MAX_EXPIRY_DAYS
  ) {
    return {
      ok: false,
      error: `Expiry must be between ${OVERRIDE_MIN_EXPIRY_DAYS} and ${OVERRIDE_MAX_EXPIRY_DAYS} days.`,
    };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + expiryDays * 24 * 60 * 60 * 1000,
  );

  const { error } = await supabase
    .from("goals")
    .update({
      rag_override: status,
      rag_override_reason: trimmedReason,
      rag_override_by: userId,
      rag_override_at: now.toISOString(),
      rag_override_expires_at: expiresAt.toISOString(),
    })
    .eq("id", goalId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data: undefined };
}
