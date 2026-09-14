import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SharingSettings, type MyShareRow } from "./sharing-settings";

/**
 * F4: sharing defaults, plus "everything you've shared from
 * v_my_shares, grouped by person" (brief, verbatim) — the grouping
 * itself happens client-side in sharing-settings.tsx (so a bulk revoke
 * can update the group in place without a full refetch), this page is
 * the fetch.
 */
export default async function SharingSettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile, error: profileError },
    { data: shares, error: sharesError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("auto_share_profile, auto_share_someday, timezone")
      .eq("id", userId)
      .single(),
    supabase
      .from("v_my_shares")
      .select(
        "grant_id, resource_type, title, grantee_id, grantee_name, grantee_handle, grantee_avatar, shared_at",
      )
      .order("shared_at", { ascending: false }),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (sharesError) {
    throw new Error(sharesError.message);
  }

  const initialShares = (shares ?? []).filter((s): s is MyShareRow =>
    Boolean(
      s.grant_id &&
      s.resource_type &&
      s.title &&
      s.grantee_id &&
      s.grantee_name &&
      s.grantee_handle &&
      s.shared_at,
    ),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Sharing</h1>
        <p className="text-muted-foreground text-sm">
          Defaults for what friends see automatically, and everything
          you&rsquo;ve shared explicitly.
        </p>
      </div>

      <SharingSettings
        initialAutoShareProfile={profile?.auto_share_profile ?? true}
        initialAutoShareSomeday={profile?.auto_share_someday ?? false}
        initialShares={initialShares}
        timezone={profile?.timezone ?? "UTC"}
      />
    </div>
  );
}
