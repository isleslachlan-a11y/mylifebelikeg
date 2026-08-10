"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { ActionResult } from "../actions";

type GoalParticipant = Database["public"]["Tables"]["goal_participants"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CURRENCY_RE = /^[A-Z]{3}$/;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

export type PledgeInput = {
  /** null clears the field — a participant can set either amount independently. */
  pledgedAmountMinor: number | null;
  monthlyAllocationMinor: number | null;
  pledgedCurrency: string;
  potId: string | null;
};

function validateInput(input: PledgeInput): string | null {
  if (!CURRENCY_RE.test(input.pledgedCurrency)) {
    return "Currency must be a 3-letter code.";
  }
  if (
    input.pledgedAmountMinor != null &&
    (!Number.isInteger(input.pledgedAmountMinor) ||
      input.pledgedAmountMinor < 0)
  ) {
    return "Pledge amount can't be negative.";
  }
  if (
    input.monthlyAllocationMinor != null &&
    (!Number.isInteger(input.monthlyAllocationMinor) ||
      input.monthlyAllocationMinor < 0)
  ) {
    return "Monthly rate can't be negative.";
  }
  return null;
}

/**
 * Every participant sets their own pledge — this always writes the
 * caller's own goal_participants row, never anyone else's (P2.4 brief:
 * "each participant sets two things", not "the owner sets everyone's").
 * goal_participants_update's RLS already restricts UPDATE to a row's own
 * user_id (see participants-actions.ts's changeParticipantRole comment),
 * so there's no separate ownership check needed for the update path.
 *
 * The owner is a special case worth spelling out: participants-actions.ts
 * never inserts a role='owner' row (its own comment says so), but
 * 001_smoke_test.sql seeds one explicitly and v_goal_funding/
 * v_goal_affordability read pledges from goal_participants with no
 * special-case for the owner — so an owner who wants to pledge toward
 * their own goal needs that row to exist. Whether a trigger creates one
 * on goal creation in the real schema is unknown here (no migration
 * history committed — see CLAUDE.md's Database section), so this handles
 * both possibilities: update in place if a row already exists (whoever
 * created it), insert one with role='owner' if it doesn't and the caller
 * really is the owner. A non-owner with no existing row is a genuine
 * error state, not silently handled — they were never added to the goal.
 */
export async function setPledge(
  goalId: string,
  input: PledgeInput,
): Promise<ActionResult<GoalParticipant>> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const [
    { data: goal, error: goalError },
    { data: existing, error: existingError },
  ] = await Promise.all([
    supabase.from("goals").select("owner_id").eq("id", goalId).maybeSingle(),
    supabase
      .from("goal_participants")
      .select("id")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (goalError || !goal) {
    return { ok: false, error: "That goal couldn't be found." };
  }
  if (existingError) {
    return { ok: false, error: humanizeDbError(existingError) };
  }

  const pledgeFields = {
    pledged_amount_minor: input.pledgedAmountMinor,
    pledged_currency: input.pledgedCurrency,
    monthly_allocation_minor: input.monthlyAllocationMinor,
    pot_id: input.potId,
  };

  if (existing) {
    // Deliberately doesn't touch `role` — only the fields this form
    // owns, so a viewer saving a pledge can never accidentally upgrade
    // their own role to collaborator (or any other unintended change).
    const { data, error } = await supabase
      .from("goal_participants")
      .update(pledgeFields)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      return { ok: false, error: humanizeDbError(error) };
    }
    revalidatePath(`/goals/${goalId}`);
    return { ok: true, data };
  }

  if (goal.owner_id !== userId) {
    return {
      ok: false,
      error: "You need to be added to this goal before you can pledge to it.",
    };
  }

  const { data, error } = await supabase
    .from("goal_participants")
    .insert({
      goal_id: goalId,
      user_id: userId,
      role: "owner",
      ...pledgeFields,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  revalidatePath(`/goals/${goalId}`);
  return { ok: true, data };
}
