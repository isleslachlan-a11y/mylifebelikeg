"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import {
  blockUser,
  respondToFriendRequest,
  sendFriendRequest,
  unfriend,
} from "./actions";

const DEBOUNCE_MS = 400;

export type FriendRow = {
  friendship_id: string;
  user_id: string;
  handle: string;
  display_name: string;
  avatar: Json;
  since: string | null;
};

export type FriendRequestRow = {
  id: string;
  is_incoming: boolean;
  handle: string;
  display_name: string;
  avatar: Json;
  created_at: string;
};

type HandleLookupState =
  | { status: "idle" }
  | { status: "searching" }
  | {
      status: "found";
      id: string;
      handle: string;
      display_name: string;
      avatar: Json;
    }
  | { status: "not_found" };

type ConfirmAction = { kind: "unfriend" | "block"; friend: FriendRow };

/**
 * F1: "Build friend management at /friends... Three sections: friends,
 * incoming requests, outgoing requests" (brief, verbatim). Same
 * debounced-handle-lookup shape participants-section.tsx (S1)
 * established -- find_profile_by_handle called directly from the
 * browser client, one setTimeout funnel per keystroke.
 */
export function FriendsView({
  initialFriends,
  initialRequests,
  timezone,
}: {
  initialFriends: FriendRow[];
  initialRequests: FriendRequestRow[];
  /** profiles.timezone — CLAUDE.md rule 4, dates display in the
   * user's own timezone, never the browser's. */
  timezone: string;
}) {
  const router = useRouter();
  const [friends, setFriends] = useState(initialFriends);
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [lookup, setLookup] = useState<HandleLookupState>({ status: "idle" });
  const [addError, setAddError] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Keep local state in sync whenever a fresh server-fetched prop
  // arrives (router.refresh() after a mutation) -- same "adjust state
  // during render" pattern participants-section.tsx already uses.
  const [prevFriends, setPrevFriends] = useState(initialFriends);
  if (initialFriends !== prevFriends) {
    setPrevFriends(initialFriends);
    setFriends(initialFriends);
  }
  const [prevRequests, setPrevRequests] = useState(initialRequests);
  if (initialRequests !== prevRequests) {
    setPrevRequests(initialRequests);
    setRequests(initialRequests);
  }

  const lookupCacheRef = useRef<Map<string, HandleLookupState>>(new Map());

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

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (lookup.status !== "found") return;
    setAddError(null);
    startTransition(async () => {
      const result = await sendFriendRequest(handle);
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setHandle("");
      setLookup({ status: "idle" });
      setAddOpen(false);
      router.refresh();
    });
  }

  function handleRespond(requestId: string, accept: boolean) {
    setError(null);
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    startTransition(async () => {
      const result = await respondToFriendRequest(requestId, accept);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function handleConfirm() {
    if (!confirmAction) return;
    setConfirmError(null);
    startTransition(async () => {
      const result =
        confirmAction.kind === "unfriend"
          ? await unfriend(confirmAction.friend.user_id)
          : await blockUser(confirmAction.friend.user_id);
      if (!result.ok) {
        setConfirmError(result.error);
        return;
      }
      setFriends((prev) =>
        prev.filter((f) => f.user_id !== confirmAction.friend.user_id),
      );
      setConfirmAction(null);
      router.refresh();
    });
  }

  const incoming = requests.filter((r) => r.is_incoming);
  const outgoing = requests.filter((r) => !r.is_incoming);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setAddOpen(true)}
      >
        Add a friend
      </Button>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">
            Incoming requests
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {incoming.length}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="border-subtle flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar
                    avatar={r.avatar}
                    size={32}
                    className="rounded-full"
                  />
                  <span className="truncate text-sm">
                    {r.display_name}{" "}
                    <span className="text-muted-foreground">@{r.handle}</span>
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRespond(r.id, true)}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => handleRespond(r.id, false)}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg">
            Outgoing requests
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {outgoing.length}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {outgoing.map((r) => (
              <li
                key={r.id}
                className="border-subtle flex items-center gap-2 rounded-lg border p-3"
              >
                <Avatar avatar={r.avatar} size={32} className="rounded-full" />
                <span className="truncate text-sm">
                  {r.display_name}{" "}
                  <span className="text-muted-foreground">@{r.handle}</span>
                </span>
                <Badge variant="secondary" className="ml-auto">
                  Waiting
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">
          Friends
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {friends.length}
          </span>
        </h2>
        {friends.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No friends yet — add one by handle above.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {friends.map((f) => (
              <li
                key={f.friendship_id}
                className="border-subtle flex items-center justify-between gap-2 rounded-lg border p-3"
              >
                <Link
                  href={`/profile/${f.handle}`}
                  className="flex min-w-0 items-center gap-2 hover:underline"
                >
                  <Avatar
                    avatar={f.avatar}
                    size={32}
                    className="rounded-full"
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {f.display_name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      @{f.handle}
                      {f.since &&
                        ` · friends since ${formatDate(f.since, timezone, { year: "numeric", month: "short" })}`}
                    </span>
                  </div>
                </Link>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`More options for ${f.display_name}`}
                    >
                      <MoreVertical className="size-4" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="flex w-44 flex-col p-1"
                  >
                    <button
                      type="button"
                      className="hover:bg-muted rounded px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        setConfirmError(null);
                        setConfirmAction({ kind: "unfriend", friend: f });
                      }}
                    >
                      Unfriend
                    </button>
                    {/* "Block lives behind a menu, not a primary
                        button" (F1 brief, verbatim). */}
                    <button
                      type="button"
                      className="hover:bg-muted text-destructive rounded px-2 py-1.5 text-left text-sm"
                      onClick={() => {
                        setConfirmError(null);
                        setConfirmAction({ kind: "block", friend: f });
                      }}
                    >
                      Block
                    </button>
                  </PopoverContent>
                </Popover>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add-a-friend dialog -- live debounced handle lookup, same
          preview-before-commit shape S1's own Share dialog uses. */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setHandle("");
            setLookup({ status: "idle" });
            setAddError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a friend</DialogTitle>
            <DialogDescription>
              Being friends doesn&rsquo;t share anything by itself — it just
              makes finding each other and sharing things later one click
              instead of typing a handle each time.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="friend-handle" className="text-xs font-medium">
                Handle
              </label>
              <Input
                id="friend-handle"
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
                  <Avatar
                    avatar={lookup.avatar}
                    size={28}
                    className="rounded-full"
                  />
                  <span className="text-sm">
                    {lookup.display_name}{" "}
                    <span className="text-muted-foreground">
                      @{lookup.handle}
                    </span>
                  </span>
                </div>
              )}
            </div>
            {addError && (
              <p role="alert" className="text-destructive text-sm">
                {addError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={isPending || lookup.status !== "found"}
              >
                {isPending ? "Sending…" : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unfriend/block confirmation. "People reasonably expect
          unfriending to be reversible, and this part isn't" (F1
          brief, verbatim) -- said explicitly, not left implied. */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setConfirmError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "block"
                ? `Block ${confirmAction.friend.display_name}?`
                : `Unfriend ${confirmAction?.friend.display_name}?`}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === "block"
                ? "This unfriends them, revokes everything shared between you in both directions, and stops them from sending you another friend request or being shared with. It doesn't notify them."
                : "This revokes everything shared between you in both directions, immediately. Unlike most things here, this isn't reversible — you'd need to become friends again from scratch."}
            </DialogDescription>
          </DialogHeader>
          {confirmError && (
            <p role="alert" className="text-destructive text-sm">
              {confirmError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleConfirm}
            >
              {confirmAction?.kind === "block" ? "Block" : "Unfriend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
