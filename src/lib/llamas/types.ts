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
  | "capacity_exceeded"
  | "checkin_due"
  | "checkin_streak"
  | "first_goal"
  | "trip_booked"
  | "goal_improved";

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
  capacity_exceeded: { percentOver: number };
  checkin_due: { goalTitle: string };
  checkin_streak: { weeks: number };
  first_goal: { goalTitle: string };
  trip_booked: { tripTitle: string };
  goal_improved: { goalTitle: string };
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
