"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";

import { AchievementCelebration } from "@/components/achievement-celebration";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
import type { Database } from "@/types/database";
import {
  createLedgerEntry,
  updateLedgerEntry,
  type LedgerEntryInput,
} from "./actions";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];
type LedgerKind = Database["public"]["Enums"]["ledger_kind"];
type FundingType = Database["public"]["Enums"]["funding_type"];

export type GoalOption = {
  id: string;
  title: string;
  currency: string;
  funding: FundingType;
};

export type PotOption = {
  id: string;
  name: string;
  currency: string;
  is_default: boolean;
};

/** save_toward goals are usually contributed to; spend_against goals are usually spent against; anything else has no obvious default. */
function defaultEntryType(funding: FundingType | undefined): LedgerKind {
  if (funding === "save_toward") return "contribution";
  return "expense";
}

const NO_GOAL = "__none__";
const NO_POT = "__none__";
const CURRENCY_RE = /^[A-Z]{3}$/;

export type LedgerDialogTarget =
  | { mode: "create"; goal: GoalOption | null }
  | { mode: "edit"; entry: LedgerEntry };

export function LedgerEntryDialog({
  target,
  onClose,
  onSaved,
  /** null = goal is fixed by the calling page (goal detail — no picker shown); an array = the /money/ledger "Add entry" case, including "No goal". */
  goalOptions,
  pots,
  defaultCurrency,
  today,
}: {
  target: LedgerDialogTarget | null;
  onClose: () => void;
  onSaved: (entry: LedgerEntry) => void;
  goalOptions: GoalOption[] | null;
  pots: PotOption[];
  defaultCurrency: string;
  today: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [missingRatePair, setMissingRatePair] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<NewlyUnlockedAchievement[]>([]);

  const [goalId, setGoalId] = useState<string>(NO_GOAL);
  const [entryType, setEntryType] = useState<LedgerKind>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [occurredOn, setOccurredOn] = useState(today);
  const [potId, setPotId] = useState<string>(NO_POT);
  const [description, setDescription] = useState("");

  const entry = target?.mode === "edit" ? target.entry : null;
  const fixedGoal = target?.mode === "create" ? target.goal : null;

  // Resync the draft whenever what's open changes — same "adjust state
  // during render off a changed identity" pattern used in
  // money/cashflow/cashflow-manager.tsx, so the form never flashes a
  // previous target's values for a frame.
  const targetKey = target
    ? target.mode === "edit"
      ? `edit:${target.entry.id}`
      : `create:${target.goal?.id ?? "none"}`
    : null;
  if (target && targetKey !== formKey) {
    setFormKey(targetKey);
    setError(null);
    setMissingRatePair(null);

    if (target.mode === "edit") {
      const e = target.entry;
      setGoalId(e.goal_id ?? NO_GOAL);
      setEntryType(e.entry_type);
      setAmount(formatMoney(e.amount_minor, e.currency));
      setCurrency(e.currency);
      setOccurredOn(e.occurred_on);
      setPotId(e.pot_id ?? NO_POT);
      setDescription(e.description ?? "");
    } else {
      const defaultPot = pots.find((p) => p.is_default);
      setGoalId(target.goal?.id ?? NO_GOAL);
      setEntryType(defaultEntryType(target.goal?.funding));
      setAmount("");
      setCurrency(target.goal?.currency ?? defaultCurrency);
      setOccurredOn(today);
      setPotId(defaultPot?.id ?? NO_POT);
      setDescription("");
    }
  }

  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, defaultCurrency, currency]),
  );

  function handleGoalChange(value: string) {
    setGoalId(value);
    if (!goalOptions) return;
    const selected = goalOptions.find((g) => g.id === value);
    setCurrency(selected?.currency ?? defaultCurrency);
    setEntryType(defaultEntryType(selected?.funding));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMissingRatePair(null);

    if (!CURRENCY_RE.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }
    if (!occurredOn) {
      setError("Enter a date.");
      return;
    }

    let amountMinor: number;
    try {
      amountMinor = parseMoney(amount, currency);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (amountMinor <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    const input: LedgerEntryInput = {
      goalId: goalId === NO_GOAL ? null : goalId,
      potId: potId === NO_POT ? null : potId,
      entryType,
      amountMinor,
      currency,
      occurredOn,
      description: description.trim() || null,
    };

    startTransition(async () => {
      const result = entry
        ? await updateLedgerEntry(entry.id, input)
        : await createLedgerEntry(input);

      if (!result.ok) {
        setError(result.error);
        setMissingRatePair(result.missingRatePair ?? null);
        return;
      }
      // updateLedgerEntry's own unlockedAchievements is always empty
      // (an edit never evaluates achievements — see actions.ts), so this
      // is safe regardless of which branch of the ternary above ran.
      if (result.data.unlockedAchievements.length > 0) {
        setUnlocked(result.data.unlockedAchievements);
      }
      onSaved(result.data);
    });
  }

  return (
    <>
      {/* Outside <Dialog>, not inside <DialogContent>: onSaved's caller
          closes the dialog immediately on success (setDialogTarget(null)
          in ledger-section.tsx), which would unmount this along with the
          rest of the dialog's content if it were nested inside. */}
      <AchievementCelebration unlocked={unlocked} />
      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {entry
                  ? "Edit entry"
                  : fixedGoal
                    ? `Log against ${fixedGoal.title}`
                    : "Add entry"}
              </DialogTitle>
            </DialogHeader>

            {error && (
              <div
                role="alert"
                className="text-destructive flex flex-col gap-1 text-sm"
              >
                <p>{error}</p>
                {missingRatePair && (
                  <Link
                    href="/money/fx"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Add a {missingRatePair.from} → {missingRatePair.to} rate
                  </Link>
                )}
              </div>
            )}

            {goalOptions && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ledger-goal">Goal</Label>
                <Select value={goalId} onValueChange={handleGoalChange}>
                  <SelectTrigger id="ledger-goal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GOAL}>No goal</SelectItem>
                    {goalOptions.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ledger-type">Type</Label>
              <Select
                value={entryType}
                onValueChange={(v) => setEntryType(v as LedgerKind)}
              >
                <SelectTrigger id="ledger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contribution">Contribution</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="ledger-amount">Amount</Label>
                <Input
                  id="ledger-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ledger-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="ledger-currency" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="ledger-date">Date</Label>
                <Input
                  id="ledger-date"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="ledger-pot">Pot</Label>
                <Select value={potId} onValueChange={setPotId}>
                  <SelectTrigger id="ledger-pot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_POT}>No pot</SelectItem>
                    {pots.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ledger-description">Description (optional)</Label>
              <Input
                id="ledger-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {entry ? "Save changes" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
