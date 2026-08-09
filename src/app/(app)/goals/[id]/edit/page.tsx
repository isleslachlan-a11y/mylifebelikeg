import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { GoalForm } from "../../goal-form";

export default async function EditGoalPage({
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

  const [{ data: goal }, { data: lifeAreas, error: lifeAreasError }] =
    await Promise.all([
      supabase.from("goals").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("life_areas")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
    ]);

  // RLS scopes goals_select to owner-or-participant, but the edit form
  // itself is owner-only (see actions.ts) — a participant landing here
  // would see a goal that exists yet can't be saved, so treat anything
  // not owned by this user as not found rather than showing a dead form.
  if (!goal || goal.owner_id !== userId) {
    notFound();
  }
  if (lifeAreasError || !lifeAreas) {
    throw new Error(lifeAreasError?.message ?? "Failed to load life areas.");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="font-display text-3xl">Edit goal</h1>
      <GoalForm
        goal={goal}
        lifeAreas={lifeAreas}
        defaultCurrency={goal.currency}
      />
    </div>
  );
}
