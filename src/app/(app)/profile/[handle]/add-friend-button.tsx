"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { sendFriendRequest } from "../../friends/actions";

/**
 * F5: "Not friends -> display name, handle, avatar, add-friend button.
 * Nothing else" (brief, verbatim). Reuses F1's own sendFriendRequest
 * action rather than a second implementation — this is just a second
 * call site for it, same as ShareControl reusing app.can_grant instead
 * of inventing its own authority check.
 */
export function AddFriendButton({ handle }: { handle: string }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Request sent
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await sendFriendRequest(handle);
            if (!result.ok) {
              setError(result.error);
              setState("error");
              return;
            }
            setState("sent");
          });
        }}
      >
        {isPending ? "Sending…" : "Add friend"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
