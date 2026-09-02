"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { emitLlamaMessage } from "@/lib/llamas/emit";
import type { Database } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// supabase gen types has no way to see that app.create_trip_goal's
// parameters are plain (nullable) SQL types, not NOT NULL — Postgres
// doesn't record parameter nullability in pg_proc the way it does column
// nullability, so the generator conservatively types every RPC arg as
// non-null (compare Database["public"]["Functions"]["create_trip_goal"]["Args"]).
// This is the real, narrower shape the function actually accepts —
// verified against 0024_trip_creation.sql's own signature, not guessed.
type CreateTripGoalArgs = {
  title: string;
  description: string | null;
  life_area_id: string | null;
  funding: Database["public"]["Enums"]["funding_type"];
  currency: string;
  target_amount_minor: number | null;
  start_date: string | null;
  target_date: string | null;
  visibility: Database["public"]["Enums"]["visibility_level"];
  origin_name: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  trip_notes: string | null;
};

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const CURRENCY_RE = /^[A-Z]{3}$/;

// Same reasoning as every other actions.ts in this app: every action here
// runs from an already-gated (app) route, so a missing session means it
// expired mid-use, not a first visit.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

export type CreateTripInput = {
  title: string;
  lifeAreaId: string | null;
  funding: Database["public"]["Enums"]["funding_type"];
  currency: string;
  targetAmountMinor: number | null;
  startDate: string | null;
  targetDate: string | null;
  origin: {
    name: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  notes: string | null;
};

/**
 * "Creates the goal and the trip together in one transaction" (P6.3
 * brief) — a single `supabase.rpc()` call to `app.create_trip_goal`
 * (0024), not two separate inserts from here: PostgREST gives one
 * statement per request, so atomicity has to live inside the database
 * function, not in this file. Visibility is fixed at 'private' rather
 * than exposed as a form field — keeping the fast path fast (brief:
 * "under 15 seconds" was P6.1's bar for a someday item, the same
 * instinct applies here); change it later from the goal's own edit page
 * if it ever needs to be shared.
 */
export async function createTripGoal(
  input: CreateTripInput,
): Promise<ActionResult<{ goalId: string; tripId: string }>> {
  if (!input.title.trim()) {
    return { ok: false, error: "Title can't be empty." };
  }
  if (!CURRENCY_RE.test(input.currency)) {
    return { ok: false, error: "Currency must be a 3-letter code." };
  }
  if (input.funding !== "none" && input.targetAmountMinor == null) {
    return {
      ok: false,
      error: "Target amount is required for this funding type.",
    };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const args: CreateTripGoalArgs = {
    title: input.title.trim(),
    description: null,
    life_area_id: input.lifeAreaId,
    funding: input.funding,
    currency: input.currency,
    target_amount_minor:
      input.funding === "none" ? null : input.targetAmountMinor,
    start_date: input.startDate,
    target_date: input.targetDate,
    visibility: "private",
    origin_name: input.origin?.name?.trim() || null,
    origin_lat: input.origin?.latitude ?? null,
    origin_lng: input.origin?.longitude ?? null,
    trip_notes: input.notes?.trim() || null,
  };
  const { data, error } = await supabase.rpc(
    "create_trip_goal",
    args as unknown as Database["public"]["Functions"]["create_trip_goal"]["Args"],
  );

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "Failed to create the trip." };
  }

  // P6.6: "a small number of messages that only fire once, on first use
  // of a feature" (brief) — same naturally-idempotent "fresh count of 1"
  // shape as goals/actions.ts's createGoal, checked here instead since
  // this is the only path that creates a trip-kind goal (goal-form.tsx
  // no longer offers "Trip" as a pickable kind — see P6.3).
  const { count: tripCount, error: tripCountError } = await supabase
    .from("goals")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("kind", "trip")
    .is("deleted_at", null);
  if (tripCountError) {
    console.error("First-trip count failed", tripCountError);
  } else if (tripCount === 1) {
    await emitLlamaMessage(
      userId,
      "first_trip",
      { tripTitle: input.title.trim() },
      { type: "goal", id: row.goal_id },
    );
  }

  if (input.funding !== "none") {
    const { count: fundedCount, error: fundedCountError } = await supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .is("deleted_at", null)
      .neq("funding", "none");
    if (fundedCountError) {
      console.error("First-budget count failed", fundedCountError);
    } else if (fundedCount === 1) {
      await emitLlamaMessage(
        userId,
        "first_budget_set",
        { goalTitle: input.title.trim() },
        { type: "goal", id: row.goal_id },
      );
    }
  }

  revalidatePath("/trips");
  redirect(`/trips/${row.trip_id}`);
}
