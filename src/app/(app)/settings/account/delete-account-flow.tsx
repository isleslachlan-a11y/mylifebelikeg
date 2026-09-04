"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccountDeletion } from "./actions";
import { GRACE_PERIOD_DAYS } from "./deletion";

type Step = "warning" | "confirm";

/**
 * "Deletion is two steps and a delay" (brief, verbatim) — this
 * component is step one and two (the warning, then the typed-email
 * confirm); the delay itself is `requestAccountDeletion` setting
 * `deletion_requested_at` and everyone else (the app-shell banner, the
 * scheduled processor) reading it from there.
 *
 * "Offer the export inside the deletion flow, before the confirm step
 * — it is the one moment someone actually wants it" (brief, verbatim):
 * the export link lives on the warning step, not the confirm step —
 * someone who clicks it leaves this flow entirely (a real navigation to
 * /api/export, which streams a download and returns them right back
 * here), rather than being blocked from continuing until they do.
 */
export function DeleteAccountFlow({ accountEmail }: { accountEmail: string }) {
  const [step, setStep] = useState<Step>("warning");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [state, formAction, isPending] = useActionState(
    requestAccountDeletion,
    {},
  );

  const emailMatches =
    confirmEmail.trim().toLowerCase() === accountEmail.toLowerCase();

  if (step === "warning") {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-2 text-sm">
          <p>Deleting your account removes, permanently and immediately at the end of a 7-day grace window:</p>
          <ul className="list-disc pl-5">
            <li>Every goal, milestone, task and trip you own</li>
            <li>Your ledger entries, pots, and cashflow items</li>
            <li>Your check-ins, ratings, and dreams</li>
            <li>Your achievements, avatar, and uploaded photos</li>
          </ul>
          <p className="font-medium">
            Goals you&rsquo;ve shared with someone else are deleted too — the
            people you shared them with lose access when the goal goes.
            Nothing transfers to them automatically.
          </p>
          <p className="text-muted-foreground">
            You&rsquo;ll be signed out immediately once you confirm below, and
            have {GRACE_PERIOD_DAYS} days to change your mind — sign back in
            and cancel from this same page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <a href="/api/export">Export your data first</a>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setStep("confirm")}
          >
            Continue to delete my account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-destructive/30 bg-destructive/5 flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmEmail">
          Type <span className="font-mono">{accountEmail}</span> to confirm
        </Label>
        <Input
          id="confirmEmail"
          name="confirmEmail"
          type="email"
          autoComplete="off"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep("warning")}
        >
          Back
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={!emailMatches || isPending}
        >
          {isPending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </form>
  );
}
