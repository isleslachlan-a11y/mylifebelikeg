import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

// Routes unauthenticated visitors may reach; everything else is gated.
// /reset-password included deliberately: on the very first load of a
// password-recovery link (`?code=...`), the session cookie this check
// reads doesn't exist yet — the client-side code exchange that
// establishes it (reset-password-form.tsx) hasn't run at that point,
// since it happens in the browser, after this middleware has already
// let the request through. Gating this route would redirect that first
// load to /login before the exchange ever gets a chance to run.
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];
// "/" is deliberately not gated here — it does its own three-way
// auth/profile branch (see src/app/page.tsx) rather than duplicating it.
const UNGATED_ROUTES = ["/", "/auth/callback"];

/**
 * Refreshes the Supabase session and enforces auth/onboarding routing on
 * every matched request. Called from the project-root `proxy.ts` (Next.js
 * 16 renamed the `middleware.ts` convention to `proxy.ts` — a file by the
 * old name is silently never invoked, no error or warning).
 *
 * Must call `getClaims()` (or `getUser()`/`getSession()`) before returning —
 * that's what actually triggers the refresh. Don't add logic between
 * `createServerClient` and that call, and don't remove the call itself:
 * either mistake causes random logouts, per the `@supabase/ssr` docs.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims()'s own documented error path (a revoked/expired refresh
  // token, an invalid signature) already resolves to `{ data: null,
  // error }` -- `userId` falling through to `undefined` below already
  // handles that gracefully, same as an anonymous visitor. What isn't
  // covered by that is the rarer case where the call genuinely throws
  // instead of returning an error result -- a malformed/corrupted
  // session cookie failing JWT decode, or a JWKS/crypto failure while
  // verifying an asymmetric-signed token (confirmed against the SDK's
  // own source: it only catches and returns known AuthError subclasses,
  // anything else is rethrown). Left unguarded, that would surface as a
  // hard middleware error instead of "redirect to login rather than
  // erroring" (the explicit ask here) -- caught and treated exactly
  // like "no session" below. Deliberately the opposite failure
  // direction from the profileError handling further down this
  // function: a broken *profile* lookup fails open (lets the request
  // through) since profiles data isn't a security boundary, but a
  // broken *auth* check must fail closed, since treating a session we
  // couldn't actually verify as valid would be the real hole.
  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims.sub;
  } catch (error) {
    console.error("proxy: getClaims threw, treating as unauthenticated", error);
  }
  const { pathname } = request.nextUrl;

  if (UNGATED_ROUTES.includes(pathname)) {
    return response;
  }

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!userId) {
    // Unauthenticated: only /login and /signup are reachable.
    return AUTH_ROUTES.includes(pathname) ? response : redirectTo("/login");
  }

  // Authenticated from here on. A profile is required for every route
  // except /onboarding itself — new sign-ups have an auth.users row but no
  // profiles row yet, and almost everything (RLS, foreign keys) runs
  // through profiles.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  // maybeSingle() only sets error for a genuine query failure — a real
  // "no profile row yet" is data: null, error: null, so this can't be
  // mistaken for that case. A transient failure here used to look
  // identical to "new user," bouncing an already-onboarded person into
  // /onboarding on literally every request until it cleared (P5.5's
  // Supabase-call audit — this file runs on every request, so it's the
  // highest-blast-radius instance of the bug). Middleware can't render
  // an error boundary, so it fails open instead: let the request
  // through as if the profile exists, and let the destination page's
  // own layout.tsx (which now throws on the same kind of error) surface
  // it honestly if the failure persists.
  if (profileError) {
    console.error("proxy: profile lookup failed", profileError);
    return response;
  }
  const hasProfile = profile !== null;

  if (AUTH_ROUTES.includes(pathname)) {
    return redirectTo(hasProfile ? "/dashboard" : "/onboarding");
  }

  if (pathname === "/onboarding") {
    return hasProfile ? redirectTo("/dashboard") : response;
  }

  return hasProfile ? response : redirectTo("/onboarding");
}
