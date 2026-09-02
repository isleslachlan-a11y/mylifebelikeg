"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Database } from "@/types/database";
import { promoteFromSomeday, type TripState } from "./stop-actions";

type SomedayItem = Database["public"]["Tables"]["someday_items"]["Row"];

/**
 * "Add from bucket list" — `app.promote_someday_to_stop` copies place,
 * cost and photo attribution (P6.3 brief). `somedayItems` is the
 * already-not-promoted list `page.tsx` fetched; a locally-tracked
 * `promotedIds` set hides an item the instant its own "Add" succeeds,
 * rather than waiting on `router.refresh()`'s round trip to remove it
 * from the prop — otherwise a fast double-click could fire the RPC
 * twice for the same item before the page catches up.
 */
export function PromoteDialog({
  open,
  onOpenChange,
  tripId,
  somedayItems,
  onPromoted,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  somedayItems: SomedayItem[];
  onPromoted: (state: TripState) => void;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [nightsById, setNightsById] = useState<Record<string, string>>({});
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());

  const visibleItems = somedayItems.filter((i) => !promotedIds.has(i.id));

  function handlePromote(item: SomedayItem) {
    const nightsText = nightsById[item.id] ?? "2";
    const nights = Number(nightsText);
    if (!Number.isInteger(nights) || nights < 0) {
      onError("Nights must be a whole number, zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await promoteFromSomeday(tripId, item.id, nights);
      if (result.ok) {
        setPromotedIds((prev) => new Set(prev).add(item.id));
        onPromoted(result.data);
      } else {
        onError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add from bucket list</DialogTitle>
        </DialogHeader>

        {visibleItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing left to promote — every someday place is already part of a
            trip, or your list is empty.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="ring-foreground/10 flex items-center gap-3 rounded-lg p-2 ring-1"
              >
                {item.unsplash_thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.unsplash_thumb_url}
                    alt=""
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="bg-raised size-10 shrink-0 rounded-md" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.place_name && (
                    <p className="text-muted-foreground truncate text-xs">
                      {item.place_name}
                    </p>
                  )}
                </div>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="w-16"
                  aria-label={`Nights for ${item.title}`}
                  value={nightsById[item.id] ?? "2"}
                  onChange={(e) =>
                    setNightsById((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handlePromote(item)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
