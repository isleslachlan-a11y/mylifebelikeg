import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 * Server-only. `SUPABASE_SERVICE_ROLE_KEY` must never reach a Client
 * Component or a `NEXT_PUBLIC_*` name (see DEPLOYMENT.md).
 *
 * This is NOT the "the query returns nothing, bypass RLS to make it work"
 * move CLAUDE.md rule 3 forbids. It exists for the narrow set of tables
 * that have no RLS INSERT policy *by design* — e.g. `llama_messages`,
 * where users can SELECT/UPDATE their own rows but the schema gives them
 * no way to INSERT one themselves, because messages are meant to be
 * system-authored, not user-authored. If a query against a table the user
 * IS meant to write to comes back empty, the policy is still the thing to
 * inspect, not this client.
 *
 * Create a new instance per call, same as `server.ts` and `client.ts`.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
