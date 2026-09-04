/**
 * Pure constants/derivations shared between the server actions
 * (`actions.ts`, a `"use server"` file that may only export async
 * functions — the same reason `goal-transitions.ts` was split out of
 * `goals/actions.ts`) and the client-rendered pieces that need the same
 * number (`delete-account-flow.tsx`, `deletion-banner.tsx`,
 * `page.tsx`).
 *
 * `profiles.deletion_requested_at` (0041) is the single source of
 * truth — "scheduled for" is always derived from it, never stored a
 * second way that could drift.
 */
export const GRACE_PERIOD_DAYS = 7;

export function deletionScheduledFor(deletionRequestedAt: string): Date {
  const requested = new Date(deletionRequestedAt);
  return new Date(
    requested.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );
}

/** Never negative — a grace window whose processor run is merely late (cron hasn't fired yet) still reads as "today," not "-1 days." */
export function daysRemaining(deletionRequestedAt: string): number {
  const msRemaining =
    deletionScheduledFor(deletionRequestedAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}
