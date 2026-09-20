import Link from "next/link";
import { redirect } from "next/navigation";

import type { DreamLinkCardData } from "@/components/social-links/dream-link-card";
import { createClient } from "@/lib/supabase/server";
import { deriveThumbPath } from "@/lib/storage/dream-photos";
import { getSignedDreamPhotoUrls } from "@/lib/storage/dream-photos-server";
import type { SocialLinkProvider } from "@/lib/social-links/parse";
import { DreamManager } from "./dream-manager";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Which trip each already-promoted item went into — "Promoted items stay
 * visible with a marker showing which trip they went into" (P6.1 brief).
 * A trip has no title of its own (it's `goal_kind: 'trip'` on `goals` —
 * see `trips.goal_id`), so this is a three-hop chase: someday_item_id ->
 * trip_stops.trip_id -> trips.goal_id -> goals.title. Sequential, not one
 * PostgREST embedded-resource call, same reasoning as /api/export's own
 * multi-phase fetch: none of these foreign keys skip a hop, and embedded-
 * resource filtering isn't a pattern used (or verified to work) anywhere
 * else in this codebase.
 */
async function fetchPromotedTripTitles(
  supabase: SupabaseServerClient,
  promotedItemIds: string[],
): Promise<Map<string, string>> {
  if (promotedItemIds.length === 0) return new Map();

  const { data: stops, error: stopsError } = await supabase
    .from("trip_stops")
    .select("someday_item_id, trip_id")
    .in("someday_item_id", promotedItemIds);
  if (stopsError || !stops || stops.length === 0) {
    if (stopsError)
      console.error("Failed to load promoted trip stops", stopsError);
    return new Map();
  }

  const tripIds = [...new Set(stops.map((s) => s.trip_id))];
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("id, goal_id")
    .in("id", tripIds);
  if (tripsError || !trips) {
    if (tripsError)
      console.error("Failed to load trips for promoted items", tripsError);
    return new Map();
  }

  const goalIds = [...new Set(trips.map((t) => t.goal_id))];
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title")
    .in("id", goalIds);
  if (goalsError || !goals) {
    if (goalsError)
      console.error("Failed to load goals for promoted trips", goalsError);
    return new Map();
  }

  const titleByGoalId = new Map(goals.map((g) => [g.id, g.title]));
  const goalIdByTripId = new Map(trips.map((t) => [t.id, t.goal_id]));

  const titleBySomedayId = new Map<string, string>();
  for (const stop of stops) {
    if (!stop.someday_item_id) continue;
    const goalId = goalIdByTripId.get(stop.trip_id);
    const title = goalId ? titleByGoalId.get(goalId) : undefined;
    if (title) titleBySomedayId.set(stop.someday_item_id, title);
  }
  return titleBySomedayId;
}

export default async function DreamsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: items, error: itemsError },
    { data: lifeAreas, error: lifeAreasError },
    { data: progress, error: progressError },
    { data: profile, error: profileError },
    { data: sharedDreams, error: sharedDreamsError },
    { data: links, error: linksError },
  ] = await Promise.all([
    supabase
      .from("someday_items")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("life_areas")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("v_someday_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("base_currency").eq("id", userId).single(),
    // F3: "surface shared items in their home lists... a shared dream
    // in the bucket list grid with an owner marker" (brief, verbatim).
    // Rendered as its own small read-only section below, not folded
    // into DreamManager's own grid/dialog state -- there's no per-item
    // view for someone *else's* dream yet (see /shared's own header
    // comment), so this can't open the same edit dialog a real row does.
    supabase
      .from("v_shared_with_me_all")
      .select("grant_id, resource_id, title, owner_name")
      .eq("resource_type", "someday_item"),
    // P10.3: every one of the user's own saved links, prefetched once
    // rather than per-dialog-open -- user_id is denormalised on
    // dream_entry_links specifically so this doesn't need to wait on
    // `items` resolving first to build an entry_id list.
    supabase
      .from("dream_entry_links")
      .select("id, entry_id, provider, provider_post_id, canonical_url, title, note")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (itemsError || !items) {
    throw new Error(itemsError?.message ?? "Failed to load your Dream Diary.");
  }
  if (linksError) {
    throw new Error(linksError.message);
  }
  if (lifeAreasError || !lifeAreas) {
    throw new Error(lifeAreasError?.message ?? "Failed to load life areas.");
  }
  if (progressError) {
    throw new Error(progressError.message);
  }
  // P8.7: found live -- this used to destructure only `{ data: profile }`,
  // silently discarding a real query error the exact same way P5.5's own
  // audit flagged elsewhere ("a mislabelled currency... instead of
  // surfacing"): `profile?.base_currency ?? "AUD"` below can't tell "no
  // row" from "the query genuinely failed," so a real error here used to
  // render as if the user's base currency were AUD regardless of what it
  // actually is. Thrown like every other page-level fetch above, not
  // logged-and-degraded -- this page is only ever reached from an
  // already-onboarded session, so a missing/errored profile row here
  // means something is actually wrong, the same reasoning `getUserId`'s
  // own doc comment gives for treating a missing session as expired
  // rather than a first visit.
  if (profileError) {
    throw new Error(profileError.message);
  }
  if (sharedDreamsError) {
    throw new Error(sharedDreamsError.message);
  }

  const promotedIds = items.filter((i) => i.promoted_at).map((i) => i.id);
  const promotedTripTitles = await fetchPromotedTripTitles(
    supabase,
    promotedIds,
  );

  // P8.1: thumbnails for every uploaded (non-Unsplash) photo, signed once
  // here and handed down as plain props -- "cache the signed URL... rather
  // than regenerating per render" (brief), satisfied for the whole grid
  // at once by never re-deriving it client-side at all. Signs the
  // *derived* thumb path (deriveThumbPath) since that's the object the
  // grid actually wants to show, but the returned map is re-keyed by
  // each item's own `storage_path` column -- the only thing
  // `<DreamCard>` has on hand -- so it never needs to know the
  // thumb-path derivation convention itself.
  const uploadPaths = items
    .filter((i) => i.image_source === "upload" && i.storage_path)
    .map((i) => i.storage_path as string);
  const signedThumbsByThumbPath = await getSignedDreamPhotoUrls(
    supabase,
    uploadPaths.map(deriveThumbPath),
  );
  const thumbUrlsByPath = new Map(
    uploadPaths
      .map((path): [string, string | undefined] => [
        path,
        signedThumbsByThumbPath.get(deriveThumbPath(path)),
      ])
      .filter((entry): entry is [string, string] => entry[1] != null),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl">Dream Diary</h1>
          <p className="text-muted-foreground text-sm">
            The places, things, and experiences you want, before you have to
            plan any of it.
          </p>
        </div>
        {/* P8.5: llama_messages carries no clickable link (see
            dream_prune_available's own doc comment) -- this is the
            actual discoverable path to the quarterly prune once Derek
            mentions it. Always shown, not gated on there being anything
            to prune right now -- the page itself already handles "nothing
            to prune" as its own empty state. */}
        <Link
          href="/dreams/prune"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
        >
          Quarterly prune
        </Link>
      </div>
      <DreamManager
        initialItems={items}
        lifeAreas={lifeAreas}
        userId={userId}
        thumbUrlsByPath={Object.fromEntries(thumbUrlsByPath)}
        linksByEntryId={groupLinksByEntryId(links ?? [])}
        progress={
          progress ?? {
            user_id: userId,
            total_items: 0,
            promoted_count: 0,
            still_dreaming: 0,
            countries_wanted: 0,
            // P8.0 additions to v_someday_progress.
            achieved_count: 0,
            archived_count: 0,
            unachieved_cost_minor_base: 0,
          }
        }
        promotedTripTitles={Object.fromEntries(promotedTripTitles)}
        defaultCurrency={profile?.base_currency ?? "AUD"}
      />

      {sharedDreams && sharedDreams.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">
            Shared with you
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {sharedDreams.length}
            </span>
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {sharedDreams.map((d) => (
              <li
                key={d.grant_id}
                className="border-subtle flex flex-col gap-1 rounded-lg border p-3"
              >
                <span className="truncate text-sm font-medium">{d.title}</span>
                <span className="text-muted-foreground text-xs">
                  {d.owner_name}&rsquo;s dream
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** P10.3: groups the flat dream_entry_links query result by entry_id, shaped exactly as DreamLinkCardData expects -- the one place the snake_case DB row becomes the camelCase prop shape every social-links component reads. */
function groupLinksByEntryId(
  rows: {
    id: string;
    entry_id: string;
    provider: string;
    provider_post_id: string | null;
    canonical_url: string;
    title: string | null;
    note: string | null;
  }[],
): Record<string, DreamLinkCardData[]> {
  const grouped: Record<string, DreamLinkCardData[]> = {};
  for (const row of rows) {
    const card: DreamLinkCardData = {
      id: row.id,
      provider: row.provider as SocialLinkProvider,
      providerPostId: row.provider_post_id,
      canonicalUrl: row.canonical_url,
      title: row.title,
      note: row.note,
    };
    (grouped[row.entry_id] ??= []).push(card);
  }
  return grouped;
}
