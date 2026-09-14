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
 * F1: "Add a friend by handle. app.send_friend_request(handle) handles
 * the case where they already sent you one -- it accepts rather than
 * creating a mirror request, so the UI doesn't need to check first"
 * (brief, verbatim) -- this action really is a thin wrapper, the same
 * shape S1's addParticipant ended up being over invite_by_handle
 * (0043): the interesting logic lives entirely in the database
 * function, not here.
 */
export async function sendFriendRequest(handle: string): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("send_friend_request", {
    p_handle: handle,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/friends");
  return { ok: true, data: undefined };
}

export async function respondToFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("respond_to_friend_request", {
    p_id: requestId,
    p_accept: accept,
  });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/friends");
  revalidatePath("/dreams");
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}

/**
 * "Unfriend needs a clear confirmation, because it revokes every share
 * in both directions" (brief, verbatim) -- the confirmation itself is
 * the UI's job (friends-view.tsx); this just calls through.
 */
export async function unfriend(userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("unfriend", { p_user: userId });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/friends");
  revalidatePath("/dreams");
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}

/**
 * "Block lives behind a menu, not a primary button. It unfriends,
 * revokes, and prevents future requests and shares" (brief, verbatim)
 * -- all of that is app.block_user's own job (0044); this is the
 * un-narrated call site.
 */
export async function blockUser(userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.rpc("block_user", { p_user: userId });
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/friends");
  revalidatePath("/dreams");
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}
