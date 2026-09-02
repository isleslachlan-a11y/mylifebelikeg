"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database, Json } from "@/types/database";
import {
  addParticipant,
  changeParticipantRole,
  removeParticipant,
} from "./participants-actions";

type ParticipantRole = Database["public"]["Enums"]["participant_role"];
type AddableRole = Extract<ParticipantRole, "collaborator" | "viewer">;

export type ParticipantRow = {
  id: string;
  user_id: string;
  // The app only ever inserts 'collaborator'/'viewer' (see
  // participants-actions.ts's AddableRole), but the column itself allows
  // the full enum, so the query result — and this type — has to too.
  role: ParticipantRole;
  profile: { handle: string; display_name: string; avatar: Json };
};

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
  owner: { handle: string; display_name: string; avatar: Json };
  initialParticipants: ParticipantRow[];
}) {
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState<AddableRole>("collaborator");

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

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addParticipant(goalId, handle, role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHandle("");
      // The new row's id/profile aren't known client-side without another
      // round trip — router.refresh() re-runs the server component (which
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

  function handleRemove(participantId: string) {
    const previous = participants;
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    setError(null);
    startTransition(async () => {
      const result = await removeParticipant(participantId);
      if (!result.ok) {
        setParticipants(previous);
        setError(result.error);
      }
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
                  onClick={() => handleRemove(p.id)}
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
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="participant-handle" className="text-xs font-medium">
              Add by handle
            </label>
            <Input
              id="participant-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="their_handle"
            />
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as AddableRole)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="collaborator">Collaborator</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isPending || !handle.trim()}>
            Add
          </Button>
        </form>
      )}
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
