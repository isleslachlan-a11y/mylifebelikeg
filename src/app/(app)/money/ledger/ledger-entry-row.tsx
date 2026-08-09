import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Database } from "@/types/database";

type LedgerEntry = Database["public"]["Tables"]["ledger_entries"]["Row"];

export function LedgerEntryRow({
  entry,
  potName,
  goalTitle,
  runningTotalMinor,
  disabled,
  onEdit,
  onRequestDelete,
}: {
  entry: LedgerEntry;
  /** null/undefined renders no pot badge — an entry doesn't have to be tied to a pot. */
  potName?: string | null;
  /** Shown only outside a single goal's own page, where it'd be redundant. */
  goalTitle?: string | null;
  /**
   * Cumulative signed base_amount_minor up to and including this entry,
   * in the viewer's base currency — the "running totals" the P2.2 brief
   * asks for. Plain addition over an already-converted, trigger-frozen
   * column, not an FX computation performed here (see actions.ts's top
   * comment on base_amount_minor).
   */
  runningTotalMinor?: number;
  disabled: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  const isExpense = entry.entry_type === "expense";

  return (
    <li className="bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className={isExpense ? "text-destructive" : "text-rag-green"}>
            {isExpense ? "−" : "+"}
            {formatMoney(entry.amount_minor, entry.currency)}
          </span>
          {entry.currency !== entry.base_currency && (
            <span className="text-muted-foreground text-xs font-normal">
              (≈ {formatMoney(entry.base_amount_minor, entry.base_currency)}, 1{" "}
              {entry.currency} = {entry.fx_rate_applied} {entry.base_currency})
            </span>
          )}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <span>{formatDate(entry.occurred_on, "UTC")}</span>
          {goalTitle && (
            <>
              <span aria-hidden>·</span>
              <span>{goalTitle}</span>
            </>
          )}
          {potName && (
            <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem]">
              {potName}
            </Badge>
          )}
          {entry.description && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{entry.description}</span>
            </>
          )}
        </span>
      </div>

      {runningTotalMinor !== undefined && (
        <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
          {formatMoney(runningTotalMinor, entry.base_currency)}
        </span>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Edit entry"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Delete entry"
        disabled={disabled}
        onClick={onRequestDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
