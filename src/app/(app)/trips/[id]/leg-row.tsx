"use client";

import { ArrowRight, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import {
  bookingStateLabel,
  describeLegEndpoint,
  travelModeLabel,
} from "@/lib/trips";
import type { Database } from "@/types/database";

type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];
type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];

/** "This is where trip budgets actually blow out, so surface leg costs prominently" (P6.3 brief) — cost gets its own emphasized slot, not folded into a muted metadata line the way a stop's cost is. */
export function LegRow({
  leg,
  stops,
  originName,
  onEdit,
  onRequestDelete,
}: {
  leg: TripLeg;
  stops: TripStop[];
  originName: string | null;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  return (
    <li className="bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span>
            {describeLegEndpoint(leg.from_stop_id, stops, originName)}
          </span>
          <ArrowRight className="text-muted-foreground size-3.5" aria-hidden />
          <span>{describeLegEndpoint(leg.to_stop_id, stops, originName)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{travelModeLabel(leg.mode)}</Badge>
          <Badge variant="outline">
            {bookingStateLabel(leg.booking_state)}
          </Badge>
          {leg.duration_minutes != null && (
            <span className="text-muted-foreground text-xs">
              {leg.duration_minutes} min
            </span>
          )}
        </div>
      </button>

      {leg.cost_minor != null && leg.currency && (
        <span className="font-display shrink-0 text-lg">
          {formatMoney(leg.cost_minor, leg.currency)}
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-11"
        aria-label="Delete leg"
        onClick={onRequestDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
