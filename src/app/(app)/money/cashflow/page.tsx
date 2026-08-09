import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/dates";
import { CapacityCard } from "./capacity-card";
import { CashflowManager } from "./cashflow-manager";

export default async function CashflowPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: items, error: itemsError },
    { data: capacity, error: capacityError },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("cashflow_items")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("label", { ascending: true }),
    // v_monthly_cashflow (migration 0009) — the only source for these
    // three figures, computed together so income - expense = capacity by
    // construction. Never recomputed here (CLAUDE.md: "weekly is 52/12
    // months, not 4, and that error compounds").
    supabase
      .from("v_monthly_cashflow")
      .select(
        "base_currency, income_monthly_minor, expense_monthly_minor, monthly_capacity_minor",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("base_currency, timezone")
      .eq("id", userId)
      .single(),
  ]);

  if (itemsError || !items) {
    throw new Error(itemsError?.message ?? "Failed to load cashflow items.");
  }
  if (capacityError) {
    throw new Error(capacityError.message);
  }

  const baseCurrency = profile?.base_currency ?? "AUD";
  const today = todayInZone(profile?.timezone ?? "UTC", new Date());

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Cashflow</h1>
        <p className="text-muted-foreground text-sm">
          Recurring income and expenses. Every figure below normalises to a
          monthly amount for you — weekly and fortnightly items aren&rsquo;t
          just multiplied by 4.
        </p>
      </div>

      <CapacityCard
        // No row at all means no active cashflow items yet — zero on all
        // three, not an error state (matches the nullable-aggregate
        // fallback pattern used for v_user_capacity elsewhere).
        incomeMonthlyMinor={capacity?.income_monthly_minor ?? 0}
        expenseMonthlyMinor={capacity?.expense_monthly_minor ?? 0}
        capacityMinor={capacity?.monthly_capacity_minor ?? 0}
        currency={capacity?.base_currency ?? baseCurrency}
      />

      <CashflowManager
        initialItems={items}
        defaultCurrency={baseCurrency}
        today={today}
      />
    </div>
  );
}
