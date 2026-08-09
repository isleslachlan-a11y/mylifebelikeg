"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Database } from "@/types/database";
import { CADENCE_OPTIONS, cadenceLabel } from "./cadence-label";
import { CashflowRow } from "./cashflow-row";
import {
  createCashflowItem,
  deleteCashflowItem,
  endCashflowItem,
  updateCashflowItem,
  type CashflowItemInput,
} from "./actions";

type CashflowItem = Database["public"]["Tables"]["cashflow_items"]["Row"];
type CashflowKind = Database["public"]["Enums"]["cashflow_kind"];
type Cadence = Database["public"]["Enums"]["cadence"];

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Active (still counting toward capacity) first, then alphabetical. */
function sortItems(items: CashflowItem[]): CashflowItem[] {
  return [...items].sort((a, b) => {
    if ((a.active_to === null) !== (b.active_to === null)) {
      return a.active_to === null ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });
}

export function CashflowManager({
  initialItems,
  defaultCurrency,
  today,
}: {
  initialItems: CashflowItem[];
  defaultCurrency: string;
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // What the create/edit dialog is showing — null means closed. Creating
  // fixes `kind` to whichever "Add income"/"Add expense" button was
  // clicked; editing derives it from the item instead.
  const [formTarget, setFormTarget] = useState<{
    kind: CashflowKind;
    item: CashflowItem | null;
  } | null>(null);
  const [endingItem, setEndingItem] = useState<CashflowItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CashflowItem | null>(null);

  const income = sortItems(items.filter((i) => i.kind === "income"));
  const expense = sortItems(items.filter((i) => i.kind === "expense"));

  function handleConfirmDelete() {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setError(null);

    startTransition(async () => {
      const result = await deleteCashflowItem(item.id);
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
      }
    });
  }

  function renderGroup(kind: CashflowKind, list: CashflowItem[]) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            {kind === "income" ? "Income" : "Expenses"}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFormTarget({ kind, item: null })}
          >
            Add {kind === "income" ? "income" : "expense"}
          </Button>
        </div>
        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No {kind === "income" ? "income" : "expenses"} yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((item) => (
              <CashflowRow
                key={item.id}
                item={item}
                disabled={isPending}
                onEdit={() => setFormTarget({ kind: item.kind, item })}
                onRequestEnd={() => setEndingItem(item)}
                onRequestDelete={() => setPendingDelete(item)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {renderGroup("income", income)}
      {renderGroup("expense", expense)}

      <CashflowItemDialog
        target={formTarget}
        defaultCurrency={defaultCurrency}
        today={today}
        onClose={() => setFormTarget(null)}
        onSaved={(saved) => {
          setItems((prev) =>
            prev.some((i) => i.id === saved.id)
              ? prev.map((i) => (i.id === saved.id ? saved : i))
              : [...prev, saved],
          );
          setFormTarget(null);
        }}
      />

      <EndItemDialog
        item={endingItem}
        today={today}
        onOpenChange={(open) => !open && setEndingItem(null)}
        onEnded={(id, activeTo) => {
          setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, active_to: activeTo } : i)),
          );
          setEndingItem(null);
        }}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;{pendingDelete?.label}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              For a recurring item that&rsquo;s simply stopped, End is usually
              what you want instead — this removes it outright, including from
              your history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CashflowItemDialog({
  target,
  defaultCurrency,
  today,
  onClose,
  onSaved,
}: {
  target: { kind: CashflowKind; item: CashflowItem | null } | null;
  defaultCurrency: string;
  today: string;
  onClose: () => void;
  onSaved: (item: CashflowItem) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [frequency, setFrequency] = useState<Cadence>("monthly");
  const [activeFrom, setActiveFrom] = useState(today);

  const item = target?.item ?? null;
  const kind = target?.kind ?? "income";

  // Resync the draft fields whenever what's open changes (a different
  // item, or create reopened) — React's documented "adjust state during
  // render off a changed identity" pattern, so the form never flashes the
  // previous target's values for a frame before an effect would catch up.
  const targetKey = target
    ? item
      ? `edit:${item.id}`
      : `create:${kind}`
    : null;
  if (target && targetKey !== formKey) {
    setFormKey(targetKey);
    setLabel(item?.label ?? "");
    setAmount(item ? formatMoney(item.amount_minor, item.currency) : "");
    setCurrency(item?.currency ?? defaultCurrency);
    setFrequency(item?.frequency ?? "monthly");
    setActiveFrom(item?.active_from ?? today);
    setError(null);
  }

  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, defaultCurrency, currency]),
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!label.trim()) {
      setError("Label can't be empty.");
      return;
    }
    if (!CURRENCY_RE.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }
    if (!activeFrom) {
      setError("Enter a start date.");
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

    const input: CashflowItemInput = {
      kind,
      label,
      amountMinor,
      currency,
      frequency,
      activeFrom,
    };

    // Branched fully, not a shared ternary over a combined result — item
    // being truthy is what picks the action, but it isn't a discriminant
    // TS can use to narrow a shared `result` variable's `.data` type
    // between updateCashflowItem's ActionResult<undefined> and
    // createCashflowItem's ActionResult<CashflowItem>.
    if (item) {
      const patch = {
        ...item,
        label: label.trim(),
        amount_minor: amountMinor,
        currency,
        frequency,
        active_from: activeFrom,
      };
      startTransition(async () => {
        const result = await updateCashflowItem(item.id, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved(patch);
      });
    } else {
      startTransition(async () => {
        const result = await createCashflowItem(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved(result.data);
      });
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {item
                ? "Edit item"
                : kind === "income"
                  ? "Add income"
                  : "Add expense"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-label">Label</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cf-amount">Amount</Label>
              <Input
                id="cf-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="cf-currency" className="w-20">
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
              <Label htmlFor="cf-frequency">Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as Cadence)}
              >
                <SelectTrigger id="cf-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {cadenceLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cf-active-from">Start date</Label>
              <Input
                id="cf-active-from"
                type="date"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {item ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndItemDialog({
  item,
  today,
  onOpenChange,
  onEnded,
}: {
  item: CashflowItem | null;
  today: string;
  onOpenChange: (open: boolean) => void;
  onEnded: (id: string, activeTo: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [activeTo, setActiveTo] = useState(today);

  if (item && item.id !== key) {
    setKey(item.id);
    setActiveTo(today);
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setError(null);

    if (!activeTo) {
      setError("Enter an end date.");
      return;
    }
    if (activeTo < item.active_from) {
      setError("End date can't be before the start date.");
      return;
    }

    startTransition(async () => {
      const result = await endCashflowItem(item.id, activeTo);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onEnded(item.id, activeTo);
    });
  }

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>End &ldquo;{item?.label}&rdquo;?</DialogTitle>
            <DialogDescription>
              It stops counting toward your monthly capacity after this date but
              stays in your history — use Delete instead if you want it gone
              entirely.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-active-to">End date</Label>
            <Input
              id="cf-active-to"
              type="date"
              value={activeTo}
              onChange={(e) => setActiveTo(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              End item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
