import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ConstellationFigure } from "@/components/constellations/constellation-figure";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buildConstellationPoints } from "@/lib/constellations/points";
import { createClient } from "@/lib/supabase/server";
import { goalStateLabel } from "../../goals/goal-state-label";

const FIGURE_SIZE_PX = 280;

const RAG_DOT_CLASS: Record<string, string> = {
  green: "bg-rag-green",
  amber: "bg-rag-amber",
  red: "bg-rag-red",
  grey: "bg-rag-grey",
};

/**
 * P5.3: the archive's read-only detail view — "opens the goal in
 * read-only form with its full history" (brief, verbatim): tasks,
 * check-in ratings, RAG history from `rag_snapshots`, and total spend.
 * Deliberately not `goals/[id]/page.tsx`: that page is the live,
 * editable one (state-transition buttons, edit forms, dependency
 * editing) — this route only ever reads, and only ever for a goal
 * that's actually reached the archive (`completed`/`abandoned`); an
 * active/someday/archived goal id here 404s rather than rendering a
 * half-lit constellation for a goal that hasn't ended yet.
 */
export default async function ConstellationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, title, state, owner_id, currency, funding, start_date, target_date, completed_at, abandoned_at, abandon_reason, life_area:life_areas(id, name, colour)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
  ]);

  // Own goals only (same restriction the gallery applies), and only
  // once it's actually reached one of the archive's two terminal states
  // — everything else genuinely isn't part of the archive, not just
  // hidden from it.
  if (
    !goal ||
    goal.owner_id !== userId ||
    (goal.state !== "completed" && goal.state !== "abandoned")
  ) {
    notFound();
  }
  const timezone = profile?.timezone ?? "UTC";
  const lit = goal.state === "completed";

  const [
    { data: tasks, error: tasksError },
    { data: milestones, error: milestonesError },
    { data: ratings, error: ratingsError },
    { data: ragSnapshots, error: ragError },
    { data: funding, error: fundingError },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, title, status, completed_at, computed_end, computed_start, created_at",
      )
      .eq("goal_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("milestones")
      .select("id, title, completed_at, due_date, created_at")
      .eq("goal_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    // Every check-in rating this goal ever received, oldest first — the
    // "check-in ratings" part of the brief's "full history."
    supabase
      .from("goal_ratings")
      .select(
        "id, score, note, created_at, rater:profiles!goal_ratings_user_id_fkey(display_name), check_in:check_ins!goal_ratings_check_in_id_fkey(period_start)",
      )
      .eq("goal_id", id)
      .order("created_at", { ascending: true }),
    // The "RAG history from rag_snapshots" part of the brief, verbatim —
    // same query shape goals/[id]/page.tsx's own MomentumSection fetch
    // already uses.
    supabase
      .from("rag_snapshots")
      .select("computed_at, overall_status")
      .eq("goal_id", id)
      .order("computed_at", { ascending: true }),
    supabase
      .from("v_goal_funding")
      .select("spent_minor, currency")
      .eq("goal_id", id)
      .maybeSingle(),
  ]);

  if (tasksError) throw new Error(tasksError.message);
  if (milestonesError) throw new Error(milestonesError.message);
  if (ratingsError) throw new Error(ratingsError.message);
  if (ragError) throw new Error(ragError.message);
  if (fundingError) throw new Error(fundingError.message);

  const points = buildConstellationPoints(lit, tasks ?? [], milestones ?? []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <Link
        href="/constellations"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Constellations
      </Link>

      <div className="flex flex-col items-center gap-3 text-center">
        <ConstellationFigure
          points={points}
          colour={goal.life_area?.colour ?? null}
          lit={lit}
          size={FIGURE_SIZE_PX}
          title={goal.title}
        />
        <h1 className="font-display text-3xl">{goal.title}</h1>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="secondary">{goalStateLabel(goal.state)}</Badge>
          {goal.life_area && (
            <Badge variant="outline" className="gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: goal.life_area.colour }}
                aria-hidden
              />
              {goal.life_area.name}
            </Badge>
          )}
        </div>
        {lit && goal.completed_at && (
          <p className="text-sm">
            Completed {formatDate(goal.completed_at, timezone)}
          </p>
        )}
        {!lit && (
          <div className="max-w-md">
            <p className="text-sm">
              Abandoned
              {goal.abandoned_at &&
                ` ${formatDate(goal.abandoned_at, timezone)}`}
            </p>
            {goal.abandon_reason && (
              <p className="text-muted-foreground mt-1 text-sm">
                {goal.abandon_reason}
              </p>
            )}
          </div>
        )}
      </div>

      {funding && funding.spent_minor != null && funding.spent_minor > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="font-display text-lg">Total spend</h2>
          <p className="text-sm">
            {formatMoney(
              funding.spent_minor,
              funding.currency ?? goal.currency,
            )}
          </p>
        </section>
      )}

      {(tasks?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Tasks</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {tasks!.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3"
              >
                <span
                  className={
                    task.status === "done"
                      ? ""
                      : task.status === "cancelled"
                        ? "text-muted-foreground line-through"
                        : "text-muted-foreground"
                  }
                >
                  {task.title}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {task.completed_at
                    ? formatDate(task.completed_at, timezone)
                    : task.status === "cancelled"
                      ? "Cancelled"
                      : "Not completed"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(milestones?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Milestones</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {milestones!.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3"
              >
                <span className={m.completed_at ? "" : "text-muted-foreground"}>
                  {m.title}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {m.completed_at
                    ? formatDate(m.completed_at, timezone)
                    : `Due ${formatDate(m.due_date, timezone)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ratings?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Check-in ratings</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {ratings!.map((r) => (
              <li
                key={r.id}
                className="border-subtle border-b pb-2 last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {r.rater?.display_name ?? "Someone"} rated {r.score}/5
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {r.check_in?.period_start
                      ? formatDate(r.check_in.period_start, timezone)
                      : formatDate(r.created_at, timezone)}
                  </span>
                </div>
                {r.note && (
                  <p className="text-muted-foreground mt-0.5">{r.note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ragSnapshots?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">RAG history</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {ragSnapshots!.map((snap) => (
              <li key={snap.computed_at} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full ${RAG_DOT_CLASS[snap.overall_status] ?? "bg-rag-grey"}`}
                />
                <span className="text-muted-foreground text-xs">
                  {formatDate(snap.computed_at, timezone)}
                </span>
                <span className="capitalize">{snap.overall_status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
