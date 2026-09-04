import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CancelDeletionButton } from "./cancel-deletion-button";
import { DeleteAccountFlow } from "./delete-account-flow";
import { daysRemaining, deletionScheduledFor } from "./deletion";

/**
 * P9.1. Two states, mutually exclusive: either deletion has never been
 * requested (or was cancelled) and this page offers to start the flow,
 * or a deletion is already pending and this page is the "cancel link"
 * the brief asks for — same page, no separate route, since which one
 * to show is entirely determined by `profiles.deletion_requested_at`
 * (0041).
 */
export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;
  const accountEmail = auth.claims.email ?? "";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("deletion_requested_at")
    .eq("id", userId)
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Account</h1>
        <p className="text-muted-foreground text-sm">
          Export your data, or delete your account entirely.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl">Export</h2>
        <p className="text-muted-foreground text-sm">
          A zip of everything you own — goals, milestones, tasks, ledger
          entries, check-ins, dreams and achievements, as JSON and CSV, plus
          your uploaded photos.
        </p>
        {/* Plain anchor, not a button + fetch — /api/export sets its own
            Content-Disposition: attachment header, so the browser downloads
            it on navigation with no client JS needed (same reasoning as the
            /profile page's own export link). */}
        <a
          href="/api/export"
          className="text-primary w-fit text-sm underline-offset-4 hover:underline"
        >
          Download your data
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Delete account</h2>
        {profile.deletion_requested_at ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm">
              Your account is scheduled for deletion on{" "}
              <span className="font-medium">
                {deletionScheduledFor(
                  profile.deletion_requested_at,
                ).toLocaleDateString()}
              </span>{" "}
              — {daysRemaining(profile.deletion_requested_at)} day
              {daysRemaining(profile.deletion_requested_at) === 1 ? "" : "s"}{" "}
              left to change your mind.
            </p>
            <CancelDeletionButton />
          </div>
        ) : (
          <DeleteAccountFlow accountEmail={accountEmail} />
        )}
      </section>
    </div>
  );
}
