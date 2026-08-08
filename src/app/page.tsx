import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// The single source of truth for the auth/onboarding/dashboard branch.
// Middleware deliberately leaves "/" ungated rather than duplicating this.
export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", auth.claims.sub)
    .maybeSingle();

  redirect(profile ? "/dashboard" : "/onboarding");
}
