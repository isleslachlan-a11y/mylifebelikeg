"use client";

import { useState, useTransition } from "react";

import { LlamaMessage } from "@/components/llama-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acceptRaiseSuggestion,
  dismissCapacitySuggestion,
  lowerLimitByMovingGoal,
} from "./actions";

export type CapacitySuggestionProps = {
  direction: "raise" | "lower";
  /** app.suggest_goal_limit_change's own reason text — already Derek/Fluffy-toned at the source, so this renders it directly rather than re-templating it through the llama copy layer. */
  reason: string;
  currentLimit: number;
  /** Only used for "lower" — the goals a picker offers to move. Empty is a real (if odd) state: a lower suggestion could theoretically fire with no active goals left to move if the count changed between page load and render. */
  activeGoals: { id: string; title: string }[];
};

/**
 * Raise: Fluffy, one tap (P4.5 brief). Lower: Derek, and accepting
 * always means picking a specific goal to move — never just
 * decrementing the number and leaving the user over their new limit.
 * Dismissing either doesn't change what app.suggest_goal_limit_change
 * computes, only whether this page shows it again this period.
 */
export function CapacitySuggestion({
  direction,
  reason,
  currentLimit,
  activeGoals,
}: CapacitySuggestionProps) {
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDismiss() {
    // Fire-and-forget: the card is already gone from this render either
    // way (LlamaMessage hides itself first), and a failed dismiss just
    // means the same true suggestion reappears next load — advisory,
    // never something worth blocking or retrying on.
    void dismissCapacitySuggestion();
  }

  function handleRaise() {
    setError(null);
    startTransition(async () => {
      const result = await acceptRaiseSuggestion(currentLimit);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  function handleMove(goalId: string, targetState: "someday" | "archived") {
    setError(null);
    startTransition(async () => {
      const result = await lowerLimitByMovingGoal(
        goalId,
        targetState,
        currentLimit,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPickerOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <LlamaMessage
        speaker={direction === "raise" ? "fluffy" : "derek"}
        body={reason}
        onDismiss={handleDismiss}
      />
      {direction === "raise" ? (
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={isPending}
          onClick={handleRaise}
        >
          Raise limit to {currentLimit + 1}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setPickerOpen(true)}
        >
          Lower limit
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move a goal to lower your limit</DialogTitle>
            <DialogDescription>
              Picking one moves it and drops your limit to{" "}
              {Math.max(1, currentLimit - 1)} together — never leaving you
              over the new limit.
            </DialogDescription>
          </DialogHeader>

          {activeGoals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active goals to move right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeGoals.map((goal) => (
                <li
                  key={goal.id}
                  className="border-subtle flex items-center justify-between gap-3 rounded-lg border p-2"
                >
                  <span className="truncate text-sm">{goal.title}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleMove(goal.id, "someday")}
                    >
                      Someday
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleMove(goal.id, "archived")}
                    >
                      Archive
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
