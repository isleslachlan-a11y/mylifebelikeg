import type { AuthError } from "@supabase/supabase-js";

/**
 * Maps a Supabase auth error to copy safe to show a user. Never surface
 * `error.message` directly — it's written for developers, not end users.
 */
export function friendlyAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email or password isn't right.";
    case "email_not_confirmed":
      return "Confirm your email before signing in — check your inbox.";
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Try signing in instead.";
    case "weak_password":
      return "Choose a stronger password (at least 6 characters).";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts — wait a moment and try again.";
    case "email_address_invalid":
      return "That doesn't look like a valid email address.";
    case "same_password":
      return "That's already your password — choose a different one.";
    // otp_expired: a used or stale recovery/confirmation link.
    // bad_code_verifier: the PKCE code didn't match (usually the same
    // underlying cause — a link opened a second time, or in a
    // different browser than the one that requested it).
    case "otp_expired":
    case "bad_code_verifier":
      return "This link has expired or already been used. Request a new one.";
    default:
      return "Something went wrong. Please try again.";
  }
}
