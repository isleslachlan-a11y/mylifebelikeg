import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/dates";
import type { Database } from "@/types/database";
import { LedgerFilters } from "./ledger-filters";
import { LedgerList, type LedgerRowData } from "./ledger-list";

type LedgerKind = Database["public"]["Enums"]["ledger_kind"];

const LEDGER_KINDS: LedgerKind[] = ["contribution", "expense"];

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    goal?: string;
    pot?: string;
    type?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const {
    goal: goalParam,
    pot: potParam,
    type: typeParam,
    from: fromParam,
    to: toParam,
  } = await searchParams;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("base_currency, timezone")
    .eq("id", userId)
    .single();
  // Same class of bug P5.5's audit already fixed on AppLayout's own
  // profile fetch: a real failure here used to silently fall back to
  // "AUD"/UTC and mislabel real money on this page instead of
  // surfacing. This route is reached post-onboarding, so any error at
  // all here is unexpected — thrown, not swallowed.
  if (profileError) {
    throw new Error(profileError.message);
  }
  const baseCurrency = profile?.base_currency ?? "AUD";
  const today = todayInZone(profile?.timezone ?? "UTC", new Date());

  // Filter/picker options: goals this user owns or participates in
  // (mirrors goals/page.tsx's owned + shared query pair, relying on
  // goals_select's RLS — owner OR active participant — as the actual
  // gate rather than re-deriving the same answer from goal_participants)
  // plus this viewer's own pots only, since another participant's pots
  // stay exactly as private as P2.0 promised regardless of a shared goal.
  const [
    { data: ownedGoals, error: ownedGoalsError },
    { data: sharedGoals, error: sharedGoalsError },
    { data: pots, error: potsError },
  ] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, currency, funding")
      .eq("owner_id", userId)
      .is("deleted_at", null),
    supabase
      .from("goals")
      .select("id, title, currency, funding")
      .neq("owner_id", userId)
      .is("deleted_at", null),
    supabase
      .from("pots")
      .select("id, name, currency, is_default")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  if (ownedGoalsError || sharedGoalsError) {
    throw new Error(
      (ownedGoalsError ?? sharedGoalsError)?.message ?? "Failed to load goals.",
    );
  }
  if (potsError) {
    throw new Error(potsError.message);
  }

  const goalOptions = [...(ownedGoals ?? []), ...(sharedGoals ?? [])].sort(
    (a, b) => a.title.localeCompare(b.title),
  );
  const goalTitleById = new Map(goalOptions.map((g) => [g.id, g.title]));
  const potOptions = pots ?? [];
  const potNameById = new Map(potOptions.map((p) => [p.id, p.name]));

  // P5.5: distinguishes "nothing here yet" from "nothing matches these
  // filters" — LedgerList used to say the latter unconditionally, which
  // misdirects a brand-new account with zero entries toward adjusting
  // filters that were never touched.
  const hasActiveFilters = Boolean(
    goalParam || potParam || typeParam || fromParam || toParam,
  );

  let query = supabase
    .from("ledger_entries")
    .select("*")
    .is("deleted_at", null);

  if (goalParam === "none") {
    query = query.is("goal_id", null);
  } else if (goalParam && goalParam !== "all") {
    query = query.eq("goal_id", goalParam);
  }
  if (potParam === "none") {
    query = query.is("pot_id", null);
  } else if (potParam && potParam !== "all") {
    query = query.eq("pot_id", potParam);
  }
  if (typeParam && LEDGER_KINDS.includes(typeParam as LedgerKind)) {
    query = query.eq("entry_type", typeParam as LedgerKind);
  }
  if (fromParam) {
    query = query.gte("occurred_on", fromParam);
  }
  if (toParam) {
    query = query.lte("occurred_on", toParam);
  }

  const { data: entries, error: entriesError } = await query
    // Ascending, so the running total below accumulates in the order
    // money actually moved — reversed for display afterwards.
    .order("occurred_on", { ascending: true })
    .order("created_at", { ascending: true });

  if (entriesError) {
    throw new Error(entriesError.message);
  }

  // Running total in base_amount_minor (already converted and frozen by
  // the insert trigger — see actions.ts's top comment) — plain addition
  // over a single, common currency, never an FX computation performed
  // here. reduce(), not a mutated `let` in a .map() — the latter trips
  // the react-hooks immutability lint even in a server component with no
  // actual re-render concern, but the functional form is no less clear.
  const rows: LedgerRowData[] = (entries ?? []).reduce<LedgerRowData[]>(
    (acc, entry) => {
      const previousTotal = acc.at(-1)?.runningTotalMinor ?? 0;
      const runningTotalMinor =
        previousTotal +
        (entry.entry_type === "expense"
          ? -entry.base_amount_minor
          : entry.base_amount_minor);
      acc.push({
        entry,
        runningTotalMinor,
        goalTitle: entry.goal_id
          ? (goalTitleById.get(entry.goal_id) ?? null)
          : null,
        potName: entry.pot_id ? (potNameById.get(entry.pot_id) ?? null) : null,
      });
      return acc;
    },
    [],
  );
  rows.reverse();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Ledger</h1>
        <p className="text-muted-foreground text-sm">
          Every contribution and expense. Running total is in {baseCurrency},
          your base currency — each entry keeps its own original amount and
          currency alongside it.
        </p>
      </div>

      <LedgerFilters
        goalOptions={goalOptions.map((g) => ({ id: g.id, title: g.title }))}
        potOptions={potOptions.map((p) => ({ id: p.id, name: p.name }))}
      />

      <LedgerList
        initialRows={rows}
        goalOptions={goalOptions}
        pots={potOptions}
        defaultCurrency={baseCurrency}
        today={today}
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
}
