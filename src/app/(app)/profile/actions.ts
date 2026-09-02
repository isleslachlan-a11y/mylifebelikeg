"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

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
 * Toggles `is_pinned` on one `user_achievements` row. No extra owner_id
 * filter beyond `.eq("id", ...)` — `user_achievements_update`'s RLS
 * (`user_id = auth.uid()`) is already the exact authorization surface
 * wanted, same per-table reasoning CLAUDE.md documents for every other
 * actions.ts in this app.
 *
 * The real limit-of-three guard is client-side (`achievement-grid.tsx`
 * disables pinning once three are already pinned) — P7.3 brief, verbatim:
 * "Prevent the fourth selection client-side." `app.enforce_pin_limit`
 * (0026) is what actually enforces it in the database; a fourth pin that
 * somehow still reaches here is rejected there and mapped through
 * `humanizeDbError`'s `PIN_LIMIT_RE` as the brief's own "backstop," not
 * the primary guard.
 */
export async function toggleAchievementPin(
  userAchievementId: string,
  pinned: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase
    .from("user_achievements")
    .update({ is_pinned: pinned })
    .eq("id", userAchievementId);

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/profile");
  return { ok: true, data: undefined };
}
