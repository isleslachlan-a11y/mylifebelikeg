import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

// Never statically optimized/cached — every hit must actually call the
// rates provider and write fresh rows, not serve a stale cached response.
export const dynamic = "force-dynamic";

type ServiceClient = ReturnType<typeof createServiceClient>;
type FxRateInsert = Database["public"]["Tables"]["fx_rates"]["Insert"];

const SOURCE = "exchangerate-api";

/**
 * Either a cron-style shared secret (for an external scheduler — this
 * repo deliberately has no vercel.json, see CLAUDE.md, so there's no
 * built-in Vercel Cron secret to piggyback on) or a normal signed-in
 * session (for the "Refresh rates" button on /money/fx). fx_rates is
 * shared, non-sensitive reference data with no per-user ownership, so
 * "any authenticated user" is an appropriate bar here — this isn't an
 * admin-only action, just not a fully public one (an anonymous caller
 * shouldn't be able to spend the API quota / write rows on demand).
 */
async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.FX_REFRESH_CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  return auth != null;
}

/**
 * Every currency actually in use, app-wide — "distinct currencies across
 * pots, goals, cashflow items and ledger entries" (P2.2 brief), plus
 * every profile's base_currency (the conversion target every other
 * figure in the app ultimately reads toward).
 *
 * Necessarily cross-user: "which currencies does the app need rates for"
 * is a system-level question no single user's RLS-scoped session could
 * answer, so this reads via the service client. It only ever reads the
 * `currency`/`base_currency` columns themselves (3-letter codes) — never
 * amounts, labels, or anything else — so pots stay exactly as private as
 * P2.0 promised; nothing here exposes what's inside anyone's pot, only
 * that some pot somewhere uses, say, JPY.
 */
async function collectCurrenciesInUse(
  service: ServiceClient,
): Promise<{ currencies: Set<string>; readErrors: string[] }> {
  const [pots, goals, cashflow, ledger, profiles] = await Promise.all([
    service.from("pots").select("currency").is("deleted_at", null),
    service.from("goals").select("currency").is("deleted_at", null),
    service.from("cashflow_items").select("currency").is("deleted_at", null),
    service.from("ledger_entries").select("currency").is("deleted_at", null),
    service.from("profiles").select("base_currency"),
  ]);

  const readErrors: string[] = [];
  const currencies = new Set<string>();

  for (const [name, result] of [
    ["pots", pots],
    ["goals", goals],
    ["cashflow_items", cashflow],
    ["ledger_entries", ledger],
  ] as const) {
    if (result.error) {
      readErrors.push(`${name}: ${result.error.message}`);
      continue;
    }
    for (const row of result.data ?? []) {
      currencies.add(row.currency);
    }
  }

  if (profiles.error) {
    readErrors.push(`profiles: ${profiles.error.message}`);
  } else {
    for (const row of profiles.data ?? []) {
      currencies.add(row.base_currency);
    }
  }

  return { currencies, readErrors };
}

type ExchangeRateApiResponse = {
  result: "success" | "error";
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
};

/** One call per base currency returns rates to every other currency at once — N calls for N currencies, not N² for every pair. */
async function fetchRatesForBase(
  base: string,
  apiKey: string,
): Promise<Record<string, number>> {
  const res = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`,
    { cache: "no-store" },
  );
  const body = (await res.json()) as ExchangeRateApiResponse;

  if (!res.ok || body.result !== "success" || !body.conversion_rates) {
    throw new Error(
      `exchangerate-api request for base ${base} failed: ${
        body["error-type"] ?? res.statusText
      }`,
    );
  }
  return body.conversion_rates;
}

async function handleRefresh(request: Request): Promise<NextResponse> {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    console.error("EXCHANGE_RATE_API_KEY is not configured.");
    return NextResponse.json(
      { error: "Rates provider isn't configured." },
      { status: 500 },
    );
  }

  const service = createServiceClient();
  const { currencies, readErrors } = await collectCurrenciesInUse(service);

  if (currencies.size < 2) {
    return NextResponse.json({
      ok: true,
      pairsUpserted: 0,
      message: "Fewer than two currencies in use — nothing to refresh.",
      readErrors,
    });
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const rows: FxRateInsert[] = [];
  const fetchFailures: string[] = [];

  for (const base of currencies) {
    try {
      const rates = await fetchRatesForBase(base, apiKey);
      for (const quote of currencies) {
        if (quote === base) continue;
        const rate = rates[quote];
        if (typeof rate !== "number") {
          fetchFailures.push(`${base}->${quote}: not returned by provider`);
          continue;
        }
        rows.push({
          base_currency: base,
          quote_currency: quote,
          rate,
          as_of: asOf,
          source: SOURCE,
        });
      }
    } catch (error) {
      console.error(`FX refresh failed for base ${base}`, error);
      fetchFailures.push(
        `${base}: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No rates could be fetched.", fetchFailures, readErrors },
      { status: 502 },
    );
  }

  // Assumption, not verified: fx_rates has a unique constraint on
  // exactly (base_currency, quote_currency, as_of) — no migration files
  // are committed to this repo to check against (see CLAUDE.md's
  // Database section). This is the natural key the P2.2 brief's "upserts
  // them for today" implies must exist; if the real constraint differs,
  // this call errors with a clear Postgres message rather than silently
  // inserting duplicates, so it fails loud, not quiet.
  const { error: upsertError } = await service
    .from("fx_rates")
    .upsert(rows, { onConflict: "base_currency,quote_currency,as_of" });

  if (upsertError) {
    console.error("Failed to upsert fx_rates", upsertError);
    return NextResponse.json(
      { error: "Failed to save fetched rates.", detail: upsertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pairsUpserted: rows.length,
    currenciesChecked: [...currencies],
    fetchFailures,
    readErrors,
  });
}

// Both methods run the same logic: POST for the in-app "Refresh rates"
// button and any scheduler that supports it; GET for external cron
// services that only know how to hit a URL on a timer (this repo has no
// vercel.json/Vercel Cron wired up — see CLAUDE.md — so there's no single
// expected trigger mechanism to assume).
export async function POST(request: Request): Promise<NextResponse> {
  return handleRefresh(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleRefresh(request);
}
