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
  arrayMove,
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
import { Input } from "@/components/ui/input";
import type { Database } from "@/types/database";
import {
  createLifeArea,
  deleteLifeArea,
  recolourLifeArea,
  renameLifeArea,
  reorderLifeAreas,
} from "./actions";
import { LifeAreaRow } from "./life-area-row";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

/**
 * Owns the list as client state for immediate feedback on every action
 * (rename, recolour, reorder, add, delete) rather than waiting on a
 * server round trip. Each handler applies the change optimistically, then
 * reverts to the pre-change snapshot if the server action reports an
 * error — `revalidatePath` in actions.ts keeps a later full page load
 * correct regardless.
 */
export function LifeAreaManager({
  initialAreas,
  goalCounts,
}: {
  initialAreas: LifeArea[];
  goalCounts: Record<string, number>;
}) {
  const [areas, setAreas] = useState(initialAreas);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LifeArea | null>(null);
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = areas.findIndex((a) => a.id === active.id);
    const newIndex = areas.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(areas, oldIndex, newIndex);
    const previous = areas;
    setAreas(reordered);
    setError(null);

    startTransition(async () => {
      const result = await reorderLifeAreas(reordered.map((a) => a.id));
      if (!result.ok) {
        setAreas(previous);
        setError(result.error);
      }
    });
  }

  function handleRename(id: string, name: string) {
    const previous = areas;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
    setError(null);

    startTransition(async () => {
      const result = await renameLifeArea(id, name);
      if (!result.ok) {
        setAreas(previous);
        setError(result.error);
      }
    });
  }

  function handleRecolour(id: string, colour: string) {
    const previous = areas;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, colour } : a)));
    setError(null);

    startTransition(async () => {
      const result = await recolourLifeArea(id, colour);
      if (!result.ok) {
        setAreas(previous);
        setError(result.error);
      }
    });
  }

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setError(null);

    startTransition(async () => {
      const result = await createLifeArea(name);
      if (result.ok) {
        setAreas((prev) => [...prev, result.data]);
        setNewName("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleConfirmDelete() {
    const area = pendingDelete;
    if (!area) return;
    setPendingDelete(null);
    const previous = areas;
    setAreas((prev) => prev.filter((a) => a.id !== area.id));
    setError(null);

    startTransition(async () => {
      const result = await deleteLifeArea(area.id);
      if (!result.ok) {
        setAreas(previous);
        setError(result.error);
      }
    });
  }

  const pendingDeleteCount = pendingDelete
    ? (goalCounts[pendingDelete.id] ?? 0)
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={areas.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {areas.map((area) => (
              <LifeAreaRow
                key={area.id}
                area={area}
                goalCount={goalCounts[area.id] ?? 0}
                onRename={(name) => handleRename(area.id, name)}
                onRecolour={(colour) => handleRecolour(area.id, colour)}
                onRequestDelete={() => setPendingDelete(area)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New life area"
          aria-label="New life area name"
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending || !newName.trim()}>
          Add
        </Button>
      </form>

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
              {pendingDeleteCount > 0
                ? `${pendingDeleteCount} goal${pendingDeleteCount === 1 ? "" : "s"} will move to Uncategorised.`
                : "No goals are in this area."}
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
