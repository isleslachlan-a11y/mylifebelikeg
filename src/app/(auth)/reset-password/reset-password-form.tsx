"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { friendlyAuthError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = "exchanging" | "ready" | "linkError" | "submitting" | "done";

/**
 * The code exchange happens here, client-side, via the browser Supabase
 * client — not the shared `/auth/callback` route handler every other
 * PKCE flow (email confirmation, magic link) in this app goes through.
 * Deliberately: `exchangeCodeForSession` writes the session by setting
 * cookies, and a Server Component (which is what would render first if
 * this page did the exchange server-side before showing anything) can't
 * write cookies at all (CLAUDE.md's own documented Supabase-clients
 * gotcha — `server.ts`'s `setAll` silently no-ops there). Doing it here
 * instead means the exchange, the cookie write, and the page that needs
 * the resulting session are all in the same client-side lifecycle, no
 * server round trip required to get from "clicked the email link" to
 * "have a session."
 *
 * `middleware.ts`'s `AUTH_ROUTES` includes `/reset-password` for exactly
 * this reason too: the *first* request for this page (with `?code=` and
 * no session cookie yet) has to be let through unauthenticated, since
 * the exchange that would establish a session hasn't run yet at that
 * point — it can't have, it's this component's own effect.
 */
const MISSING_CODE_MESSAGE =
  "This link is missing its code — open the link from your email again.";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once, at the first render, rather than inside the effect below
  // -- "no code in the URL" is knowable synchronously during render, so
  // it belongs in the initial state, not a setState call fired from
  // the effect body (React's own lint rule flags that shape as a
  // needless extra render cycle; the effect below is left to do only
  // the one thing that's genuinely asynchronous, the code exchange).
  const code = searchParams.get("code");
  const [stage, setStage] = useState<Stage>(code ? "exchanging" : "linkError");
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(
    code ? null : MISSING_CODE_MESSAGE,
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const supabase = createClient();
    let cancelled = false;
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (cancelled) return;
      if (error) {
        setLinkErrorMessage(friendlyAuthError(error));
        setStage("linkError");
        return;
      }
      setStage("ready");
    });
    return () => {
      cancelled = true;
    };
    // Intentionally keyed on `code` alone, not `searchParams` itself --
    // re-running on every searchParams identity change would re-exchange
    // an already-used code, which Supabase refuses the second time (a
    // used code isn't reusable).
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 6) {
      setSubmitError("Choose a password with at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Those passwords don't match.");
      return;
    }

    setStage("submitting");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSubmitError(friendlyAuthError(error));
      setStage("ready");
      return;
    }

    // Sign out of the recovery session deliberately -- the new password
    // is what should get someone back in, not the link they just used.
    // Same "don't leave an ambiguous elevated-trust session lying
    // around longer than necessary" instinct P9.1's account-deletion
    // flow already follows for a different reason.
    await supabase.auth.signOut();
    setStage("done");
    router.push("/login?passwordReset=1");
  }

  if (stage === "exchanging") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Confirming your link…
      </p>
    );
  }

  if (stage === "linkError") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-rag-red text-sm">
          {linkErrorMessage}
        </p>
        <Button asChild>
          <a href="/forgot-password">Request a new link</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {submitError && (
        <p role="alert" className="text-rag-red text-sm">
          {submitError}
        </p>
      )}
      <Button type="submit" disabled={stage === "submitting"} className="mt-2">
        {stage === "submitting" ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
