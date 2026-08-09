import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeTimeRemaining, formatDate, todayInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  computeScheduleVariance,
  formatScheduleVariance,
} from "@/lib/schedule-variance";
import { createClient } from "@/lib/supabase/server";
import { goalStateLabel } from "../goal-state-label";
import { DeleteGoalButton } from "./delete-goal-button";
import { GoalStateActions } from "./goal-state-actions";
import { MilestonesSection } from "./milestones-section";
import { ParticipantsSection } from "./participants-section";
import { TasksSection } from "./tasks-section";

export default async function GoalDetailPage({
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
      .select("*, life_area:life_areas(id, name, colour)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
  ]);

  if (!goal) {
    notFound();
  }
  const timezone = profile?.timezone ?? "UTC";
  const isOwner = goal.owner_id === userId;
  // Computed exactly once per request, right after we know the viewer's
  // timezone — passed down from here, never re-derived via new Date()
  // inside a component (P1.10; this is the P0.8 spike's trap).
  const today = todayInZone(timezone, new Date());

  const [
    { data: ownerProfile },
    { data: participants, error: participantsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", goal.owner_id)
      .single(),
    supabase
      .from("goal_participants")
      .select(
        "id, user_id, role, profile:profiles!goal_participants_user_id_fkey(handle, display_name)",
      )
      .eq("goal_id", id)
      .is("removed_at", null)
      .order("joined_at", { ascending: true }),
  ]);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  // Mirrors app.can_edit_goal (owner OR a collaborator-role active
  // participant) — milestones_write's RLS is the real gate, but the UI
  // needs to know too, to decide whether to render the editing controls
  // at all. Unlike the goal-level actions in actions.ts (which restrict
  // to owner_id — correct there, since app.can_edit_goal only mattered
  // for edits before P1.4 added real participants), milestones follow
  // the full owner-or-collaborator surface RLS actually grants.
  const canEditGoal =
    isOwner ||
    (participants ?? []).some(
      (p) => p.user_id === userId && p.role === "collaborator",
    );

  const { data: milestones, error: milestonesError } = await supabase
    .from("milestones")
    .select("*")
    .eq("goal_id", id)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  if (milestonesError) {
    throw new Error(milestonesError.message);
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .eq("goal_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  // Task owner is limited to the goal owner or a collaborator-role
  // participant — not viewers, and not "anyone with a handle" the way
  // goal participants themselves are added. A viewer can't write
  // anything goal-scoped (app.can_edit_goal excludes them), so being the
  // nominal owner of a task they can't touch would be a dead end, not a
  // real assignment.
  const assignableUsers = [
    { id: goal.owner_id, display_name: ownerProfile?.display_name ?? "Owner" },
    ...(participants ?? [])
      .filter((p) => p.role === "collaborator")
      .map((p) => ({ id: p.user_id, display_name: p.profile.display_name })),
  ];

  const ownerNames: Record<string, string> = {
    [goal.owner_id]: ownerProfile?.display_name ?? "Owner",
  };
  for (const p of participants ?? []) {
    ownerNames[p.user_id] = p.profile.display_name;
  }

  const scheduleVariance = computeScheduleVariance({
    createdAt: goal.created_at,
    startDate: goal.start_date,
    targetDate: goal.target_date,
    tasks: (tasks ?? []).map((t) => ({
      durationDays: t.duration_days,
      status: t.status,
    })),
  });

  // Target dates get the time-remaining treatment (P1.10); start dates
  // don't — "how long ago it started" isn't a useful urgency signal the
  // way "how soon it's due" is.
  const targetDateDisplay = goal.target_date
    ? describeTimeRemaining(goal.target_date, today)
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl">{goal.title}</h1>
          {isOwner && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/goals/${goal.id}/edit`}>Edit</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          {goal.kind === "trip" && <Badge variant="outline">Trip</Badge>}
        </div>

        {/* A neutral number with direction, not a RAG colour — only the
            schedule dimension has real data until Phase 4, and a colour
            drawn from a third of the model would teach you to distrust
            it (P1.7). Null means genuinely nothing to show, not 0%. */}
        {scheduleVariance != null && (
          <p className="text-muted-foreground text-sm">
            {formatScheduleVariance(scheduleVariance)}
          </p>
        )}

        {goal.description && (
          <p className="text-muted-foreground text-sm">{goal.description}</p>
        )}

        {goal.start_date ||
        goal.target_date ||
        goal.target_amount_minor != null ? (
          <dl className="flex flex-col gap-1 text-sm">
            {goal.start_date && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Start</dt>
                <dd>{formatDate(goal.start_date, timezone)}</dd>
              </div>
            )}
            {targetDateDisplay && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Target date</dt>
                <dd>
                  {targetDateDisplay.primary}{" "}
                  <span className="text-muted-foreground">
                    ({targetDateDisplay.secondary})
                  </span>
                </dd>
              </div>
            )}
            {goal.funding !== "none" && goal.target_amount_minor != null && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Target</dt>
                <dd>{formatMoney(goal.target_amount_minor, goal.currency)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">No dates set.</p>
        )}

        {/* The three end states mean different things — completed is "we
            did it", archived is "putting this aside", abandoned is "we're
            not doing this, and here's why". Worth saying differently, not
            just three colours of the same badge. */}
        {goal.state === "completed" && goal.completed_at && (
          <p className="text-sm">
            Completed {formatDate(goal.completed_at, timezone)} — you did it.
          </p>
        )}
        {goal.state === "archived" && goal.archived_at && (
          <p className="text-muted-foreground text-sm">
            Archived {formatDate(goal.archived_at, timezone)} — put aside, not
            abandoned.
          </p>
        )}
        {goal.state === "abandoned" && (
          <div className="border-subtle bg-surface rounded-xl border p-3">
            <p className="text-sm font-medium">
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

        {isOwner && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <GoalStateActions goalId={goal.id} state={goal.state} />
            <DeleteGoalButton goalId={goal.id} goalTitle={goal.title} />
          </div>
        )}
      </div>

      {ownerProfile && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Participants</h2>
          <ParticipantsSection
            goalId={goal.id}
            currentUserId={userId}
            isOwner={isOwner}
            owner={ownerProfile}
            initialParticipants={participants ?? []}
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Milestones</h2>
        <MilestonesSection
          goalId={goal.id}
          today={today}
          canEdit={canEditGoal}
          initialMilestones={milestones ?? []}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Tasks</h2>
        <TasksSection
          goalId={goal.id}
          today={today}
          canEdit={canEditGoal}
          currentUserId={userId}
          goalStartDate={goal.start_date}
          goalCurrency={goal.currency}
          milestones={milestones ?? []}
          assignableUsers={assignableUsers}
          ownerNames={ownerNames}
          initialTasks={tasks ?? []}
        />
      </section>
    </div>
  );
}
