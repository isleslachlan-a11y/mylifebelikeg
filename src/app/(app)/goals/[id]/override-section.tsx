"use client";

import { useState, useTransition } from "react";

import { RagBadge } from "@/components/rag-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates";
import { RAG_LABEL, type RagStatus } from "@/lib/rag";
import { setGoalOverride } from "./override-actions";
import {
  OVERRIDE_DEFAULT_EXPIRY_DAYS,
  OVERRIDE_MAX_EXPIRY_DAYS,
  type OverridableStatus,
} from "./override-constants";

export type OverrideHistoryEntry = {
  id: string;
  status: RagStatus;
  reason: string;
  setByName: string;
  setAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedReason: "replaced" | "cleared_by_checkin" | null;
};

const OVERRIDABLE_STATUSES: OverridableStatus[] = ["green", "amber", "red"];

const ENDED_REASON_LABEL: Record<
  NonNullable<OverrideHistoryEntry["endedReason"]>,
  string
> = {
  replaced: "Replaced by a new override",
  cleared_by_checkin: "Cleared by a later check-in",
};

/**
 * RAG override (P4.3). The live override (if any) always renders with
 * the computed status alongside it — "hiding what the app actually
 * thinks is how an override becomes greenwashing" (brief, verbatim) —
 * and explains, in plain language, the one clearing mechanism that
 * isn't a literal countdown: a later check-in submission. History below
 * comes straight from `rag_override_history` (0017); this component
 * never computes "expired" for a *closed* entry (ended_reason already
 * says why it ended) — only the still-open entry's live/expired split
 * comes from a caller-supplied flag (`isLive`, `v_goal_rag.is_overridden`),
 * never a client-side `new Date()` comparison (P0.8's hydration-mismatch
 * trap).
 */
export function OverrideSection({
  goalId,
  computedStatus,
  isLive,
  history,
  timezone,
  canEdit,
}: {
  goalId: string;
  computedStatus: RagStatus;
  isLive: boolean;
  history: OverrideHistoryEntry[];
  timezone: string;
  /** app.can_edit_goal — same surface goals_update's RLS actually gates; hides the action, doesn't just disable it, for a viewer who couldn't save one anyway. */
  canEdit: boolean;
}) {
  const current = history.find((h) => h.endedAt === null) ?? null;
  const past = history.filter((h) => h.endedAt !== null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<OverridableStatus>("amber");
  const [reason, setReason] = useState("");
  const [expiryDays, setExpiryDays] = useState(OVERRIDE_DEFAULT_EXPIRY_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setError(null);
    setStatus("amber");
    setReason("");
    setExpiryDays(OVERRIDE_DEFAULT_EXPIRY_DAYS);
    setDialogOpen(true);
  }

  function submit() {
    if (!reason.trim()) {
      setError("Tell us why.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setGoalOverride(goalId, status, reason, expiryDays);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDialogOpen(false);
    });
  }

  if (!current && past.length === 0 && !canEdit) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div className="border-subtle flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <RagBadge
              status={current.status}
              label={`${RAG_LABEL[current.status]} — manual${isLive ? "" : " (expired)"}`}
            />
            <span className="text-muted-foreground text-sm">
              Computed: {RAG_LABEL[computedStatus]}
            </span>
          </div>
          <p className="text-sm">{current.reason}</p>
          <p className="text-muted-foreground text-xs">
            Set by {current.setByName} on {formatDate(current.setAt, timezone)}{" "}
            — expires {formatDate(current.expiresAt, timezone)}.{" "}
            Also clears early if a check-in for a later period gets
            submitted before then.
          </p>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={openDialog}
            >
              Change override
            </Button>
          )}
        </div>
      ) : (
        canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={openDialog}
          >
            Override status
          </Button>
        )
      )}

      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium">
            Override history
          </h3>
          <ul className="flex flex-col gap-2">
            {past.map((entry) => (
              <li
                key={entry.id}
                className="border-subtle flex flex-col gap-1 rounded-lg border p-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RagBadge status={entry.status} className="h-4 px-1.5 text-[0.65rem]" />
                  <span className="text-muted-foreground">
                    {entry.setByName}, {formatDate(entry.setAt, timezone)}
                  </span>
                </div>
                <p>{entry.reason}</p>
                <p className="text-muted-foreground">
                  {entry.endedReason && ENDED_REASON_LABEL[entry.endedReason]}
                  {entry.endedAt && ` — ${formatDate(entry.endedAt, timezone)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override this goal&apos;s status</DialogTitle>
            <DialogDescription>
              Needs a reason and an expiry — an override with neither
              doesn&apos;t save (override_needs_reason). The computed status
              stays visible alongside it either way.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as OverridableStatus)}
              >
                <SelectTrigger id="override-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {RAG_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-expiry">Expires in (days)</Label>
              <Input
                id="override-expiry"
                type="number"
                min={1}
                max={OVERRIDE_MAX_EXPIRY_DAYS}
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
              />
              <p className="text-muted-foreground text-xs">
                Up to {OVERRIDE_MAX_EXPIRY_DAYS} days — clears automatically
                either way, sooner if a later check-in gets submitted first.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
