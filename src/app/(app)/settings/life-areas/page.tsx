import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LifeAreaManager } from "./life-area-manager";

export default async function LifeAreasSettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: areas, error } = await supabase
    .from("life_areas")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error || !areas) {
    throw new Error(error?.message ?? "Failed to load life areas.");
  }

  // Goal counts per area, for the "N goals will move to Uncategorised"
  // warning on delete — computed here so the confirm dialog doesn't need
  // its own round trip. select() over life_area_id and tally in JS rather
  // than a `group by`, since there's no view for it and the row count per
  // user is small.
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("life_area_id")
    .eq("owner_id", userId)
    .is("deleted_at", null);

  if (goalsError) {
    throw new Error(goalsError.message);
  }

  const goalCounts: Record<string, number> = {};
  for (const goal of goals ?? []) {
    if (!goal.life_area_id) continue;
    goalCounts[goal.life_area_id] = (goalCounts[goal.life_area_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Life areas</h1>
        <p className="text-muted-foreground text-sm">
          The lanes goals and trips are grouped under. Drag to reorder, click a
          name to rename, or a swatch to recolour.
        </p>
      </div>
      <LifeAreaManager initialAreas={areas} goalCounts={goalCounts} />
    </div>
  );
}
