"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import { parseSocialLink } from "@/lib/social-links/parse";
import type { Database } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type DreamEntryLinkRow = Database["public"]["Tables"]["dream_entry_links"]["Row"];

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PATH = "/dreams";

async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

/**
 * P10.3: the one write path for a saved link. The parser runs again
 * here, server-side, even though the UI already ran it once for the
 * live provider-chip preview -- never trust a client-supplied
 * provider/providerPostId/canonicalUrl, all three are re-derived from
 * `url` alone. An unparseable `url` reaching this action at all
 * shouldn't happen (the UI's own save button only enables once the
 * parser succeeds, or the explicit "save as a plain link" path is
 * taken -- see dream-links-section.tsx), but a stale client or a
 * direct call still gets a real error back, not a row built from
 * garbage.
 */
export async function createDreamLink(
  entryId: string,
  url: string,
  title: string,
  note: string,
  /**
   * "Unparseable input: inline message, keep the pasted text in the
   * field, do not clear it. Offer to save it as a plain link" (brief,
   * verbatim) -- this is that escape hatch. When true and the parser
   * can't make sense of `url` at all, the raw text is saved as-is
   * (`provider: 'other'`, url and canonical_url both the literal
   * pasted string) rather than refusing the save outright. Silently
   * ignored if the parser actually succeeds -- a real parse always
   * wins over the fallback.
   */
  saveAsPlainLink = false,
): Promise<ActionResult<DreamEntryLinkRow>> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const trimmedUrl = url.trim();
  const parsed = parseSocialLink(trimmedUrl);
  if (!parsed && !saveAsPlainLink) {
    return { ok: false, error: "That doesn't look like a link — check the address and try again." };
  }
  if (!trimmedUrl) {
    return { ok: false, error: "Paste a link first." };
  }

  const { data, error } = await supabase
    .from("dream_entry_links")
    .insert({
      entry_id: entryId,
      user_id: userId,
      provider: parsed?.provider ?? "other",
      provider_post_id: parsed?.providerPostId ?? null,
      url: trimmedUrl,
      canonical_url: parsed?.canonicalUrl ?? trimmedUrl,
      title: title.trim() || null,
      note: note.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

/** Deletion is per-link, inline (brief, verbatim) -- RLS (user_id = auth.uid()) is the real gate here, this is just the un-narrated wrapper every other delete action in this app already is. */
export async function deleteDreamLink(linkId: string): Promise<ActionResult> {
  const supabase = await createClient();
  await getUserId(supabase);

  const { error } = await supabase.from("dream_entry_links").delete().eq("id", linkId);
  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
