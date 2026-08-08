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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.claims.sub)
    .single();
  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={profile.display_name} />
      <div className="flex flex-1 flex-col">
        <MobileHeader displayName={profile.display_name} />
        <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
