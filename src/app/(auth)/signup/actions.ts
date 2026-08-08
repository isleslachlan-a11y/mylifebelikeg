"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export type SignUpFormState = { error?: string; message?: string };

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { error: friendlyAuthError(error) };
  }

  if (!data.session) {
    // Email confirmation is required before a session can be created.
    return {
      message: "Check your inbox to confirm your email, then sign in.",
    };
  }

  redirect("/");
}
