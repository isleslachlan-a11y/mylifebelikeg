import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

/**
 * Supabase client for server components and route handlers. Create a new
 * one per request — never module-scope or reuse this across requests.
 *
 * `setAll` is wrapped in try/catch: Server Components can't write cookies
 * (Next.js throws), so a session refresh triggered from one is silently
 * dropped there. That's fine as long as `middleware.ts` also refreshes the
 * session on every request — it's the one place writes always succeed.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — no-op, middleware covers it.
          }
        },
      },
    },
  );
}
