import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { getClientIp } from "@/lib/get-client-ip";
import { checkEdgeWriteLimit, isWriteMethod } from "@/lib/rate-limit-edge";

/**
 * P9.2: the coarse write-throttle (rate-limit-edge.ts's own header has
 * the full reasoning) runs first, before touching Supabase at all --
 * refusing here is strictly cheaper than refusing after a session
 * refresh, and there's no reason a request about to be rejected should
 * pay for one anyway.
 */
export async function proxy(request: NextRequest) {
  if (isWriteMethod(request.method)) {
    const ip = getClientIp(request.headers);
    if (!checkEdgeWriteLimit(ip)) {
      return new NextResponse("Too many requests.", { status: 429 });
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every request except static assets and image optimisation
     * files, so the session cookie stays fresh without doing the work
     * (or the auth calls) on requests that can't use it anyway.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
