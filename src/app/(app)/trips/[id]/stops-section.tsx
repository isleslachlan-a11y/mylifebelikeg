"use client";

import { useState, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { PromoteDialog } from "./promote-dialog";
import {
  createStop,
  deleteStop,
  reorderStop,
  updateStop,
  type TripState,
} from "./stop-actions";
import { StopFormDialog } from "./stop-form-dialog";
import { StopMap, type StopMapOrigin } from "./stop-map";
import { StopRow } from "./stop-row";

type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];
type SomedayItem = Database["public"]["Tables"]["someday_items"]["Row"];

/**
 * "Do not renumber client-side... refetch after; don't mutate local
 * state" (P6.3 brief) — every handler here calls its action, then hands
 * the *server's* fresh `{ stops, legs }` straight to `onTripStateChange`.
 * There is deliberately no local `arrayMove` on drag end (unlike
 * `life-area-manager.tsx`'s reordering, which does apply optimistically)
 * — a drop visually snaps back to the old order for the moment the
 * request is in flight, then jumps to the real one once it resolves;
 * `isReordering` dims the list during that window so it doesn't read as
 * broken.
 */
export function StopsSection({
  tripId,
  stops,
  legs,
  origin,
  somedayItems,
  timezone,
  today,
  onTripStateChange,
  onError,
}: {
  tripId: string;
  stops: TripStop[];
  legs: TripLeg[];
  origin: StopMapOrigin;
  somedayItems: SomedayItem[];
  timezone: string;
  today: string;
  onTripStateChange: (state: TripState) => void;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<TripStop | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripStop | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const newIndex = stops.findIndex((s) => s.id === over.id);
    if (newIndex === -1) return;

    startTransition(async () => {
      const result = await reorderStop(tripId, String(active.id), newIndex);
      if (result.ok) {
        onTripStateChange(result.data);
      } else {
        onError(result.error);
      }
    });
  }

  function handleConfirmDelete() {
    const stop = pendingDelete;
    if (!stop) return;
    setPendingDelete(null);

    startTransition(async () => {
      const result = await deleteStop(tripId, stop.id);
      if (result.ok) {
        onTripStateChange(result.data);
      } else {
        onError(result.error);
      }
    });
  }

  const legCountByStop = new Map<string, number>();
  for (const leg of legs) {
    if (leg.from_stop_id) {
      legCountByStop.set(
        leg.from_stop_id,
        (legCountByStop.get(leg.from_stop_id) ?? 0) + 1,
      );
    }
    if (leg.to_stop_id) {
      legCountByStop.set(
        leg.to_stop_id,
        (legCountByStop.get(leg.to_stop_id) ?? 0) + 1,
      );
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">Stops</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPromoteOpen(true)}
          >
            Add from bucket list
          </Button>
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            Add stop
          </Button>
        </div>
      </div>

      {stops.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No stops yet — add one, or promote a place from your someday list.
        </p>
      ) : (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
          {/* P6.4: the map sits beside the sequence list, not the other
              way to reorder — "reorder from the map by dragging markers
              in the sequence list beside it, not by dragging on the map
              itself" (brief). Order here (map first in source, list
              second) puts the map on top on mobile and on the left on
              desktop; dragging only ever happens in the list below. */}
          <StopMap
            stops={stops}
            legs={legs}
            origin={origin}
            timezone={timezone}
            today={today}
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={stops.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul
                className={cn("flex flex-col gap-2", isPending && "opacity-60")}
              >
                {stops.map((stop, index) => (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    index={index}
                    timezone={timezone}
                    onEdit={() => setEditingStop(stop)}
                    onRequestDelete={() => setPendingDelete(stop)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <StopFormDialog
        mode="create"
        open={isCreateOpen}
        defaultCurrency={stops[0]?.currency ?? "AUD"}
        onOpenChange={setIsCreateOpen}
        onSubmit={(input) => createStop(tripId, input)}
        onSaved={(state) => {
          onTripStateChange(state);
          setIsCreateOpen(false);
        }}
      />

      <StopFormDialog
        mode="edit"
        open={editingStop !== null}
        stop={editingStop}
        defaultCurrency={editingStop?.currency ?? "AUD"}
        onOpenChange={(open) => !open && setEditingStop(null)}
        onSubmit={(input) => updateStop(tripId, editingStop!.id, input)}
        onSaved={(state) => {
          onTripStateChange(state);
          setEditingStop(null);
        }}
      />

      <PromoteDialog
        open={isPromoteOpen}
        onOpenChange={setIsPromoteOpen}
        tripId={tripId}
        somedayItems={somedayItems}
        onPromoted={onTripStateChange}
        onError={onError}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              {(legCountByStop.get(pendingDelete?.id ?? "") ?? 0) > 0
                ? `${legCountByStop.get(pendingDelete!.id)} leg${legCountByStop.get(pendingDelete!.id) === 1 ? "" : "s"} touching this stop will be deleted too.`
                : "Later stops' dates will shift to fill the gap."}
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
    </section>
  );
}
