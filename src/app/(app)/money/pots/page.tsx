import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PotManager } from "./pot-manager";

export default async function PotsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: pots, error: potsError },
    { data: balances, error: balancesError },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("pots")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("v_pot_balances")
      .select("pot_id, balance_minor")
      .eq("user_id", userId),
    supabase.from("profiles").select("base_currency").eq("id", userId).single(),
  ]);

  if (potsError || !pots) {
    throw new Error(potsError?.message ?? "Failed to load pots.");
  }
  if (balancesError) {
    throw new Error(balancesError.message);
  }

  const balanceByPot = new Map(
    (balances ?? []).map((b) => [b.pot_id, b.balance_minor]),
  );

  const potsWithBalance = pots.map((pot) => ({
    ...pot,
    // v_pot_balances subtracts ledger_entries from opening_balance_minor
    // via a LEFT JOIN aggregate, so a pot with no entries yet can come
    // back with a null balance_minor rather than 0 — fall back to the
    // opening balance itself (mathematically identical to "no entries to
    // subtract"), not to computing anything new. See CLAUDE.md rule: never
    // compute a balance in application code.
    balanceMinor: balanceByPot.get(pot.id) ?? pot.opening_balance_minor,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Pots</h1>
        <p className="text-muted-foreground text-sm">
          Private savings containers. These are never visible to anyone else —
          even on a shared goal, only your pledge amount is shared, never the
          pot itself.
        </p>
      </div>
      <PotManager
        initialPots={potsWithBalance}
        defaultCurrency={profile?.base_currency ?? "AUD"}
      />
    </div>
  );
}
