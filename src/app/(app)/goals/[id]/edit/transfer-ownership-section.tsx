"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Json } from "@/types/database";
import { transferGoalOwnership } from "../participants-actions";

export type TransferCandidate = {
  user_id: string;
  display_name: string;
  handle: string;
  avatar: Json;
};

/**
 * Goal sharing package (S3): "Transfer ownership, in goal settings...
 * The new owner must already be a participant" (brief, verbatim) --
 * `candidates` is exactly the active participant list this page's own
 * query already has to fetch for `<ParticipantsSection>` one level up,
 * passed down rather than re-queried. Empty entirely (no dropdown,
 * just an explanatory line) when there's no one to transfer to yet --
 * "the new owner must already be a participant" means transferring is
 * only ever offered once sharing this goal with someone already
 * happened, not before.
 */
export function TransferOwnershipSection({
  goalId,
  candidates,
}: {
  goalId: string;
  candidates: TransferCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(
    candidates[0]?.user_id ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = candidates.find((c) => c.user_id === selectedId);

  function handleTransfer() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await transferGoalOwnership(goalId, selectedId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // router.push, not router.refresh() -- the caller is no longer
      // the owner after this succeeds, so this edit page (owner-only,
      // per its own notFound() guard) would immediately 404 itself on
      // refresh; navigating to the goal page instead, which a
      // collaborator can still see, fetches fresh server data for the
      // new route the same way a full reload would.
      router.push(`/goals/${goalId}`);
    });
  }

  return (
    <section className="border-subtle flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="font-display text-lg">Transfer ownership</h2>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Share this goal with someone first — the new owner has to already
          be a participant.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Hand this goal to a participant. You&rsquo;ll stay on as a
            collaborator — nothing is lost — but this isn&rsquo;t reversible
            without their cooperation.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setOpen(true)}
          >
            Transfer…
          </Button>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.display_name} will become the owner. You'll stay on as a collaborator. This isn't reversible without their cooperation.`
                : "Pick who this goal transfers to."}
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>
                  <span className="flex items-center gap-2">
                    <Avatar avatar={c.avatar} size={20} className="rounded-full" />
                    {c.display_name} (@{c.handle})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !selectedId}
              onClick={handleTransfer}
            >
              {isPending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
