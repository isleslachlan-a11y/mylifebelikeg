"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type AuthFormState = { error?: string };

// Per-account is the tight one -- credential stuffing against one
// email needs a low ceiling. Per-IP is looser -- it exists to catch a
// single source guessing across many accounts, not to block a shared
// office/NAT IP with several real people signing in.
const LOGIN_ACCOUNT_LIMIT = 5;
const LOGIN_IP_LIMIT = 20;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const ip = getClientIp(await headers());

  const [ipCheck, accountCheck] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS),
    checkRateLimit(
      `login:account:${email.toLowerCase()}`,
      LOGIN_ACCOUNT_LIMIT,
      LOGIN_WINDOW_SECONDS,
    ),
  ]);
  if (!ipCheck.allowed || !accountCheck.allowed) {
    return { error: "Too many attempts. Try again later." };
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
