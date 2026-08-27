"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateActiveGoalLimit } from "./actions";

/**
 * The direct-edit path (P4.5 brief: "the user can always change the
 * limit directly", independent of any suggestion) — moved here from
 * profile/capacity-settings.tsx, now alongside the suggestion itself
 * rather than a bare number input with a forward-pointing comment about
 * Phase 4. `recentCapacityMean` is `v_user_capacity`'s own column,
 * never recomputed here; null means fewer than 3 capacity ratings ever
 * (the view's own definition), shown as "not enough data yet" rather
 * than a fabricated number.
 */
export function CapacitySettings({
  activeGoalCount,
  activeGoalLimit,
  recentCapacityMean,
}: {
  activeGoalCount: number;
  activeGoalLimit: number;
  recentCapacityMean: number | null;
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
      <dl className="text-muted-foreground flex flex-col gap-0.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Active goals</dt>
          <dd>
            {activeGoalCount} of {activeGoalLimit}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Recent capacity</dt>
          <dd>
            {recentCapacityMean != null
              ? `${recentCapacityMean.toFixed(1)} / 5`
              : "Not enough data yet"}
          </dd>
        </div>
      </dl>
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
