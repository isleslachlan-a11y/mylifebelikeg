import { redirect } from "next/navigation";

import { Sidebar } from "@/components/app-shell/sidebar";
import { MobileHeader } from "@/components/app-shell/mobile-header";
import { TabBar } from "@/components/app-shell/tab-bar";
import { DeletionBanner } from "@/components/app-shell/deletion-banner";
import { JumpMenu } from "@/components/app-shell/jump-menu";
import { createClient } from "@/lib/supabase/server";

// The shell around every authenticated route. Server component — the
// only client pieces are the ones that genuinely need the browser: nav
// active-state (needs the current pathname), the More sheet and jump
// menu (both need open/closed state).
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
    // P9.1: deletion_requested_at rides along on the same query this
    // layout already runs on every page, rather than a second fetch —
    // the banner below needs it on every page too, for the same reason
    // display_name already does.
    .select("display_name, deletion_requested_at")
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
    .select(
      "id, speaker, body, read_at, resource_type, resource_id, trigger_code",
    )
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
    resourceType: m.resource_type,
    resourceId: m.resource_id,
  }));

  // F1: "Badge the friends nav item on a pending incoming request"
  // (brief, verbatim) -- a direct count on friendships rather than
  // routing through v_friend_requests, since this only needs a number,
  // not the resolved-profile shape that view exists for.
  const { count: incomingRequestCount, error: incomingRequestError } =
    await supabase
      .from("friendships")
      .select("id", { count: "exact", head: true })
      .eq("addressee_id", auth.claims.sub)
      .eq("status", "pending");
  if (incomingRequestError) {
    console.error(
      "AppLayout: incoming friend request count failed",
      incomingRequestError,
    );
  }

  // Goal sharing package (S2): "badge on the goals nav item for unread
  // share notification" (brief, verbatim) -- computed here, once, off
  // the same inbox fetch above rather than a second query; a Set keyed
  // by nav entry id since that's what NavLink/Sidebar/TabBar already
  // key off.
  const badgedNavEntryIds = new Set<string>();
  if (
    llamaMessages?.some(
      (m) =>
        m.read_at == null &&
        m.trigger_code === "goal_shared_with_you" &&
        m.resource_type === "goal",
    )
  ) {
    badgedNavEntryIds.add("goals");
  }
  if ((incomingRequestCount ?? 0) > 0) {
    badgedNavEntryIds.add("friends");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        inboxMessages={inboxMessages}
        badgedNavEntryIds={badgedNavEntryIds}
      />
      <div className="flex flex-1 flex-col">
        <MobileHeader inboxMessages={inboxMessages} />
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {profile.deletion_requested_at && (
            <DeletionBanner
              deletionRequestedAt={profile.deletion_requested_at}
            />
          )}
          {children}
        </main>
      </div>
      <TabBar
        displayName={profile.display_name}
        badgedNavEntryIds={badgedNavEntryIds}
      />
      {/* P10.0: mounted once, here — the one shared instance every
          JumpMenuTrigger (sidebar, mobile header) opens via a window
          event rather than each rendering its own. See jump-menu.tsx's
          own header for why. */}
      <JumpMenu />
    </div>
  );
}
