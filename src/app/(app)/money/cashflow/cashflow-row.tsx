import { Ban, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Database } from "@/types/database";
import { cadenceLabel } from "./cadence-label";

type CashflowItem = Database["public"]["Tables"]["cashflow_items"]["Row"];

export function CashflowRow({
  item,
  disabled,
  onEdit,
  onRequestEnd,
  onRequestDelete,
}: {
  item: CashflowItem;
  disabled: boolean;
  onEdit: () => void;
  onRequestEnd: () => void;
  onRequestDelete: () => void;
}) {
  const isEnded = item.active_to != null;

  // active_from/active_to are bare `date` columns (calendar-only, see
  // dates.ts) — always formatted in UTC, never shifted by a viewer's
  // timezone, same as a goal's start/target date.
  const range = isEnded
    ? `${formatDate(item.active_from, "UTC")} – ${formatDate(item.active_to!, "UTC")}`
    : `Since ${formatDate(item.active_from, "UTC")}`;

  return (
    <li className="bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {item.label}
          {isEnded && (
            <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem]">
              Ended
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatMoney(item.amount_minor, item.currency)} ·{" "}
          {cadenceLabel(item.frequency)} · {range}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${item.label}`}
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>

      {!isEnded && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`End ${item.label}`}
          disabled={disabled}
          onClick={onRequestEnd}
        >
          <Ban className="size-4" />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${item.label}`}
        disabled={disabled}
        onClick={onRequestDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
