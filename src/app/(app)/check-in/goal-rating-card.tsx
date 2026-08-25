"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { saveGoalRating } from "./actions";
import { RatingScale } from "./rating-scale";
import { useDebouncedCallback } from "./use-debounced-save";

const NOTE_DEBOUNCE_MS = 600;

export type CheckInGoal = {
  id: string;
  title: string;
  /** Pre-formatted (formatScheduleVariance) or null — schedule-variance.ts's "no signal" case, not a 0. */
  scheduleVarianceText: string | null;
  initialScore: number | null;
  initialNote: string;
};

type GoalRatingCardProps = {
  checkInId: string;
  goal: CheckInGoal;
};

/**
 * One goal, one card: rating + optional note, saving as you go (P4.1
 * brief). `goal_ratings.score` is NOT NULL (0014's live schema) — there's
 * no row to attach a note to before a score exists, so the note field
 * stays hidden behind a hint until the goal's been rated at least once,
 * rather than silently dropping a note nobody knew wasn't being saved.
 */
export function GoalRatingCard({ checkInId, goal }: GoalRatingCardProps) {
  const [score, setScore] = useState(goal.initialScore);
  const [note, setNote] = useState(goal.initialNote);
  const [showNote, setShowNote] = useState(goal.initialNote.length > 0);
  const [error, setError] = useState<string | null>(null);

  const saveNoteDebounced = useDebouncedCallback(
    async (currentScore: number, value: string) => {
      const result = await saveGoalRating(checkInId, goal.id, currentScore, value);
      setError(result.ok ? null : result.error);
    },
    NOTE_DEBOUNCE_MS,
  );

  async function handleScoreChange(next: number) {
    setScore(next);
    const result = await saveGoalRating(checkInId, goal.id, next, note);
    setError(result.ok ? null : result.error);
  }

  function handleNoteChange(value: string) {
    setNote(value);
    if (score != null) {
      saveNoteDebounced(score, value);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{goal.title}</CardTitle>
        {goal.scheduleVarianceText && (
          <p className="text-muted-foreground text-sm">
            {goal.scheduleVarianceText}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <RatingScale
          label={`Rate ${goal.title}`}
          value={score}
          onChange={handleScoreChange}
          lowLabel="didn't touch it"
          highLabel="absolutely smashed it"
        />
        {score == null ? (
          <p className="text-muted-foreground text-xs">
            Rate this goal to add a note.
          </p>
        ) : showNote ? (
          <Textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Add a note…"
            rows={2}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="text-muted-foreground hover:text-foreground self-start text-xs underline-offset-4 hover:underline"
          >
            + Add a note
          </button>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </CardContent>
    </Card>
  );
}
