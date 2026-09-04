"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cancelAccountDeletion } from "./actions";

/**
 * The "cancel link" the brief asks for, as an actual one-tap control
 * rather than a bare URL to navigate to — used both on /settings/account
 * itself and in the app-shell banner (deletion-banner.tsx) that shows
 * on every page during the grace window.
 */
export function CancelDeletionButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleCancel}
      >
        {isPending ? "Cancelling…" : "Cancel deletion"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
