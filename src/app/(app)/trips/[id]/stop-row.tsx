"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { bookingStateLabel } from "@/lib/trips";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];

export function StopRow({
  stop,
  index,
  timezone,
  onEdit,
  onRequestDelete,
}: {
  stop: TripStop;
  index: number;
  timezone: string;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card ring-foreground/10 flex items-start gap-3 rounded-lg p-3 ring-1",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${stop.name}`}
        className="text-muted-foreground hover:text-foreground mt-1 flex shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing max-md:size-11"
      >
        <GripVertical className="size-4" />
      </button>

      {stop.unsplash_thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stop.unsplash_thumb_url}
          alt=""
          className="ring-foreground/10 size-14 shrink-0 rounded-md object-cover ring-1"
        />
      ) : (
        <div className="bg-raised ring-foreground/10 flex size-14 shrink-0 items-center justify-center rounded-md text-xs font-medium ring-1">
          {index + 1}
        </div>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{stop.name}</span>
          <Badge variant="outline">
            {bookingStateLabel(stop.booking_state)}
          </Badge>
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {[stop.place_name, stop.country_code?.trim()]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p className="text-muted-foreground text-xs">
          {stop.computed_arrival && stop.computed_departure
            ? formatDateRange(
                stop.computed_arrival,
                stop.computed_departure,
                timezone,
              )
            : `${stop.nights} night${stop.nights === 1 ? "" : "s"}`}
          {stop.estimated_cost_minor != null && stop.currency && (
            <> · {formatMoney(stop.estimated_cost_minor, stop.currency)}</>
          )}
        </p>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-11"
        aria-label={`Delete ${stop.name}`}
        onClick={onRequestDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
