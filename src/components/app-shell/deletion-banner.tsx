import { daysRemaining, deletionScheduledFor } from "@/app/(app)/settings/account/deletion";
import { CancelDeletionButton } from "@/app/(app)/settings/account/cancel-deletion-button";

/**
 * P9.1: shown on every page during the grace window — "not a surprise"
 * (brief) means visible from wherever the user happens to be, not just
 * on /settings/account itself. Server component; the only interactive
 * piece (the cancel button) is its own small client island.
 */
export function DeletionBanner({
  deletionRequestedAt,
}: {
  deletionRequestedAt: string;
}) {
  const scheduledFor = deletionScheduledFor(deletionRequestedAt);
  const remaining = daysRemaining(deletionRequestedAt);

  return (
    <div className="border-destructive/30 bg-destructive/10 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm">
      <p>
        Your account is scheduled for deletion on{" "}
        <span className="font-medium">{scheduledFor.toLocaleDateString()}</span>{" "}
        ({remaining} day{remaining === 1 ? "" : "s"} left).
      </p>
      <CancelDeletionButton />
    </div>
  );
}
