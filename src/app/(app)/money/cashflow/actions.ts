"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/errors";
import type { Database } from "@/types/database";

type CashflowItem = Database["public"]["Tables"]["cashflow_items"]["Row"];
type CashflowKind = Database["public"]["Enums"]["cashflow_kind"];
type Cadence = Database["public"]["Enums"]["cadence"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };

const PATH = "/money/cashflow";
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Every action below runs from an already-gated (app) route, so a missing
// session here means it expired mid-use, not a first visit — send back to
// /login the same way proxy.ts would, rather than surfacing a form error.
async function getUserId(supabase: SupabaseServerClient): Promise<string> {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  return auth.claims.sub;
}

export type CashflowItemInput = {
  kind: CashflowKind;
  label: string;
  amountMinor: number;
  currency: string;
  frequency: Cadence;
  activeFrom: string;
};

function validateInput(input: CashflowItemInput): string | null {
  if (!input.label.trim()) {
    return "Label can't be empty.";
  }
  if (!CURRENCY_RE.test(input.currency)) {
    return "Currency must be a 3-letter code.";
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!DATE_RE.test(input.activeFrom)) {
    return "Enter a valid start date.";
  }
  return null;
}

export async function createCashflowItem(
  input: CashflowItemInput,
): Promise<ActionResult<CashflowItem>> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("cashflow_items")
    .insert({
      user_id: userId,
      kind: input.kind,
      label: input.label.trim(),
      amount_minor: input.amountMinor,
      currency: input.currency,
      frequency: input.frequency,
      active_from: input.activeFrom,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }

  revalidatePath(PATH);
  return { ok: true, data };
}

export async function updateCashflowItem(
  id: string,
  input: CashflowItemInput,
): Promise<ActionResult> {
  const validationError = validateInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("cashflow_items")
    .update({
      label: input.label.trim(),
      amount_minor: input.amountMinor,
      currency: input.currency,
      frequency: input.frequency,
      active_from: input.activeFrom,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That item couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

/**
 * "End-date it, don't delete it" (P2.1 brief) — kept deliberately separate
 * from updateCashflowItem so ending a recurring item is a distinct,
 * intentional action rather than a field that happens to be editable
 * alongside label/amount/frequency. The row (and its history) survives;
 * v_monthly_cashflow simply stops counting it once active_to is in the past.
 */
export async function endCashflowItem(
  id: string,
  activeTo: string,
): Promise<ActionResult> {
  if (!DATE_RE.test(activeTo)) {
    return { ok: false, error: "Enter a valid end date." };
  }

  const supabase = await createClient();
  const userId = await getUserId(supabase);

  const { data, error } = await supabase
    .from("cashflow_items")
    .update({ active_to: activeTo })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That item couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}

export async function deleteCashflowItem(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getUserId(supabase);

  // Soft delete, for removing a mistaken/duplicate entry outright — not
  // the "this recurring item stopped" case, which is endCashflowItem's job.
  const { data, error } = await supabase
    .from("cashflow_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: humanizeDbError(error) };
  }
  if (!data) {
    return { ok: false, error: "That item couldn't be found." };
  }

  revalidatePath(PATH);
  return { ok: true, data: undefined };
}
