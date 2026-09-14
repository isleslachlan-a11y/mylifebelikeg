import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewGoalBadge, RagBadge } from "@/components/rag-badge";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isGracePeriod } from "@/lib/rag";
import { createClient } from "@/lib/supabase/server";

export default async function TripsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [{ data: profile }, { data: goals, error: goalsError }] =
    await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", userId).single(),
      // F3: "surface shared items in their home lists... a shared trip
      // in the trips list" (brief, verbatim). No owner_id filter here
      // at all -- this already relies entirely on goals_select's RLS
      // (owner OR participant OR a goal/trip-level share grant, the
      // last of which 0044 just made trips_select-reachable), so a
      // trip shared via either grant type surfaces here for free. What
      // the query alone can't do is *mark* it as someone else's --
      // owner_id is selected for exactly that, checked against userId
      // below.
      supabase
        .from("goals")
        .select(
          "id, owner_id, title, start_date, target_date, target_amount_minor, currency, owner:profiles!goals_owner_id_fkey(display_name)",
        )
        .eq("kind", "trip")
        .is("deleted_at", null)
        .order("start_date", { ascending: true, nullsFirst: false }),
    ]);
  const timezone = profile?.timezone ?? "UTC";

  if (goalsError) {
    throw new Error(goalsError.message);
  }

  const goalIds = (goals ?? []).map((g) => g.id);

  const [{ data: rag }, { data: trips, error: tripsError }] = await Promise.all(
    [
      supabase.from("v_goal_rag").select("*").in("goal_id", goalIds),
      supabase
        .from("trips")
        .select("id, goal_id")
        .in("goal_id", goalIds)
        .is("deleted_at", null),
    ],
  );

  if (tripsError) {
    throw new Error(tripsError.message);
  }

  const tripIds = (trips ?? []).map((t) => t.id);
  const { data: estimates, error: estimatesError } = await supabase
    .from("v_trip_estimates")
    .select("*")
    .in("trip_id", tripIds);

  if (estimatesError) {
    throw new Error(estimatesError.message);
  }

  const ragByGoalId = new Map((rag ?? []).map((r) => [r.goal_id, r]));
  const tripByGoalId = new Map((trips ?? []).map((t) => [t.goal_id, t]));
  const estimateByTripId = new Map(
    (estimates ?? []).map((e) => [e.trip_id, e]),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl">Trips</h1>
          <p className="text-muted-foreground text-sm">
            Every trip is a goal — stops, legs, and a budget that rolls up into
            its own RAG.
          </p>
        </div>
        <Button asChild>
          <Link href="/trips/new">New trip</Link>
        </Button>
      </div>

      {!goals || goals.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          No trips yet — the first one starts at{" "}
          <Link href="/trips/new" className="underline">
            New trip
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((goal) => {
            const trip = tripByGoalId.get(goal.id);
            const goalRag = ragByGoalId.get(goal.id);
            const estimate = trip ? estimateByTripId.get(trip.id) : undefined;

            return (
              <li key={goal.id}>
                <Link
                  href={trip ? `/trips/${trip.id}` : `/goals/${goal.id}`}
                  className="bg-card ring-foreground/10 hover:bg-raised flex flex-col gap-2 rounded-lg p-4 ring-1 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg">{goal.title}</p>
                    {goalRag &&
                      (isGracePeriod(goalRag) ? (
                        <NewGoalBadge />
                      ) : (
                        <RagBadge status={goalRag.effective_status ?? "grey"} />
                      ))}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {goal.owner_id !== userId && goal.owner?.display_name && (
                      <Badge variant="outline">
                        Shared by {goal.owner.display_name}
                      </Badge>
                    )}
                    {goal.start_date && (
                      <span>
                        Starts {formatDate(goal.start_date, timezone)}
                      </span>
                    )}
                    {estimate && (estimate.total_nights ?? 0) > 0 && (
                      <span>
                        {estimate.total_nights} night
                        {estimate.total_nights === 1 ? "" : "s"}
                      </span>
                    )}
                    {estimate && estimate.currency && (
                      <span>
                        {formatMoney(
                          estimate.total_estimate_minor ?? 0,
                          estimate.currency,
                        )}{" "}
                        estimated
                        {goal.target_amount_minor != null &&
                          ` of ${formatMoney(goal.target_amount_minor, goal.currency)}`}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
