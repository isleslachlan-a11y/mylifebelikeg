import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GoalTimeline } from "@/components/timeline/goal-timeline";
import { describeTimeRemaining, formatDate, todayInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buildRatingTrend } from "@/lib/rating-trend";
import { createClient } from "@/lib/supabase/server";
import { goalStateLabel } from "../goal-state-label";
import { DeleteGoalButton } from "./delete-goal-button";
import { FundingSection } from "./funding-section";
import { GoalStateActions } from "./goal-state-actions";
import { LedgerSection } from "./ledger-section";
import { MilestonesSection } from "./milestones-section";
import { MomentumSection } from "./momentum-section";
import { OverrideSection } from "./override-section";
import { ParticipantsSection } from "./participants-section";
import { RagBreakdown } from "./rag-breakdown";
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
        "id, user_id, role, pledged_amount_minor, pledged_currency, monthly_allocation_minor, pot_id, profile:profiles!goal_participants_user_id_fkey(handle, display_name)",
      )
      .eq("goal_id", id)
      .is("removed_at", null)
      .order("joined_at", { ascending: true }),
  ]);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  // participants-actions.ts never inserts a role='owner' row, but
  // funding-actions.ts's setPledge does create one the first time an
  // owner pledges to their own goal (see its own comment) — so this list
  // can now legitimately contain one. ParticipantsSection renders the
  // owner separately (from ownerProfile, below) and assumes everything
  // in `participants` is a collaborator/viewer; filter the owner row out
  // here rather than let it show up twice.
  const nonOwnerParticipants = (participants ?? []).filter(
    (p) => p.role !== "owner",
  );

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

  // Phase 5 (P5.0): every edge in this goal's dependency network. Scoped
  // by successor_task_id — dependencies never cross goals (brief: "one
  // goal's network at a time"), so a real edge's predecessor is always
  // one of the same goal's tasks too.
  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: dependencies, error: dependenciesError } =
    taskIds.length > 0
      ? await supabase
          .from("task_dependencies")
          .select("*")
          .in("successor_task_id", taskIds)
      : { data: [], error: null };

  if (dependenciesError) {
    throw new Error(dependenciesError.message);
  }

  const [
    { data: ledgerEntries, error: ledgerError },
    { data: pots, error: potsError },
    { data: rag, error: ragError },
    { data: overrideHistory, error: overrideHistoryError },
    { data: ragSnapshots, error: ragSnapshotsError },
    { data: divergenceRows, error: divergenceError },
    { data: ratingTrendRows, error: ratingTrendError },
  ] = await Promise.all([
    // No user_id filter — RLS is the actual gate, and per Schema.MD,
    // ledger entries against a shared goal are visible to every
    // participant, not just whoever wrote them (unlike the pots they
    // reference, which stay exactly as private as P2.0 promised — see
    // potNames below, built only from *this* viewer's own pots).
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("goal_id", id)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .limit(10),
    supabase
      .from("pots")
      .select("id, name, currency, is_default")
      .eq("user_id", userId)
      .is("deleted_at", null),
    // P4.2: app.compute_goal_rag/app.effective_goal_rag, exposed via
    // v_goal_rag (0016) — never recomputed here.
    supabase.from("v_goal_rag").select("*").eq("goal_id", id).maybeSingle(),
    // P4.3: every past and current override, newest first — 0017's
    // goals_log_rag_override trigger is what populates this, this page
    // only ever reads it.
    supabase
      .from("rag_override_history")
      .select(
        "id, status, reason, set_at, expires_at, ended_at, ended_reason, setter:profiles!rag_override_history_set_by_fkey(display_name)",
      )
      .eq("goal_id", id)
      .order("set_at", { ascending: false }),
    // P4.4: one row per submitted check-in that rated this goal — the
    // reason snapshots exist rather than only ever computing on read.
    supabase
      .from("rag_snapshots")
      .select("computed_at, overall_status")
      .eq("goal_id", id)
      .order("computed_at", { ascending: true }),
    // P4.4/0018: v_rating_divergence's own HAVING clause only requires
    // 2+ raters, not a spread of 2+ — the brief's actual threshold is
    // filtered here. Most recent divergent period only (see
    // momentum-section.tsx's doc).
    supabase
      .from("v_rating_divergence")
      .select("period_start, spread")
      .eq("goal_id", id)
      .gte("spread", 2)
      .order("period_start", { ascending: false })
      .limit(1),
    // P4.4/0018: every participant's raw score per period, for the
    // sparkline (never an average) and to name who scored what in the
    // divergence callout.
    supabase
      .from("v_goal_rating_trend")
      .select("user_id, period_start, score")
      .eq("goal_id", id),
  ]);

  if (ledgerError) {
    throw new Error(ledgerError.message);
  }
  if (potsError) {
    throw new Error(potsError.message);
  }
  if (ragError || !rag) {
    throw new Error(ragError?.message ?? "Couldn't load this goal's RAG status.");
  }
  if (overrideHistoryError) {
    throw new Error(overrideHistoryError.message);
  }
  if (ragSnapshotsError) {
    throw new Error(ragSnapshotsError.message);
  }
  if (divergenceError) {
    throw new Error(divergenceError.message);
  }
  if (ratingTrendError) {
    throw new Error(ratingTrendError.message);
  }

  const [
    { data: goalFunding, error: fundingError },
    { data: affordability, error: affordabilityError },
    { data: allocationSummary, error: allocationError },
  ] = await Promise.all([
    supabase.from("v_goal_funding").select("*").eq("goal_id", id).maybeSingle(),
    // Only ever has a row for save_toward goals — spend_against and
    // unfunded goals return none, by the view's own design (see
    // supabase/local/006_affordability_test), not an error to handle here.
    supabase
      .from("v_goal_affordability")
      .select("*")
      .eq("goal_id", id)
      .maybeSingle(),
    // This viewer's own capacity, not the goal's — v_allocation_summary
    // is keyed by user_id (every participant has their own pots/base
    // currency/capacity), and P2.4's brief frames this as "the reality
    // check" for whoever's about to set an allocation, not a goal-level
    // figure.
    supabase
      .from("v_allocation_summary")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (fundingError) {
    throw new Error(fundingError.message);
  }
  if (affordabilityError) {
    throw new Error(affordabilityError.message);
  }
  if (allocationError) {
    throw new Error(allocationError.message);
  }

  const myPledgeRow = (participants ?? []).find((p) => p.user_id === userId);
  const myPledge = myPledgeRow
    ? {
        pledgedAmountMinor: myPledgeRow.pledged_amount_minor,
        pledgedCurrency: myPledgeRow.pledged_currency,
        monthlyAllocationMinor: myPledgeRow.monthly_allocation_minor,
        potId: myPledgeRow.pot_id,
      }
    : null;
  const otherPledges = (participants ?? [])
    .filter((p) => p.user_id !== userId)
    .map((p) => ({
      userId: p.user_id,
      displayName: p.profile.display_name,
      pledgedAmountMinor: p.pledged_amount_minor,
      pledgedCurrency: p.pledged_currency,
      monthlyAllocationMinor: p.monthly_allocation_minor,
    }));

  const potNames = Object.fromEntries((pots ?? []).map((p) => [p.id, p.name]));

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

  // Raw task counts (cancelled excluded), for the schedule breakdown's
  // "4 of 12 tasks done" (P4.2 brief) — deliberately not
  // rag.inputs.task_weight_done/total, which are duration-weighted sums
  // used for the variance calculation itself, a different number.
  const nonCancelledTasks = (tasks ?? []).filter(
    (t) => t.status !== "cancelled",
  );
  const taskCounts =
    nonCancelledTasks.length > 0
      ? {
          done: nonCancelledTasks.filter((t) => t.status === "done").length,
          total: nonCancelledTasks.length,
        }
      : null;

  // Target dates get the time-remaining treatment (P1.10); start dates
  // don't — "how long ago it started" isn't a useful urgency signal the
  // way "how soon it's due" is.
  const targetDateDisplay = goal.target_date
    ? describeTimeRemaining(goal.target_date, today)
    : null;

  // P4.3: rag_override_history rows, as OverrideSection expects them.
  // "Someone" only shows up if a set_by profile is somehow missing —
  // shouldn't happen (set_by is NOT NULL with a real FK), defensive
  // fallback rather than a crash.
  const overrideHistoryEntries = (overrideHistory ?? []).map((entry) => ({
    id: entry.id,
    status: entry.status,
    reason: entry.reason,
    setByName: entry.setter?.display_name ?? "Someone",
    setAt: entry.set_at,
    expiresAt: entry.expires_at,
    endedAt: entry.ended_at,
    endedReason: entry.ended_reason as "replaced" | "cleared_by_checkin" | null,
  }));

  // P4.4: rating trend (0018's v_goal_rating_trend) — every column on a
  // view is nullable regardless of the underlying tables' real
  // constraints (same fact timeline-item-adapter.ts documents), so this
  // drops any row missing a field rather than crash. ownerNames is the
  // same owner+participants map built above for milestones/tasks.
  const validTrendPoints = (ratingTrendRows ?? []).filter(
    (r): r is { user_id: string; period_start: string; score: number } =>
      r.user_id != null && r.period_start != null && r.score != null,
  );
  const trend = buildRatingTrend(
    validTrendPoints.map((r) => ({
      userId: r.user_id,
      periodStart: r.period_start,
      score: r.score,
    })),
    ownerNames,
  );

  // Most recent period with a spread of 2+ (if any), cross-referenced
  // against the raw trend rows to name who scored what —
  // v_rating_divergence itself only has the aggregate, not per-rater
  // scores.
  const divergenceRow = (divergenceRows ?? [])[0];
  const divergence =
    divergenceRow?.period_start != null
      ? {
          periodStart: divergenceRow.period_start,
          entries: validTrendPoints
            .filter((r) => r.period_start === divergenceRow.period_start)
            .map((r) => ({
              name: ownerNames[r.user_id] ?? "Someone",
              score: r.score,
              isYou: r.user_id === userId,
            })),
        }
      : null;

  const ragHistory = (ragSnapshots ?? []).map((s) => ({
    computedAt: s.computed_at,
    overallStatus: s.overall_status,
  }));

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

        <RagBreakdown
          rag={rag}
          goalTitle={goal.title}
          funding={goal.funding}
          taskCounts={taskCounts}
        />

        <OverrideSection
          goalId={goal.id}
          computedStatus={rag.overall_status ?? "grey"}
          isLive={rag.is_overridden ?? false}
          history={overrideHistoryEntries}
          timezone={timezone}
          canEdit={canEditGoal}
        />

        <MomentumSection
          rag={rag}
          ragHistory={ragHistory}
          trend={trend}
          divergence={divergence}
          timezone={timezone}
        />

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

      <section className="flex flex-col gap-2">
        <GoalTimeline
          startDate={goal.start_date}
          targetDate={goal.target_date}
          today={today}
          tasks={tasks ?? []}
          milestones={milestones ?? []}
        />
      </section>

      {ownerProfile && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Participants</h2>
          <ParticipantsSection
            goalId={goal.id}
            currentUserId={userId}
            isOwner={isOwner}
            owner={ownerProfile}
            initialParticipants={nonOwnerParticipants}
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
          initialDependencies={dependencies ?? []}
        />
      </section>

      {goal.funding !== "none" && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Funding</h2>
          <FundingSection
            goalId={goal.id}
            goalCurrency={goal.currency}
            goalFunding={goal.funding}
            createdAt={goal.created_at}
            startDate={goal.start_date}
            targetDate={goal.target_date}
            today={today}
            pots={(pots ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              is_default: p.is_default,
            }))}
            myPledge={myPledge}
            otherPledges={otherPledges}
            funding={goalFunding}
            affordability={affordability}
            allocationSummary={allocationSummary}
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Money</h2>
        <LedgerSection
          goal={{
            id: goal.id,
            title: goal.title,
            currency: goal.currency,
            funding: goal.funding,
          }}
          pots={pots ?? []}
          today={today}
          initialEntries={ledgerEntries ?? []}
          potNames={potNames}
        />
      </section>
    </div>
  );
}
