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
