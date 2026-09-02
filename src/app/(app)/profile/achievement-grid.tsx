"use client";

import { useState, useTransition } from "react";
import { Lock, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleAchievementPin } from "./actions";

export type AchievementDef = {
  code: string;
  name: string;
  description: string;
};

export type UnlockedAchievement = {
  /** The user_achievements row's own id — what toggleAchievementPin
   * actually updates, distinct from the achievement's own code. */
  id: string;
  isPinned: boolean;
  unlockedAt: string;
};

const PIN_LIMIT = 3;

/**
 * The full achievement grid — own profile only (P7.3 brief: another
 * user's profile shows pinned flair, never this). "Locked ones visible
 * and their hints shown" (brief) is the same "don't hide the unlock
 * system's own advertising" instinct `/profile/avatar`'s preset tiles
 * already follow — a locked card here shows the achievement's own
 * `description` directly (there's no separate `unlock_hint` field the
 * way `v_available_presets` has one; for an achievement, its
 * description *is* how to earn it, e.g. "Completed five goals.").
 */
export function AchievementGrid({
  achievements,
  unlockedByCode,
}: {
  achievements: AchievementDef[];
  unlockedByCode: Record<string, UnlockedAchievement>;
}) {
  const [rows, setRows] = useState(unlockedByCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pinnedCount = Object.values(rows).filter((r) => r.isPinned).length;

  function handleTogglePin(code: string) {
    const row = rows[code];
    if (!row) return;
    const nextPinned = !row.isPinned;

    // The brief's own client-side prevention: a fourth pin never even
    // reaches the server action. Unpinning is always allowed regardless
    // of count.
    if (nextPinned && pinnedCount >= PIN_LIMIT) {
      setError("You can only pin three achievements — unpin one first.");
      return;
    }

    setError(null);
    setRows((prev) => ({
      ...prev,
      [code]: { ...prev[code]!, isPinned: nextPinned },
    }));

    startTransition(async () => {
      const result = await toggleAchievementPin(row.id, nextPinned);
      if (!result.ok) {
        // Revert the optimistic flip — this is the brief's "backstop"
        // path (app.enforce_pin_limit rejected something the client-side
        // count check above should already have caught).
        setError(result.error);
        setRows((prev) => ({
          ...prev,
          [code]: { ...prev[code]!, isPinned: !nextPinned },
        }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {achievements.map((achievement) => {
          const row = rows[achievement.code];
          const unlocked = row != null;
          const pinDisabled =
            isPending ||
            (!unlocked ? true : !row.isPinned && pinnedCount >= PIN_LIMIT);

          return (
            <div
              key={achievement.code}
              className={cn(
                "border-border flex items-start gap-3 rounded-xl border p-3",
                !unlocked && "opacity-60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  unlocked
                    ? "bg-star/15 text-star"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {unlocked ? (
                  <Star className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-medium">
                  {achievement.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {achievement.description}
                </p>
              </div>
              {unlocked && (
                <Button
                  type="button"
                  variant={row.isPinned ? "secondary" : "outline"}
                  size="sm"
                  disabled={pinDisabled}
                  onClick={() => handleTogglePin(achievement.code)}
                  className="shrink-0"
                >
                  {row.isPinned ? "Unpin" : "Pin"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
