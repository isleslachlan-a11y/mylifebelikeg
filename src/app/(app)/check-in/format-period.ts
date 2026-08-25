/**
 * "week ending Sunday" — the check-in header's period phrase (P4.1
 * brief). Names `periodEnd`'s actual weekday, not literally "Sunday":
 * `check_in_day` is per-profile and configurable (0014's
 * `app.current_checkin_period`), so a Wednesday-ending period reads
 * "week ending Wednesday". `periodEnd` is a bare `date` column
 * (CLAUDE.md rule 4) — formatted in UTC so the weekday it names is the
 * literal calendar day stored, never shifted by a timezone conversion
 * (same reasoning `formatDate`'s bare-date branch in `dates.ts` follows).
 */
export function formatCheckInPeriod(periodEnd: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${periodEnd}T00:00:00Z`));
  return `week ending ${weekday}`;
}
