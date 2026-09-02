"use client";

import Link from "next/link";
import { useState } from "react";
import { Sparkles, X } from "lucide-react";

import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";

/**
 * The live, in-context half of the unlock moment (P7.2 brief: "the
 * unlock moment is the payoff for the whole system") — Fluffy's own
 * `llama_messages` row (`src/lib/achievements/evaluate.ts`'s
 * `celebrate`) is the durable, always-in-the-inbox half; this is the
 * modest star-token-and-a-pop-in celebration the brief also asks for,
 * shown once, right where the user's action earned it.
 *
 * Every call site (goal/trip completion, check-in submit, a ledger
 * entry, accepting a "lower" capacity suggestion, or the dashboard's own
 * debounced load) passes whatever `evaluateAchievements`/
 * `evaluateAchievementsDebounced`/`grantAchievementManually` just
 * returned. "Never celebrate twice" (brief) needs no dedupe state here:
 * `app.evaluate_achievements`/`app.grant_achievement` (0026) are both
 * idempotent, so a given achievement code only ever appears in one of
 * those return values once, on the one call that actually earned it —
 * every render of this component downstream of that call is showing a
 * real, first-time unlock, and the *next* render (a fresh page load, a
 * fresh action) gets an empty array for that same achievement, forever.
 * The only local state here is which cards the user has already
 * dismissed *this render* — not a "have I shown this before" flag.
 */
export function AchievementCelebration({
  unlocked,
}: {
  unlocked: NewlyUnlockedAchievement[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = unlocked.filter((a) => !dismissed.has(a.code));

  if (visible.length === 0) return null;

  return (
    <div
      role="status"
      // P7.5: TabBar is also `fixed bottom-0`, ~5rem tall plus the safe
      // area, and only hides at `md:` — a plain `bottom-4` sat inside
      // that zone and either covered the tab bar or fought it for the
      // same strip of screen. `<main>`'s own `pb-[calc(5rem+...)]`
      // compensation (src/app/(app)/layout.tsx) is the reference value
      // for how tall that bar actually is; this adds a bit more
      // clearance on top of it so the card reads as its own element,
      // not glued to the bar. `md:bottom-8` once the bar is gone.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+1rem)] z-50 flex flex-col items-center gap-3 px-4 md:bottom-8"
    >
      {visible.map((achievement) => (
        <div
          key={achievement.code}
          className="achievement-celebration-card border-star/40 bg-surface pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-lg"
        >
          <span
            aria-hidden
            className="achievement-star bg-star/15 text-star flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-star text-xs font-medium">Fluffy</p>
            <p className="text-foreground text-sm font-medium">
              Achievement unlocked: {achievement.name}
            </p>
            {achievement.presets.length > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                New for your avatar:{" "}
                {achievement.presets.map((p) => p.name).join(", ")}
              </p>
            )}
            <Link
              href="/profile/avatar"
              className="text-primary mt-1.5 inline-block text-xs underline-offset-4 hover:underline"
            >
              Customise your avatar →
            </Link>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setDismissed((prev) => new Set(prev).add(achievement.code))
            }
            // P7.5: matches LlamaMessage's own dismiss button exactly —
            // p-1 around a size-4 icon is a 24x24 tap target on its own,
            // the same shortfall P5.5's mobile pass found and fixed
            // there; max-md:size-11 gives this the same 44px floor below
            // the desktop breakpoint, found here by re-checking every
            // P6/P7 component against that established pattern rather
            // than assuming a copy-pasted button already had it.
            className="text-muted-foreground hover:bg-raised hover:text-foreground flex shrink-0 items-center justify-center rounded-full p-1 transition-colors max-md:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
