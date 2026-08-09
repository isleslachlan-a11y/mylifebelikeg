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

/** Today's date, as a bare "YYYY-MM-DD", in `timezone` — "today" is itself timezone-dependent. */
function todayInZone(timezone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the bare-date shape we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

export type FormatDateOptions = Intl.DateTimeFormatOptions;

const DEFAULT_DATE_OPTS: FormatDateOptions = {
  day: "numeric",
  month: "short",
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
 * "today" / "in N days" / "N days ago", relative to the current date in
 * `timezone`. `date` may be a bare date or a `timestamptz`; either way
 * it's compared as a calendar day in `timezone`, not by raw elapsed time.
 */
export function relativeDays(
  date: string,
  timezone: string,
  now: Date = new Date(),
): string {
  const target = isBareDate(date)
    ? date
    : todayInZone(timezone, new Date(date));
  const diff = toGoalOffset(target, todayInZone(timezone, now));

  if (diff === 0) return "today";
  if (diff > 0) return `in ${diff} day${diff === 1 ? "" : "s"}`;
  return `${-diff} day${diff === -1 ? "" : "s"} ago`;
}

/**
 * Whether `date` (bare or timestamptz) has passed, as of `now` in
 * `timezone`. Pure calendar comparison only — it doesn't know about
 * "completed" or any other domain concept; callers combine this with
 * their own completion state (e.g. `isOverdue(dueDate, tz) && !completedAt`).
 */
export function isOverdue(
  date: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  const target = isBareDate(date)
    ? date
    : todayInZone(timezone, new Date(date));
  return toGoalOffset(target, todayInZone(timezone, now)) < 0;
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
