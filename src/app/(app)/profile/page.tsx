import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { PinnedFlair } from "@/components/pinned-flair";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  AchievementGrid,
  type AchievementDef,
  type UnlockedAchievement,
} from "./achievement-grid";

const MONTH_YEAR = { month: "long" as const, year: "numeric" as const };

/**
 * The own-profile page (P7.3). Everything here is scoped to `auth.uid()`
 * — no visibility branching, unlike `[handle]/page.tsx`'s gated view of
 * *someone else's* profile. Stats and the full achievement grid only
 * ever belong here (brief: another user's profile shows pinned flair
 * and shared goals, never this).
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile, error: profileError },
    { data: achievementDefs, error: achievementsError },
    { data: userAchievements, error: userAchievementsError },
    { count: goalsCompleted, error: goalsCompletedError },
    { count: tripsCompleted, error: tripsCompletedError },
    { data: countryRows, error: countriesError },
    { data: streakRow, error: streakError },
    { data: somedayProgress, error: somedayError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("avatar, display_name, handle, timezone, created_at")
      .eq("id", userId)
      .single(),
    // achievements_select's RLS is just "signed in and active" — the
    // catalogue itself isn't scoped to a user, only which ones you hold.
    supabase
      .from("achievements")
      .select("id, code, name, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_achievements")
      .select("id, achievement_id, is_pinned, unlocked_at")
      .eq("user_id", userId),
    // Mirrors app.evaluate_achievements' own goals_completed condition
    // exactly (src/lib/achievements/evaluate.ts, 0026) — not
    // re-derived independently, just counted the same way here for
    // display.
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("state", "completed")
      .is("deleted_at", null),
    // Same trips_completed condition — a trip-kind goal always has a
    // matching trips row (app.enforce_trip_goal_kind), so this needs no
    // join to trips at all, just the kind filter.
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("kind", "trip")
      .eq("state", "completed")
      .is("deleted_at", null),
    // v_countries_visited (0026-era, predates this package) has no
    // security_invoker and isn't scoped to auth.uid() on its own — the
    // explicit .eq below is what keeps this to just mine, same
    // defensive-filter reasoning CLAUDE.md documents for views like it.
    supabase
      .from("v_countries_visited")
      .select("country_code")
      .eq("user_id", userId),
    // v_checkin_streak is hardcoded to `WHERE id = auth.uid()` in its
    // own definition — always exactly one row for any signed-in user
    // with a profile, so .single() (not .maybeSingle()) is correct here.
    supabase.from("v_checkin_streak").select("streak").single(),
    // Same "no row at all for a user with zero items" shape /someday's
    // own page.tsx already documents — substituted with an all-zero row
    // below, never left for the UI to handle null.
    supabase
      .from("v_someday_progress")
      .select("total_items, promoted_count, still_dreaming, countries_wanted")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileError) throw new Error(profileError.message);
  if (achievementsError) throw new Error(achievementsError.message);
  if (userAchievementsError) throw new Error(userAchievementsError.message);
  if (goalsCompletedError) throw new Error(goalsCompletedError.message);
  if (tripsCompletedError) throw new Error(tripsCompletedError.message);
  if (countriesError) throw new Error(countriesError.message);
  // A missing streak row would mean this profile itself doesn't exist,
  // which can't happen post-onboarding — genuine failures still throw.
  if (streakError) throw new Error(streakError.message);
  if (somedayError) throw new Error(somedayError.message);

  const achievements: AchievementDef[] = achievementDefs ?? [];
  const idToCode = new Map(
    (achievementDefs ?? []).map((a) => [a.id, a.code] as const),
  );

  const unlockedByCode: Record<string, UnlockedAchievement> = {};
  for (const ua of userAchievements ?? []) {
    const code = idToCode.get(ua.achievement_id);
    if (!code) continue; // defensive: an inactive/renamed achievement id
    unlockedByCode[code] = {
      id: ua.id,
      isPinned: ua.is_pinned,
      unlockedAt: ua.unlocked_at,
    };
  }

  const pinned = achievements
    .filter((a) => unlockedByCode[a.code]?.isPinned)
    .map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
    }));

  const countries = new Set(
    (countryRows ?? [])
      .map((r) => r.country_code)
      .filter((c): c is string => c != null),
  );
  const someday = somedayProgress ?? {
    total_items: 0,
    promoted_count: 0,
    still_dreaming: 0,
    countries_wanted: 0,
  };

  const stats = [
    { label: "Goals completed", value: goalsCompleted ?? 0 },
    { label: "Trips taken", value: tripsCompleted ?? 0 },
    { label: "Countries visited", value: countries.size },
    {
      label: "Check-in streak",
      value: `${streakRow?.streak ?? 0} week${streakRow?.streak === 1 ? "" : "s"}`,
    },
    {
      label: "Bucket list",
      value: `${someday.promoted_count} of ${someday.total_items} promoted`,
    },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start gap-4">
        <Avatar avatar={profile.avatar} size={96} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display truncate text-3xl">
            {profile.display_name}
          </h1>
          <p className="text-muted-foreground text-sm">@{profile.handle}</p>
          <p className="text-muted-foreground text-xs">
            Member since{" "}
            {formatDate(profile.created_at, profile.timezone, MONTH_YEAR)}
          </p>
          <PinnedFlair pinned={pinned} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Stats</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="border-border flex flex-col gap-0.5 rounded-lg border p-3"
            >
              <dt className="text-muted-foreground text-xs">{stat.label}</dt>
              <dd className="text-foreground text-lg font-medium">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Achievements</h2>
        <AchievementGrid
          achievements={achievements}
          unlockedByCode={unlockedByCode}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl">Settings</h2>
        <div className="flex flex-col gap-2">
          <Link
            href="/profile/avatar"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Edit avatar
          </Link>
          <Link
            href="/settings/life-areas"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Manage life areas
          </Link>
          <Link
            href="/settings/capacity"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Manage capacity
          </Link>
          {/* P5.5: a plain anchor, not a button + fetch — /api/export sets
              its own Content-Disposition: attachment header, so the
              browser downloads it on navigation with no client JS needed.
              P9.1: now a zip (JSON + CSVs + photos), same link. */}
          <a
            href="/api/export"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Export your data
          </a>
          {/* P9.1: export-and-delete live together at /settings/account —
              "offer the export inside the deletion flow" (brief) means
              someone who lands here from "delete my account" sees the
              export link again right there, not just on this page. */}
          <Link
            href="/settings/account"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Manage account / delete account
          </Link>
        </div>
      </section>
    </div>
  );
}
