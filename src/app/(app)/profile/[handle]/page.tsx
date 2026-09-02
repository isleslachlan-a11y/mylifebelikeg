import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { PinnedFlair } from "@/components/pinned-flair";
import { createClient } from "@/lib/supabase/server";

/**
 * Someone else's profile (P7.3). `profiles_select`'s own RLS is broad —
 * any signed-in user can read any non-deleted profile row (handle,
 * display_name, avatar, created_at) — so the row itself isn't what
 * gates this page; the brief's "viewable when they've shared a goal
 * with you or granted profile access" is an application-level decision
 * layered on top, checked explicitly below rather than assumed from
 * the row being readable at all. `user_achievements_select`'s own RLS
 * (`user_id = auth.uid() OR app.has_grant('profile', user_id, 'view')`)
 * already does the finer-grained half of this for free: querying it as
 * the viewer returns pinned achievements only when a real `profile`
 * share grant exists, empty otherwise — "without a grant, show only
 * what shared-goal participation already exposes" (brief) falls out of
 * that RLS shape rather than needing a second branch in this file.
 *
 * "Nothing about their money, their private goals, or their check-ins"
 * is enforced by never querying any of it here — no `goals` columns
 * beyond id/title/kind/state, no `ledger_entries`/`pots`/`cashflow_items`,
 * no `check_ins`/`v_checkin_streak`, no stats block, no full achievement
 * grid (that's `/profile`'s own page, never this one).
 */
export default async function OtherProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const viewerId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar")
    .eq("handle", handle)
    .is("deleted_at", null)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!profile) {
    notFound();
  }
  if (profile.id === viewerId) {
    // Your own handle, visited by the same route — the full page with
    // stats/grid/settings lives at /profile, never re-rendered here.
    redirect("/profile");
  }

  const [
    { data: grant, error: grantError },
    { data: myGoals, error: myGoalsError },
  ] = await Promise.all([
    // share_grants_select's RLS (grantor_id = auth.uid() OR grantee_id
    // = auth.uid()) already scopes this to grants the viewer is a party
    // to — no extra filter needed beyond the resource identity itself.
    supabase
      .from("share_grants")
      .select("id")
      .eq("resource_type", "profile")
      .eq("resource_id", profile.id)
      .eq("grantee_id", viewerId)
      .is("revoked_at", null)
      .maybeSingle(),
    // goals_select's RLS is already "my goals" (owner or active
    // participant) — the viewer can never see profile.id's goals
    // directly this way, only cross-reference against their own.
    supabase
      .from("goals")
      .select("id, title, kind, state")
      .is("deleted_at", null),
  ]);

  if (grantError) {
    throw new Error(grantError.message);
  }
  if (myGoalsError) {
    throw new Error(myGoalsError.message);
  }

  const myGoalIds = (myGoals ?? []).map((g) => g.id);

  // Two-query in-memory join (CLAUDE.md's documented convention here,
  // not embedded-resource filtering): which of *my* goals does the
  // profile owner also participate in. goal_participants_select's RLS
  // (`user_id = auth.uid() OR app.can_view_goal(goal_id)`) permits
  // reading every participant row on a goal I can already view, not
  // just my own row on it — which is exactly what this needs.
  const { data: theirParticipantRows, error: participantsError } =
    myGoalIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("goal_participants")
          .select("goal_id")
          .in("goal_id", myGoalIds)
          .eq("user_id", profile.id)
          .is("removed_at", null);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const theirGoalIds = new Set(
    (theirParticipantRows ?? []).map((r) => r.goal_id),
  );
  const sharedGoals = (myGoals ?? []).filter((g) => theirGoalIds.has(g.id));

  const hasRelationship = grant != null || sharedGoals.length > 0;

  if (!hasRelationship) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <h1 className="font-display text-3xl">@{profile.handle}</h1>
        <p className="text-muted-foreground text-sm">
          This profile isn&apos;t shared with you — nothing to show yet.
        </p>
      </div>
    );
  }

  // user_achievements_select's RLS resolves "do I actually have a
  // profile grant" more precisely than the boolean above ever could —
  // scope 'view' vs 'edit', revoked timing, all of it — so this query
  // is the real source of truth for whether pinned flair renders, not
  // `grant`, which only decided whether to render the page *at all*.
  const { data: pinnedRows, error: pinnedError } = await supabase
    .from("user_achievements")
    .select("achievement:achievements(code, name, description)")
    .eq("user_id", profile.id)
    .eq("is_pinned", true);

  if (pinnedError) {
    throw new Error(pinnedError.message);
  }

  const pinned = (pinnedRows ?? [])
    .map((r) => r.achievement)
    .filter(
      (a): a is { code: string; name: string; description: string } =>
        a != null,
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start gap-4">
        <Avatar avatar={profile.avatar} size={96} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display truncate text-3xl">
            {profile.display_name}
          </h1>
          <p className="text-muted-foreground text-sm">@{profile.handle}</p>
          <PinnedFlair pinned={pinned} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Shared goals</h2>
        {sharedGoals.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No goals in common yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sharedGoals.map((goal) => (
              <li key={goal.id}>
                <Link
                  href={`/goals/${goal.id}`}
                  className="border-border hover:bg-muted flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
                >
                  <span className="truncate text-sm">{goal.title}</span>
                  <span className="flex shrink-0 gap-1.5">
                    {goal.kind === "trip" && (
                      <Badge variant="outline">Trip</Badge>
                    )}
                    <Badge variant="secondary" className="capitalize">
                      {goal.state}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
