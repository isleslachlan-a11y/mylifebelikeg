"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

// share_grants.resource_type is a plain `text` column with a CHECK
// constraint, not a Postgres enum -- generated types report it as bare
// `string`, which isn't narrow enough for SCOPE_DESCRIPTIONS'
// exhaustive per-type map in share-control.tsx. Named explicitly here
// instead, matching the constraint's own four values (0008's baseline
// schema, confirmed live).
export type ShareResourceType = "goal" | "someday_item" | "trip" | "profile";
export type ShareScope = Database["public"]["Enums"]["share_scope"];

async function getUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * F2: the one entry point every <ShareControl> instance calls,
 * regardless of resource type -- app.share_resource (0044) does all
 * the real work (authority check via app.can_grant, block check,
 * reactivate-not-duplicate, notification). `path` is the caller's own
 * page, revalidated so a fresh read (v_my_shares) reflects the new
 * grant without a full client refetch.
 */
export async function shareResource(
  resourceType: ShareResourceType,
  resourceId: string,
  granteeId: string,
  scope: ShareScope,
  path: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("share_resource", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_grantee: granteeId,
    p_scope: scope,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(path);
  return { ok: true, data: undefined };
}

/**
 * "Revoking takes effect immediately. Either side can revoke" (F2
 * brief, verbatim) -- unshare_resource itself decides which side is
 * calling; this is just the un-narrated wrapper, same shape as every
 * other thin RPC action in this app.
 */
export async function unshareResource(
  resourceType: ShareResourceType,
  resourceId: string,
  granteeId: string,
  path: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("unshare_resource", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_grantee: granteeId,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(path);
  return { ok: true, data: undefined };
}

/** F2: "'Share with all friends' calling app.share_with_all_friends." */
export async function shareWithAllFriends(
  resourceType: ShareResourceType,
  resourceId: string,
  scope: ShareScope,
  path: string,
): Promise<ActionResult<{ count: number }>> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { data, error } = await supabase.rpc("share_with_all_friends", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_scope: scope,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(path);
  return { ok: true, data: { count: data ?? 0 } };
}
