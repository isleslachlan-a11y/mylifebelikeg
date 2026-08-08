import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Exchanges the PKCE code from an email confirmation / magic link for a
// session, then hands off to "/" — it already knows whether to send the
// user to onboarding or the dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
