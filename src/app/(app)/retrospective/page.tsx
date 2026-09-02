import { redirect } from "next/navigation";
import { todayInZone } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * `/retrospective` with no year — redirects to the current year's page
 * (`/retrospective/[year]`, P5.4's real page). Timezone-resolved, not a
 * bare `new Date().getFullYear()`: near midnight on Dec 31/Jan 1 those
 * can disagree, same reasoning every other page-level "today" already
 * follows (P1.10; the P0.8 spike's trap).
 */
export default async function RetrospectiveIndexPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", auth.claims.sub)
    .single();
  // .single()'s error covers both "no row" and a genuine query failure —
  // a real failure here used to redirect to a wrong-timezone year
  // silently instead of surfacing (P5.5's Supabase-call audit, same
  // class of bug as AppLayout's own profile fetch). This route is
  // reached post-onboarding, same guarantee AppLayout relies on, so any
  // error at all here is unexpected — thrown, not swallowed.
  if (profileError) {
    throw new Error(profileError.message);
  }

  const today = todayInZone(profile?.timezone ?? "UTC", new Date());
  redirect(`/retrospective/${today.slice(0, 4)}`);
}
