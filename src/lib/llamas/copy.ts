import type { TriggerCode, TriggerParams } from "./types";

type CopyFn<K extends TriggerCode> = (params: TriggerParams[K]) => string;

/**
 * Every variant, for every trigger — enumerable on purpose (the
 * /styleguide/llamas page shows all of them side by side for review).
 * `getLlamaCopy` below is the only thing that picks one at random; it's
 * what real event-wiring will call later.
 */
export const COPY_VARIANTS: { [K in TriggerCode]: CopyFn<K>[] } = {
  // ---- Derek: dry, pragmatic, blunt but never cruel. States the fact
  // and lets it land — no exclamation points, no cheerleading. ----
  goal_red: [
    ({ goalTitle }) =>
      `${goalTitle} is red. Not trending well, and it's not fixing itself.`,
    ({ goalTitle }) =>
      `Calling it: ${goalTitle} is off track. Time to look at it, not away from it.`,
  ],
  goal_amber: [
    ({ goalTitle }) =>
      `${goalTitle} is drifting into amber. Still recoverable, if you act now.`,
    ({ goalTitle }) => `Keep an eye on ${goalTitle} — it's slipping, not sunk.`,
  ],
  task_overdue: [
    ({ taskTitle, daysOverdue }) =>
      `${taskTitle} was due ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago. It's not getting any less due.`,
    ({ taskTitle, daysOverdue }) =>
      `Still waiting on ${taskTitle} — ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} and counting.`,
  ],
  budget_exceeded: [
    ({ goalTitle, spentPercent, elapsedPercent }) =>
      `You've spent ${spentPercent}% of ${goalTitle} and you're ${elapsedPercent}% through the year. Just saying.`,
    ({ goalTitle, spentPercent, elapsedPercent }) =>
      `${goalTitle} is ${spentPercent}% spent with ${100 - elapsedPercent}% of the year left. The maths isn't subtle.`,
  ],
  goal_undefined: [
    ({ goalTitle }) =>
      `${goalTitle} has no tasks and no budget. I can't tell you how it's going — there's nothing to measure.`,
    ({ goalTitle }) =>
      `Can't rate ${goalTitle} red, amber, or green. It's none of them. It's undefined — fix that first.`,
  ],
  capacity_exceeded: [
    ({ percentOver }) =>
      `Your commitments this month run ${percentOver}% over what you actually have. Something gives eventually.`,
    ({ percentOver }) =>
      `You're ${percentOver}% overcommitted. Not a judgement, just the number.`,
  ],
  checkin_due: [
    ({ goalTitle }) =>
      `${goalTitle} hasn't had a check-in this week. Two minutes, that's the whole ask.`,
    ({ goalTitle }) =>
      `No update on ${goalTitle} yet. I'll wait, but the goal won't check in on itself.`,
  ],

  // ---- Fluffy: warm, enthusiastic, encouraging without being
  // saccharine. Never minimises a genuine setback. ----
  goal_green: [
    ({ goalTitle }) =>
      `${goalTitle} is green and staying that way — love to see it!`,
    ({ goalTitle }) =>
      `Right on track with ${goalTitle}. Whatever you're doing, keep doing it!`,
  ],
  goal_completed: [
    ({ goalTitle }) =>
      `${goalTitle} is DONE. You actually did the whole thing!`,
    ({ goalTitle }) =>
      `That's a wrap on ${goalTitle} — go tell someone, this is worth bragging about!`,
  ],
  checkin_streak: [
    ({ weeks }) =>
      `${weeks} weeks of check-ins in a row! That kind of consistency is the real achievement.`,
    ({ weeks }) =>
      `You've shown up ${weeks} weeks straight — I notice, and I'm genuinely impressed.`,
  ],
  first_goal: [
    ({ goalTitle }) =>
      `${goalTitle} is your very first goal — every big thing starts exactly like this!`,
    ({ goalTitle }) =>
      `You just created ${goalTitle}. Welcome to having a plan — let's make it real!`,
  ],
  trip_booked: [
    ({ tripTitle }) =>
      `${tripTitle} is fully booked. This is really happening now!`,
    ({ tripTitle }) =>
      `Every last piece of ${tripTitle} is locked in. Go ahead, start getting excited!`,
  ],
  goal_improved: [
    ({ goalTitle }) =>
      `${goalTitle} is trending better than last week — whatever you changed, it's working!`,
    ({ goalTitle }) =>
      `That's a real turnaround on ${goalTitle}. Not luck — that's you showing up.`,
  ],
};

export function getLlamaCopy<K extends TriggerCode>(
  trigger: K,
  params: TriggerParams[K],
): string {
  const variants = COPY_VARIANTS[trigger];
  // Every trigger is seeded with at least two variants above, so this
  // index is always in bounds — noUncheckedIndexedAccess just can't see
  // that statically.
  const fn = variants[Math.floor(Math.random() * variants.length)]!;
  return fn(params);
}
