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
 */
export async function emitLlamaMessage<K extends TriggerCode>(
  userId: string,
  trigger: K,
  params: TriggerParams[K],
  resource?: { type: string; id: string },
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.from("llama_messages").insert({
    user_id: userId,
    speaker: getSpeaker(trigger),
    trigger_code: trigger,
    body: getLlamaCopy(trigger, params),
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
