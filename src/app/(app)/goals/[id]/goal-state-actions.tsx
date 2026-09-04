"use client";

import { useState, useTransition } from "react";

import { AchievementCelebration } from "@/components/achievement-celebration";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
import { achieveDream } from "@/app/(app)/dreams/actions";
import { transitionGoalState, type OfferableAchieveDream } from "../actions";
import {
  ALLOWED_GOAL_TRANSITIONS,
  transitionLabel,
  type GoalState,
} from "../goal-transitions";

export function GoalStateActions({
  goalId,
  state,
}: {
  goalId: string;
  state: GoalState;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");
  const [unlocked, setUnlocked] = useState<NewlyUnlockedAchievement[]>([]);
  // P8.4: "offer to mark the dream achieved rather than doing it
  // silently; the user may disagree about what counted" (brief,
  // verbatim) — populated only from this call's own result, same
  // "shown once, right where the user's action earned it" shape
  // `unlocked` above already has. Accepting or dismissing one just
  // removes it from this list; there's no persisted "still pending"
  // state to reconcile if the user navigates away without answering.
  const [offerDreams, setOfferDreams] = useState<OfferableAchieveDream[]>([]);
  const [achievingDreamId, setAchievingDreamId] = useState<string | null>(null);

  const targets = ALLOWED_GOAL_TRANSITIONS[state];

  function runTransition(target: GoalState, reason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await transitionGoalState(goalId, target, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (target === "abandoned") {
        setAbandonOpen(false);
        setAbandonReason("");
      }
      // P7.2: transitionGoalState only ever returns a non-empty array
      // here when *this* call is what earned it — see that action's own
      // comment and AchievementCelebration's for why that's enough on
      // its own to guarantee this never fires twice for one grant.
      if (result.data.unlockedAchievements.length > 0) {
        setUnlocked(result.data.unlockedAchievements);
      }
      if (result.data.offerAchieveDreams.length > 0) {
        setOfferDreams(result.data.offerAchieveDreams);
      }
    });
  }

  function handleAcceptOffer(dream: OfferableAchieveDream) {
    setAchievingDreamId(dream.id);
    startTransition(async () => {
      const result = await achieveDream(dream.id, {
        note: null,
        achievedStoragePath: null,
      });
      setAchievingDreamId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOfferDreams((prev) => prev.filter((d) => d.id !== dream.id));
      if (result.data.unlockedAchievements.length > 0) {
        setUnlocked((prev) => [...prev, ...result.data.unlockedAchievements]);
      }
    });
  }

  if (targets.length === 0 && offerDreams.length === 0) {
    return null;
  }

  function handleAbandonConfirm() {
    if (!abandonReason.trim()) {
      setError("Tell us why you're abandoning this goal.");
      return;
    }
    runTransition("abandoned", abandonReason);
  }

  return (
    <div className="flex flex-col gap-2">
      <AchievementCelebration unlocked={unlocked} />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {offerDreams.map((dream) => (
        <div
          key={dream.id}
          className="border-star/30 bg-star/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <p className="text-sm">
            Was &ldquo;{dream.title}&rdquo; part of this? You can mark it
            achieved too.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-11"
              disabled={achievingDreamId === dream.id}
              onClick={() =>
                setOfferDreams((prev) => prev.filter((d) => d.id !== dream.id))
              }
            >
              Not this one
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11"
              disabled={achievingDreamId === dream.id}
              onClick={() => handleAcceptOffer(dream)}
            >
              {achievingDreamId === dream.id
                ? "Marking achieved…"
                : "Mark achieved"}
            </Button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <Button
            key={target}
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() =>
              target === "abandoned"
                ? setAbandonOpen(true)
                : runTransition(target)
            }
          >
            {transitionLabel(state, target)}
          </Button>
        ))}
      </div>

      <Dialog open={abandonOpen} onOpenChange={setAbandonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandon this goal?</DialogTitle>
            <DialogDescription>
              We&rsquo;re not doing this, and here&rsquo;s why — the reason
              stays attached to the goal, it&rsquo;s not hidden once you abandon
              it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="abandon-reason">Reason</Label>
            <Textarea
              id="abandon-reason"
              autoFocus
              value={abandonReason}
              onChange={(e) => setAbandonReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbandonOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !abandonReason.trim()}
              onClick={handleAbandonConfirm}
            >
              Abandon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
