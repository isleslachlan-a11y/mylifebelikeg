"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateActiveGoalLimit } from "./actions";

// Do not build limit-change suggestions here based on capacity ratings —
// that needs check-in history from Phase 4 (P1.7's notes). This is just
// the count and a plain number input.
export function CapacitySettings({
  activeGoalCount,
  activeGoalLimit,
}: {
  activeGoalCount: number;
  activeGoalLimit: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(String(activeGoalLimit));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
      setError("Choose a whole number between 1 and 20.");
      return;
    }

    startTransition(async () => {
      const result = await updateActiveGoalLimit(parsed);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {activeGoalCount} of {activeGoalLimit} active goals
      </p>
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="active-goal-limit">Active goal limit</Label>
          <Input
            id="active-goal-limit"
            type="number"
            min={1}
            max={20}
            step={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-20"
          />
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          Save
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
