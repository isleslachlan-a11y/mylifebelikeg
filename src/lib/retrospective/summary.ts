/**
 * P5.4's pure logic for `/retrospective/[year]` — every function here
 * takes already-timezone-resolved bare "YYYY-MM-DD" strings, never a
 * `Date` or a raw timestamptz + timezone pair: the page converts each
 * goal's `completed_at`/`abandoned_at` to the viewer's local bare date
 * (`todayInZone(timezone, new Date(ts))` — that function generalises to
 * any instant despite its name) *before* calling in here, same
 * boundary the rest of this app draws between "timezone conversion"
 * (page/adapter layer) and "pure calendar comparison" (lib layer).
 *
 * Two sections below are honest approximations, not exact history, and
 * say so at the point they're computed: neither `profiles.active_goal_limit`
 * nor a goal's `state` transitions are logged anywhere (no changelog
 * table exists for either — confirmed against the live schema before
 * writing this, not assumed), so "the goal limit changed on this date"
 * or "this goal became active on this date" aren't real, queryable
 * facts. What *is* real: every goal's `created_at`, `completed_at`,
 * `abandoned_at`, and current `state` — enough to reconstruct a
 * defensible, clearly-labelled approximation, not enough to reconstruct
 * true history.
 */

export type YearRange = { start: string; end: string };

export function getYearRange(year: number): YearRange {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Loosely-typed against `goals`'s real columns, already bare-dated — only what this module needs. */
export type RetroGoalInput = {
  id: string;
  title: string;
  state: string;
  lifeAreaId: string | null;
  createdOn: string;
  completedOn: string | null;
  abandonedOn: string | null;
  abandonReason: string | null;
};

export type YearGoalCategories = {
  /** completed_at falls within the year. */
  completed: RetroGoalInput[];
  /** abandoned_at falls within the year, reason included — never hidden (P5.3's own archive already established this app doesn't hide abandonments). */
  abandoned: RetroGoalInput[];
  /** Still open (active or someday) by the end of the year, and existed by then — the ongoing, unresolved remainder. */
  carriedForward: RetroGoalInput[];
};

/**
 * "Goals completed, abandoned, and carried forward" — the brief's first,
 * simpler three-way split (distinct from `estimateYearStartCohort`
 * below, which asks a narrower question about a specific starting
 * cohort). A goal can appear in at most one bucket: `completed`/
 * `abandoned` are decided by their own terminal date falling in-year;
 * `carriedForward` is everything else still open by year end.
 */
export function categorizeGoalsForYear(
  goals: RetroGoalInput[],
  range: YearRange,
): YearGoalCategories {
  const completed: RetroGoalInput[] = [];
  const abandoned: RetroGoalInput[] = [];
  const carriedForward: RetroGoalInput[] = [];

  for (const goal of goals) {
    if (
      goal.completedOn &&
      goal.completedOn >= range.start &&
      goal.completedOn <= range.end
    ) {
      completed.push(goal);
    } else if (
      goal.abandonedOn &&
      goal.abandonedOn >= range.start &&
      goal.abandonedOn <= range.end
    ) {
      abandoned.push(goal);
    } else if (
      (goal.state === "active" || goal.state === "someday") &&
      goal.createdOn <= range.end
    ) {
      carriedForward.push(goal);
    }
  }

  return { completed, abandoned, carriedForward };
}

export type CohortOutcome =
  "completed" | "abandoned" | "still_active" | "moved_to_someday" | "archived";

export type CohortEntry = { goal: RetroGoalInput; outcome: CohortOutcome };

/**
 * "What you said you'd do versus what you did" (brief, verbatim) — the
 * retrospective's centrepiece. The cohort is every goal that almost
 * certainly existed and was active before the year began (`createdOn`
 * strictly before `range.start` — a goal created *during* the year was
 * never "what you said you'd do" going into it); each one's outcome is
 * read as of `cutoff` (year end, or today for a year still in
 * progress — never later than today, so an in-progress year's cohort
 * reads "so far," not a prediction).
 *
 * A goal already `completed`/`abandoned` by `cutoff` reports that.
 * Otherwise its *current* `state` decides: `archived` or `someday` are
 * real, current facts even though exactly when the goal moved there
 * isn't logged; anything else (i.e. still `active`) reports
 * `still_active`. This is the one place in this module where "current
 * state" stands in for "state at cutoff" — the approximation the
 * module doc's header explains.
 */
export function estimateYearStartCohort(
  goals: RetroGoalInput[],
  range: YearRange,
  today: string,
): CohortEntry[] {
  const cutoff = range.end < today ? range.end : today;

  return goals
    .filter((g) => g.createdOn < range.start)
    .map((goal): CohortEntry => {
      if (goal.completedOn && goal.completedOn <= cutoff) {
        return { goal, outcome: "completed" };
      }
      if (goal.abandonedOn && goal.abandonedOn <= cutoff) {
        return { goal, outcome: "abandoned" };
      }
      if (goal.state === "archived") {
        return { goal, outcome: "archived" };
      }
      if (goal.state === "someday") {
        return { goal, outcome: "moved_to_someday" };
      }
      return { goal, outcome: "still_active" };
    });
}

/** Loosely-typed against `ledger_entries`'s real columns, already bare-dated. */
export type RetroLedgerEntryInput = {
  entryType: "contribution" | "expense";
  baseAmountMinor: number;
  goalId: string | null;
  occurredOn: string;
};

export type LifeAreaMoneyTotals = {
  lifeAreaId: string | null;
  savedMinor: number;
  spentMinor: number;
};

/**
 * "Total saved and spent by life area" — sums `ledger_entries.base_amount_minor`
 * (the ledger's own already-FX-converted figure, one consistent base
 * currency per user — CLAUDE.md rule 1: never recompute money, read the
 * ledger) grouped by each entry's goal's life area, for entries within
 * `range`. `contribution` entries add to `savedMinor`, `expense` to
 * `spentMinor` — `ledger_kind`'s only two values (0009's own enum), so
 * there's no third bucket to account for. An entry with no `goal_id`
 * (schema allows it — a ledger entry isn't required to be goal-scoped)
 * or a goal with no `life_area_id` both land in the `null` group,
 * rather than being silently dropped — CLAUDE.md rule 1's "never a bare
 * number" extends to "never a silently discarded one" here too.
 */
export function summarizeMoneyByLifeArea(
  entries: RetroLedgerEntryInput[],
  range: YearRange,
  lifeAreaByGoal: Map<string, string | null>,
): LifeAreaMoneyTotals[] {
  const totals = new Map<string | null, LifeAreaMoneyTotals>();

  for (const entry of entries) {
    if (entry.occurredOn < range.start || entry.occurredOn > range.end) {
      continue;
    }
    const lifeAreaId = entry.goalId
      ? (lifeAreaByGoal.get(entry.goalId) ?? null)
      : null;
    const existing = totals.get(lifeAreaId) ?? {
      lifeAreaId,
      savedMinor: 0,
      spentMinor: 0,
    };
    if (entry.entryType === "contribution") {
      existing.savedMinor += entry.baseAmountMinor;
    } else {
      existing.spentMinor += entry.baseAmountMinor;
    }
    totals.set(lifeAreaId, existing);
  }

  return [...totals.values()];
}

const ISO_DOW_MS = 86_400_000;

/**
 * Every weekly check-in period whose `period_end` falls within
 * `[rangeStart, rangeEnd]` (inclusive) — the same period-derivation
 * shape `app.current_checkin_period` uses (0014: a 7-day window ending
 * on the most recent occurrence of `checkInDay`), generalised from "the
 * one period containing today" to "every period in a range." Used as
 * the denominator for check-in coverage: a period existing here doesn't
 * require a `check_ins` row to have ever been created for it (0014's
 * `ensure_current_checkin` is lazy — a skipped week never gets a row at
 * all), so counting real rows alone would undercount possible periods,
 * not just submitted ones.
 */
export function enumeratePeriodStarts(
  checkInDay: number,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const start = new Date(`${rangeStart}T00:00:00.000Z`);
  const end = new Date(`${rangeEnd}T00:00:00.000Z`);

  // isodow: 1 = Monday .. 7 = Sunday, matching 0014's own convention.
  const isoDow = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
  const back = (isoDow(start) - checkInDay + 7) % 7;
  let periodEnd = new Date(start.getTime() - back * ISO_DOW_MS);
  // The first candidate might land before the range if `back` overshot
  // a period that ended just before rangeStart — step forward once more
  // in that case so the enumeration only ever starts at or after it.
  if (periodEnd.getTime() < start.getTime()) {
    periodEnd = new Date(periodEnd.getTime() + 7 * ISO_DOW_MS);
  }

  const starts: string[] = [];
  while (periodEnd.getTime() <= end.getTime()) {
    const periodStart = new Date(periodEnd.getTime() - 6 * ISO_DOW_MS);
    starts.push(periodStart.toISOString().slice(0, 10));
    periodEnd = new Date(periodEnd.getTime() + 7 * ISO_DOW_MS);
  }
  return starts;
}

export type CheckinCoverage = { submitted: number; possible: number };

/** `possible` = every period that could have been submitted (`enumeratePeriodStarts`); `submitted` = how many actually were, by matching `period_start`. */
export function computeCheckinCoverage(
  allPeriodStarts: string[],
  submittedPeriodStarts: ReadonlySet<string>,
): CheckinCoverage {
  const submitted = allPeriodStarts.filter((p) =>
    submittedPeriodStarts.has(p),
  ).length;
  return { submitted, possible: allPeriodStarts.length };
}

export type MonthlyAverage = { month: number; average: number | null };

/**
 * "Average rating by month as a sparkline" — one entry per calendar
 * month (1–12, always all twelve, even a month with zero ratings —
 * `average: null` there, not a `0` that would misread as "rated
 * terribly" per this app's own "never a bare number for something that
 * didn't happen" instinct, CLAUDE.md rule 1's spirit applied to ratings
 * rather than money). Grouped by the rating's period's *end* month, not
 * `created_at`'s (a rating logged a day late still belongs to the
 * period it rated) and not `period_start`'s either — a period spanning
 * a month or year boundary (e.g. starting Dec 29, ending Jan 4) reads
 * as belonging to whichever month it actually concluded in, the same
 * convention `enumeratePeriodStarts`/`computeCheckinCoverage` already
 * use for deciding which *year* a boundary-spanning period counts
 * toward — this keeps both away from silently disagreeing with each
 * other on the exact same kind of period.
 */
export function averageRatingByMonth(
  ratings: { periodEnd: string; score: number }[],
  year: number,
): MonthlyAverage[] {
  const byMonth = new Map<number, number[]>();
  for (const r of ratings) {
    const [y, m] = r.periodEnd.split("-").map(Number);
    if (y !== year || m == null) continue;
    const bucket = byMonth.get(m) ?? [];
    bucket.push(r.score);
    byMonth.set(m, bucket);
  }

  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const scores = byMonth.get(month);
    const average =
      scores && scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null;
    return { month, average };
  });
}

export type MonthlyActiveCount = { month: number; count: number };

/**
 * "Capacity trend against goal limit changes" — the count half of that
 * (the module doc explains why the *limit* half can only ever be
 * today's single current value, never a real trend). One entry per
 * month up to and including the month `today` falls in (for the
 * current year) or all twelve (for a fully elapsed past year) — a
 * future month has no meaningful count, not a zero.
 *
 * A goal counts toward month `M` if it existed by `M`'s end
 * (`createdOn <= monthEnd`) and hadn't yet completed/abandoned by then.
 * Goals whose *current* state is `someday` are excluded from every
 * month, not just where they'd be someday now — there's no record of
 * when a goal moved into `someday`, so there's no honest month to stop
 * counting it at; excluding it everywhere is the documented
 * approximation, not a silent guess at a cutoff month.
 */
export function estimateActiveGoalCountByMonth(
  goals: RetroGoalInput[],
  year: number,
  today: string,
): MonthlyActiveCount[] {
  const currentYearToday = today.startsWith(`${year}-`) ? today : null;
  const lastMonth = currentYearToday
    ? Number(currentYearToday.slice(5, 7))
    : today > `${year}-12-31`
      ? 12
      : 0; // a future year: no months have happened yet.

  const countable = goals.filter((g) => g.state !== "someday");

  return Array.from({ length: lastMonth }, (_, i) => {
    const month = i + 1;
    const monthEnd = lastDayOfMonth(year, month);
    const count = countable.filter((g) => {
      if (g.createdOn > monthEnd) return false;
      if (g.completedOn && g.completedOn <= monthEnd) return false;
      if (g.abandonedOn && g.abandonedOn <= monthEnd) return false;
      return true;
    }).length;
    return { month, count };
  });
}

function lastDayOfMonth(year: number, month: number): string {
  // Day 0 of the *next* month is the last day of this one — a
  // well-known JS Date idiom, applied here to a bare-date string via a
  // UTC Date round-trip so it stays consistent with the rest of this
  // module's UTC-only date handling.
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}
