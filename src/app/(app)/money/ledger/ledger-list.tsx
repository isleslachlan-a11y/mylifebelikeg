"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Database } from "@/types/database";
import { deleteLedgerEntry } from "./actions";
import {
  LedgerEntryDialog,
  type GoalOption,
  type LedgerDialogTarget,
  type PotOption,
} from "./ledger-entry-dialog";
import { LedgerEntryRow } from "./ledger-entry-row";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

export type LedgerRowData = {
  entry: LedgerEntry;
  runningTotalMinor: number;
  goalTitle: string | null;
  potName: string | null;
};

export function LedgerList({
  initialRows,
  goalOptions,
  pots,
  defaultCurrency,
  today,
}: {
  initialRows: LedgerRowData[];
  goalOptions: GoalOption[];
  pots: PotOption[];
  defaultCurrency: string;
  today: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
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
    const previous = rows;
    setRows((prev) => prev.filter((r) => r.entry.id !== entry.id));
    setError(null);

    startTransition(async () => {
      const result = await deleteLedgerEntry(entry.id, entry.goal_id);
      if (!result.ok) {
        setRows(previous);
        setError(result.error);
      } else {
        // Running totals for every row after this one are now off by
        // this entry's amount — rather than patch every downstream
        // total in place (fiddly, and another place to get the sign
        // wrong), just pull the freshly server-computed set.
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setDialogTarget({ mode: "create", goal: null })}
      >
        Add entry
      </Button>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No entries match these filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ entry, runningTotalMinor, goalTitle, potName }) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              goalTitle={goalTitle}
              potName={potName}
              runningTotalMinor={runningTotalMinor}
              disabled={isPending}
              onEdit={() => setDialogTarget({ mode: "edit", entry })}
              onRequestDelete={() => setPendingDelete(entry)}
            />
          ))}
        </ul>
      )}

      <LedgerEntryDialog
        target={dialogTarget}
        goalOptions={goalOptions}
        pots={pots}
        defaultCurrency={defaultCurrency}
        today={today}
        onClose={() => setDialogTarget(null)}
        onSaved={() => {
          setDialogTarget(null);
          router.refresh();
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
