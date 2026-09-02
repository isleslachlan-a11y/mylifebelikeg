import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LlamaMessage } from "@/components/llama-message";
import { Badge } from "@/components/ui/badge";
import { formatDate, todayInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  describeAbandonedListDerek,
  describeYearSummaryFluffy,
} from "@/lib/retrospective/narration";
import {
  averageRatingByMonth,
  categorizeGoalsForYear,
  computeCheckinCoverage,
  enumeratePeriodStarts,
  estimateActiveGoalCountByMonth,
  estimateYearStartCohort,
  getYearRange,
  summarizeMoneyByLifeArea,
  type CohortOutcome,
  type RetroGoalInput,
} from "@/lib/retrospective/summary";
import { createClient } from "@/lib/supabase/server";
import { CapacityTrendChart } from "./capacity-trend-chart";
import { RatingSparkline } from "./rating-sparkline";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const COHORT_OUTCOME_LABEL: Record<CohortOutcome, string> = {
  completed: "Completed",
  abandoned: "Abandoned",
  still_active: "Still active",
  moved_to_someday: "Moved to someday",
  archived: "Archived",
};

/**
 * P5.4: the annual retrospective — "still be able to view what you have
 * done in the past" (the original concept's phrase, per CLAUDE.md),
 * applied to a whole year at once rather than one goal
 * (`/constellations/[id]`) or one goal's schedule (P5.2's slip
 * preview). Every number here is read straight from `goals`/
 * `ledger_entries`/`check_ins`/`goal_ratings` for this exact user and
 * year — "reconciles with the ledger and goal lists" (the acceptance
 * criterion, verbatim) is true by construction, not by cross-checking:
 * there's no second, independently-computed figure anywhere on this
 * page to disagree with the source tables.
 *
 * `src/lib/retrospective/summary.ts`'s own module doc explains the two
 * places this page is an honest *approximation* rather than exact
 * history — the year-start cohort and the capacity trend — because
 * neither goal-state transitions nor `active_goal_limit` changes are
 * logged anywhere in the schema. Read that doc before changing either
 * section here.
 */
export default async function RetrospectivePage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (
    !Number.isInteger(year) ||
    year < MIN_YEAR ||
    year > MAX_YEAR ||
    String(year) !== yearParam
  ) {
    notFound();
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone, active_goal_limit, check_in_day, base_currency")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "Couldn't load your profile.");
  }
  const timezone = profile.timezone;
  const today = todayInZone(timezone, new Date());
  const range = getYearRange(year);

  const [
    { data: lifeAreas, error: lifeAreasError },
    { data: goals, error: goalsError },
    { data: ledgerEntries, error: ledgerError },
    { data: checkIns, error: checkInsError },
    { data: ratings, error: ratingsError },
    { data: streakRow },
  ] = await Promise.all([
    supabase
      .from("life_areas")
      .select("id, name, colour")
      .eq("user_id", userId)
      .is("deleted_at", null),
    // Every goal this user owns, regardless of state or when it was
    // created — the cohort/carried-forward sections both need the
    // goal's full lifecycle, not just what happened within `year`.
    supabase
      .from("goals")
      .select(
        "id, title, state, life_area_id, created_at, completed_at, abandoned_at, abandon_reason",
      )
      .eq("owner_id", userId)
      .is("deleted_at", null),
    supabase
      .from("ledger_entries")
      .select("entry_type, base_amount_minor, goal_id, occurred_on")
      .eq("user_id", userId)
      .is("deleted_at", null),
    // Every check-in this user has, not windowed to the year — a period
    // spanning the year boundary (e.g. starting Dec 29) still needs to
    // be matchable against enumeratePeriodStarts's own boundary-crossing
    // entries, and this is a bounded personal-scale table either way.
    supabase
      .from("check_ins")
      .select("period_start, period_end, submitted_at")
      .eq("user_id", userId),
    // This viewer's own ratings only, not every collaborator's on a
    // shared goal — "check-in streak and coverage" one section up is
    // inherently personal, and this sparkline sits right beside it as
    // the same kind of figure, not an aggregate across everyone who
    // ever rated a shared goal.
    supabase
      .from("goal_ratings")
      .select(
        "score, check_in:check_ins!goal_ratings_check_in_id_fkey(period_end)",
      )
      .eq("user_id", userId),
    supabase
      .from("v_checkin_streak")
      .select("streak")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (lifeAreasError) throw new Error(lifeAreasError.message);
  if (goalsError) throw new Error(goalsError.message);
  if (ledgerError) throw new Error(ledgerError.message);
  if (checkInsError) throw new Error(checkInsError.message);
  if (ratingsError) throw new Error(ratingsError.message);

  const lifeAreaById = new Map(
    (lifeAreas ?? []).map((a) => [a.id, { name: a.name, colour: a.colour }]),
  );

  // Every timestamp goes through todayInZone (which, despite its name,
  // converts *any* Date to a bare local date — see summary.ts's module
  // doc) before reaching the pure functions below, so "which year did
  // this happen in" matches what the viewer actually saw on their own
  // clock, not a UTC-day reading that could land a late-December event
  // on the wrong side of midnight.
  const retroGoals: RetroGoalInput[] = (goals ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    state: g.state,
    lifeAreaId: g.life_area_id,
    createdOn: todayInZone(timezone, new Date(g.created_at)),
    completedOn: g.completed_at
      ? todayInZone(timezone, new Date(g.completed_at))
      : null,
    abandonedOn: g.abandoned_at
      ? todayInZone(timezone, new Date(g.abandoned_at))
      : null,
    abandonReason: g.abandon_reason,
  }));

  const { completed, abandoned, carriedForward } = categorizeGoalsForYear(
    retroGoals,
    range,
  );
  const cohort = estimateYearStartCohort(retroGoals, range, today);

  const lifeAreaByGoal = new Map(
    retroGoals.map((g) => [g.id, g.lifeAreaId] as const),
  );
  const moneyByLifeArea = summarizeMoneyByLifeArea(
    (ledgerEntries ?? []).map((e) => ({
      entryType: e.entry_type,
      baseAmountMinor: e.base_amount_minor,
      goalId: e.goal_id,
      occurredOn: e.occurred_on,
    })),
    range,
    lifeAreaByGoal,
  );

  const allPeriods = enumeratePeriodStarts(
    profile.check_in_day,
    range.start,
    range.end,
  );
  const submittedPeriods = new Set(
    (checkIns ?? [])
      .filter((c) => c.submitted_at != null)
      .map((c) => c.period_start),
  );
  const coverage = computeCheckinCoverage(allPeriods, submittedPeriods);

  const validRatings = (ratings ?? []).filter(
    (r): r is { score: number; check_in: { period_end: string } } =>
      r.check_in?.period_end != null,
  );
  const monthlyRatings = averageRatingByMonth(
    validRatings.map((r) => ({
      periodEnd: r.check_in.period_end,
      score: r.score,
    })),
    year,
  );

  const monthlyActiveCounts = estimateActiveGoalCountByMonth(
    retroGoals,
    year,
    today,
  );

  const currentYear = Number(today.slice(0, 4));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/retrospective/${year - 1}`}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← {year - 1}
        </Link>
        <h1 className="font-display text-3xl">{year}</h1>
        {year < currentYear ? (
          <Link
            href={`/retrospective/${year + 1}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {year + 1} →
          </Link>
        ) : (
          <span className="w-8" aria-hidden />
        )}
      </div>

      <LlamaMessage
        speaker="fluffy"
        body={describeYearSummaryFluffy({
          year,
          completedCount: completed.length,
          abandonedCount: abandoned.length,
          carriedForwardCount: carriedForward.length,
        })}
      />

      {cohort.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">What you said, what happened</h2>
          <p className="text-muted-foreground text-sm">
            Goals already active when {year} began — every one, whatever became
            of it.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {cohort.map(({ goal, outcome }) => (
              <li
                key={goal.id}
                className="flex items-center justify-between gap-3"
              >
                <span>{goal.title}</span>
                <Badge variant="secondary" className="shrink-0">
                  {COHORT_OUTCOME_LABEL[outcome]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Completed</h2>
        {completed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None finished this year.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {completed.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3"
              >
                <Link
                  href={`/constellations/${g.id}`}
                  className="hover:text-primary-soft underline-offset-4 hover:underline"
                >
                  {g.title}
                </Link>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(g.completedOn!, timezone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Abandoned</h2>
        <LlamaMessage
          speaker="derek"
          body={describeAbandonedListDerek(abandoned)}
        />
        {abandoned.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {abandoned.map((g) => (
              <li
                key={g.id}
                className="border-subtle border-b pb-2 last:border-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/constellations/${g.id}`}
                    className="hover:text-primary-soft underline-offset-4 hover:underline"
                  >
                    {g.title}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDate(g.abandonedOn!, timezone)}
                  </span>
                </div>
                {g.abandonReason && (
                  <p className="text-muted-foreground mt-0.5">
                    {g.abandonReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Carried forward</h2>
        {carriedForward.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing left open at year end.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {carriedForward.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3"
              >
                <Link
                  href={`/goals/${g.id}`}
                  className="hover:text-primary-soft underline-offset-4 hover:underline"
                >
                  {g.title}
                </Link>
                <Badge variant="outline" className="shrink-0">
                  {g.state === "someday" ? "Someday" : "Active"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {moneyByLifeArea.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">
            Saved and spent, by life area
          </h2>
          <dl className="flex flex-col gap-1.5 text-sm">
            {moneyByLifeArea.map((t) => (
              <div
                key={t.lifeAreaId ?? "__none__"}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <dt className="flex items-center gap-1.5">
                  {t.lifeAreaId && lifeAreaById.get(t.lifeAreaId) && (
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: lifeAreaById.get(t.lifeAreaId)!.colour,
                      }}
                    />
                  )}
                  {t.lifeAreaId
                    ? (lifeAreaById.get(t.lifeAreaId)?.name ?? "Unknown")
                    : "No life area"}
                </dt>
                <dd className="text-right">
                  {t.savedMinor > 0 && (
                    <span>
                      {formatMoney(t.savedMinor, profile.base_currency)} saved
                    </span>
                  )}
                  {t.savedMinor > 0 && t.spentMinor > 0 && (
                    <span className="text-muted-foreground"> · </span>
                  )}
                  {t.spentMinor > 0 && (
                    <span>
                      {formatMoney(t.spentMinor, profile.base_currency)} spent
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Check-ins</h2>
        <p className="text-sm">
          {coverage.submitted} of {coverage.possible} check-ins done this year
          {streakRow?.streak
            ? ` — on a ${streakRow.streak}-week streak now.`
            : "."}
        </p>
        <RatingSparkline months={monthlyRatings} />
      </section>

      {monthlyActiveCounts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Capacity</h2>
          <p className="text-muted-foreground text-sm">
            Active goals by month, against today&rsquo;s limit of{" "}
            {profile.active_goal_limit} — the limit itself has no history to
            plot, only its current value.
          </p>
          <CapacityTrendChart
            months={monthlyActiveCounts}
            currentLimit={profile.active_goal_limit}
          />
        </section>
      )}

      {/* Trips taken and places visited: deferred until Phase 6 actually
          builds the trips flow (brief, verbatim: "once Phase 6 lands") —
          trips/trip_legs/trip_stops exist in the schema but nothing
          populates them yet, so there's genuinely nothing to summarise
          here. Intentionally no query, no placeholder section: adding
          one now would either be empty forever until P6 ships, or need
          rewriting once it does. */}
    </div>
  );
}
