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
  capacity_exceeded: { speaker: "derek", priority: 1 },
  checkin_due: { speaker: "derek", priority: 2 },

  goal_green: { speaker: "fluffy", priority: 3 },
  goal_completed: { speaker: "fluffy", priority: 1 },
  checkin_streak: { speaker: "fluffy", priority: 3 },
  first_goal: { speaker: "fluffy", priority: 3 },
  trip_booked: { speaker: "fluffy", priority: 2 },
  goal_improved: { speaker: "fluffy", priority: 3 },
};

export function getSpeaker(trigger: TriggerCode): LlamaSpeaker {
  return TRIGGER_REGISTRY[trigger].speaker;
}

export function getPriority(trigger: TriggerCode): Priority {
  return TRIGGER_REGISTRY[trigger].priority;
}
