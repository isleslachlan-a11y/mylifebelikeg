"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { AvatarSelection } from "@/lib/avatar/types";
import type { Json } from "@/types/database";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Same reasoning as every other actions.ts in this app: every action here
// runs from an already-gated (app) route, so a missing session means it
// expired mid-use, not a first visit.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Writes the full avatar selection to `profiles.avatar`. `app.validate_avatar()`
 * (migration 0026) is the actual authorization boundary — a locked, unknown,
 * or wrong-slot preset is rejected there, not here, and this action does no
 * unlock-checking of its own before writing. That's deliberate: `avatar-editor.tsx`
 * already builds its tiles from the same `v_available_presets` rows this
 * page fetched, so a locked preset is never clickable to begin with —
 * "a user hitting a database error for something the UI let them click is
 * a bug in the UI" (P7.1 brief). This action's own job is just the write
 * and the `humanizeDbError` translation for whatever still gets through a
 * stale client or a direct API call — defense in depth, not the primary
 * guard, same relationship every other actions.ts in this app has to its
 * own RLS/trigger layer.
 */
export async function saveAvatar(
  selection: AvatarSelection,
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("profiles")
    .update({ avatar: selection as Json })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/profile/avatar");
  revalidatePath("/profile");
  return { ok: true, data: undefined };
}
