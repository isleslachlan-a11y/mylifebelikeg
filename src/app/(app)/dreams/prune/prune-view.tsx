"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { DREAM_KIND_LABELS, type DreamKind } from "@/lib/someday";
import { archiveDream, keepDream } from "../actions";

export type PruneCandidate = {
  id: string;
  title: string;
  kind: DreamKind;
  roughCostMinor: number | null;
  currency: string | null;
  createdAt: string;
  lastSurfacedAt: string | null;
  photoUrl: string | null;
};

/**
 * The batch itself. "Offered as a batch to keep or archive" (brief) —
 * each row keeps its own Keep/Archive pair rather than a multi-select,
 * since a decision per dream is what the brief actually describes, not
 * one decision applied to several at once. Archiving here is quiet
 * (`archiveDream`, no per-item Derek message) — the weekly prompt's
 * "Let it go" is the personal, one-at-a-time moment that earns Derek's
 * own line; a batch sweep firing that same message N times would be
 * noise, not decency.
 */
export function PruneView({
  initialCandidates,
}: {
  initialCandidates: PruneCandidate[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function respond(id: string, action: "keep" | "archive") {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await (action === "keep" ? keepDream(id) : archiveDream(id));
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Nothing untouched for a year right now — nothing to prune.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {candidates.map((c) => (
        <div
          key={c.id}
          className="border-subtle bg-surface flex items-center gap-3 rounded-xl border p-3"
        >
          <div className="ring-foreground/10 aspect-square size-14 shrink-0 overflow-hidden rounded-lg ring-1">
            {c.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="bg-muted size-full" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-sm">{c.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                {DREAM_KIND_LABELS[c.kind]}
              </Badge>
              {c.roughCostMinor != null && c.currency && (
                <Badge variant="outline" className="text-xs">
                  {formatMoney(c.roughCostMinor, c.currency)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11"
              disabled={pendingId === c.id}
              onClick={() => respond(c.id, "keep")}
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive max-md:h-11"
              disabled={pendingId === c.id}
              onClick={() => respond(c.id, "archive")}
            >
              Archive
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
