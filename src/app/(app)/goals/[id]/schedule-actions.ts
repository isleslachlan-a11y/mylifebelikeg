"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../actions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Every action below runs from an already-gated (app) route, so a missing
// session here means it expired mid-use, not a first visit — same
// convention as goals/actions.ts and every other *-actions.ts file on
// this page. The real authorization gate for the preview itself is
// app.preview_task_slip's own app.can_edit_goal check (0023) — this
// isn't a second copy of that, just the session-expiry redirect every
// other action file already does.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * "What if this takes N days longer?" (P5.2) — calls
 * `public.preview_task_slip`, a thin wrapper around
 * `app.preview_task_slip` (0023), which mutates and recomputes the
 * whole goal's schedule *inside its own internal savepoint* and
 * deliberately rolls that back before returning — see the migration's
 * own comment for why that has to happen inside the function rather
 * than out here. Nothing this action does needs to (or should)
 * `revalidatePath`: a preview changes nothing, so there's nothing for a
 * revalidation to pick up — calling it here would be a no-op at best and
 * a misleading "something just changed" signal at worst.
 */
export async function previewTaskSlip(
  taskId: string,
  extraDays: number,
): Promise<ActionResult<string>> {
  if (!Number.isInteger(extraDays)) {
    return { ok: false, error: "Enter a whole number of days." };
  }

  const supabase = await createClient();
  await getUserId(supabase);

  // Not humanizeDbError: that's for constraint violations on a table
  // write (it maps a *_check/unique-index name to copy, and genericises
  // anything unmapped — CLAUDE.md's own doc on that file). This RPC's
  // only realistic errors are the two plain, already-safe-to-show
  // sentences app.preview_task_slip itself raises ("Task not found.",
  // "Not authorized to preview this task.") — passing `error.message`
  // straight through is what check-in/page.tsx's own
  // `ensure_current_checkin` RPC call already does for the same reason.
  const { data, error } = await supabase.rpc("preview_task_slip", {
    task_id: taskId,
    extra_days: extraDays,
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Couldn't preview this change.",
    };
  }
  if (!data) {
    return {
      ok: false,
      error: "Couldn't project an end date — check the task has a schedule.",
    };
  }

  return { ok: true, data };
}
