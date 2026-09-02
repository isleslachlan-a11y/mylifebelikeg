import { createServiceClient } from "@/lib/supabase/service";
import { getPriority, getSpeaker } from "./registry";
import { getLlamaCopy } from "./copy";
import type { TriggerCode, TriggerParams } from "./types";

/**
 * Writes a llama message for a real app event — the "real event-wiring"
 * copy.ts's own comment points at. Uses the service-role client because
 * `llama_messages` has no user-facing INSERT policy (see
 * src/lib/supabase/service.ts): messages are system-authored, not
 * user-authored, by design.
 *
 * The `llama_messages_filter` trigger (app.filter_llama_message) drops
 * the row server-side based on the user's `llama_frequency` — this
 * function doesn't duplicate that muting logic, it just inserts and lets
 * the trigger decide.
 *
 * Never throws: a failed llama message shouldn't break whatever action
 * triggered it (e.g. completing a goal should succeed even if this
 * fails) — logged instead.
 *
 * `bodyOverride` (P7.4) skips `getLlamaCopy`'s randomly-picked variant
 * entirely when supplied — the one caller that needs this is
 * `src/lib/achievements/evaluate.ts`'s `celebrate()`, which has its own
 * specific, pre-written line per achievement (`ACHIEVEMENT_UNLOCK_LINES`
 * in copy.ts) rather than a generic templated one. Same reasoning
 * `suggest_goal_limit_change`'s reason text gets rendered directly
 * instead of re-templated (P4.5) — some copy is already exactly right at
 * the source and doesn't need a second, randomised pass on top.
 */
export async function emitLlamaMessage<K extends TriggerCode>(
  userId: string,
  trigger: K,
  params: TriggerParams[K],
  resource?: { type: string; id: string },
  bodyOverride?: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("llama_messages").insert({
    user_id: userId,
    speaker: getSpeaker(trigger),
    trigger_code: trigger,
    body: bodyOverride ?? getLlamaCopy(trigger, params),
    priority: getPriority(trigger),
    resource_type: resource?.type ?? null,
    resource_id: resource?.id ?? null,
  });

  if (error) {
    console.error(
      `Failed to emit llama message for trigger "${trigger}"`,
      error,
    );
  }
}
