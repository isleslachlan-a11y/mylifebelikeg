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
import { deleteGoal } from "../actions";

// Always a soft delete, and deliberately separate from the lifecycle
// buttons in goal-state-actions.tsx — deleting isn't a state.
export function DeleteGoalButton({
  goalId,
  goalTitle,
}: {
  goalId: string;
  goalTitle: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGoal(goalId);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{goalTitle}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes it from every list. If you just want to put it aside,
              archive it instead — that&rsquo;s reversible from the goal itself;
              this isn&rsquo;t.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirm}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
