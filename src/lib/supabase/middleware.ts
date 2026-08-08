import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/types/database";

// Routes unauthenticated visitors may reach; everything else is gated.
const AUTH_ROUTES = ["/login", "/signup"];
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

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  const hasProfile = profile !== null;

  if (AUTH_ROUTES.includes(pathname)) {
    return redirectTo(hasProfile ? "/dashboard" : "/onboarding");
  }

  if (pathname === "/onboarding") {
    return hasProfile ? redirectTo("/dashboard") : response;
  }

  return hasProfile ? response : redirectTo("/onboarding");
}
