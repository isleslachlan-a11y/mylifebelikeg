/**
 * Date helpers, reading `profiles.timezone` for display conversion.
 *
 * CLAUDE.md rule 4: dates are stored UTC (`timestamptz`) or as a bare
 * `date` where time of day is meaningless. The two need opposite
 * treatment here:
 *
 * - Bare `date` values (`"YYYY-MM-DD"`, no time component) are
 *   calendar-only — a task due 14 March is 14 March everywhere, and must
 *   never be shifted by a timezone conversion.
 * - `timestamptz` values (ISO strings with a time/offset) genuinely land
 *   on different calendar days depending on where the viewer is, and are
 *   converted into the user's `timezone` before display.
 *
 * `toGoalOffset`/`fromGoalOffset` are pure calendar math for display and
 * read-side computation only — per CLAUDE.md rule 5 and the Phase 1
 * notes, `tasks.computed_start`/`computed_end` are derived by database
 * triggers, not application code. Nothing here should be used to write
 * those columns back.
 *
 * P1.10: every function below that's relative to "today" —
 * `formatTimeRemaining`, `describeTimeRemaining`, `isOverdue` — takes an
 * already-resolved `today` (a bare date, from `todayInZone`), not a
 * timezone and an implicit `new Date()`. Call `todayInZone` exactly once
 * per request (in a page's server component) and pass the result down —
 * never call it, or `new Date()`, inside a component that renders one of
 * these. That's the P0.8 spike's hydration-mismatch trap: computing
 * "now" independently on the server and the client produces two
 * different answers near a day boundary.
 */

const BARE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function isBareDate(value: string): boolean {
  return BARE_DATE_RE.test(value);
}

function parseBareDate(date: string): { y: number; m: number; d: number } {
  const match = BARE_DATE_RE.exec(date);
  if (!match) {
    throw new TypeError(`Expected a bare date ("YYYY-MM-DD"), got "${date}"`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function bareDateToUtcMs(date: string): number {
  const { y, m, d } = parseBareDate(date);
  return Date.UTC(y, m - 1, d);
}

function utcMsToBareDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Today's date, as a bare "YYYY-MM-DD", in `timezone` — "today" is
 * itself timezone-dependent. Call this once per request (typically at
 * the top of a page's server component, right after reading
 * `profiles.timezone`) and pass the result down as a plain string —
 * don't call it again per-component.
 */
export function todayInZone(timezone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the bare-date shape we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export type FormatDateOptions = Intl.DateTimeFormatOptions;

const DEFAULT_DATE_OPTS: FormatDateOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

const MONTH_YEAR_OPTS: FormatDateOptions = {
  month: "long",
  year: "numeric",
};

/**
 * Format a date column for display in `timezone`. Bare dates are
 * formatted as their literal calendar day (never shifted); `timestamptz`
 * values are converted into `timezone` first.
 */
export function formatDate(
  value: string,
  timezone: string,
  opts: FormatDateOptions = DEFAULT_DATE_OPTS,
): string {
  if (isBareDate(value)) {
    return new Intl.DateTimeFormat("en-US", {
      ...opts,
      timeZone: "UTC",
    }).format(new Date(bareDateToUtcMs(value)));
  }
  return new Intl.DateTimeFormat("en-US", {
    ...opts,
    timeZone: timezone,
  }).format(new Date(value));
}

/** Format a start/end pair as a single collapsed range, e.g. "14–20 Mar 2026". */
export function formatDateRange(
  startValue: string,
  endValue: string,
  timezone: string,
  opts: FormatDateOptions = DEFAULT_DATE_OPTS,
): string {
  const startIsBare = isBareDate(startValue);
  const endIsBare = isBareDate(endValue);

  if (startIsBare !== endIsBare) {
    // Mixed bare/timestamptz — no single timezone is correct for both,
    // so fall back to formatting each side independently.
    return `${formatDate(startValue, timezone, opts)} – ${formatDate(endValue, timezone, opts)}`;
  }

  const zone = startIsBare ? "UTC" : timezone;
  const start = startIsBare
    ? new Date(bareDateToUtcMs(startValue))
    : new Date(startValue);
  const end = startIsBare
    ? new Date(bareDateToUtcMs(endValue))
    : new Date(endValue);

  return new Intl.DateTimeFormat("en-US", {
    ...opts,
    timeZone: zone,
  }).formatRange(start, end);
}

/**
 * Whether `date` (a bare date) is before `today` (also a bare date).
 * Pure calendar comparison only — it doesn't know about "completed" or
 * any other domain concept; callers combine this with their own
 * completion state (e.g. `isOverdue(dueDate, today) && !completedAt`).
 */
export function isOverdue(date: string, today: string): boolean {
  return toGoalOffset(date, today) < 0;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** "5 days" / "3 weeks" / "4 months" / "2 years" — `days` must be >= 0. */
function magnitudeText(days: number): string {
  if (days < 7) {
    return plural(days, "day");
  }
  if (days < 30) {
    return plural(Math.round(days / 7), "week");
  }
  const months = Math.round(days / 30.44);
  if (months < 12) {
    return plural(months, "month");
  }
  return plural(Math.round(days / 365.25), "year");
}

/**
 * "today" / "tomorrow" / "in 5 days" / "in 3 weeks" / "in 4 months" /
 * "yesterday" / "5 days ago" / "3 weeks overdue" — relative to `today`.
 * Degrades gracefully at distance (day -> week -> month -> year
 * granularity) rather than ever saying "in 847 days".
 *
 * Both arguments must be bare dates ("YYYY-MM-DD") — this is relative
 * time for goal target dates, milestone due dates, and task computed
 * dates, all of which are bare `date` columns. A timestamptz argument
 * throws (via toGoalOffset), the same restriction toGoalOffset/
 * fromGoalOffset already have, rather than silently guessing a timezone
 * to bare-ify it with.
 */
export function formatTimeRemaining(date: string, today: string): string {
  const diff = toGoalOffset(date, today);

  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";

  const magnitude = magnitudeText(Math.abs(diff));
  if (diff > 0) {
    return `in ${magnitude}`;
  }
  // The day bucket reads "N days ago"; week/month/year read "overdue"
  // instead of "ago" — a due date that's weeks in the past is better
  // described as overdue than merely "elapsed".
  return Math.abs(diff) < 7 ? `${magnitude} ago` : `${magnitude} overdue`;
}

export type TimeRemainingDisplay = {
  /** The text to show with visual emphasis. */
  primary: string;
  /** The text to show as secondary/muted context (or on hover). */
  secondary: string;
};

const RELATIVE_PRIMARY_THRESHOLD_DAYS = 90;

/**
 * P1.10's threshold rule, as a standalone predicate: overdue is always
 * relative-primary regardless of how overdue ("5 days ago" isn't
 * materially different from "3 weeks overdue" as far as urgency framing
 * goes — both need to read as relative, not as a calendar date to
 * parse). Within 90 days (inclusive) of today, relative is primary.
 * Beyond 90 days, absolute is primary. Exported separately from
 * `describeTimeRemaining` so callers that need to build their own
 * absolute side (e.g. a task's full date *range*, not just its end date)
 * can still reuse the same threshold decision instead of re-deriving it.
 */
export function isRelativeTimePrimary(date: string, today: string): boolean {
  const diff = toGoalOffset(date, today);
  return diff < 0 || diff <= RELATIVE_PRIMARY_THRESHOLD_DAYS;
}

/**
 * Decides which of {relative, absolute} should be primary, per P1.10's
 * threshold rule (see `isRelativeTimePrimary`). Beyond 90 days, the
 * absolute side is shown at month+year precision ("March 2029") rather
 * than day precision — day-level precision on a two-years-out date is
 * false confidence, not useful information.
 */
export function describeTimeRemaining(
  date: string,
  today: string,
): TimeRemainingDisplay {
  const relative = formatTimeRemaining(date, today);
  const relativeIsPrimary = isRelativeTimePrimary(date, today);
  const absolute = relativeIsPrimary
    ? formatDate(date, "UTC")
    : formatDate(date, "UTC", MONTH_YEAR_OPTS);

  return relativeIsPrimary
    ? { primary: relative, secondary: absolute }
    : { primary: absolute, secondary: relative };
}

/** Integer day offset of `taskDate` from `goalStart` (both bare dates). */
export function toGoalOffset(taskDate: string, goalStart: string): number {
  return Math.round(
    (bareDateToUtcMs(taskDate) - bareDateToUtcMs(goalStart)) / DAY_MS,
  );
}

/** The bare date `offsetDays` after `goalStart`. */
export function fromGoalOffset(offsetDays: number, goalStart: string): string {
  return utcMsToBareDate(bareDateToUtcMs(goalStart) + offsetDays * DAY_MS);
}
