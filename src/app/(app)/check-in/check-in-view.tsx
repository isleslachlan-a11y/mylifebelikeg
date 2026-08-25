"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { saveCapacityRating, saveOverallNote, submitCheckIn } from "./actions";
import { formatCheckInPeriod } from "./format-period";
import { GoalRatingCard, type CheckInGoal } from "./goal-rating-card";
import { RatingScale } from "./rating-scale";
import { useDebouncedCallback } from "./use-debounced-save";

const NOTE_DEBOUNCE_MS = 600;

export type CheckInViewProps = {
  checkInId: string;
  periodEnd: string;
  streak: number;
  goals: CheckInGoal[];
  initialCapacityRating: number | null;
  initialOverallNote: string;
  initiallySubmitted: boolean;
};

type Step =
  | { kind: "goal"; goal: CheckInGoal }
  | { kind: "capacity" }
  | { kind: "note" }
  | { kind: "submit" };

/**
 * The weekly check-in (P4.1). One scrolling page on desktop; on mobile,
 * one step at a time — a goal-by-goal tap-and-advance flow is what makes
 * the "under two minutes" acceptance criterion realistic on a phone.
 * Every field autosaves via its own server action as it changes (ratings
 * immediately, free text debounced); Submit is the one separate,
 * deliberate act (flips submitted_at, per actions.ts). There's no
 * "unsaved changes" state anywhere in this component by design — closing
 * the tab mid-way is meant to be indistinguishable from finishing later.
 */
export function CheckInView({
  checkInId,
  periodEnd,
  streak,
  goals,
  initialCapacityRating,
  initialOverallNote,
  initiallySubmitted,
}: CheckInViewProps) {
  const isMobile = useIsMobile();

  const [capacityRating, setCapacityRating] = useState(initialCapacityRating);
  const [overallNote, setOverallNote] = useState(initialOverallNote);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    ...goals.map((goal): Step => ({ kind: "goal", goal })),
    { kind: "capacity" },
    { kind: "note" },
    { kind: "submit" },
  ];

  const saveNoteDebounced = useDebouncedCallback(async (value: string) => {
    const result = await saveOverallNote(checkInId, value);
    setError(result.ok ? null : result.error);
  }, NOTE_DEBOUNCE_MS);

  async function handleCapacityChange(next: number) {
    setCapacityRating(next);
    const result = await saveCapacityRating(checkInId, next);
    setError(result.ok ? null : result.error);
  }

  function handleNoteChange(value: string) {
    setOverallNote(value);
    saveNoteDebounced(value);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const result = await submitCheckIn(checkInId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setSubmitted(true);
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h1 className="font-display text-3xl">Check-in</h1>
      <p className="text-muted-foreground text-sm">
        {formatCheckInPeriod(periodEnd)}
        {streak > 0 ? ` · ${streak}-week streak` : null}
      </p>
    </div>
  );

  const capacitySection = (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium">
        How much capacity did you have this week?
      </h2>
      <p className="text-muted-foreground text-sm">
        A self-report, not a scorecard — it never gates anything, so answer
        honestly rather than however you think it should look.
      </p>
      <RatingScale
        label="This week's capacity"
        value={capacityRating}
        onChange={handleCapacityChange}
        lowLabel="ran on empty"
        highLabel="full tank"
      />
    </section>
  );

  const noteSection = (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium">Anything else? (optional)</h2>
      <Textarea
        value={overallNote}
        onChange={(e) => handleNoteChange(e.target.value)}
        placeholder="How the week went, in your own words…"
        rows={3}
      />
    </section>
  );

  const submitSection = (
    <section className="flex flex-col gap-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {submitted ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-sm">
          Submitted ✓ — you can keep making changes until next week&apos;s
          check-in opens.
        </div>
      ) : (
        <Button onClick={handleSubmit} disabled={submitting} size="lg">
          {submitting ? "Submitting…" : "Submit check-in"}
        </Button>
      )}
    </section>
  );

  if (isMobile) {
    // steps is never empty (capacity/note/submit are always present), so
    // this fallback never actually triggers — it only exists to satisfy
    // noUncheckedIndexedAccess, which can't see that invariant.
    const step = steps[stepIndex] ?? steps[steps.length - 1]!;
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
        {header}
        <div className="flex-1">
          {step.kind === "goal" && (
            <GoalRatingCard checkInId={checkInId} goal={step.goal} />
          )}
          {step.kind === "capacity" && capacitySection}
          {step.kind === "note" && noteSection}
          {step.kind === "submit" && submitSection}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
          >
            Back
          </Button>
          <p className="text-muted-foreground text-xs">
            {stepIndex + 1} of {steps.length}
          </p>
          <Button
            variant="outline"
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            disabled={isLast}
            className={isLast ? "invisible" : undefined}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      {header}
      {goals.length > 0 ? (
        <div className="flex flex-col gap-4">
          {goals.map((goal) => (
            <GoalRatingCard key={goal.id} checkInId={checkInId} goal={goal} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No active goals to rate this week.
        </p>
      )}
      {capacitySection}
      {noteSection}
      {submitSection}
    </div>
  );
}
