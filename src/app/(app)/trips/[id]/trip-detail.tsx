"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { ShareControl } from "@/components/sharing/share-control";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isGracePeriod } from "@/lib/rag";
import type { Database } from "@/types/database";
import type { TripState } from "./stop-actions";
import { LegsSection } from "./legs-section";
import { StopsSection } from "./stops-section";
import { TripEstimates } from "./trip-estimates";

type Trip = Database["public"]["Tables"]["trips"]["Row"];
// Only the columns page.tsx's own select() actually asks for — not the
// full goals Row type, which would claim every other column (RAG
// override fields, abandon_reason, ...) is present too.
type Goal = Pick<
  Database["public"]["Tables"]["goals"]["Row"],
  | "id"
  | "owner_id"
  | "title"
  | "start_date"
  | "target_date"
  | "currency"
  | "target_amount_minor"
  | "funding"
> & {
  life_area: Pick<
    Database["public"]["Tables"]["life_areas"]["Row"],
    "id" | "name" | "colour"
  > | null;
};
type GoalRag = Database["public"]["Views"]["v_goal_rag"]["Row"];
type TripEstimate = Database["public"]["Views"]["v_trip_estimates"]["Row"];
type SomedayItem = Database["public"]["Tables"]["someday_items"]["Row"];

/**
 * Owns `stops`/`legs` as one piece of state — every mutation in
 * `stop-actions.ts`/`leg-actions.ts` returns a fresh `{ stops, legs }`
 * pair (see that module's own comment on why: dates and dependent legs
 * can ripple from a single stop change), so this component never patches
 * either list itself, only replaces both wholesale via
 * `handleTripStateChange`.
 */
export function TripDetail({
  trip,
  goal,
  timezone,
  today,
  initialStops,
  initialLegs,
  goalRag,
  estimate,
  somedayItems,
  isOwner,
}: {
  trip: Trip;
  goal: Goal;
  timezone: string;
  today: string;
  initialStops: Database["public"]["Tables"]["trip_stops"]["Row"][];
  initialLegs: Database["public"]["Tables"]["trip_legs"]["Row"][];
  goalRag: GoalRag | null;
  estimate: TripEstimate | null;
  somedayItems: SomedayItem[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [tripState, setTripState] = useState<TripState>({
    stops: initialStops,
    legs: initialLegs,
  });
  const [error, setError] = useState<string | null>(null);

  function handleTripStateChange(next: TripState) {
    setTripState(next);
    // Estimates (v_trip_estimates) live server-side and aren't part of
    // TripState — a full refresh keeps the rollup numbers honest without
    // this component re-deriving them from stops/legs itself (CLAUDE.md:
    // never recompute what a view already computed).
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-3xl">{goal.title}</h1>
          <Link
            href={`/goals/${goal.id}`}
            className="text-muted-foreground text-sm underline"
          >
            View as goal
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {goalRag &&
            (isGracePeriod(goalRag) ? (
              <NewGoalBadge />
            ) : (
              <RagBadge status={goalRag.effective_status ?? "grey"} />
            ))}
          {goal.life_area && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: goal.life_area.colour }}
                aria-hidden
              />
              {goal.life_area.name}
            </span>
          )}
          {goal.start_date && (
            <span className="text-muted-foreground text-sm">
              Starts {formatDate(goal.start_date, timezone)}
            </span>
          )}
          <ShareControl
            resourceType="trip"
            resourceId={trip.id}
            isOwner={isOwner}
            path={`/trips/${trip.id}`}
          />
          {trip.origin_name && (
            <span className="text-muted-foreground text-sm">
              From {trip.origin_name}
            </span>
          )}
        </div>
        {goal.target_amount_minor != null && (
          <p className="text-muted-foreground text-sm">
            Budget: {formatMoney(goal.target_amount_minor, goal.currency)}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <TripEstimates
        estimate={estimate}
        targetAmountMinor={goal.target_amount_minor}
        goalCurrency={goal.currency}
      />

      <StopsSection
        tripId={trip.id}
        stops={tripState.stops}
        legs={tripState.legs}
        origin={{
          name: trip.origin_name,
          latitude: trip.origin_lat,
          longitude: trip.origin_lng,
        }}
        somedayItems={somedayItems}
        timezone={timezone}
        today={today}
        onTripStateChange={handleTripStateChange}
        onError={setError}
      />

      <LegsSection
        tripId={trip.id}
        stops={tripState.stops}
        legs={tripState.legs}
        originName={trip.origin_name}
        goalCurrency={goal.currency}
        onTripStateChange={handleTripStateChange}
        onError={setError}
      />
    </div>
  );
}
