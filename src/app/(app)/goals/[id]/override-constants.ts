import type { Database } from "@/types/database";

// Split out from override-actions.ts for the same reason
// goal-transitions.ts is split from actions.ts: a "use server" file may
// only export async functions, and these plain values need importing
// from both the server action and the client-rendered form
// (override-section.tsx).

// Overriding "to grey" isn't a real action — grey means undefined (no
// tasks, no budget), which is a fact about the goal's data, not a
// judgement call to declare (P4.2). The DB itself doesn't restrict
// rag_override to these three (goals.rag_override is the full
// rag_status enum), so this is a UI-level choice, not a constraint one.
export type OverridableStatus = Extract<
  Database["public"]["Enums"]["rag_status"],
  "green" | "amber" | "red"
>;

export const OVERRIDE_DEFAULT_EXPIRY_DAYS = 14;
export const OVERRIDE_MAX_EXPIRY_DAYS = 30;
export const OVERRIDE_MIN_EXPIRY_DAYS = 1;
