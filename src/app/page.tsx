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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", auth.claims.sub)
    .maybeSingle();
  // maybeSingle() only ever sets error for a genuine query failure — a
  // real "no profile row yet" is data: null, error: null. Conflating the
  // two used to mean a transient failure here silently redirected an
  // already-onboarded user into /onboarding; throwing instead lets the
  // root error boundary say so honestly (P5.5's Supabase-call audit).
  if (profileError) {
    throw new Error(profileError.message);
  }

  redirect(profile ? "/dashboard" : "/onboarding");
}
