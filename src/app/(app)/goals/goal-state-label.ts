import type { Database } from "@/types/database";

export function goalStateLabel(
  state: Database["public"]["Enums"]["goal_state"],
): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}
