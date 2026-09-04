"use server";

import { headers } from "next/headers";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export type ForgotPasswordFormState = { error?: string; message?: string };

// Same per-IP-and-per-account shape as login (P9.2's own runbook noted
// this as the pending gap: "when [a password-reset flow] is built, it
// needs the same per-IP-and-per-account treatment as login"). Slightly
// looser than login's own numbers — a genuine password-reset request is
// rarer per person than a login attempt, so a real user retrying after
// a slow inbox shouldn't hit this before an actual abuser would.
const RESET_ACCOUNT_LIMIT = 3;
const RESET_IP_LIMIT = 10;
const RESET_WINDOW_SECONDS = 15 * 60;

/**
 * Always returns the same success message whether or not the email
 * belongs to a real account — Supabase's own `resetPasswordForEmail`
 * already behaves this way (returns `{ error: null }` either way, by
 * design, specifically so this endpoint can't be used to enumerate
 * which emails have accounts here). Rate limiting still applies before
 * that call, so this is refused-then-generic, not silently
 * generic-always: a real abuser sees "too many attempts," not a tell
 * about which addresses are real.
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter your email address." };
  }

  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);

  const [ipCheck, accountCheck] = await Promise.all([
    checkRateLimit(
      `password_reset:ip:${ip}`,
      RESET_IP_LIMIT,
      RESET_WINDOW_SECONDS,
    ),
    checkRateLimit(
      `password_reset:account:${email.toLowerCase()}`,
      RESET_ACCOUNT_LIMIT,
      RESET_WINDOW_SECONDS,
    ),
  ]);
  if (!ipCheck.allowed || !accountCheck.allowed) {
    return { error: "Too many attempts. Try again later." };
  }

  const origin = requestHeaders.get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  // A real failure here (malformed email, Supabase's own rate limit)
  // is still shown -- only "does this email have an account" is masked,
  // which is what resetPasswordForEmail's own success-either-way
  // behavior already guarantees at the API level.
  if (error) {
    return { error: friendlyAuthError(error) };
  }

  return {
    message: "If that email has an account, we've sent a reset link.",
  };
}
