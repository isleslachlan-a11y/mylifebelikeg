"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * F4: the two toggles. "Turning it on applies retroactively to current
 * friends; turning it off does not revoke what's already shared" (brief,
 * verbatim) -- both halves of that sentence are true for free here,
 * since this just flips the column: 0044's
 * `someday_items_auto_share` trigger only fires on a *new* dream's
 * insert, and turning the preference on doesn't retroactively share
 * existing dreams by itself either -- see `applyAutoShareRetroactively`
 * below, the explicit action this page calls right after flipping the
 * toggle on, so "applies retroactively" is a real, visible act, not an
 * invisible side effect of this one update.
 */
export async function updateSharingPreference(
  field: "auto_share_profile" | "auto_share_someday",
  value: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("profiles")
    .update(
      field === "auto_share_profile"
        ? { auto_share_profile: value }
        : { auto_share_someday: value },
    )
    .eq("id", userId);
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/settings/sharing");
  return { ok: true, data: undefined };
}

/**
 * "Turning it on applies retroactively to current friends" (F4 brief) --
 * called right after `updateSharingPreference("auto_share_someday", true)`
 * so the retroactive share is a real, immediate action rather than left
 * to the next dream insert's own trigger. Loops the same
 * share_with_all_friends the ShareControl "share with all friends"
 * button uses, once per existing dream, rather than a bespoke bulk
 * function -- the reactivate-not-duplicate upsert underneath makes
 * calling it again later (toggled off then on) safe either way.
 */
export async function applyAutoShareRetroactively(): Promise<
  ActionResult<{ dreamCount: number }>
> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data: items, error: itemsError } = await supabase
    .from("someday_items")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (itemsError) {
    return { ok: false, error: humanizeDbError(itemsError) };
  }

  for (const item of items ?? []) {
    const { error } = await supabase.rpc("share_with_all_friends", {
      p_resource_type: "someday_item",
      p_resource_id: item.id,
      p_scope: "view",
    });
    if (error) {
      return { ok: false, error: humanizeDbError(error) };
    }
  }

  revalidatePath("/settings/sharing");
  revalidatePath("/dreams");
  return { ok: true, data: { dreamCount: items?.length ?? 0 } };
}

/**
 * "Offer a 'revoke all shared dreams' action so the intent is
 * achievable" (F4 brief, verbatim) -- turning the preference off on its
 * own deliberately doesn't revoke anything already shared (same
 * paragraph); this is the explicit, separate action for when someone
 * really does mean "undo all of it," not folded into the toggle itself.
 */
export async function revokeAllSharedDreams(): Promise<
  ActionResult<{ revokedCount: number }>
> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { data: shares, error: sharesError } = await supabase
    .from("v_my_shares")
    .select("resource_id, grantee_id")
    .eq("resource_type", "someday_item");
  if (sharesError) {
    return { ok: false, error: humanizeDbError(sharesError) };
  }

  for (const share of shares ?? []) {
    if (!share.resource_id || !share.grantee_id) continue;
    const { error } = await supabase.rpc("unshare_resource", {
      p_resource_type: "someday_item",
      p_resource_id: share.resource_id,
      p_grantee: share.grantee_id,
    });
    if (error) {
      return { ok: false, error: humanizeDbError(error) };
    }
  }

  revalidatePath("/settings/sharing");
  revalidatePath("/dreams");
  return { ok: true, data: { revokedCount: shares?.length ?? 0 } };
}

/**
 * F4: "grouped by person, with bulk revoke per person" -- one grantee,
 * every resource shared with them, revoked in one action rather than
 * one-at-a-time.
 */
export async function revokeAllSharesForPerson(
  granteeId: string,
): Promise<ActionResult<{ revokedCount: number }>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { data: shares, error: sharesError } = await supabase
    .from("v_my_shares")
    .select("resource_type, resource_id")
    .eq("grantee_id", granteeId);
  if (sharesError) {
    return { ok: false, error: humanizeDbError(sharesError) };
  }

  for (const share of shares ?? []) {
    if (!share.resource_type || !share.resource_id) continue;
    const { error } = await supabase.rpc("unshare_resource", {
      p_resource_type: share.resource_type,
      p_resource_id: share.resource_id,
      p_grantee: granteeId,
    });
    if (error) {
      return { ok: false, error: humanizeDbError(error) };
    }
  }

  revalidatePath("/settings/sharing");
  return { ok: true, data: { revokedCount: shares?.length ?? 0 } };
}
