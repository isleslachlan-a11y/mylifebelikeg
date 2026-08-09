"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteLedgerEntry,
  type ActionResult,
} from "@/app/(app)/money/ledger/actions";
import {
  LedgerEntryDialog,
  type GoalOption,
  type LedgerDialogTarget,
  type PotOption,
} from "@/app/(app)/money/ledger/ledger-entry-dialog";
import { LedgerEntryRow } from "@/app/(app)/money/ledger/ledger-entry-row";
import type { Database } from "@/types/database";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

/**
 * The goal-detail quick-add — "same speed principle as tasks" (P2.3
 * brief). Goal is fixed (this page's own goal, never a picker); the full
 * filterable list with running totals lives at /money/ledger, this is
 * just enough to log something without leaving the goal page.
 */
export function LedgerSection({
  goal,
  pots,
  today,
  initialEntries,
  potNames,
}: {
  goal: GoalOption;
  pots: PotOption[];
  today: string;
  initialEntries: LedgerEntry[];
  potNames: Record<string, string>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dialogTarget, setDialogTarget] = useState<LedgerDialogTarget | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<LedgerEntry | null>(null);

  function handleConfirmDelete() {
    const entry = pendingDelete;
    if (!entry) return;
    setPendingDelete(null);
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setError(null);

    startTransition(async () => {
      const result: ActionResult = await deleteLedgerEntry(
        entry.id,
        entry.goal_id,
      );
      if (!result.ok) {
        setEntries(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No money logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              potName={entry.pot_id ? potNames[entry.pot_id] : null}
              disabled={isPending}
              onEdit={() => setDialogTarget({ mode: "edit", entry })}
              onRequestDelete={() => setPendingDelete(entry)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogTarget({ mode: "create", goal })}
        >
          Log money
        </Button>
        <Link
          href={`/money/ledger?goal=${goal.id}`}
          className="text-muted-foreground text-xs underline-offset-4 hover:underline"
        >
          View all in ledger
        </Link>
      </div>

      <LedgerEntryDialog
        target={dialogTarget}
        goalOptions={null}
        pots={pots}
        defaultCurrency={goal.currency}
        today={today}
        onClose={() => setDialogTarget(null)}
        onSaved={(saved) => {
          setEntries((prev) =>
            prev.some((e) => e.id === saved.id)
              ? prev.map((e) => (e.id === saved.id ? saved : e))
              : [saved, ...prev],
          );
          setDialogTarget(null);
        }}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              This can&rsquo;t be undone from here. If a pot was involved, its
              balance updates immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
