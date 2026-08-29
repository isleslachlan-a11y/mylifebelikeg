import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Maps a Postgres constraint violation (surfaced through PostgREST) to a
 * sentence safe to show a user. Never render `error.message` directly —
 * it's written for developers, not end users, and names tables/columns.
 *
 * Distinct from `src/lib/supabase/errors.ts`, which handles Supabase Auth
 * errors specifically — this one is for database constraint violations
 * from any table.
 */

const CONSTRAINT_MESSAGES: Record<string, string> = {
  goal_dates_ordered: "Target date must be on or after the start date.",
  funded_goals_need_target: "A goal with a budget needs a target amount.",
  abandoned_needs_reason: "Tell us why you're abandoning this goal.",
  override_needs_reason: "An override needs a reason and an expiry date.",
  handle_format:
    "Handles can use lowercase letters, numbers and underscores, 3–30 characters.",
  profiles_handle_key: "That handle is already taken.",
  done_tasks_have_timestamp: "A completed task needs a completion time.",
  task_cost_needs_currency: "A cost estimate needs a currency.",
  pledge_needs_currency: "A pledge needs a currency.",
  no_self_dependency: "A task can't depend on itself.",
  goal_participants_unique: "That person is already on this goal.",
  check_in_period_ordered: "Check-in period end must be on or after the start.",
  // Unique index, not a named table constraint (life_areas (user_id, lower(name))
  // where deleted_at is null) — Postgres still reports it as a "constraint"
  // violation by the index's name, so it matches CONSTRAINT_NAME_RE the same way.
  life_areas_user_name_key: "You already have a life area with that name.",
  goals_currency_check: "Currency must be a 3-letter code.",
  goals_target_amount_minor_check: "Target amount can't be negative.",
  goals_title_check: "Title can't be empty.",
  tasks_title_check: "Title can't be empty.",
  tasks_duration_days_check: "Duration can't be negative.",
  tasks_offset_days_check: "A task can't start before the goal's start date.",
  tasks_estimated_cost_minor_check: "Estimated cost can't be negative.",
  tasks_cost_currency_check: "Currency must be a 3-letter code.",
  profiles_active_goal_limit_check: "Choose a number between 1 and 20.",
  // Inferred from Postgres's default auto-generated name for an unnamed
  // column CHECK (`<table>_<column>_check`), matching the pattern every
  // other entry above follows — not verified against the live schema
  // (no `pots` migration is committed here to check against, see
  // CLAUDE.md's Database section). Worst case if either name is wrong:
  // this falls through to the generic fallback below, same as any other
  // unmapped constraint, so it's safe to leave in speculatively.
  pots_currency_check: "Currency must be a 3-letter code.",
  pots_opening_balance_minor_check: "Opening balance can't be negative.",
  cashflow_items_currency_check: "Currency must be a 3-letter code.",
  cashflow_items_label_check: "Label can't be empty.",
  cashflow_items_amount_minor_check: "Amount must be greater than zero.",
  // Guessed name for an active_to >= active_from ordering check, following
  // this file's existing goal_dates_ordered/check_in_period_ordered
  // naming style rather than Postgres's default (a named, not auto-named,
  // constraint wouldn't be guessable at all) — even less certain than the
  // *_check entries above, same safe-fallback reasoning applies.
  cashflow_items_active_ordered: "End date must be on or after the start date.",
  fx_rates_base_currency_check: "Currency must be a 3-letter code.",
  fx_rates_quote_currency_check: "Currency must be a 3-letter code.",
  fx_rates_rate_check: "Rate must be greater than zero.",
  ledger_entries_currency_check: "Currency must be a 3-letter code.",
  ledger_entries_amount_minor_check: "Amount must be greater than zero.",
};

const FALLBACK_MESSAGE = "Something went wrong — please try again.";

// Postgres names the offending constraint inline in the error text, e.g.
// `new row for relation "goals" violates check constraint
// "goal_dates_ordered"` or `duplicate key value violates unique
// constraint "profiles_handle_key"`. Some error classes put it in
// `details` instead of `message`, so check both.
const CONSTRAINT_NAME_RE = /constraint "([a-z0-9_]+)"/i;

function extractConstraintName(
  error: Pick<PostgrestError, "message" | "details">,
): string | null {
  const match =
    CONSTRAINT_NAME_RE.exec(error.message) ??
    CONSTRAINT_NAME_RE.exec(error.details);
  return match?.[1] ?? null;
}

// Not every user-facing DB error is a named constraint violation —
// prevent_dependency_cycle (Phase 5) rejects a cycle with a RAISE
// EXCEPTION, errcode check_violation, naming both task ids in the
// message rather than a constraint name CONSTRAINT_NAME_RE could ever
// match. Checked by message content instead, same "never let the raw
// Postgres message reach the user" rule as the constraint table above —
// this just has one entry, not a lookup table, since it's the only
// raised (non-constraint) exception this app surfaces to a form today.
const CYCLE_MESSAGE_RE = /would create a cycle/i;

/** Map a Postgres/PostgREST error to a user-facing sentence. Logs the original for unmatched cases. */
export function humanizeDbError(
  error: Pick<PostgrestError, "message" | "details">,
): string {
  const name = extractConstraintName(error);
  const message = name ? CONSTRAINT_MESSAGES[name] : undefined;
  if (message) {
    return message;
  }

  if (CYCLE_MESSAGE_RE.test(error.message)) {
    return "That would create a circular dependency.";
  }

  console.error(
    name ? `Unmapped DB constraint violation: ${name}` : "Unmapped DB error",
    error,
  );
  return FALLBACK_MESSAGE;
}
