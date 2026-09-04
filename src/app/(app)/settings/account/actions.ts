"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

export type RequestDeletionFormState = { error?: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * Step two of "request, confirm by typing the account email, then a
 * 7-day grace window" (brief, verbatim) — step one (the export offer
 * and the warning copy) is UI-only, nothing to write yet.
 *
 * The email match is re-checked here even though `<DeleteAccountFlow>`
 * already checks it client-side before this ever fires — the client
 * check is only ever a UX nicety (don't let someone submit a typo),
 * never the actual gate; a crafted request with a mismatched or blank
 * `confirmEmail` must still be refused. `auth.getClaims()`'s own
 * `email` claim is compared against, not a client-supplied "this is my
 * email" field — the account being deleted is always the caller's own,
 * there is no `userId` parameter here to spoof.
 *
 * `useActionState`-shaped (`_prevState`/`FormData`) — same contract
 * `(auth)/login/actions.ts`'s `signIn` already uses for the same reason
 * (a client form with one text input and a pending state).
 */
export async function requestAccountDeletion(
  _prevState: RequestDeletionFormState,
  formData: FormData,
): Promise<RequestDeletionFormState> {
  const confirmEmail = String(formData.get("confirmEmail") ?? "").trim();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const accountEmail = auth.claims.email;
  if (!accountEmail) {
    return { error: "Couldn't verify your account email. Try again." };
  }
  if (confirmEmail.toLowerCase() !== accountEmail.toLowerCase()) {
    return { error: "That doesn't match your account email." };
  }

  const userId = auth.claims.sub;
  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    return { error: humanizeDbError(error) };
  }

  // "Sign the user out immediately on request... so the account is
  // unusable during the window" (brief, verbatim). This is a Server
  // Action, not a Server Component — cookie writes succeed here (see
  // CLAUDE.md's Supabase-clients list), so signOut()'s cookie clearing
  // actually takes effect before the redirect below.
  await supabase.auth.signOut();
  redirect("/login?accountDeletionRequested=1");
}

/**
 * The "cancel link" the brief asks for: reachable any time during the
 * grace window by signing back in (deletion_requested_at being set
 * doesn't block login — only the session at request time was killed)
 * and returning to /settings/account, where this is wired to a plain
 * button, and to the persistent app-shell banner (deletion-banner.tsx)
 * that shows on every page for exactly this reason — a cancel path
 * that doesn't depend on remembering one specific URL.
 */
export async function cancelAccountDeletion(): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { error } = await supabase
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", userId);
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath("/settings/account");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
