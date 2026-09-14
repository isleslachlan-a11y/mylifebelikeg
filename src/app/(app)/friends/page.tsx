import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { FriendsView } from "./friends-view";

/**
 * F1: friend management. v_friends/v_friend_requests (0044) already do
 * the hard half -- resolving the *other* party's profile off a
 * directed requester/addressee row, scoped to auth.uid() internally --
 * so this page is a straight fetch-and-render, same shape every other
 * page in this app takes over a purpose-built view.
 */
export default async function FriendsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile, error: profileError },
    { data: friends, error: friendsError },
    { data: requests, error: requestsError },
  ] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase
      .from("v_friends")
      .select("friendship_id, user_id, handle, display_name, avatar, since")
      .order("since", { ascending: false }),
    supabase
      .from("v_friend_requests")
      .select("id, is_incoming, handle, display_name, avatar, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (friendsError) {
    throw new Error(friendsError.message);
  }
  if (requestsError) {
    throw new Error(requestsError.message);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Friends</h1>
        <p className="text-muted-foreground text-sm">
          A relationship, nothing more — being friends doesn&rsquo;t share
          anything by itself. It just makes finding each other and sharing
          things later one click instead of typing a handle each time.
        </p>
      </div>

      <FriendsView
        initialFriends={(friends ?? []).filter(
          (
            f,
          ): f is typeof f & {
            friendship_id: string;
            user_id: string;
            handle: string;
            display_name: string;
          } =>
            Boolean(f.friendship_id && f.user_id && f.handle && f.display_name),
        )}
        initialRequests={(requests ?? []).filter(
          (
            r,
          ): r is typeof r & {
            id: string;
            handle: string;
            display_name: string;
            is_incoming: boolean;
            created_at: string;
          } =>
            Boolean(
              r.id &&
              r.handle &&
              r.display_name &&
              r.is_incoming !== null &&
              r.created_at,
            ),
        )}
        timezone={profile?.timezone ?? "UTC"}
      />
    </div>
  );
}
