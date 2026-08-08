"use server";

import { redirect } from "next/navigation";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string };

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: friendlyAuthError(error) };
  }

  redirect("/");
}
