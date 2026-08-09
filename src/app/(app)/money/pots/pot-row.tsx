import { Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import type { Database } from "@/types/database";

type Pot = Database["public"]["Tables"]["pots"]["Row"];

export function PotRow({
  pot,
  balanceMinor,
  onEdit,
  onMakeDefault,
  onRequestDelete,
  disabled,
}: {
  pot: Pot;
  balanceMinor: number;
  onEdit: () => void;
  onMakeDefault: () => void;
  onRequestDelete: () => void;
  disabled: boolean;
}) {
  return (
    <li className="bg-card ring-foreground/10 flex items-center gap-3 rounded-lg p-3 ring-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={
          pot.is_default ? "Default pot" : `Make ${pot.name} the default pot`
        }
        aria-pressed={pot.is_default}
        disabled={disabled || pot.is_default}
        onClick={onMakeDefault}
        className="shrink-0"
      >
        <Star
          className="size-4"
          fill={pot.is_default ? "currentColor" : "none"}
        />
      </Button>

      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
      >
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {pot.name}
          {pot.is_default && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem]">
              Default
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatMoney(balanceMinor, pot.currency)} · {pot.currency}
        </span>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${pot.name}`}
        disabled={disabled}
        onClick={onRequestDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
