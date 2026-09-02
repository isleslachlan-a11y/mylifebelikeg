"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { evaluateAchievements } from "@/lib/achievements/evaluate";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
import type { Database } from "@/types/database";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];
type LedgerEntryInsert =
  Database["public"]["Tables"]["ledger_entries"]["Insert"];
type LedgerKind = Database["public"]["Enums"]["ledger_kind"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      /** Set only for a no_data_found failure — lets the UI render a real link to /money/fx instead of just mentioning the URL in text. */
      missingRatePair?: { from: string; to: string };
    };

const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Postgres's builtin plpgsql condition `no_data_found` maps to this fixed
// SQLSTATE (P0002) — unlike this app's other guessed *_check constraint
// names (see errors.ts), this one isn't schema-specific or a guess: it's
// part of Postgres itself, so PostgREST will surface it as error.code
// exactly this value regardless of how the trigger's RAISE is worded.
const NO_FX_RATE_SQLSTATE = "P0002";

export type LedgerEntryInput = {
  goalId: string | null;
  potId: string | null;
  entryType: LedgerKind;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  description: string | null;
};

function validateInput(input: LedgerEntryInput): string | null {
  if (!CURRENCY_RE.test(input.currency)) {
    return "Currency must be a 3-letter code.";
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!DATE_RE.test(input.occurredOn)) {
    return "Enter a valid date.";
  }
  return null;
}

async function getUserContext(
  supabase: SupabaseServerClient,
): Promise<{ userId: string; baseCurrency: string }> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("base_currency")
    .eq("id", userId)
    .single();
  // Unlike the page-level profile fetches, this is a server action
  // helper — it can't throw into an error boundary, it has to keep
  // returning so the caller can produce a normal ActionResult. The
  // fallback only ever surfaces inside insertEntry's own
  // NO_FX_RATE_SQLSTATE error message text (never used for the actual
  // ledger write, which the database's own BEFORE INSERT trigger stamps
  // independently from the real profiles.base_currency) — logged rather
  // than left fully silent, matching the "log then degrade" shape
  // AppLayout's own llama-inbox fetch already uses for a similarly
  // non-critical failure.
  if (profileError) {
    console.error("getUserContext: profile fetch failed", profileError);
  }

  return { userId, baseCurrency: profile?.base_currency ?? "AUD" };
}

/**
 * Do not add base_amount_minor, base_currency, or fx_rate_applied here —
 * a BEFORE INSERT trigger stamps all three from the user's base currency
 * and that day's app.fx_rate() (P2.3 brief). They're NOT NULL in the
 * schema (so the generated Insert type marks them required — schema
 * introspection sees a NOT NULL column, not that a trigger fills it), but
 * a BEFORE INSERT trigger runs before that constraint is checked, so
 * omitting them here is exactly correct, not an oversight. Supplying a
 * value here would fight the trigger (P2.3 brief, verbatim) rather than
 * just being redundantly overwritten — never do it.
 */
type AppLedgerEntryInsert = Omit<
  LedgerEntryInsert,
  "base_amount_minor" | "base_currency" | "fx_rate_applied"
>;

async function insertEntry(
  supabase: SupabaseServerClient,
  userId: string,
  baseCurrency: string,
  input: LedgerEntryInput,
): Promise<ActionResult<LedgerEntry>> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const payload: AppLedgerEntryInsert = {
    user_id: userId,
    goal_id: input.goalId,
    pot_id: input.potId,
    entry_type: input.entryType,
    amount_minor: input.amountMinor,
    currency: input.currency,
    occurred_on: input.occurredOn,
    description: input.description?.trim() || null,
  };

  const { data, error } = await supabase
    .from("ledger_entries")
    // The cast is the point of the type above: TS's generated Insert
    // type still requires the three trigger-owned columns since it can't
    // see the trigger, but this payload deliberately omits them.
    .insert(payload as LedgerEntryInsert)
    .select()
    .single();

  if (error) {
    if (error.code === NO_FX_RATE_SQLSTATE) {
      return {
        ok: false,
        error: `No exchange rate on file for ${input.currency} → ${baseCurrency}.`,
        missingRatePair: { from: input.currency, to: baseCurrency },
      };
    }
    return { ok: false, error: humanizeDbError(error) };
  }

  return { ok: true, data };
}

function revalidateFor(goalId: string | null): void {
  revalidatePath("/money/ledger");
  if (goalId) {
    revalidatePath(`/goals/${goalId}`);
  }
}

export async function createLedgerEntry(
  input: LedgerEntryInput,
): Promise<
  ActionResult<
    LedgerEntry & { unlockedAchievements: NewlyUnlockedAchievement[] }
  >
> {
  const supabase = await createClient();
  const { userId, baseCurrency } = await getUserContext(supabase);

  const result = await insertEntry(supabase, userId, baseCurrency, input);
  if (!result.ok) {
    return result;
  }
  revalidateFor(input.goalId);

  // P7.2: a ledger entry is a discrete event, so this always runs — not
  // debounced. Only the literal "add an entry" path (this function), not
  // updateLedgerEntry's own internal insert-then-delete-old (that's an
  // edit, not a creation, even though it shares insertEntry under the
  // hood). Never blocks the save itself, which has already committed.
  let unlockedAchievements: NewlyUnlockedAchievement[] = [];
  try {
    unlockedAchievements = await evaluateAchievements(supabase, userId);
  } catch (evalError) {
    console.error(
      "Achievement evaluation failed after ledger entry creation",
      evalError,
    );
  }

  return { ok: true, data: { ...result.data, unlockedAchievements } };
}

/**
 * The trigger that stamps base_currency/base_amount_minor/fx_rate_applied
 * only fires on INSERT (P2.3 brief) — it does not run on UPDATE. A plain
 * `.update()` that changes amount_minor, currency, or occurred_on would
 * leave the old FX stamp sitting against new money/date facts: silently
 * wrong in exactly the way ledger data can't afford to be. So editing is
 * never a plain UPDATE here — not even for a change that looks unrelated
 * to FX (this app treats every field edit uniformly rather than trying
 * to detect "did anything FX-relevant change" and risk that check having
 * a bug that leaves a stale stamp behind).
 *
 * Order matters: insert the corrected row first, and only soft-delete the
 * original once that succeeds — insert-then-delete, not the
 * delete-then-insert order the brief's prose suggests literally. If the
 * insert fails (most importantly: no_data_found for a missing FX rate),
 * the original entry is untouched and nothing is lost; the user fixes
 * the rate and retries. Delete-first would mean an FX failure during an
 * edit deletes the user's data with nothing to replace it — exactly the
 * kind of loss this table exists to avoid.
 *
 * No multi-statement transaction is available from this client (same
 * constraint noted on pots' setDefaultPot) — there's a narrow window
 * where both the old and new rows are simultaneously active. A
 * balance/running-total read that lands in that window briefly
 * double-counts; it self-corrects the instant the delete below completes.
 */
export async function updateLedgerEntry(
  id: string,
  input: LedgerEntryInput,
): Promise<
  ActionResult<
    LedgerEntry & { unlockedAchievements: NewlyUnlockedAchievement[] }
  >
> {
  const supabase = await createClient();
  const { userId, baseCurrency } = await getUserContext(supabase);

  const insertResult = await insertEntry(supabase, userId, baseCurrency, input);
  if (!insertResult.ok) {
    return insertResult;
  }

  const { error: deleteError } = await supabase
    .from("ledger_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    // The corrected row exists but the original didn't get cleaned up —
    // surfaced rather than swallowed, so the user knows to check for a
    // duplicate instead of silently ending up with two active entries.
    return {
      ok: false,
      error:
        "Saved the correction, but couldn't remove the original — you may have a duplicate entry to delete.",
    };
  }

  revalidateFor(input.goalId);
  // Always empty: an edit never evaluates achievements (see
  // createLedgerEntry's own comment on why only a real creation does) —
  // this shape match is what lets ledger-entry-dialog.tsx read
  // unlockedAchievements off either function's result without a type
  // guard for which one actually ran.
  return { ok: true, data: { ...insertResult.data, unlockedAchievements: [] } };
}

export async function deleteLedgerEntry(
  id: string,
  goalId: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  // Soft delete only — v_pot_balances sums non-deleted ledger_entries
  // live, so a pot's balance is restored the instant this row stops
  // counting; nothing here needs to touch the pot itself (P2.2/P2.0's
  // "never compute a balance in application code" applies here too).
  const { data, error } = await supabase
    .from("ledger_entries")
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
    return { ok: false, error: "That entry couldn't be found." };
  }

  revalidateFor(goalId);
  return { ok: true, data: undefined };
}
