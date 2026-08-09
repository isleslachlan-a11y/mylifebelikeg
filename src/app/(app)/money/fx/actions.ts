"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";

type FxRate = Database["public"]["Tables"]["fx_rates"]["Row"];

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const PATH = "/money/fx";
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ManualFxRateInput = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  asOf: string;
};

/**
 * fx_rates has no user-facing INSERT policy — like llama_messages, it's
 * system-authored data, not user-authored (any signed-in user freely
 * writing rates would let one user's typo corrupt everyone else's
 * conversions). This action is the sanctioned path: it requires a real
 * session first, then writes via the service client — the same shape as
 * emitLlamaMessage, just for a pin-a-rate action instead of a
 * system-triggered notification. See src/lib/supabase/service.ts's own
 * comment for why this isn't the "bypass RLS to make a query work" move
 * CLAUDE.md rule 3 forbids.
 */
export async function createManualRate(
  input: ManualFxRateInput,
): Promise<ActionResult<FxRate>> {
  const base = input.baseCurrency.toUpperCase();
  const quote = input.quoteCurrency.toUpperCase();

  if (!CURRENCY_RE.test(base) || !CURRENCY_RE.test(quote)) {
    return { ok: false, error: "Currency must be a 3-letter code." };
  }
  if (base === quote) {
    return { ok: false, error: "Pick two different currencies." };
  }
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return { ok: false, error: "Rate must be greater than zero." };
  }
  if (!DATE_RE.test(input.asOf)) {
    return { ok: false, error: "Enter a valid date." };
  }

  // Require a real session — this action is reachable by any signed-in
  // user, just not an anonymous caller — before touching the
  // service-role client at all.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("fx_rates")
    .upsert(
      {
        base_currency: base,
        quote_currency: quote,
        rate: input.rate,
        as_of: input.asOf,
        source: "manual",
      },
      { onConflict: "base_currency,quote_currency,as_of" },
    )
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data };
}
