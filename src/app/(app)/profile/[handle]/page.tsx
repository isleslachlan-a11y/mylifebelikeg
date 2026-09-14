import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { PinnedFlair } from "@/components/pinned-flair";
import { createClient } from "@/lib/supabase/server";
import { AddFriendButton } from "./add-friend-button";

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
 *
 * F5 (0044) adds the friendship dimension on top, deliberately
 * independent of the grant/shared-goal check above: "friendship grants
 * no access to anything by itself" (0044's own opening philosophy), so
 * `isFriend` only ever decides whether an "Add friend" button renders
 * in the minimal view, never whether the expanded view does — a friend
 * with no grant and a stranger with no grant see the exact same
 * "nothing to show yet" text, on purpose ("show the minimal view
 * without explaining why," F5 brief, verbatim). "Dreams and trips"
 * below "Shared goals" is new too, sourced from `v_shared_with_me_all`
 * filtered to this profile's own `owner_id` — a genuinely different
 * concept from "Shared goals" (goal_participants-based mutual
 * collaboration, P7.3, unchanged), so it's additive, not a replacement.
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
    { data: friendship, error: friendshipError },
    { data: theirShares, error: theirSharesError },
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
    // F5: "not friends -> add-friend button... friends without a grant
    // -> show the minimal view without explaining why" -- both
    // branches need to know friendship state, distinct from the grant
    // check above (0044's own "friendship grants no access by itself"
    // philosophy). friendships_select's RLS (either party) already
    // scopes this correctly.
    supabase
      .from("friendships")
      .select("status")
      .or(
        `and(requester_id.eq.${viewerId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewerId})`,
      )
      .maybeSingle(),
    // F5: "dreams and trips" alongside shared goals -- everything this
    // specific person has shared with the viewer via a real grant
    // (share_grants, 0044), as opposed to "Shared goals" below which is
    // goal_participants-based mutual collaboration, a different, older
    // concept (P7.3) this page already covered before F5.
    supabase
      .from("v_shared_with_me_all")
      .select("grant_id, resource_type, resource_id, title")
      .eq("owner_id", profile.id)
      .in("resource_type", ["someday_item", "trip"]),
  ]);

  if (grantError) {
    throw new Error(grantError.message);
  }
  if (myGoalsError) {
    throw new Error(myGoalsError.message);
  }
  if (friendshipError) {
    throw new Error(friendshipError.message);
  }
  if (theirSharesError) {
    throw new Error(theirSharesError.message);
  }
  const isFriend = friendship?.status === "accepted";
  const hasPendingRequest = friendship?.status === "pending";

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
        <div className="flex items-center gap-4">
          <Avatar avatar={profile.avatar} size={64} />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl">{profile.display_name}</h1>
            <p className="text-muted-foreground text-sm">@{profile.handle}</p>
          </div>
        </div>
        {/* F5: "not friends -> add-friend button. Friends without a
            grant -> show the minimal view without explaining why" --
            the button itself is the only thing that differs between
            those two cases; the explanatory text is deliberately the
            same either way, never naming which case this is. */}
        {isFriend || hasPendingRequest ? null : (
          <AddFriendButton handle={profile.handle} />
        )}
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

      {theirShares && theirShares.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl">Shared with you</h2>
          <ul className="flex flex-col gap-2">
            {theirShares.map((s) =>
              s.resource_type === "trip" && s.resource_id ? (
                <li key={s.grant_id}>
                  <Link
                    href={`/trips/${s.resource_id}`}
                    className="border-border hover:bg-muted flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <span className="truncate text-sm">{s.title}</span>
                    <Badge variant="outline">Trip</Badge>
                  </Link>
                </li>
              ) : (
                <li
                  key={s.grant_id}
                  className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="truncate text-sm">{s.title}</span>
                  <Badge variant="outline">Dream</Badge>
                </li>
              ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
