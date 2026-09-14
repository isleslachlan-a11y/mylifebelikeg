import type { Database } from "@/types/database";

export type LlamaSpeaker = Database["public"]["Enums"]["llama_speaker"];

export type LlamaMessage =
  Database["public"]["Tables"]["llama_messages"]["Row"];

/**
 * Every event the llama layer can speak to. Add to this union, then to
 * `registry.ts` (who says it, how urgently) and `copy.ts` (what they say)
 * — the two are kept separate on purpose: registry.ts decides the
 * speaker so it's never chosen ad hoc per call site.
 */
export type TriggerCode =
  | "goal_red"
  | "goal_amber"
  | "goal_green"
  | "goal_completed"
  | "task_overdue"
  | "budget_exceeded"
  | "goal_undefined"
  | "schedule_momentum_mismatch"
  | "capacity_exceeded"
  | "capacity_shortfall"
  | "allocation_over_capacity"
  | "checkin_due"
  | "checkin_streak"
  | "first_goal"
  | "trip_booked"
  | "goal_improved"
  | "goal_projected_late"
  | "bucket_list_milestone"
  | "trip_completed"
  | "trip_over_budget"
  | "stop_unbooked_soon"
  | "first_trip"
  | "first_budget_set"
  | "achievement_unlocked"
  | "dream_achieved"
  | "dream_let_go"
  | "dream_prune_available"
  | "dreams_achieved_recap"
  | "goal_shared_with_you"
  | "friend_request"
  | "friend_accepted"
  | "resource_shared_with_you";

/** Typed parameters each trigger's copy templates need. */
export type TriggerParams = {
  goal_red: { goalTitle: string };
  goal_amber: { goalTitle: string };
  goal_green: { goalTitle: string };
  goal_completed: { goalTitle: string };
  task_overdue: { taskTitle: string; daysOverdue: number };
  budget_exceeded: {
    goalTitle: string;
    spentPercent: number;
    elapsedPercent: number;
  };
  goal_undefined: { goalTitle: string };
  /**
   * P4.2's explicit call-out: schedule green + momentum red. Worst-wins
   * already renders the goal red with no explanation of why one
   * dimension contradicts another this sharply — this trigger exists
   * specifically to say the quiet part ("the tasks don't reflect the
   * real work") rather than leaving it implied by a colour alone.
   */
  schedule_momentum_mismatch: { goalTitle: string };
  capacity_exceeded: { percentOver: number };
  /**
   * Distinct from capacity_exceeded, which is about active_goal_count
   * exceeding a user's goal-count limit (v_user_capacity), not money —
   * an unfortunate name collision from P1.0. This one is P2.1's monthly
   * cashflow capacity (v_monthly_cashflow) hitting zero or going
   * negative: income no longer covers recurring expenses.
   */
  capacity_shortfall: { capacityMinor: number; currency: string };
  /**
   * P2.4's reality check: v_allocation_summary.over_allocated — total
   * monthly_allocation_minor across every goal this user pledges to
   * exceeds their monthly cashflow capacity. A warning, never a block
   * (P2.4 brief, verbatim) — rendered live from real data on every load,
   * same as capacity_shortfall, not persisted to llama_messages.
   */
  allocation_over_capacity: { overMinor: number; currency: string };
  /**
   * P4.6 correction: this was speculatively shaped per-goal back in
   * P0.6, before P4.1 built the real check-in flow and settled that a
   * check-in is one weekly ritual covering every goal at once, not a
   * per-goal thing — `goalTitle` never fit what actually got built.
   * `daysLeft` matches the real trigger condition (P4.6's own table:
   * "within 2 days of period end").
   */
  checkin_due: { daysLeft: number };
  checkin_streak: { weeks: number };
  first_goal: { goalTitle: string };
  trip_booked: { tripTitle: string };
  goal_improved: { goalTitle: string };
  /**
   * P5.2: `app.goal_projected_end` (0021) run past the goal's own
   * `target_date` — the CPM-driven counterpart to `budget_exceeded`'s
   * money version, for schedule instead. `daysLate` is the gap in
   * calendar days, always positive (the evaluator only fires this when
   * projected is strictly after target — see evaluate.ts).
   */
  goal_projected_late: { goalTitle: string; daysLate: number };
  /**
   * P6.1 brief, verbatim: "Fluffy delivers a milestone message at every
   * tenth item added." Emitted inline from `someday/actions.ts`'s
   * `createSomedayItem` the instant a fresh count is an exact multiple of
   * 10 — same "exactly once, at the moment, not polled for" shape as
   * `goal_completed` (see CLAUDE.md). Renamed from `someday_milestone`
   * in P6.6 to match that brief's exact trigger list — no behaviour
   * change, same emit site.
   */
  bucket_list_milestone: { count: number };
  /**
   * P6.6: the trip-flavoured sibling of `goal_completed` — emitted
   * *instead of* it (not alongside) when the completed goal is
   * `kind: 'trip'`, from the same `transitionGoalState` call site.
   */
  trip_completed: { tripTitle: string };
  /**
   * P6.6: `v_trip_estimates.total_estimate_minor` past the trip goal's
   * own `target_amount_minor` — the trip-specific sibling of
   * `budget_exceeded`, which only ever looks at `v_goal_funding`'s
   * ledger-derived spend and has no notion of stops/legs. `overMinor` is
   * already the difference, same shape `allocation_over_capacity` uses,
   * so the copy doesn't have to subtract twice.
   */
  trip_over_budget: { tripTitle: string; overMinor: number; currency: string };
  /**
   * P6.6 brief, verbatim: "a stop within 30 days still at idea."
   * `daysUntil` is always 0-30 inclusive by construction of the
   * evaluator's own window — never negative (a past stop isn't "soon"
   * anymore, it's just late, which this trigger doesn't cover).
   */
  stop_unbooked_soon: {
    stopName: string;
    tripTitle: string;
    daysUntil: number;
  };
  /** P6.6: "a small number of messages that only fire once, on first use of a feature" (brief) — the trip-planning sibling of `first_goal`, fired once, the first time a user's very first trip-kind goal is created. */
  first_trip: { tripTitle: string };
  /**
   * P6.6: another first-use message (brief, verbatim: "a first-run line
   * from each llama") — Derek's, since target amounts are squarely his
   * territory (`budget_exceeded`/`capacity_shortfall`/
   * `allocation_over_capacity`/`goal_projected_late`). Fires once, the
   * first time any goal (standard or trip) is created with `funding !==
   * 'none'`.
   */
  first_budget_set: { goalTitle: string };
  /**
   * P7.2: fired from `src/lib/achievements/evaluate.ts`'s `celebrate`,
   * once per grant — `app.evaluate_achievements`/`app.grant_achievement`
   * (0026) are both idempotent, so this trigger's own condition ("a code
   * just moved from locked to unlocked, for this user, for the first
   * time ever") can only ever be true once per achievement, the same
   * "fresh count of 1" shape `first_goal`/`first_trip`/`first_budget_set`
   * already rely on for their own once-only guarantee. This is the
   * durable half of the unlock moment — the persisted, always-in-the-
   * inbox record — not the live celebration itself; see
   * `<AchievementCelebration>` for the ephemeral, in-context half the
   * P7.2 brief also asks for ("a modest celebration... star token, a
   * brief animation"), which uses its own copy rather than this
   * trigger's randomly-picked variant, so the two don't need to match
   * word for word.
   */
  achievement_unlocked: { achievementName: string };
  /**
   * P8.4: "the moment matters. Fluffy delivers it" (brief, verbatim) --
   * fired inline, exactly once, from `dreams/actions.ts`'s
   * `achieveDream`, the same "real event, not polled for" shape every
   * other one-off completion trigger here uses (`goal_completed`,
   * `bucket_list_milestone`). Distinct from `achievement_unlocked`,
   * which may or may not *also* fire alongside this in the same action
   * (whether achieving a dream happens to be someone's first or tenth) —
   * two independent messages for two independent facts, not one
   * conflated into the other, same relationship `goal_completed` already
   * has with its own achievement-evaluation call.
   */
  dream_achieved: { dreamTitle: string };
  /**
   * P8.5: "Let it go — archive, with Derek being decent about it.
   * Wanting something and then not wanting it is not a failure, and the
   * copy should not imply it is" (brief, verbatim). Fired inline from
   * `dreams/actions.ts`'s `letGoDream` -- the weekly prompt's own
   * "Let it go" response, not the quarterly prune's batch archive
   * (which stays quiet per-item, same "a batch operation doesn't need N
   * individual notifications" reasoning P8.4's own un-achieve already
   * established for a different quiet action).
   */
  dream_let_go: { dreamTitle: string };
  /**
   * P8.5: "a quarterly prune... offered as a batch to keep or archive"
   * -- this is the notice pointing at that batch, not the batch UI
   * itself. `count` is how many dreams currently qualify
   * (`v_dream_prune_candidates`), evaluated debounced on dashboard
   * load/check-in, same delivery surface every other trigger here uses.
   */
  dream_prune_available: { count: number };
  /**
   * P8.5: "Fluffy's counterweight, so the feature is not only
   * subtraction: a monthly note on what was achieved in the period, and
   * the total value of dreams achieved to date" (brief, verbatim) --
   * two different numbers, deliberately: `count` is this calendar
   * month's own achievements, `totalValueMinor`/`currency` is the
   * running lifetime total (base currency, via the stamped
   * `cost_base_minor` P8.3 already established) -- not the same figure
   * twice.
   */
  dreams_achieved_recap: {
    count: number;
    totalValueMinor: number;
    currency: string;
  };
  /**
   * Goal sharing package (S2). Emitted directly from
   * `app.invite_by_handle` (0043) via the same `llama_messages` insert
   * path `emit.ts` uses elsewhere -- not through `emitLlamaMessage`
   * itself, since the trigger fires inside a database function, not
   * application code (see 0043's own `v_bodies` comment). Listed here
   * purely for documentation/type-completeness, matching every other
   * wired trigger's presence in this union; `registry.ts`'s entry is
   * likewise never read by the emit path for this one trigger, only by
   * anything downstream (the inbox, `/styleguide/llamas`) that expects
   * every `TriggerCode` to resolve to a speaker.
   */
  goal_shared_with_you: { goalTitle: string; ownerName: string };
  /**
   * Friends and sharing package (F1). Emitted directly from
   * app.send_friend_request (0044), same "documentation/type-
   * completeness only, the real copy lives in SQL" shape
   * goal_shared_with_you already established -- see that trigger's
   * own comment.
   */
  friend_request: { requesterName: string };
  /** F1: emitted from app._apply_friendship_accepted (0044). */
  friend_accepted: { accepterName: string };
  /**
   * F3: emitted from app.share_resource/app.share_with_all_friends
   * (0044). resourceType isn't part of the params shape -- the SQL
   * body text is generic ("something just got shared with you") on
   * purpose, since the trigger fires for all four resource types
   * uniformly and the recipient sees exactly what it is the moment
   * they open /shared or the inbox link.
   */
  resource_shared_with_you: Record<string, never>;
};

/** Display metadata for the two speakers — not database-derived, just copy. */
export const SPEAKER_META: Record<
  LlamaSpeaker,
  { name: string; initial: string; description: string }
> = {
  derek: {
    name: "Derek",
    initial: "D",
    description: "Brown llama. Dry, pragmatic, blunt but never cruel.",
  },
  fluffy: {
    name: "Fluffy",
    initial: "F",
    description: "White llama. Warm, enthusiastic, never saccharine.",
  },
};
