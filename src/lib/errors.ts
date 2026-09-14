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
  // P6.1, confirmed against the live schema (a scratch `supabase db dump`,
  // same technique as P5.1's — not guessed, unlike some entries above).
  someday_coords_paired: "Enter both latitude and longitude, or neither.",
  someday_cost_needs_currency: "A rough cost needs a currency.",
  someday_items_currency_check: "Currency must be a 3-letter code.",
  someday_items_latitude_check: "Latitude must be between -90 and 90.",
  someday_items_longitude_check: "Longitude must be between -180 and 180.",
  someday_items_rough_cost_minor_check: "Rough cost can't be negative.",
  someday_items_title_check: "Title can't be empty.",
  unsplash_needs_attribution:
    "That photo is missing attribution — try picking it again.",
  // P8.1, confirmed against the live schema (migration 0032 and 0031's
  // own constraints, applied directly). None of these should ever
  // actually trigger through the normal <ImageUpload>/<SomedayFormDialog>
  // flow -- same "the mapping should exist even if nothing should ever
  // trigger it" reasoning P7.1's avatar editor already established for
  // app.validate_avatar()'s errors.
  dream_image_source_consistent:
    "Something went wrong with that photo — try uploading it again.",
  achieved_photo_needs_achieved_at:
    "Mark the dream as achieved before adding a photo of it.",
  achieved_xor_archived:
    "A dream can't be both achieved and archived.",
  // P6.3, confirmed against the live schema (same `supabase db dump`
  // technique as P6.1's entries above).
  trips_origin_lat_check: "Latitude must be between -90 and 90.",
  trips_origin_lng_check: "Longitude must be between -180 and 180.",
  stop_coords_paired: "Enter both latitude and longitude, or neither.",
  stop_cost_needs_currency: "A cost estimate needs a currency.",
  stop_unsplash_needs_attribution:
    "That photo is missing attribution — try picking it again.",
  trip_stops_currency_check: "Currency must be a 3-letter code.",
  trip_stops_estimated_cost_minor_check: "Cost can't be negative.",
  trip_stops_latitude_check: "Latitude must be between -90 and 90.",
  trip_stops_longitude_check: "Longitude must be between -180 and 180.",
  trip_stops_name_check: "Name can't be empty.",
  trip_stops_nights_check: "Nights can't be negative.",
  leg_cost_needs_currency: "A cost estimate needs a currency.",
  leg_endpoints_differ: "A leg can't start and end at the same stop.",
  leg_has_an_endpoint: "A leg needs at least one endpoint.",
  trip_legs_cost_minor_check: "Cost can't be negative.",
  trip_legs_currency_check: "Currency must be a 3-letter code.",
  trip_legs_duration_minutes_check: "Duration can't be negative.",
  // Partial unique index, not a named table constraint (trip_stops
  // (trip_id, sequence) where deleted_at is null) — Postgres still
  // reports it as a "constraint" violation by the index's name, same
  // shape as life_areas_user_name_key above. In practice this should
  // only ever surface from a genuine race (two stops added at once);
  // app.reorder_trip_stop's own park-then-renumber algorithm exists
  // specifically so a normal reorder never hits it.
  trip_stops_sequence_unique:
    "That stop order changed elsewhere — refresh and try again.",
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

// app.enforce_trip_goal_kind (P6.3, trips_kind_check) rejects the same
// way — a RAISE EXCEPTION, not a named constraint. In practice this
// should never surface through the UI (create_trip_goal always creates
// the goal with kind = 'trip' in the same transaction before the trips
// insert), but it's the one path that could still hit it: a direct
// trips insert against a goal that was never a trip to begin with.
const TRIP_GOAL_KIND_RE = /trips\.goal_id must reference a goal with kind/i;

// P7.1: app.validate_avatar() (migration 0026) raises three distinct
// shapes when profiles.avatar is written, none of them a named
// constraint — same "raised exception, not CONSTRAINT_NAME_RE-matchable"
// situation as prevent_dependency_cycle/enforce_trip_goal_kind above.
// avatar-editor.tsx already prevents all three client-side (a locked
// preset can't be clicked, an unknown/wrong-slot code never reaches the
// save action to begin with) — these mappings are defense in depth for
// a direct write outside that UI, not a path real usage should hit.
const AVATAR_LOCKED_RE = /is not unlocked yet$/i;
const AVATAR_UNKNOWN_SLOT_RE = /^Unknown avatar slot:/i;
const AVATAR_INVALID_PRESET_RE =
  /^Unknown avatar preset:|belongs to category .+, not /i;

// P7.3: app.enforce_pin_limit (0026) rejects a fourth pin the same way —
// a RAISE EXCEPTION, not a named constraint. achievement-grid.tsx
// already disables the pin control once three are pinned, so this is
// defense in depth, same relationship the avatar-lock mappings above
// have to their own already-client-prevented UI. Its raised message
// ("You can pin at most three achievements") already reads fine to an
// end user — still routed through this function rather than passed
// through raw, so nothing here bypasses the "never render error.message
// directly" rule on the technicality that one message happens to be
// pre-written politely.
const PIN_LIMIT_RE = /can pin at most three achievements/i;

// P8.3: app.promote_dream_to_goal's own four guards (migration 0033),
// none of them named constraints -- same "raised exception, not
// CONSTRAINT_NAME_RE-matchable" situation as every entry above. The
// dialog also disables/hides the "Promote to goal" action for each of
// these cases client-side (no price, already promoted, achieved,
// archived), so these are defense in depth for a stale client or a
// direct RPC call, same reasoning P7.1's avatar-lock mappings give for
// their own already-client-prevented cases.
const DREAM_NEEDS_PRICE_RE = /needs a price before it can become a goal/i;
const DREAM_ALREADY_PROMOTED_RE = /already been promoted to a goal/i;
const DREAM_ALREADY_ACHIEVED_RE = /dream has already been achieved/i;
const DREAM_ARCHIVED_RE = /this dream is archived/i;

// Goal sharing (migration 0043) -- app.invite_by_handle/leave_goal/
// transfer_goal_ownership/create_goal_invitation/accept_invitation
// each raise several distinct, specifically-worded exceptions rather
// than named constraints, matched by message content the same way
// every RAISE EXCEPTION-based entry above already is. Message text,
// not `error.code` (the raw SQLSTATE, e.g. 23505/42501/P0002) --
// several of these functions reuse the *same* SQLSTATE for
// semantically different situations (invite_by_handle's "that's you"
// and leave_goal's "owner can't leave" are both check_violation), so a
// code-keyed lookup would be too coarse to give each its own message;
// this file's existing convention of matching on the raised text
// itself doesn't have that problem.
const NO_HANDLE_RE = /no one's using that handle/i;
const ALREADY_ON_GOAL_RE = /they're already on this goal/i;
const INVITING_SELF_RE = /that's you -- you already own this goal/i;
const OWNER_ONLY_INVITE_RE = /only the goal owner can invite people/i;
const OWNER_ONLY_REMOVE_RE = /only the goal owner can remove someone else/i;
const OWNER_ONLY_TRANSFER_RE = /only the goal owner can transfer ownership/i;
const OWNER_CANT_LEAVE_RE = /the owner can't leave their own goal/i;
const OPEN_TASKS_RE = /still own (\d+) open task/i;
const NEW_OWNER_NOT_PARTICIPANT_RE =
  /the new owner has to already be a participant/i;
const INVALID_EMAIL_RE = /doesn't look like a valid email address/i;
const EMAIL_HAS_ACCOUNT_RE = /invite them by handle instead/i;
const INVITATION_INVALID_RE = /this invitation is invalid or has expired/i;

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
  if (TRIP_GOAL_KIND_RE.test(error.message)) {
    return "That goal isn't a trip.";
  }
  if (AVATAR_LOCKED_RE.test(error.message)) {
    return "That option isn't unlocked yet.";
  }
  if (
    AVATAR_UNKNOWN_SLOT_RE.test(error.message) ||
    AVATAR_INVALID_PRESET_RE.test(error.message)
  ) {
    return "That avatar option isn't valid — refresh and try again.";
  }
  if (PIN_LIMIT_RE.test(error.message)) {
    return "You can only pin three achievements — unpin one first.";
  }
  if (DREAM_NEEDS_PRICE_RE.test(error.message)) {
    return "Add a price before promoting this dream to a goal.";
  }
  if (DREAM_ALREADY_PROMOTED_RE.test(error.message)) {
    return "This dream is already linked to a goal.";
  }
  if (DREAM_ALREADY_ACHIEVED_RE.test(error.message)) {
    return "This dream is already achieved — nothing left to save toward.";
  }
  if (DREAM_ARCHIVED_RE.test(error.message)) {
    return "Unarchive this dream before promoting it to a goal.";
  }
  if (NO_HANDLE_RE.test(error.message)) {
    return "No one's using that handle.";
  }
  if (ALREADY_ON_GOAL_RE.test(error.message)) {
    return "They're already on this goal.";
  }
  if (INVITING_SELF_RE.test(error.message)) {
    return "That's you — you already own this goal.";
  }
  if (
    OWNER_ONLY_INVITE_RE.test(error.message) ||
    OWNER_ONLY_TRANSFER_RE.test(error.message)
  ) {
    return "Only the goal owner can do that.";
  }
  if (OWNER_ONLY_REMOVE_RE.test(error.message)) {
    return "You can only remove yourself from this goal.";
  }
  if (OWNER_CANT_LEAVE_RE.test(error.message)) {
    return "The owner can't leave their own goal — transfer it or archive it instead.";
  }
  // The open-task count is baked into the raised message itself
  // (`leave_goal`'s own `RAISE ... '...% open task(s)...', v_count`) --
  // extracted and reformatted here rather than passed through verbatim,
  // so the exact wording lives in one place. Callers that need the raw
  // count for a "link to the filtered task list" affordance (S3) should
  // use `extractOpenTaskCount` below instead of parsing this string a
  // second time.
  if (OPEN_TASKS_RE.test(error.message)) {
    const count = Number(OPEN_TASKS_RE.exec(error.message)?.[1]);
    return `They still own ${count} open task${count === 1 ? "" : "s"} on this goal — reassign ${count === 1 ? "it" : "them"} first.`;
  }
  if (NEW_OWNER_NOT_PARTICIPANT_RE.test(error.message)) {
    return "The new owner needs to already be a participant on this goal.";
  }
  if (INVALID_EMAIL_RE.test(error.message)) {
    return "That doesn't look like a valid email address.";
  }
  if (EMAIL_HAS_ACCOUNT_RE.test(error.message)) {
    return "That email already has an account — invite them by handle instead.";
  }
  if (INVITATION_INVALID_RE.test(error.message)) {
    return "This invitation is invalid or has expired.";
  }

  console.error(
    name ? `Unmapped DB constraint violation: ${name}` : "Unmapped DB error",
    error,
  );
  return FALLBACK_MESSAGE;
}

/**
 * S3: "surface it as 'Reassign their 3 open tasks first' and link to
 * the filtered task list — don't just report the error and leave them
 * to find the tasks" (brief, verbatim). `humanizeDbError` already turns
 * `leave_goal`'s raised message into a display string; this pulls the
 * same count back out as a number so a caller can build that link
 * (e.g. `/goals/[id]?ownerId=...`) alongside the message, without
 * parsing the string a second time with a different regex.
 */
export function extractOpenTaskCount(
  error: Pick<PostgrestError, "message" | "details">,
): number | null {
  const match = /still own (\d+) open task/i.exec(error.message);
  return match ? Number(match[1]) : null;
}
