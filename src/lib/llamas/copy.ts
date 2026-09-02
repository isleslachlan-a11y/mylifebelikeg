import { formatMoney } from "@/lib/money";
import type { TriggerCode, TriggerParams } from "./types";

type CopyFn<K extends TriggerCode> = (params: TriggerParams[K]) => string;

/**
 * Every variant, for every trigger — enumerable on purpose (the
 * /styleguide/llamas page shows all of them side by side for review).
 * `getLlamaCopy` below is the only thing that picks one at random; it's
 * what real event-wiring will call later.
 *
 * P6.6: at least three variants per trigger, verbatim per that brief —
 * "two isn't enough once you're using the app daily; repetition is what
 * makes a character feel like a robot." Every line below was read aloud
 * against the two-sentence character briefs at the top of each block
 * before being kept.
 */
export const COPY_VARIANTS: { [K in TriggerCode]: CopyFn<K>[] } = {
  // ---- Derek: dry, pragmatic, blunt but never cruel. States the fact
  // and lets it land — no exclamation points, no cheerleading. ----
  goal_red: [
    ({ goalTitle }) =>
      `${goalTitle} is red. Not trending well, and it's not fixing itself.`,
    ({ goalTitle }) =>
      `Calling it: ${goalTitle} is off track. Time to look at it, not away from it.`,
    ({ goalTitle }) => `${goalTitle} is red. Ignoring it won't turn it green.`,
  ],
  goal_amber: [
    ({ goalTitle }) =>
      `${goalTitle} is drifting into amber. Still recoverable, if you act now.`,
    ({ goalTitle }) => `Keep an eye on ${goalTitle} — it's slipping, not sunk.`,
    ({ goalTitle }) =>
      `${goalTitle} isn't red yet. That's the best time to do something about it.`,
  ],
  task_overdue: [
    ({ taskTitle, daysOverdue }) =>
      `${taskTitle} was due ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago. It's not getting any less due.`,
    ({ taskTitle, daysOverdue }) =>
      `Still waiting on ${taskTitle} — ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} and counting.`,
    ({ taskTitle, daysOverdue }) =>
      `${taskTitle}: ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. The date doesn't move on its own.`,
  ],
  budget_exceeded: [
    ({ goalTitle, spentPercent, elapsedPercent }) =>
      `You've spent ${spentPercent}% of ${goalTitle} and you're ${elapsedPercent}% through the year. Just saying.`,
    ({ goalTitle, spentPercent, elapsedPercent }) =>
      `${goalTitle} is ${spentPercent}% spent with ${100 - elapsedPercent}% of the year left. The maths isn't subtle.`,
    ({ goalTitle, spentPercent, elapsedPercent }) =>
      `${spentPercent}% of ${goalTitle}'s budget is gone, and the year's only ${elapsedPercent}% over. Worth a look.`,
  ],
  goal_undefined: [
    ({ goalTitle }) =>
      `${goalTitle} has no tasks and no budget. I can't tell you how it's going — there's nothing to measure.`,
    ({ goalTitle }) =>
      `Can't rate ${goalTitle} red, amber, or green. It's none of them. It's undefined — fix that first.`,
    ({ goalTitle }) =>
      `${goalTitle} isn't red, amber, or green. It's empty. Add a task or a budget and I'll have something to say.`,
  ],
  schedule_momentum_mismatch: [
    ({ goalTitle }) =>
      `${goalTitle}'s schedule looks fine, but the ratings say otherwise. Tasks getting ticked off that aren't the actual work will do that.`,
    ({ goalTitle }) =>
      `The tasks on ${goalTitle} say green. The ratings say red. One of those is measuring the wrong thing.`,
    ({ goalTitle }) =>
      `${goalTitle} is on schedule and rated badly at the same time. Worth asking which one you actually trust.`,
  ],
  capacity_exceeded: [
    ({ percentOver }) =>
      `Your commitments this month run ${percentOver}% over what you actually have. Something gives eventually.`,
    ({ percentOver }) =>
      `You're ${percentOver}% overcommitted. Not a judgement, just the number.`,
    ({ percentOver }) =>
      `${percentOver}% over capacity this month. Adding one more thing won't make that number smaller.`,
  ],
  // Not dismissed-and-gone like the others — call sites render this one
  // directly from live data on every load rather than persisting it to
  // llama_messages, precisely so it can't be hidden while still true.
  capacity_shortfall: [
    ({ capacityMinor, currency }) =>
      `Your monthly capacity is ${formatMoney(capacityMinor, currency)} right now. Expenses outrun income — that doesn't fix itself.`,
    ({ capacityMinor, currency }) =>
      `${formatMoney(capacityMinor, currency)} a month. Not a rounding error — recurring expenses are ahead of recurring income.`,
    ({ capacityMinor, currency }) =>
      `${formatMoney(capacityMinor, currency)} a month, and it's negative. That's not a savings problem, that's an income-versus-expense one.`,
  ],
  // Also rendered live, never persisted — see capacity_shortfall above.
  // A warning, not a block (P2.4 brief): this fires alongside whatever
  // action just pushed allocation over capacity, it never prevents it.
  allocation_over_capacity: [
    ({ overMinor, currency }) =>
      `You've allocated ${formatMoney(overMinor, currency)} more than your monthly capacity covers. Real money, recorded anyway — something eventually has to give.`,
    ({ overMinor, currency }) =>
      `That's ${formatMoney(overMinor, currency)} over what you actually have free each month. Not stopping you — just saying it plainly.`,
    ({ overMinor, currency }) =>
      `${formatMoney(overMinor, currency)} allocated beyond what you actually bring in each month. The goals don't know that yet.`,
  ],
  // P5.2: app.goal_projected_end run past target_date — the schedule's
  // own honest projection, not a vague "you're behind."
  goal_projected_late: [
    ({ goalTitle, daysLate }) =>
      `${goalTitle} is projected to finish ${daysLate} day${daysLate === 1 ? "" : "s"} after target, at the current pace. That's the schedule talking, not a guess.`,
    ({ goalTitle, daysLate }) =>
      `Run the tasks on ${goalTitle} forward and you land ${daysLate} day${daysLate === 1 ? "" : "s"} past target. Worth knowing before it happens, not after.`,
    ({ goalTitle, daysLate }) =>
      `${daysLate} day${daysLate === 1 ? "" : "s"} late, if nothing changes on ${goalTitle}. The tasks say so — I'm just reading them.`,
  ],
  // P6.6: v_trip_estimates' honest total against the trip's own target —
  // the "add it all up" sibling of budget_exceeded, one level more
  // granular (stops and legs, not just the ledger).
  trip_over_budget: [
    ({ tripTitle, overMinor, currency }) =>
      `${tripTitle}'s stops and legs add up to ${formatMoney(overMinor, currency)} more than the budget. That's not a rounding error.`,
    ({ tripTitle, overMinor, currency }) =>
      `Add up every stop and leg on ${tripTitle} and you're ${formatMoney(overMinor, currency)} over budget. Just saying.`,
    ({ tripTitle, overMinor, currency }) =>
      `${tripTitle} is ${formatMoney(overMinor, currency)} over what you set aside for it. The itinerary got ahead of the number.`,
  ],
  // P6.6 brief, verbatim: "a stop within 30 days still at idea."
  stop_unbooked_soon: [
    ({ stopName, tripTitle, daysUntil }) =>
      `${stopName} on ${tripTitle} is ${daysUntil} day${daysUntil === 1 ? "" : "s"} out and still just an idea. Might be time to actually book it.`,
    ({ stopName, daysUntil }) =>
      `${daysUntil} day${daysUntil === 1 ? "" : "s"} until ${stopName}, still unbooked. It doesn't book itself.`,
    ({ stopName, tripTitle, daysUntil }) =>
      `${stopName} on ${tripTitle}: ${daysUntil} day${daysUntil === 1 ? "" : "s"} away, still marked idea. Worth moving on before the date does.`,
  ],
  // P6.6: first-use, Derek's — see TriggerParams.first_budget_set's doc
  // for why this one's his rather than Fluffy's.
  first_budget_set: [
    ({ goalTitle }) =>
      `First budget on the books, on ${goalTitle}. Now the numbers can actually tell you something.`,
    ({ goalTitle }) =>
      `${goalTitle} has a real target attached now. That's when this app starts being useful.`,
    ({ goalTitle }) =>
      `You've put a number on ${goalTitle}. From here I can tell you if it's working, not just guess.`,
  ],
  // ---- Fluffy: warm, enthusiastic, encouraging without being
  // saccharine. Never minimises a genuine setback. ----
  goal_green: [
    ({ goalTitle }) =>
      `${goalTitle} is green and staying that way — love to see it!`,
    ({ goalTitle }) =>
      `Right on track with ${goalTitle}. Whatever you're doing, keep doing it!`,
    ({ goalTitle }) =>
      `${goalTitle}'s green again this week. Steady is its own kind of impressive!`,
  ],
  goal_completed: [
    ({ goalTitle }) =>
      `${goalTitle} is DONE. You actually did the whole thing!`,
    ({ goalTitle }) =>
      `That's a wrap on ${goalTitle} — go tell someone, this is worth bragging about!`,
    ({ goalTitle }) =>
      `${goalTitle}: complete. From idea to done — that's the whole arc, right there!`,
  ],
  checkin_streak: [
    ({ weeks }) =>
      `${weeks} weeks of check-ins in a row! That kind of consistency is the real achievement.`,
    ({ weeks }) =>
      `You've shown up ${weeks} weeks straight — I notice, and I'm genuinely impressed.`,
    ({ weeks }) =>
      `${weeks} weeks running. Showing up is the hard part, and you keep doing it!`,
  ],
  first_goal: [
    ({ goalTitle }) =>
      `${goalTitle} is your very first goal — every big thing starts exactly like this!`,
    ({ goalTitle }) =>
      `You just created ${goalTitle}. Welcome to having a plan — let's make it real!`,
    ({ goalTitle }) =>
      `${goalTitle}: goal number one! I'm excited to watch this one happen.`,
  ],
  trip_booked: [
    ({ tripTitle }) =>
      `${tripTitle} is fully booked. This is really happening now!`,
    ({ tripTitle }) =>
      `Every last piece of ${tripTitle} is locked in. Go ahead, start getting excited!`,
    ({ tripTitle }) =>
      `Every stop and every leg of ${tripTitle} is booked. Nothing left to plan — just to pack!`,
  ],
  goal_improved: [
    ({ goalTitle }) =>
      `${goalTitle} is trending better than last week — whatever you changed, it's working!`,
    ({ goalTitle }) =>
      `That's a real turnaround on ${goalTitle}. Not luck — that's you showing up.`,
    ({ goalTitle }) =>
      `${goalTitle} is moving the right direction again. Whatever shifted, it's working!`,
  ],
  // P4.6 correction: moved from Derek and reshaped from a per-goal
  // reminder to a whole-week one — see TriggerParams.checkin_due's doc.
  checkin_due: [
    ({ daysLeft }) =>
      `This week's check-in is still open — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Two minutes, whenever suits.`,
    ({ daysLeft }) =>
      `Haven't seen this week's check-in yet — ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go. No rush, just don't forget!`,
    ({ daysLeft }) =>
      `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on this week's check-in. Quick one, whenever you've got a minute!`,
  ],
  // P6.1: fires once per ten someday items, ever — a round number worth
  // noticing on a list that's meant to grow for years. Renamed from
  // someday_milestone in P6.6.
  bucket_list_milestone: [
    ({ count }) =>
      `${count} places on your someday list now. That's a lot of wanting-to — some of it's going to happen!`,
    ({ count }) =>
      `Just hit ${count} someday items. The list is doing its job — dream first, plan later.`,
    ({ count }) =>
      `${count} places on the list now. Every single one started as "wouldn't it be nice"!`,
  ],
  // P6.6: emitted instead of goal_completed for a trip-kind goal — see
  // TriggerParams.trip_completed's doc.
  trip_completed: [
    ({ tripTitle }) =>
      `${tripTitle} is done — not planned, not booked, actually DONE. How was it?!`,
    ({ tripTitle }) =>
      `You went on ${tripTitle}! That's not a spreadsheet anymore, that's a memory.`,
    ({ tripTitle }) =>
      `${tripTitle}: complete. From an idea on a map to an actual trip — that's the whole point!`,
  ],
  // P6.6: first-use — the trip-planning sibling of first_goal.
  first_trip: [
    ({ tripTitle }) =>
      `${tripTitle} is your first trip in here — say the words, get out the door!`,
    ({ tripTitle }) =>
      `You just started planning ${tripTitle}. Every stop from here is a step closer to actually going!`,
    ({ tripTitle }) =>
      `${tripTitle}: your very first trip! Stops, legs, budget — let's build the whole thing.`,
  ],
  // P7.2: the persisted half of the unlock moment (the live celebration
  // is <AchievementCelebration>'s own job, with its own copy — see that
  // component and TriggerParams's doc comment for why they don't need
  // to match word for word). Deliberately doesn't name what got
  // unlocked — that's on the achievement editor link, not crammed into
  // one line of inbox text.
  achievement_unlocked: [
    ({ achievementName }) =>
      `${achievementName} — unlocked! Go see what that opens up for your avatar.`,
    ({ achievementName }) =>
      `You just earned ${achievementName}. There's something new waiting on your avatar.`,
    ({ achievementName }) =>
      `${achievementName}: yours now! Something new just showed up in the avatar editor.`,
  ],
};

/**
 * P7.4: one specific, hand-written Fluffy line per achievement — the
 * brief's own ask ("write... Fluffy's unlock line" for each), passed as
 * `emitLlamaMessage`'s `bodyOverride` from `celebrate()` rather than
 * picked randomly the way every other trigger's copy is. A flat map
 * keyed by achievement `code`, not the usual `COPY_VARIANTS` shape, on
 * purpose: an achievement unlocks once, ever, for a given user (P7.2's
 * own idempotency guarantee) — there's no "getting stale from
 * repetition" the way a daily-use trigger like `goal_red` has, so there
 * was never a reason to write three variants of a line only ever seen
 * once. `achievement_unlocked`'s own three generic variants above still
 * exist and stay wired as the fallback for any future call site that
 * emits this trigger without a specific line to hand it.
 */
export const ACHIEVEMENT_UNLOCK_LINES: Record<string, string> = {
  first_light:
    "Your first finished goal! That's the whole system working, right there.",
  constellation:
    "Five goals down — that's not luck, that's a pattern. Well done.",
  southern_cross:
    "Ten goals. That's a whole constellation of finished things — genuinely impressive.",
  first_departure: "You actually went! First trip, done — here's to many more.",
  well_travelled: "Three countries and counting — your world's getting bigger.",
  steady_hand:
    "A month of steady check-ins. That's the habit forming — nice work.",
  long_haul:
    "Half a year without missing a week. You're the reliable one — I see it.",
  on_the_money:
    "On time AND under budget — that's not an accident, that's planning.",
  honest_reckoning:
    "Pulling back when things got hard isn't giving up — it's steering. Good call.",
  first_landfall:
    "From idea to actually booked — that's the moment a trip gets real.",
  star_chart:
    "Ten places on the list now. That's a proper map of where you're headed.",
  fair_wind:
    "Came in under budget — the numbers actually went your way this time.",
  twin_stars: "Two of you, one goal. That's always better company.",
  full_orbit:
    "A full year, start to finish. That's not a streak, that's a habit — congratulations.",
};

export function getLlamaCopy<K extends TriggerCode>(
  trigger: K,
  params: TriggerParams[K],
): string {
  const variants = COPY_VARIANTS[trigger];
  // Every trigger is seeded with at least three variants above (P6.6),
  // so this index is always in bounds — noUncheckedIndexedAccess just
  // can't see that statically.
  const fn = variants[Math.floor(Math.random() * variants.length)]!;
  return fn(params);
}
