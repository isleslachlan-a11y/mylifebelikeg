import { Badge } from "@/components/ui/badge";
import { RAG_LABEL, type RagStatus } from "@/lib/rag";
import { cn } from "@/lib/utils";

/** Exported for the RAG history band (P4.4), which paints the same four colours as flat segments rather than dots. */
export const RAG_DOT_CLASS: Record<RagStatus, string> = {
  green: "bg-rag-green",
  amber: "bg-rag-amber",
  red: "bg-rag-red",
  grey: "bg-rag-grey",
};

export type RagBadgeProps = {
  status: RagStatus;
  /** Overrides RAG_LABEL — used for the schedule/momentum-mismatch case, which needs its own wording rather than the generic per-colour label. */
  label?: string;
  className?: string;
};

/**
 * A coloured dot paired with a text label — never the dot alone (P4.2
 * brief: "never colour alone... a colour-only signal is unreadable to a
 * meaningful share of people"). The dot is `aria-hidden`; the label is
 * real text, so a screen reader or a colour-blind viewer gets the same
 * information a sighted, full-colour-vision viewer does.
 */
export function RagBadge({ status, label, className }: RagBadgeProps) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span className={cn("size-2 rounded-full", RAG_DOT_CLASS[status])} aria-hidden />
      {label ?? RAG_LABEL[status]}
    </Badge>
  );
}

/**
 * The one exception to "always a colour" (P4.2 brief): goals inside
 * `app.compute_goal_rag`'s 14-day grace period are unconditionally
 * green, which isn't a real signal yet — this renders "new" instead,
 * with no rag-* colour at all, so it can't be mistaken for an earned
 * green.
 */
export function NewGoalBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={className}>
      New
    </Badge>
  );
}
