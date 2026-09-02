import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TripCreateForm } from "./trip-create-form";

export default async function NewTripPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [{ data: lifeAreas, error: lifeAreasError }, { data: profile }] =
    await Promise.all([
      supabase
        .from("life_areas")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select("base_currency")
        .eq("id", userId)
        .single(),
    ]);

  if (lifeAreasError || !lifeAreas) {
    throw new Error(lifeAreasError?.message ?? "Failed to load life areas.");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">New trip</h1>
        <p className="text-muted-foreground text-sm">
          A trip is a goal — it gets its own budget, RAG, and place on the
          timeline, plus stops and legs.
        </p>
      </div>
      <TripCreateForm
        lifeAreas={lifeAreas}
        defaultCurrency={profile?.base_currency ?? "AUD"}
      />
    </div>
  );
}
