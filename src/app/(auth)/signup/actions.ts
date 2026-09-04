"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type SignUpFormState = { error?: string; message?: string };

// Per-IP: blunts a script farming accounts from one source. Per-email:
// blunts email-bombing a specific address with confirmation emails
// (also protects mailer_rate_limit_email_sent, the platform's own
// per-project cap, from being exhausted by one target). Both loose
// enough that a real person mistyping their password on signup, or
// retrying after a bounced email, never notices.
const SIGNUP_IP_LIMIT = 10;
const SIGNUP_EMAIL_LIMIT = 3;
const SIGNUP_WINDOW_SECONDS = 60 * 60;

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);

  const [ipCheck, emailCheck] = await Promise.all([
    checkRateLimit(`signup:ip:${ip}`, SIGNUP_IP_LIMIT, SIGNUP_WINDOW_SECONDS),
    checkRateLimit(
      `signup:email:${email.toLowerCase()}`,
      SIGNUP_EMAIL_LIMIT,
      SIGNUP_WINDOW_SECONDS,
    ),
  ]);
  if (!ipCheck.allowed || !emailCheck.allowed) {
    return { error: "Too many attempts. Try again later." };
  }

  const origin = requestHeaders.get("origin");
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
