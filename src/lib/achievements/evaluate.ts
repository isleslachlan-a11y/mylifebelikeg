import { createClient } from "@/lib/supabase/server";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import { ACHIEVEMENT_UNLOCK_LINES } from "@/lib/llamas/copy";
import type { NewlyUnlockedAchievement } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const DEBOUNCE_MS = 60 * 60 * 1000; // one hour, per brief — same shape evaluateLlamaTriggers (0020) already uses.

/**
 * Builds the rich celebration payload for one grant — `app.presets_unlocked_by`
 * for "what it unlocked" (P7.2 brief), plus Fluffy's own persisted
 * `llama_messages` row ("delivers the news by name"). The llama message
 * is the durable record: it's still sitting in the inbox on the next
 * page load even if the caller's own live `<AchievementCelebration>`
 * never mounts, gets dismissed unseen, or the request that earned it
 * never makes it back to the browser. Never throws — a failed
 * presets/llama lookup shouldn't undo or block a grant that already
 * happened; it just means a slightly emptier celebration this once.
 */
async function celebrate(
  supabase: SupabaseServerClient,
  userId: string,
  code: string,
  name: string,
): Promise<NewlyUnlockedAchievement> {
  const { data: presets, error: presetsError } = await supabase.rpc(
    "presets_unlocked_by",
    { p_achievement_code: code },
  );
  if (presetsError) {
    console.error(
      `celebrate: presets_unlocked_by failed for "${code}"`,
      presetsError,
    );
  }

  // P7.4: each achievement's own hand-written line, not the generic
  // templated variants — see ACHIEVEMENT_UNLOCK_LINES's own comment for
  // why this is a bodyOverride rather than routed through getLlamaCopy.
  // Falls back to the generic copy for any achievement that doesn't
  // have one yet (defensive — every seeded achievement does, as of 0029).
  //
  // No `resource` here (found live, P8.6 verification): `app.evaluate_
  // achievements` only ever returns `code`/`name` (its own doc comment:
  // "the return value is exactly what to celebrate"), and `code` is a
  // text slug like "new_star" -- never a valid uuid, which is what
  // `llama_messages.resource_id` actually is. Passing it as one silently
  // failed every `achievement_unlocked` insert (a Postgres uuid-syntax
  // error, caught by this function's own log-don't-throw try, so the
  // grant itself always still succeeded -- only the inbox message never
  // landed). resource_type/resource_id are write-only right now anyway
  // (grep confirms neither is read by any UI component, only by
  // evaluate.ts's own dedupe helpers, which this always-run-once,
  // naturally-idempotent trigger never uses) -- omitting them here is
  // honest about that rather than resolving a fake link to satisfy a
  // column nothing reads yet.
  await emitLlamaMessage(
    userId,
    "achievement_unlocked",
    { achievementName: name },
    undefined,
    ACHIEVEMENT_UNLOCK_LINES[code],
  );

  return { code, name, presets: presets ?? [] };
}

/**
 * The core evaluator — always runs, never debounced. Call this directly
 * from a discrete real event: check-in submit, goal/trip completion, or
 * a ledger entry being created. Each of those is a one-off moment worth
 * checking immediately ("the unlock moment is the payoff for the whole
 * system" — brief), not something to make a user wait up to an hour
 * for. Only dashboard load — a genuine poll, not a discrete event —
 * goes through `evaluateAchievementsDebounced` below instead.
 *
 * `app.evaluate_achievements` (0026) is itself idempotent and returns
 * only newly-unlocked codes, so "the return value is exactly what to
 * celebrate" (brief, verbatim) — this function does no filtering or
 * dedupe of its own on top; there's nothing to dedupe; a code this
 * returns has never been returned by any evaluation, for this user,
 * before.
 */
export async function evaluateAchievements(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<NewlyUnlockedAchievement[]> {
  const { data, error } = await supabase.rpc("evaluate_achievements");
  if (error) {
    console.error("evaluateAchievements: RPC failed", error);
    return [];
  }
  if (!data || data.length === 0) {
    return [];
  }

  const results: NewlyUnlockedAchievement[] = [];
  for (const row of data) {
    results.push(await celebrate(supabase, userId, row.code, row.name));
  }
  return results;
}

/**
 * Dashboard load's own entry point — debounced to at most once an hour
 * per user via `profiles.achievements_evaluated_at` (0028), claimed
 * *before* the checks run for the same reason `evaluateLlamaTriggers`
 * (0020) claims `llama_evaluated_at` first: two near-simultaneous loads
 * shouldn't both pay for a full pass. A dashboard load that's within the
 * debounce window returns an empty array, exactly like "nothing newly
 * unlocked" — the caller can't tell the difference, and doesn't need to.
 */
export async function evaluateAchievementsDebounced(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<NewlyUnlockedAchievement[]> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("achievements_evaluated_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error(
      "evaluateAchievementsDebounced: profile fetch failed",
      profileError,
    );
    return [];
  }
  if (!profile) return [];

  const lastEvaluated = profile.achievements_evaluated_at
    ? new Date(profile.achievements_evaluated_at).getTime()
    : 0;
  if (Date.now() - lastEvaluated < DEBOUNCE_MS) {
    return [];
  }

  const { error: claimError } = await supabase
    .from("profiles")
    .update({ achievements_evaluated_at: new Date().toISOString() })
    .eq("id", userId);
  if (claimError) {
    console.error(
      "evaluateAchievementsDebounced: claiming achievements_evaluated_at failed",
      claimError,
    );
  }

  return evaluateAchievements(supabase, userId);
}

/**
 * `honest_reckoning` (P4.5/P7.2) — trigger_type `capacity_honesty`, the
 * one achievement for an act of judgement rather than an accumulation.
 * "Lowered your own goal limit while goals were struggling" isn't
 * something a counting rule can detect, so it's granted here,
 * explicitly, from `settings/capacity/actions.ts`'s
 * `lowerLimitByMovingGoal`, not evaluated by `app.evaluate_achievements`
 * at all (0026's own `capacity_honesty` branch just checks a flag this
 * path never sets — it exists there only so the trigger_type is a real,
 * exhaustive case, not a silent no-op). This function takes an
 * achievement `code`, not a trigger_type — confirmed live that those are
 * two different columns with different values here (`code:
 * 'honest_reckoning'`, `trigger_type: 'capacity_honesty'`), after a
 * first pass that conflated them and passed the trigger_type straight
 * through as if it were the code, which `grant_achievement` would have
 * silently accepted as "unknown code" and granted nothing, forever.
 * `app.grant_achievement` (0026) is itself idempotent (`on conflict do
 * nothing`, returns whether a row was actually inserted) — a second
 * "lower" acceptance is a normal, expected thing to do and must never
 * re-celebrate the same achievement, so a `false` return here (already
 * held) is treated as "nothing to celebrate", not an error.
 */
export async function grantAchievementManually(
  supabase: SupabaseServerClient,
  userId: string,
  code: string,
): Promise<NewlyUnlockedAchievement | null> {
  const { data: granted, error } = await supabase.rpc("grant_achievement", {
    p_code: code,
  });
  if (error) {
    console.error(
      `grantAchievementManually: grant failed for "${code}"`,
      error,
    );
    return null;
  }
  if (!granted) {
    return null;
  }

  const { data: achievement, error: achievementError } = await supabase
    .from("achievements")
    .select("name")
    .eq("code", code)
    .maybeSingle();
  if (achievementError || !achievement) {
    console.error(
      `grantAchievementManually: couldn't fetch name for "${code}"`,
      achievementError,
    );
    return null;
  }

  return celebrate(supabase, userId, code, achievement.name);
}
