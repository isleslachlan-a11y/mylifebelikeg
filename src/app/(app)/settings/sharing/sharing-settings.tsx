"use client";

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
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/dates";
import type { Json } from "@/types/database";
import {
  applyAutoShareRetroactively,
  revokeAllSharedDreams,
  revokeAllSharesForPerson,
  updateSharingPreference,
} from "./actions";

export type MyShareRow = {
  grant_id: string;
  resource_type: "goal" | "someday_item" | "trip" | "profile";
  title: string;
  grantee_id: string;
  grantee_name: string;
  grantee_handle: string;
  grantee_avatar: Json;
  shared_at: string;
};

const TYPE_LABEL: Record<MyShareRow["resource_type"], string> = {
  goal: "Goal",
  someday_item: "Dream",
  trip: "Trip",
  profile: "Profile",
};

/**
 * F4: two toggles plus everything-you've-shared, grouped by person.
 * "This answers 'what does Sophia actually see?' in one screen, which
 * is the question people want answered" (brief, verbatim) — hence
 * grouping by grantee rather than leaving a flat list of grants for
 * the reader to mentally group themselves.
 */
export function SharingSettings({
  initialAutoShareProfile,
  initialAutoShareSomeday,
  initialShares,
  timezone,
}: {
  initialAutoShareProfile: boolean;
  initialAutoShareSomeday: boolean;
  initialShares: MyShareRow[];
  timezone: string;
}) {
  const [autoShareProfile, setAutoShareProfile] = useState(
    initialAutoShareProfile,
  );
  const [autoShareSomeday, setAutoShareSomeday] = useState(
    initialAutoShareSomeday,
  );
  const [shares, setShares] = useState(initialShares);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [retroactiveNote, setRetroactiveNote] = useState<string | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokePersonId, setRevokePersonId] = useState<string | null>(null);

  function handleToggleProfile(value: boolean) {
    setAutoShareProfile(value);
    setError(null);
    startTransition(async () => {
      const result = await updateSharingPreference("auto_share_profile", value);
      if (!result.ok) {
        setAutoShareProfile(!value);
        setError(result.error);
      }
    });
  }

  function handleToggleSomeday(value: boolean) {
    setAutoShareSomeday(value);
    setRetroactiveNote(null);
    setError(null);
    startTransition(async () => {
      const result = await updateSharingPreference("auto_share_someday", value);
      if (!result.ok) {
        setAutoShareSomeday(!value);
        setError(result.error);
        return;
      }
      if (value) {
        const retroResult = await applyAutoShareRetroactively();
        if (!retroResult.ok) {
          setError(retroResult.error);
          return;
        }
        setRetroactiveNote(
          retroResult.data.dreamCount > 0
            ? `Shared ${retroResult.data.dreamCount} existing dream${retroResult.data.dreamCount === 1 ? "" : "s"} with your friends.`
            : null,
        );
      }
    });
  }

  function handleRevokeAllDreams() {
    setError(null);
    startTransition(async () => {
      const result = await revokeAllSharedDreams();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShares((prev) =>
        prev.filter((s) => s.resource_type !== "someday_item"),
      );
      setRevokeAllOpen(false);
    });
  }

  function handleRevokePerson(granteeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeAllSharesForPerson(granteeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShares((prev) => prev.filter((s) => s.grantee_id !== granteeId));
      setRevokePersonId(null);
    });
  }

  const byPerson = new Map<string, MyShareRow[]>();
  for (const share of shares) {
    byPerson.set(share.grantee_id, [
      ...(byPerson.get(share.grantee_id) ?? []),
      share,
    ]);
  }
  const revokePersonShares = revokePersonId
    ? byPerson.get(revokePersonId)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              Share your profile automatically
            </p>
            <p className="text-muted-foreground text-xs">
              Friends see your avatar, pinned achievements and shared goals the
              moment you accept them, with no extra step.
            </p>
          </div>
          <Switch
            checked={autoShareProfile}
            onCheckedChange={handleToggleProfile}
            disabled={isPending}
            aria-label="Share your profile automatically with friends"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">
              Share your bucket list automatically
            </p>
            <p className="text-muted-foreground text-xs">
              Applies to every friend, not a chosen few — and to dreams you add
              later, not just the ones you have now. Turning it on shares what
              you already have too; turning it off doesn&rsquo;t take back
              what&rsquo;s already shared (use &ldquo;Revoke all shared
              dreams&rdquo; below for that).
            </p>
          </div>
          <Switch
            checked={autoShareSomeday}
            onCheckedChange={handleToggleSomeday}
            disabled={isPending}
            aria-label="Share your bucket list automatically with friends"
          />
        </div>
        {retroactiveNote && (
          <p className="text-muted-foreground text-xs">{retroactiveNote}</p>
        )}

        {shares.some((s) => s.resource_type === "someday_item") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setRevokeAllOpen(true)}
          >
            Revoke all shared dreams
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg">What you&rsquo;ve shared</h2>
        {byPerson.size === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven&rsquo;t shared anything yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {[...byPerson.entries()].flatMap(([granteeId, personShares]) => {
              // byPerson only ever gets an entry by pushing a real share
              // onto it (see the reduce above) — every value is
              // non-empty by construction, but TS can't see that
              // through a Map, so this is the one narrowing point.
              const first = personShares[0];
              if (!first) return [];
              return [
                <li
                  key={granteeId}
                  className="border-subtle flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Avatar
                        avatar={first.grantee_avatar}
                        size={28}
                        className="rounded-full"
                      />
                      <span className="text-sm font-medium">
                        {first.grantee_name}{" "}
                        <span className="text-muted-foreground font-normal">
                          @{first.grantee_handle}
                        </span>
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setRevokePersonId(granteeId)}
                    >
                      Revoke all
                    </Button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {personShares.map((s) => (
                      <li
                        key={s.grant_id}
                        className="text-muted-foreground flex items-center gap-2 text-xs"
                      >
                        <Badge variant="outline" className="shrink-0">
                          {TYPE_LABEL[s.resource_type]}
                        </Badge>
                        <span className="truncate">{s.title}</span>
                        <span className="ml-auto shrink-0">
                          {formatDate(s.shared_at, timezone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>,
              ];
            })}
          </ul>
        )}
      </section>

      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke all shared dreams?</DialogTitle>
            <DialogDescription>
              Every friend currently able to see any of your dreams loses that
              access immediately. This doesn&rsquo;t change the auto-share
              toggle itself — new dreams will share again if it&rsquo;s still
              on.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={handleRevokeAllDreams}
            >
              Revoke all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revokePersonId !== null}
        onOpenChange={(open) => !open && setRevokePersonId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Revoke everything shared with{" "}
              {revokePersonShares?.[0]?.grantee_name}?
            </DialogTitle>
            <DialogDescription>
              They lose access to all {revokePersonShares?.length ?? 0} item
              {revokePersonShares?.length === 1 ? "" : "s"} immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokePersonId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() =>
                revokePersonId && handleRevokePerson(revokePersonId)
              }
            >
              Revoke all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
