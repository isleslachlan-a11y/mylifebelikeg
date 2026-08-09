import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { formatDate, todayInZone, toGoalOffset } from "@/lib/dates";
import type { Database } from "@/types/database";
import { ManualRateForm } from "./rate-form";
import { RefreshRatesButton } from "./refresh-button";

type FxRateRow = Pick<
  Database["public"]["Tables"]["fx_rates"]["Row"],
  "base_currency" | "quote_currency" | "rate" | "as_of" | "source"
>;

const STALE_AFTER_DAYS = 7;

/** Latest as_of in either direction — app.fx_rate() itself falls back to the inverse pair, so staleness should respect that same fallback rather than flag a pair as stale when its inverse is fresh. */
function latestAsOf(rates: FxRateRow[], a: string, b: string): string | null {
  let latest: string | null = null;
  for (const r of rates) {
    const matches =
      (r.base_currency === a && r.quote_currency === b) ||
      (r.base_currency === b && r.quote_currency === a);
    if (matches && (latest === null || r.as_of > latest)) {
      latest = r.as_of;
    }
  }
  return latest;
}

export default async function FxPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile },
    { data: pots, error: potsError },
    { data: goals, error: goalsError },
    { data: cashflow, error: cashflowError },
    { data: ledger, error: ledgerError },
    { data: rates, error: ratesError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("base_currency, timezone")
      .eq("id", userId)
      .single(),
    supabase
      .from("pots")
      .select("currency")
      .eq("user_id", userId)
      .is("deleted_at", null),
    supabase
      .from("goals")
      .select("currency")
      .eq("owner_id", userId)
      .is("deleted_at", null),
    supabase
      .from("cashflow_items")
      .select("currency")
      .eq("user_id", userId)
      .is("deleted_at", null),
    supabase
      .from("ledger_entries")
      .select("currency")
      .eq("user_id", userId)
      .is("deleted_at", null),
    // Shared reference data, not owned by anyone — every pair, every
    // user reads the same rows. Small table; reduced to "latest per
    // pair" here in JS rather than queried per-pair.
    supabase
      .from("fx_rates")
      .select("base_currency, quote_currency, rate, as_of, source")
      .order("as_of", { ascending: false }),
  ]);

  for (const [name, error] of [
    ["pots", potsError],
    ["goals", goalsError],
    ["cashflow_items", cashflowError],
    ["ledger_entries", ledgerError],
    ["fx_rates", ratesError],
  ] as const) {
    if (error) {
      throw new Error(`Failed to load ${name}: ${error.message}`);
    }
  }

  const baseCurrency = profile?.base_currency ?? "AUD";
  const today = todayInZone(profile?.timezone ?? "UTC", new Date());

  const currenciesInUse = new Set<string>();
  for (const row of pots ?? []) currenciesInUse.add(row.currency);
  for (const row of goals ?? []) currenciesInUse.add(row.currency);
  for (const row of cashflow ?? []) currenciesInUse.add(row.currency);
  for (const row of ledger ?? []) currenciesInUse.add(row.currency);
  currenciesInUse.delete(baseCurrency);

  const allRates = rates ?? [];

  const staleness = [...currenciesInUse]
    .map((currency) => ({
      currency,
      latest: latestAsOf(allRates, currency, baseCurrency),
    }))
    .map(({ currency, latest }) => ({
      currency,
      latest,
      daysOld: latest === null ? null : toGoalOffset(today, latest),
    }))
    .filter(({ daysOld }) => daysOld === null || daysOld > STALE_AFTER_DAYS)
    .sort((a, b) => a.currency.localeCompare(b.currency));

  // Latest row per (base, quote) pair — allRates is already newest-first.
  const latestByPair = new Map<string, FxRateRow>();
  for (const r of allRates) {
    const key = `${r.base_currency}-${r.quote_currency}`;
    if (!latestByPair.has(key)) {
      latestByPair.set(key, r);
    }
  }
  const latestRows = [...latestByPair.values()].sort((a, b) =>
    `${a.base_currency}${a.quote_currency}`.localeCompare(
      `${b.base_currency}${b.quote_currency}`,
    ),
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Exchange rates</h1>
        <p className="text-muted-foreground text-sm">
          Rates behind every currency conversion in the app. Refresh pulls
          current rates for every currency pair actually in use; pin a rate by
          hand for a pair the API doesn&rsquo;t cover, or to lock in a
          historical value.
        </p>
      </div>

      <RefreshRatesButton />

      {staleness.length > 0 && (
        <div className="border-destructive/30 bg-destructive/10 flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <p className="text-destructive font-medium">
            {staleness.length} currenc{staleness.length === 1 ? "y" : "ies"} you
            use {staleness.length === 1 ? "has" : "have"} a stale rate:
          </p>
          <ul className="list-inside list-disc">
            {staleness.map(({ currency, latest, daysOld }) => (
              <li key={currency}>
                {currency} / {baseCurrency} —{" "}
                {latest === null
                  ? "no rate on file"
                  : `last updated ${formatDate(latest, "UTC")} (${daysOld} days ago)`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Add or pin a rate</h2>
        <ManualRateForm today={today} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Known rates</h2>
        {latestRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rates on file yet — refresh, or add one below.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="py-1 pr-4 font-normal">Pair</th>
                  <th className="py-1 pr-4 font-normal">Rate</th>
                  <th className="py-1 pr-4 font-normal">As of</th>
                  <th className="py-1 font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.map((r) => (
                  <tr
                    key={`${r.base_currency}-${r.quote_currency}`}
                    className="border-foreground/10 border-t"
                  >
                    <td className="py-1.5 pr-4">
                      {r.base_currency} → {r.quote_currency}
                    </td>
                    <td className="py-1.5 pr-4">{r.rate}</td>
                    <td className="py-1.5 pr-4">
                      {formatDate(r.as_of, "UTC")}
                    </td>
                    <td className="text-muted-foreground py-1.5">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
