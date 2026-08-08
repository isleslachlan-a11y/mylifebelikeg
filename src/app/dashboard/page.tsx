import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Placeholder — middleware already guarantees an authenticated user with a
// profile reaches this point, but a page can't set cookies mid-render the
// way middleware can, so it re-checks rather than trusting that blindly.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.claims.sub)
    .single();
  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="font-display text-3xl">{profile.display_name}</h1>
    </main>
  );
}
