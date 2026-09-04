"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import {
  letGoDream,
  promoteDreamToGoal,
  snoozeDream,
} from "@/app/(app)/dreams/actions";

export type SurfacedDream = {
  id: string;
  title: string;
  roughCostMinor: number | null;
  currency: string | null;
  photoUrl: string | null;
};

type Response = "still_want" | "promote" | "snooze" | "let_go";

/**
 * "Weekly, as part of the check-in, one dream surfaced" (P8.5 brief) --
 * rendered outside the check-in's own step navigation (mobile's
 * one-step-at-a-time flow, desktop's scrolling page) since this isn't
 * part of rating a goal; it shouldn't consume a "step" or block reaching
 * Submit, just sit alongside it. "The prompt offers four responses, and
 * this is the whole design" (brief, verbatim) -- all four, no more.
 *
 * "Still want this — resets nothing, just acknowledges" is the one
 * response with no server action behind it at all: `setDismissed(true)`
 * *is* the entire implementation, not a stub. The other three each
 * dismiss the card only *after* their own action succeeds, so a failed
 * request leaves the prompt exactly where it was rather than silently
 * losing the response.
 */
export function DreamPrompt({ dream }: { dream: SurfacedDream | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<Response | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [promotedGoalId, setPromotedGoalId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!dream || dismissed) return null;

  function respond(response: Response) {
    if (!dream) return;
    setError(null);

    if (response === "still_want") {
      // "Resets nothing, just acknowledges" -- no server call, see this
      // component's own top comment.
      setDismissed(true);
      return;
    }

    setPendingResponse(response);
    startTransition(async () => {
      const result =
        response === "promote"
          ? await promoteDreamToGoal(dream.id)
          : response === "snooze"
            ? await snoozeDream(dream.id)
            : await letGoDream(dream.id);

      setPendingResponse(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (response === "promote") {
        // Stays visible one extra beat with a link to the new goal,
        // rather than just vanishing -- "make it a goal" is the one
        // response with somewhere useful to go next. promoteDreamToGoal
        // returns the dream row itself (fresh, per its own "ripple
        // effects return full state" comment), and that row now has
        // promoted_goal_id set.
        setPromotedGoalId(result.data.promoted_goal_id);
        return;
      }
      setDismissed(true);
    });
  }

  if (promotedGoalId) {
    return (
      <div className="border-subtle bg-surface flex items-center justify-between gap-3 rounded-xl border p-4">
        <p className="text-sm">
          &ldquo;{dream.title}&rdquo; is now a goal.
        </p>
        <Link
          href={`/goals/${promotedGoalId}`}
          className="text-primary text-sm underline underline-offset-2"
        >
          View goal →
        </Link>
      </div>
    );
  }

  return (
    <div className="border-subtle bg-surface flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <div className="ring-foreground/10 aspect-square size-16 shrink-0 overflow-hidden rounded-lg ring-1">
          {dream.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dream.photoUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="bg-muted size-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">Still on your mind?</p>
          <p className="font-display truncate text-base">{dream.title}</p>
          {dream.roughCostMinor != null && dream.currency && (
            <Badge variant="outline" className="mt-1 w-fit">
              {formatMoney(dream.roughCostMinor, dream.currency)}
            </Badge>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pendingResponse !== null}
          onClick={() => respond("still_want")}
        >
          Still want this
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pendingResponse !== null}
          onClick={() => respond("promote")}
        >
          {pendingResponse === "promote" ? "Making it a goal…" : "Make it a goal"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={pendingResponse !== null}
          onClick={() => respond("snooze")}
        >
          {pendingResponse === "snooze" ? "Snoozing…" : "Not right now"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive max-md:h-11"
          disabled={pendingResponse !== null}
          onClick={() => respond("let_go")}
        >
          {pendingResponse === "let_go" ? "Letting go…" : "Let it go"}
        </Button>
      </div>
    </div>
  );
}
