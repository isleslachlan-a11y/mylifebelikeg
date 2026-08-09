"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";

type Pot = Database["public"]["Tables"]["pots"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const PATH = "/money/pots";
const CURRENCY_RE = /^[A-Z]{3}$/;

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

export type CreatePotInput = {
  name: string;
  currency: string;
  openingBalanceMinor: number;
};

export async function createPot(
  input: CreatePotInput,
): Promise<ActionResult<Pot>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Name can't be empty." };
  }
  if (!CURRENCY_RE.test(input.currency)) {
    return { ok: false, error: "Currency must be a 3-letter code." };
  }
  if (
    !Number.isInteger(input.openingBalanceMinor) ||
    input.openingBalanceMinor < 0
  ) {
    return { ok: false, error: "Opening balance can't be negative." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // A pot's currency can't be changed after creation (ledger entries and
  // goal_participants.pledged_currency read pot.currency at write time —
  // see money.ts and Schema.MD's "FX is stamped at write time"), so this
  // is the only place currency is ever set.
  //
  // The very first pot a user creates becomes their default automatically
  // — there's otherwise no way to have a default at all until someone
  // remembers to set one, and a lone pot is the unambiguous choice.
  // Every pot after that starts non-default; changing it is an explicit
  // action (setDefaultPot).
  const { count, error: countError } = await supabase
    .from("pots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (countError) {
    return { ok: false, error: humanizeDbError(countError) };
  }

  const { data, error } = await supabase
    .from("pots")
    .insert({
      user_id: userId,
      name,
      currency: input.currency,
      opening_balance_minor: input.openingBalanceMinor,
      is_default: (count ?? 0) === 0,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function renamePot(
  id: string,
  name: string,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Name can't be empty." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("pots")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That pot couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function updateOpeningBalance(
  id: string,
  openingBalanceMinor: number,
): Promise<ActionResult> {
  if (!Number.isInteger(openingBalanceMinor) || openingBalanceMinor < 0) {
    return { ok: false, error: "Opening balance can't be negative." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("pots")
    .update({ opening_balance_minor: openingBalanceMinor })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That pot couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/**
 * Exactly one pot per user may have is_default = true, enforced by a
 * partial unique index (on (user_id) where is_default) rather than a
 * NOT NULL/default-required rule — so zero defaults is a valid state,
 * two never is.
 *
 * PostgREST gives us one statement per call, not a client-driven
 * transaction, so this can't clear-the-old-and-set-the-new atomically
 * the way a single SQL statement inside a stored procedure could. Doing
 * the clear first and the set second is still safe under that
 * constraint: at every point in between, at most one row is true (never
 * two, which the index would reject anyway), so a crash or failure
 * between the two calls leaves this pot's owner with no default pot
 * rather than a corrupted one — recoverable by calling this again, not
 * silently wrong.
 */
export async function setDefaultPot(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error: clearError } = await supabase
    .from("pots")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true)
    .neq("id", id);

  if (clearError) {
    return { ok: false, error: humanizeDbError(clearError) };
  }

  const { data, error } = await supabase
    .from("pots")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That pot couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function deletePot(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // Soft delete only — ledger_entries and goal_participants.pot_id keep
  // pointing at this row (it isn't reassigned the way life_areas moves
  // goals to Uncategorised; a pledge or a past transaction against a
  // retired pot is still meaningful history, not an orphan to fix up).
  // Deleting a default pot is allowed and just leaves zero defaults —
  // see setDefaultPot's comment on why that's a valid state.
  const { data, error } = await supabase
    .from("pots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That pot couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
