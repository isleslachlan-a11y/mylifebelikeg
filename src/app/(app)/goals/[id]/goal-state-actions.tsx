"use client";

import { useState, useTransition } from "react";

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
import { transitionGoalState } from "../actions";
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

  const targets = ALLOWED_GOAL_TRANSITIONS[state];
  if (targets.length === 0) {
    return null;
  }

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
    });
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
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

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
