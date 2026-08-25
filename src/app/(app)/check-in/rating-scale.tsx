"use client";

import { Button } from "@/components/ui/button";

const SCORES = [1, 2, 3, 4, 5] as const;

type RatingScaleProps = {
  /** Distinguishes multiple scales on one screen for assistive tech — not rendered. */
  label: string;
  value: number | null;
  onChange: (score: number) => void;
  lowLabel: string;
  highLabel: string;
};

/**
 * A 1–5 tap control, labelled at both ends rather than left as bare
 * numbers — P4.1's brief is explicit that a rating only means something
 * once "1 is X, 5 is Y" anchors it (capacity's ends read differently
 * from a goal's, so both are caller-supplied, never hardcoded here).
 */
export function RatingScale({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: RatingScaleProps) {
  return (
    <div className="flex flex-col gap-1" role="radiogroup" aria-label={label}>
      <div className="flex gap-1.5">
        {SCORES.map((score) => (
          <Button
            key={score}
            type="button"
            variant={value === score ? "default" : "outline"}
            size="icon"
            aria-pressed={value === score}
            className="flex-1"
            onClick={() => onChange(score)}
          >
            {score}
          </Button>
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
