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

/** Map a Postgres/PostgREST error to a user-facing sentence. Logs the original for unmatched cases. */
export function humanizeDbError(
  error: Pick<PostgrestError, "message" | "details">,
): string {
  const name = extractConstraintName(error);
  const message = name ? CONSTRAINT_MESSAGES[name] : undefined;
  if (message) {
    return message;
  }

  console.error(
    name ? `Unmapped DB constraint violation: ${name}` : "Unmapped DB error",
    error,
  );
  return FALLBACK_MESSAGE;
}
