import type { LlamaSpeaker, TriggerCode } from "./types";

export type Priority = 1 | 2 | 3;

export type RegistryEntry = {
  speaker: LlamaSpeaker;
  /** 1 important, 2 normal, 3 incidental. */
  priority: Priority;
};

/**
 * The speaker is derived from the trigger here, once — call sites ask
 * "who says goal_red" via getSpeaker(), they never pick a llama
 * themselves. Derek carries red/amber/overdue/overrun/undefined/warning
 * territory; Fluffy carries completions, streaks, improvements, and green.
 */
export const TRIGGER_REGISTRY: Record<TriggerCode, RegistryEntry> = {
  goal_red: { speaker: "derek", priority: 1 },
  goal_amber: { speaker: "derek", priority: 2 },
  task_overdue: { speaker: "derek", priority: 1 },
  budget_exceeded: { speaker: "derek", priority: 1 },
  goal_undefined: { speaker: "derek", priority: 2 },
  schedule_momentum_mismatch: { speaker: "derek", priority: 2 },
  capacity_exceeded: { speaker: "derek", priority: 1 },
  capacity_shortfall: { speaker: "derek", priority: 1 },
  allocation_over_capacity: { speaker: "derek", priority: 1 },
  // P5.2 brief, verbatim: "when projected end is past target date, Derek
  // says so" — priority 1, same tier as task_overdue/budget_exceeded,
  // the other two "the schedule/money says so, plainly" triggers.
  goal_projected_late: { speaker: "derek", priority: 1 },
  // P6.6: same tier as budget_exceeded/allocation_over_capacity — real
  // money, ahead of what was set aside.
  trip_over_budget: { speaker: "derek", priority: 1 },
  // P6.6: a nudge, not yet a problem — "still recoverable if you act"
  // territory, same tier as goal_amber, not task_overdue's priority 1
  // (nothing's actually late yet).
  stop_unbooked_soon: { speaker: "derek", priority: 2 },
  // P6.6: a first-use note, incidental by nature — same tier as
  // first_goal/first_trip below.
  first_budget_set: { speaker: "derek", priority: 3 },

  goal_green: { speaker: "fluffy", priority: 3 },
  goal_completed: { speaker: "fluffy", priority: 1 },
  checkin_streak: { speaker: "fluffy", priority: 3 },
  first_goal: { speaker: "fluffy", priority: 3 },
  trip_booked: { speaker: "fluffy", priority: 2 },
  goal_improved: { speaker: "fluffy", priority: 3 },
  // P6.1: a round-number milestone on the bucket list — celebratory, not
  // urgent, same tier as checkin_streak/goal_improved. Renamed from
  // someday_milestone in P6.6.
  bucket_list_milestone: { speaker: "fluffy", priority: 3 },
  // P4.6 correction: a nudge that a weekly ritual is due reads as
  // encouragement, not a fault to call out — moved from Derek (its
  // speculative P0.6 assignment) to Fluffy, matching P4.6's own trigger
  // table exactly.
  checkin_due: { speaker: "fluffy", priority: 2 },
  // P6.6: same tier as goal_completed — a real completion, always
  // priority 1, never buried under incidental noise.
  trip_completed: { speaker: "fluffy", priority: 1 },
  // P6.6: same tier as first_goal — a first-use welcome, not urgent.
  first_trip: { speaker: "fluffy", priority: 3 },
  // P7.2 brief, verbatim: "the unlock moment is the payoff for the whole
  // system" — same tier as goal_completed/trip_completed, never buried
  // under incidental noise.
  achievement_unlocked: { speaker: "fluffy", priority: 1 },
  // P8.4: "the moment matters" — same tier as goal_completed/
  // trip_completed/achievement_unlocked, a real completion, not incidental.
  dream_achieved: { speaker: "fluffy", priority: 1 },
  // P8.5: Derek's territory (letting go, pruning) vs. Fluffy's
  // counterweight (the achieved recap) — same speaker split the rest of
  // this registry already draws. Priority 2 for both Derek triggers: a
  // real thing worth seeing, not urgent the way task_overdue/
  // budget_exceeded are. The recap is priority 3, incidental, same tier
  // as checkin_streak/goal_improved — good news, not news that needs
  // acting on.
  dream_let_go: { speaker: "derek", priority: 2 },
  dream_prune_available: { speaker: "derek", priority: 2 },
  dreams_achieved_recap: { speaker: "fluffy", priority: 3 },
  // Goal sharing package (S2, brief verbatim): "Fluffy, priority 1" --
  // same tier as goal_completed/achievement_unlocked, since being added
  // to someone's goal is the kind of thing worth surfacing promptly,
  // not left to go stale in the inbox. Emitted from
  // `app.invite_by_handle` (0043) directly, not through this registry's
  // usual emitLlamaMessage path -- see the TriggerParams comment.
  goal_shared_with_you: { speaker: "fluffy", priority: 1 },
  // F1 brief, verbatim: "Add both to the P0.6 registry at priority 1
  // and 2." A request arriving is priority 1 (something to act on);
  // an acceptance is priority 2 (good news, not urgent).
  friend_request: { speaker: "fluffy", priority: 1 },
  friend_accepted: { speaker: "fluffy", priority: 2 },
  // F3 brief, verbatim: "a Fluffy trigger; add it to the P0.6 registry
  // at priority 2."
  resource_shared_with_you: { speaker: "fluffy", priority: 2 },
};

export function getSpeaker(trigger: TriggerCode): LlamaSpeaker {
  return TRIGGER_REGISTRY[trigger].speaker;
}

export function getPriority(trigger: TriggerCode): Priority {
  return TRIGGER_REGISTRY[trigger].priority;
}
