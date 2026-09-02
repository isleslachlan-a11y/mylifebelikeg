"use client";

import { useState, useTransition } from "react";

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
import { createLeg, deleteLeg, updateLeg } from "./leg-actions";
import { LegFormDialog } from "./leg-form-dialog";
import { LegRow } from "./leg-row";
import type { TripState } from "./stop-actions";

type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];

export function LegsSection({
  tripId,
  stops,
  legs,
  originName,
  goalCurrency,
  onTripStateChange,
  onError,
}: {
  tripId: string;
  stops: TripStop[];
  legs: TripLeg[];
  originName: string | null;
  goalCurrency: string;
  onTripStateChange: (state: TripState) => void;
  onError: (message: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLeg, setEditingLeg] = useState<TripLeg | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripLeg | null>(null);

  function handleConfirmDelete() {
    const leg = pendingDelete;
    if (!leg) return;
    setPendingDelete(null);

    startTransition(async () => {
      const result = await deleteLeg(tripId, leg.id);
      if (result.ok) {
        onTripStateChange(result.data);
      } else {
        onError(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">Legs</h2>
        <Button
          type="button"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          disabled={stops.length === 0}
        >
          Add leg
        </Button>
      </div>

      {stops.length === 0 ? (
        <p className="text-muted-foreground py-4 text-sm">
          Add a stop first — a leg travels to or from one.
        </p>
      ) : legs.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No legs yet — the travel between stops (or from home) goes here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {legs.map((leg) => (
            <LegRow
              key={leg.id}
              leg={leg}
              stops={stops}
              originName={originName}
              onEdit={() => setEditingLeg(leg)}
              onRequestDelete={() => setPendingDelete(leg)}
            />
          ))}
        </ul>
      )}

      <LegFormDialog
        mode="create"
        open={isCreateOpen}
        stops={stops}
        originName={originName}
        defaultCurrency={goalCurrency}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createLeg(tripId, input)}
        onSaved={(state) => {
          onTripStateChange(state);
          setIsCreateOpen(false);
        }}
      />

      <LegFormDialog
        mode="edit"
        open={editingLeg !== null}
        leg={editingLeg}
        stops={stops}
        originName={originName}
        defaultCurrency={goalCurrency}
        onOpenChange={(open) => !open && setEditingLeg(null)}
        onSubmit={(input) => updateLeg(tripId, editingLeg!.id, input)}
        onSaved={(state) => {
          onTripStateChange(state);
          setEditingLeg(null);
        }}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this leg?</DialogTitle>
            <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
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
    </section>
  );
}
