import { redirect } from "next/navigation";

import { Sidebar } from "@/components/app-shell/sidebar";
import { MobileHeader } from "@/components/app-shell/mobile-header";
import { TabBar } from "@/components/app-shell/tab-bar";
import { createClient } from "@/lib/supabase/server";

// The shell around every authenticated route. Server component — the
// only client pieces are the ones that genuinely need the browser: nav
// active-state (needs the current pathname) and the mobile account menu
// (needs open/closed state).
//
// proxy.ts already redirects unauthenticated or profile-less requests
// before they get here; this check is defense in depth, not the primary
// guard (a layout can't set cookies mid-render the way proxy can).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.claims.sub)
    .single();
  // .single() sets error for *both* "no row" (PGRST116 — a real new
  // signup, correctly sent to onboarding) and a genuine query failure.
  // Conflating them used to mean a transient failure here silently
  // bounced an already-onboarded user into onboarding on every page in
  // the app (this layout wraps all of them) — thrown instead, so the
  // new error boundary says so rather than misrouting (P5.5's
  // Supabase-call audit).
  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(profileError.message);
  }
  if (!profile) {
    redirect("/onboarding");
  }

  // P4.6's inbox — undismissed messages, newest first. llama_messages_select's
  // RLS (user_id = auth.uid()) already scopes this to the signed-in user.
  // A failure here degrades to an empty inbox rather than breaking the
  // shell every other page renders inside — logged so that degradation
  // is at least visible server-side (P5.5's Supabase-call audit), not
  // thrown, since a quiet inbox is a far smaller loss than the whole
  // app going down over one non-essential fetch.
  const { data: llamaMessages, error: llamaMessagesError } = await supabase
    .from("llama_messages")
    .select("id, speaker, body, read_at")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (llamaMessagesError) {
    console.error("AppLayout: llama inbox fetch failed", llamaMessagesError);
  }
  const inboxMessages = (llamaMessages ?? []).map((m) => ({
    id: m.id,
    speaker: m.speaker,
    body: m.body,
    readAt: m.read_at,
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        inboxMessages={inboxMessages}
      />
      <div className="flex flex-1 flex-col">
        <MobileHeader
          displayName={profile.display_name}
          inboxMessages={inboxMessages}
        />
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
