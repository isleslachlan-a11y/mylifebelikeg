"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import {
  addParticipant,
  changeParticipantRole,
  removeParticipant,
} from "./participants-actions";

type ParticipantRole = Database["public"]["Enums"]["participant_role"];
type AddableRole = Extract<ParticipantRole, "collaborator" | "viewer">;
const DEBOUNCE_MS = 400;

export type ParticipantRow = {
  id: string;
  user_id: string;
  // The app only ever inserts 'collaborator'/'viewer' (see
  // participants-actions.ts's AddableRole), but the column itself allows
  // the full enum, so the query result — and this type — has to too.
  role: ParticipantRole;
  profile: { handle: string; display_name: string; avatar: Json };
};

type HandleLookupState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "found"; id: string; handle: string; display_name: string; avatar: Json }
  | { status: "not_found" };

/**
 * Goal sharing package (S1). The "Share" control is a dialog now, not
 * an always-visible inline form -- brief, verbatim: "A 'Share' control,
 * visible to the goal owner only, opening a dialog." Its handle input
 * does a live, debounced lookup via `find_profile_by_handle` (called
 * directly from the browser client -- the function is SECURITY DEFINER
 * and needs no owner check to merely look someone up, so there's no
 * reason to round-trip through a server action first) and shows the
 * matched avatar/display name before the owner commits to inviting --
 * "so the owner can confirm they've got the right person" (brief).
 */
export function ParticipantsSection({
  goalId,
  currentUserId,
  isOwner,
  owner,
  initialParticipants,
}: {
  goalId: string;
  currentUserId: string;
  isOwner: boolean;
  owner: { id: string; handle: string; display_name: string; avatar: Json };
  initialParticipants: ParticipantRow[];
}) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<AddableRole>("collaborator");
  const [lookup, setLookup] = useState<HandleLookupState>({ status: "idle" });

  const [confirmTarget, setConfirmTarget] = useState<ParticipantRow | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<{
    message: string;
    openTaskCount: number | null;
  } | null>(null);

  // useState's initial value only applies on mount — router.refresh() re-runs
  // the server component and passes a new initialParticipants prop, but
  // won't by itself update this already-mounted component's local copy.
  // Adjusting state during render (React's documented pattern for this,
  // rather than an effect that would cause an extra commit) keeps the two
  // in sync whenever a fresh prop actually arrives.
  const [prevInitialParticipants, setPrevInitialParticipants] =
    useState(initialParticipants);
  if (initialParticipants !== prevInitialParticipants) {
    setPrevInitialParticipants(initialParticipants);
    setParticipants(initialParticipants);
  }

  const lookupCacheRef = useRef<Map<string, HandleLookupState>>(new Map());

  // A ref's `.current` can't be read during render (a second React lint
  // rule, distinct from the setState-in-effect one below) -- the cache
  // is only ever touched from inside this effect, an event handler, or
  // a callback, never the component body itself. Every branch,
  // including "empty input" and "already cached," funnels through this
  // one setTimeout so every setState call happens inside its callback
  // rather than synchronously in the effect body -- the exact shape
  // photo-picker.tsx's own search debounce already uses, for the same
  // lint reason.
  useEffect(() => {
    const trimmed = handle.trim();
    const normalized = trimmed.toLowerCase();
    const cached = trimmed ? lookupCacheRef.current.get(normalized) : undefined;
    const delay = trimmed && !cached ? DEBOUNCE_MS : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      if (!trimmed) {
        setLookup({ status: "idle" });
        return;
      }
      if (cached) {
        setLookup(cached);
        return;
      }

      setLookup({ status: "searching" });
      void (async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc("find_profile_by_handle", {
          p_handle: trimmed,
        });
        if (cancelled) return;
        const match = data?.[0];
        const next: HandleLookupState = match?.id
          ? {
              status: "found",
              id: match.id,
              handle: match.handle!,
              display_name: match.display_name!,
              avatar: match.avatar,
            }
          : { status: "not_found" };
        lookupCacheRef.current.set(normalized, next);
        setLookup(next);
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle]);

  function handleShare(event: FormEvent) {
    event.preventDefault();
    if (lookup.status !== "found") return;
    setError(null);
    startTransition(async () => {
      const result = await addParticipant(goalId, handle, role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHandle("");
      setLookup({ status: "idle" });
      setShareOpen(false);
      // The new row's id isn't known client-side without another round
      // trip — router.refresh() re-runs the server component (which
      // already has fresh data via addParticipant's revalidatePath)
      // rather than fabricating a placeholder row here.
      router.refresh();
    });
  }

  function handleRoleChange(participantId: string, newRole: AddableRole) {
    const previous = participants;
    setParticipants((prev) =>
      prev.map((p) => (p.id === participantId ? { ...p, role: newRole } : p)),
    );
    setError(null);
    startTransition(async () => {
      const result = await changeParticipantRole(participantId, newRole);
      if (!result.ok) {
        setParticipants(previous);
        setError(result.error);
      }
    });
  }

  function handleConfirmRemove() {
    if (!confirmTarget) return;
    setConfirmError(null);
    startTransition(async () => {
      const result = await removeParticipant(confirmTarget.id);
      if (!result.ok) {
        setConfirmError({
          message: result.error,
          openTaskCount: result.openTaskCount,
        });
        return;
      }
      setParticipants((prev) => prev.filter((p) => p.id !== confirmTarget.id));
      setConfirmTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        <li className="flex items-center justify-between gap-2 text-sm">
          <Link
            href={`/profile/${owner.handle}`}
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            <Avatar avatar={owner.avatar} size={24} className="rounded-full" />
            <span className="truncate">
              {owner.display_name}{" "}
              <span className="text-muted-foreground">@{owner.handle}</span>
            </span>
          </Link>
          <Badge variant="secondary">Owner</Badge>
        </li>

        {participants.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <Link
              href={`/profile/${p.profile.handle}`}
              className="flex min-w-0 items-center gap-2 hover:underline"
            >
              <Avatar
                avatar={p.profile.avatar}
                size={24}
                className="rounded-full"
              />
              <span className="truncate">
                {p.profile.display_name}{" "}
                <span className="text-muted-foreground">
                  @{p.profile.handle}
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <Select
                  value={p.role}
                  onValueChange={(v) =>
                    handleRoleChange(p.id, v as AddableRole)
                  }
                >
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collaborator">Collaborator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{roleLabel(p.role)}</Badge>
              )}
              {(isOwner || p.user_id === currentUserId) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setConfirmError(null);
                    setConfirmTarget(p);
                  }}
                >
                  {p.user_id === currentUserId ? "Leave" : "Remove"}
                </Button>
              )}
            </div>
          </li>
        ))}

        {participants.length === 0 && (
          <li className="text-muted-foreground text-sm">
            No one else on this goal yet.
          </li>
        )}
      </ul>

      {isOwner && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setShareOpen(true)}
        >
          Share
        </Button>
      )}

      {/* Share dialog -- live handle lookup, debounced, with an
          avatar/name preview before committing (S1, brief verbatim). */}
      <Dialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setHandle("");
            setLookup({ status: "idle" });
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this goal</DialogTitle>
            <DialogDescription>
              They&rsquo;ll be able to see spending on this goal — sharing a
              goal exposes its ledger entries to every participant. Your
              pots, income and expenses stay private regardless.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleShare} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="share-handle" className="text-xs font-medium">
                Handle
              </label>
              <Input
                id="share-handle"
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="their_handle"
              />
              {lookup.status === "searching" && (
                <p className="text-muted-foreground text-xs">Looking…</p>
              )}
              {lookup.status === "not_found" && (
                <p className="text-destructive text-xs">
                  No one&rsquo;s using that handle.
                </p>
              )}
              {lookup.status === "found" && (
                <div className="bg-muted flex items-center gap-2 rounded-lg p-2">
                  <Avatar avatar={lookup.avatar} size={28} className="rounded-full" />
                  <span className="text-sm">
                    {lookup.display_name}{" "}
                    <span className="text-muted-foreground">
                      @{lookup.handle}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="share-role" className="text-xs font-medium">
                Role
              </label>
              <Select value={role} onValueChange={(v) => setRole(v as AddableRole)}>
                <SelectTrigger id="share-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collaborator">
                    Collaborator — can edit
                  </SelectItem>
                  <SelectItem value="viewer">Viewer — read-only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                View is read-only, not a participant slot for pledging money
                or owning tasks — for that, invite them as a collaborator
                instead. Picking wrong is annoying to undo later.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={isPending || lookup.status !== "found"}
              >
                {isPending ? "Sharing…" : "Share"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Leave/remove confirmation (S3, brief verbatim: "confirm before
          either... they lose access, their ratings and pledges stay on
          the goal as history"). */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTarget(null);
            setConfirmError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.user_id === currentUserId
                ? "Leave this goal?"
                : `Remove ${confirmTarget?.profile.display_name}?`}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget?.user_id === currentUserId
                ? "You'll lose access to this goal. Your ratings and pledges stay on it as history — you can be re-invited later, which reactivates the same record rather than starting over."
                : `They'll lose access to this goal. Their ratings and pledges stay on it as history — re-inviting them later reactivates the same record rather than duplicating it.`}
            </DialogDescription>
          </DialogHeader>
          {confirmError && (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-destructive text-sm">
                {confirmError.message}
              </p>
              {confirmError.openTaskCount != null && confirmError.openTaskCount > 0 && (
                <Link
                  href={`/goals/${goalId}#tasks`}
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  View {confirmTarget?.profile.display_name}&rsquo;s tasks on
                  this goal
                </Link>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirmRemove}
            >
              {confirmTarget?.user_id === currentUserId ? "Leave" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function roleLabel(role: ParticipantRole): string {
  switch (role) {
    case "collaborator":
      return "Collaborator";
    case "viewer":
      return "Viewer";
    case "owner":
      // The app never inserts this — ownership is goals.owner_id, not a
      // participant row — but the column allows it, so render something
      // sane rather than nothing if one ever exists.
      return "Owner";
  }
}
