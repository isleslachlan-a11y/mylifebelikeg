"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";
import {
  shareResource,
  shareWithAllFriends,
  unshareResource,
  type ShareResourceType,
  type ShareScope,
} from "./share-actions";

type CurrentShare = {
  grant_id: string;
  grantee_id: string;
  grantee_name: string;
  grantee_handle: string;
  grantee_avatar: Json;
  scope: ShareScope;
};

type Friend = {
  user_id: string;
  handle: string;
  display_name: string;
  avatar: Json;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; shares: CurrentShare[]; friends: Friend[] }
  | { status: "error"; message: string };

// F2 brief, verbatim: "scope means something different per type, so
// label it per type rather than a generic 'can edit'." Profile has no
// edit meaning at all -- sharing your own profile "editable" makes no
// sense -- so its scope selector is simply never shown; every share of
// a profile is `view`.
const SCOPE_DESCRIPTIONS: Record<
  ShareResourceType,
  { view: string; edit: string | null }
> = {
  someday_item: {
    view: "They can see it.",
    edit: "They can change it.",
  },
  trip: {
    view: "Itinerary and map.",
    edit: "Add and reorder stops.",
  },
  goal: {
    view: "Read-only — not a participant. To have someone pledge money or own tasks, add them as a participant instead.",
    edit: "They can edit the goal's tasks, milestones and spending — but still can't pledge money or be assigned a task themselves. For that, add them as a participant instead.",
  },
  profile: {
    view: "They can see your avatar, pinned achievements and shared goals.",
    edit: null,
  },
};

const RESOURCE_LABEL: Record<ShareResourceType, string> = {
  goal: "goal",
  someday_item: "dream",
  trip: "trip",
  profile: "profile",
};

/**
 * F2: "One component, used everywhere. Four separate share dialogs
 * will drift" (brief, verbatim). `isOwner` is caller-supplied (every
 * call site already computes an owner check for its own purposes) —
 * this component still gates on it as its own belt-and-suspenders,
 * same "don't offer what will fail" posture participants-section.tsx's
 * Share button already takes, since app.share_resource itself would
 * raise insufficient_privilege for anyone else anyway.
 */
export function ShareControl({
  resourceType,
  resourceId,
  isOwner,
  path,
  triggerLabel = "Share",
}: {
  resourceType: ShareResourceType;
  resourceId: string;
  isOwner: boolean;
  /** The current page's own pathname, passed straight to revalidatePath after a mutation. */
  path: string;
  /**
   * Goals already have their own "Share" button (S1's participants
   * invite) -- this trigger needs a distinct label there so the two
   * genuinely different mechanisms (participant vs. view-only friend
   * grant) don't read as the same control twice.
   */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [scope, setScope] = useState<ShareScope>("view");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shareAllCount, setShareAllCount] = useState<number | null>(null);

  if (!isOwner) {
    return null;
  }

  function load() {
    setState({ status: "loading" });
    void (async () => {
      const supabase = createClient();
      const [
        { data: shares, error: sharesError },
        { data: friends, error: friendsError },
      ] = await Promise.all([
        supabase
          .from("v_my_shares")
          .select(
            "grant_id, grantee_id, grantee_name, grantee_handle, grantee_avatar, scope",
          )
          .eq("resource_type", resourceType)
          .eq("resource_id", resourceId),
        supabase
          .from("v_friends")
          .select("user_id, handle, display_name, avatar"),
      ]);
      if (sharesError || friendsError) {
        setState({
          status: "error",
          message: (sharesError ?? friendsError)!.message,
        });
        return;
      }
      setState({
        status: "loaded",
        shares: (shares ?? []).filter((s): s is CurrentShare =>
          Boolean(
            s.grant_id &&
            s.grantee_id &&
            s.grantee_name &&
            s.grantee_handle &&
            s.scope,
          ),
        ),
        friends: (friends ?? []).filter((f): f is Friend =>
          Boolean(f.user_id && f.handle && f.display_name),
        ),
      });
    })();
  }

  function handleShare() {
    if (!selectedFriendId) return;
    setError(null);
    startTransition(async () => {
      const result = await shareResource(
        resourceType,
        resourceId,
        selectedFriendId,
        resourceType === "profile" ? "view" : scope,
        path,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelectedFriendId("");
      load();
    });
  }

  function handleShareAll() {
    setError(null);
    setShareAllCount(null);
    startTransition(async () => {
      const result = await shareWithAllFriends(
        resourceType,
        resourceId,
        resourceType === "profile" ? "view" : scope,
        path,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShareAllCount(result.data.count);
      load();
    });
  }

  function handleRevoke(granteeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await unshareResource(
        resourceType,
        resourceId,
        granteeId,
        path,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      load();
    });
  }

  const descriptions = SCOPE_DESCRIPTIONS[resourceType];
  const loaded = state.status === "loaded" ? state : null;
  const alreadySharedIds = new Set(loaded?.shares.map((s) => s.grantee_id));
  const shareableFriends =
    loaded?.friends.filter((f) => !alreadySharedIds.has(f.user_id)) ?? [];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => {
          setOpen(true);
          setError(null);
          setShareAllCount(null);
          load();
        }}
      >
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this {RESOURCE_LABEL[resourceType]}</DialogTitle>
            <DialogDescription>
              Only people you&rsquo;re friends with are listed below — being
              friends doesn&rsquo;t share anything by itself, this is the step
              that actually does.
            </DialogDescription>
          </DialogHeader>

          {state.status === "loading" && (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
          {state.status === "error" && (
            <p role="alert" className="text-destructive text-sm">
              {state.message}
            </p>
          )}

          {loaded && (
            <div className="flex flex-col gap-4">
              {loaded.shares.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium">Currently shared with</p>
                  <ul className="flex flex-col gap-2">
                    {loaded.shares.map((s) => (
                      <li
                        key={s.grant_id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar
                            avatar={s.grantee_avatar}
                            size={24}
                            className="rounded-full"
                          />
                          <span className="truncate">
                            {s.grantee_name}{" "}
                            <span className="text-muted-foreground">
                              @{s.grantee_handle}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 capitalize"
                          >
                            {s.scope}
                          </Badge>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleRevoke(s.grantee_id)}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {shareableFriends.length === 0 && loaded.friends.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  You don&rsquo;t have any friends yet —{" "}
                  <Link
                    href="/friends"
                    className="underline underline-offset-2"
                  >
                    add one
                  </Link>{" "}
                  to share with them.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium">Add</p>
                  <Select
                    value={selectedFriendId}
                    onValueChange={setSelectedFriendId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a friend" />
                    </SelectTrigger>
                    <SelectContent>
                      {shareableFriends.map((f) => (
                        <SelectItem key={f.user_id} value={f.user_id}>
                          <span className="flex items-center gap-2">
                            <Avatar
                              avatar={f.avatar}
                              size={20}
                              className="rounded-full"
                            />
                            {f.display_name} (@{f.handle})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {descriptions.edit && (
                    <>
                      <Select
                        value={scope}
                        onValueChange={(v) => setScope(v as ShareScope)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground text-xs">
                        {scope === "view"
                          ? descriptions.view
                          : descriptions.edit}
                      </p>
                    </>
                  )}
                  {!descriptions.edit && (
                    <p className="text-muted-foreground text-xs">
                      {descriptions.view}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending || !selectedFriendId}
                      onClick={handleShare}
                    >
                      {isPending ? "Sharing…" : "Share"}
                    </Button>
                    {loaded.friends.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={handleShareAll}
                      >
                        Share with all friends
                      </Button>
                    )}
                  </div>
                  {shareAllCount != null && (
                    <p className="text-muted-foreground text-xs">
                      Shared with {shareAllCount} friend
                      {shareAllCount === 1 ? "" : "s"}.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
