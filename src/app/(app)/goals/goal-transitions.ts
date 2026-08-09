import type { Database } from "@/types/database";

export type GoalState = Database["public"]["Enums"]["goal_state"];

/**
 * The lifecycle graph. Kept separate from actions.ts (a "use server" file
 * can only export async functions) so both the server action and the
 * client buttons read the same source of truth instead of two hand-kept
 * copies drifting apart.
 */
export const ALLOWED_GOAL_TRANSITIONS: Record<GoalState, GoalState[]> = {
  active: ["completed", "archived", "abandoned", "someday"],
  someday: ["active", "archived"],
  completed: ["active"],
  archived: ["active"],
  abandoned: ["active"],
};

const TARGET_LABELS: Record<Exclude<GoalState, "active">, string> = {
  someday: "Move to someday",
  completed: "Mark complete",
  archived: "Archive",
  abandoned: "Abandon",
};

/**
 * Button copy for a transition. "→ active" reads differently depending
 * on where it's coming from: leaving someday is "Activate" (it was never
 * really stopped), leaving one of the three end states is "Reopen" (it
 * was finished, put aside, or abandoned, and now isn't).
 */
export function transitionLabel(from: GoalState, to: GoalState): string {
  if (to === "active") {
    return from === "someday" ? "Activate" : "Reopen";
  }
  return TARGET_LABELS[to];
}
