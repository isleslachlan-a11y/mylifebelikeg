import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CapacitySettings } from "./capacity-settings";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: capacity } = await supabase
    .from("v_user_capacity")
    .select("active_goal_count, active_goal_limit")
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-3xl">Profile</h1>

      <Link
        href="/settings/life-areas"
        className="text-primary text-sm underline-offset-4 hover:underline"
      >
        Manage life areas
      </Link>

      {capacity && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">Capacity</h2>
          <CapacitySettings
            activeGoalCount={capacity.active_goal_count ?? 0}
            activeGoalLimit={capacity.active_goal_limit ?? 5}
          />
        </section>
      )}
    </div>
  );
}
