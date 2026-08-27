"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * llama_messages_update's RLS (user_id = auth.uid()) already lets a user
 * dismiss their own messages — unlike emit.ts's insert, this needs no
 * service-role client.
 */
export async function dismissLlamaMessage(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return { ok: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("llama_messages")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Failed to dismiss llama message", error);
    return { ok: false, error: "Couldn't dismiss that — try again." };
  }

  revalidatePath("/goals");
  return { ok: true };
}

/**
 * P4.6's inbox (src/components/app-shell/llama-inbox.tsx) manages its
 * own list client-side after a successful call here rather than relying
 * on revalidatePath — the inbox lives in the shared (app) layout, not
 * one page, so there's no single route to revalidate that would refresh
 * every page it's rendered on.
 */
export async function markLlamaMessageRead(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return { ok: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("llama_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Failed to mark llama message read", error);
    return { ok: false, error: "Couldn't mark that read — try again." };
  }

  return { ok: true };
}

/** Same client-side-managed-list reasoning as markLlamaMessageRead. */
export async function markAllLlamaMessagesRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return { ok: false, error: "Not signed in." };
  }

  const { error } = await supabase
    .from("llama_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", auth.claims.sub)
    .is("read_at", null)
    .is("dismissed_at", null);

  if (error) {
    console.error("Failed to mark all llama messages read", error);
    return { ok: false, error: "Couldn't mark those read — try again." };
  }

  return { ok: true };
}
