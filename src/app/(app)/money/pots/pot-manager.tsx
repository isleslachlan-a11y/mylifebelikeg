"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
import {
  createPot,
  deletePot,
  renamePot,
  setDefaultPot,
  updateOpeningBalance,
} from "./actions";
import { PotRow } from "./pot-row";

type Pot = Database["public"]["Tables"]["pots"]["Row"];
type PotWithBalance = Pot & { balanceMinor: number };

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Owns the list as client state, like LifeAreaManager. Make-default and
 * delete apply optimistically (immediate feedback, reverted on a server
 * error — revalidatePath in actions.ts keeps a later full load correct
 * regardless). Create/edit go through a dialog with an explicit Save, so
 * they wait for the server round trip rather than guessing at a parsed
 * amount before it's validated.
 */
export function PotManager({
  initialPots,
  defaultCurrency,
}: {
  initialPots: PotWithBalance[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pots, setPots] = useState(initialPots);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPot, setEditingPot] = useState<PotWithBalance | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PotWithBalance | null>(
    null,
  );

  function handleMakeDefault(pot: PotWithBalance) {
    const previous = pots;
    setPots((prev) => prev.map((p) => ({ ...p, is_default: p.id === pot.id })));
    setError(null);

    startTransition(async () => {
      const result = await setDefaultPot(pot.id);
      if (!result.ok) {
        setPots(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleConfirmDelete() {
    const pot = pendingDelete;
    if (!pot) return;
    setPendingDelete(null);
    const previous = pots;
    setPots((prev) => prev.filter((p) => p.id !== pot.id));
    setError(null);

    startTransition(async () => {
      const result = await deletePot(pot.id);
      if (!result.ok) {
        setPots(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {pots.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No pots yet — add one to start tracking a balance.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pots.map((pot) => (
            <PotRow
              key={pot.id}
              pot={pot}
              balanceMinor={pot.balanceMinor}
              disabled={isPending}
              onEdit={() => setEditingPot(pot)}
              onMakeDefault={() => handleMakeDefault(pot)}
              onRequestDelete={() => setPendingDelete(pot)}
            />
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => setIsCreateOpen(true)}
      >
        Add pot
      </Button>

      <CreatePotDialog
        open={isCreateOpen}
        defaultCurrency={defaultCurrency}
        onOpenChange={setIsCreateOpen}
        onCreated={(pot) => {
          // A brand-new pot has no ledger entries yet, so its balance is
          // exactly its opening balance — that's the definition of an
          // empty pot, not a subtraction performed here (see page.tsx's
          // identical fallback). router.refresh() still runs afterwards
          // so ordering/defaults reconcile exactly with the server.
          setPots((prev) =>
            [
              ...(pot.is_default
                ? prev.map((p) => ({ ...p, is_default: false }))
                : prev),
              { ...pot, balanceMinor: pot.opening_balance_minor },
            ].sort((a, b) =>
              a.is_default === b.is_default
                ? a.name.localeCompare(b.name)
                : a.is_default
                  ? -1
                  : 1,
            ),
          );
          router.refresh();
        }}
      />

      <EditPotDialog
        pot={editingPot}
        onOpenChange={(open) => !open && setEditingPot(null)}
        onSaved={(id, patch) => {
          // Rename is safe to reflect immediately. balanceMinor is
          // deliberately left untouched here — it comes only from
          // v_pot_balances (CLAUDE.md rule: never compute a balance in
          // application code), and "new opening balance ± old delta"
          // would be exactly that computation. router.refresh() re-runs
          // the server component and pulls the real post-edit balance
          // from the view instead.
          setPots((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          );
          setEditingPot(null);
          router.refresh();
        }}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              Past pledges and transactions against this pot keep their history
              — this only hides it from your pot list.
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

function CreatePotDialog({
  open,
  defaultCurrency,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (pot: Pot) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [openingBalance, setOpeningBalance] = useState("");

  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, defaultCurrency, currency]),
  );

  function reset() {
    setName("");
    setCurrency(defaultCurrency);
    setOpeningBalance("");
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    if (!CURRENCY_RE.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }

    let openingBalanceMinor = 0;
    if (openingBalance.trim()) {
      try {
        openingBalanceMinor = parseMoney(openingBalance, currency);
      } catch {
        setError("Enter a valid opening balance.");
        return;
      }
      if (openingBalanceMinor < 0) {
        setError("Opening balance can't be negative.");
        return;
      }
    }

    startTransition(async () => {
      const result = await createPot({
        name,
        currency,
        openingBalanceMinor,
      });
      if (result.ok) {
        onCreated(result.data);
        reset();
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add pot</DialogTitle>
            <DialogDescription>
              Currency can&rsquo;t be changed once the pot is created.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pot-name">Name</Label>
            <Input
              id="pot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="pot-opening-balance">Opening balance</Label>
              <Input
                id="pot-opening-balance"
                inputMode="decimal"
                placeholder="0.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pot-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="pot-currency" className="w-20">
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Add pot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPotDialog({
  pot,
  onOpenChange,
  onSaved,
}: {
  pot: PotWithBalance | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string, patch: Partial<Pot>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Keyed off pot?.id so the fields reset to the newly-opened pot's values
  // rather than carrying over the previous one's draft.
  const [key, setKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  if (pot && pot.id !== key) {
    setKey(pot.id);
    setName(pot.name);
    setOpeningBalance(formatMoney(pot.opening_balance_minor, pot.currency));
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pot) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name can't be empty.");
      return;
    }

    let openingBalanceMinor: number;
    try {
      openingBalanceMinor = parseMoney(openingBalance, pot.currency);
    } catch {
      setError("Enter a valid opening balance.");
      return;
    }
    if (openingBalanceMinor < 0) {
      setError("Opening balance can't be negative.");
      return;
    }

    const nameChanged = trimmedName !== pot.name;
    const balanceChanged = openingBalanceMinor !== pot.opening_balance_minor;

    startTransition(async () => {
      const [renameResult, balanceResult] = await Promise.all([
        nameChanged ? renamePot(pot.id, trimmedName) : null,
        balanceChanged
          ? updateOpeningBalance(pot.id, openingBalanceMinor)
          : null,
      ]);

      if (renameResult && !renameResult.ok) {
        setError(renameResult.error);
        return;
      }
      if (balanceResult && !balanceResult.ok) {
        setError(balanceResult.error);
        return;
      }

      onSaved(pot.id, {
        name: trimmedName,
        opening_balance_minor: openingBalanceMinor,
      });
    });
  }

  return (
    <Dialog open={pot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit pot</DialogTitle>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-pot-name">Name</Label>
            <Input
              id="edit-pot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-pot-opening-balance">
              Opening balance ({pot?.currency})
            </Label>
            <Input
              id="edit-pot-opening-balance"
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
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
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
