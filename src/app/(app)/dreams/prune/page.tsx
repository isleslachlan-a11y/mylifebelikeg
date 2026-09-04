import { redirect } from "next/navigation";

import { deriveThumbPath } from "@/lib/storage/dream-photos";
import { getSignedDreamPhotoUrls } from "@/lib/storage/dream-photos-server";
import { createClient } from "@/lib/supabase/server";
import { PruneView, type PruneCandidate } from "./prune-view";

/**
 * "A quarterly prune, separate from the weekly prompt: dreams untouched
 * for over a year, offered as a batch to keep or archive. Derek runs
 * this one" (P8.5 brief, verbatim). Eligibility is entirely
 * `v_dream_prune_candidates`'s own job (migration 0035) -- this page
 * reads that view for *which* ids qualify, then a second, targeted
 * `someday_items` query for the display columns the view doesn't carry
 * (photo, kind label) — reusing the view as the one place the
 * eligibility rule lives, rather than restating its WHERE clause here
 * to also fetch photos in the same query.
 */
export default async function DreamPrunePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: candidateIds, error: candidatesError } = await supabase
    .from("v_dream_prune_candidates")
    .select("dream_id")
    .eq("user_id", userId);
  if (candidatesError) {
    throw new Error(candidatesError.message);
  }

  // Every view column is nullable per Postgres/PostgREST convention
  // regardless of the underlying table's real constraint (same gotcha
  // timeline-item-adapter.ts's own comment documents for v_timeline_items) --
  // dream_id is never actually null in a real row, this just satisfies
  // the generated type.
  const ids = (candidateIds ?? [])
    .map((c) => c.dream_id)
    .filter((id): id is string => id != null);

  const { data: dreams, error: dreamsError } =
    ids.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("someday_items")
          .select(
            "id, title, kind, rough_cost_minor, currency, image_source, storage_path, unsplash_thumb_url, created_at, last_surfaced_at",
          )
          .in("id", ids)
          .order("created_at", { ascending: true });
  if (dreamsError) {
    throw new Error(dreamsError.message);
  }

  const uploadPaths = (dreams ?? [])
    .filter((d) => d.image_source === "upload" && d.storage_path)
    .map((d) => d.storage_path as string);
  const signedThumbsByThumbPath = await getSignedDreamPhotoUrls(
    supabase,
    uploadPaths.map(deriveThumbPath),
  );

  const candidates: PruneCandidate[] = (dreams ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    roughCostMinor: d.rough_cost_minor,
    currency: d.currency,
    createdAt: d.created_at,
    lastSurfacedAt: d.last_surfaced_at,
    photoUrl:
      d.image_source === "upload" && d.storage_path
        ? (signedThumbsByThumbPath.get(deriveThumbPath(d.storage_path)) ?? null)
        : (d.unsplash_thumb_url ?? null),
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">The quarterly prune</h1>
        <p className="text-muted-foreground text-sm">
          Dreams you haven&rsquo;t touched in over a year. Keep the ones that
          still hold, let the rest go — a lighter list is a more honest one.
        </p>
      </div>
      <PruneView initialCandidates={candidates} />
    </div>
  );
}
