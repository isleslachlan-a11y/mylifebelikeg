"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type RefreshResponse =
  | { ok: true; pairsUpserted: number; fetchFailures?: string[] }
  | { error: string };

/**
 * Fetches our own route handler, never the rates provider or Supabase
 * directly — the P2.2 brief's "this is a server route, never a client
 * fetch" is about where the provider call and the service-role write
 * happen (inside route.ts), not about whether a button can trigger it.
 */
export function RefreshRatesButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/fx/refresh", { method: "POST" });
        const body = (await res.json()) as RefreshResponse;

        if (!res.ok || "error" in body) {
          setIsError(true);
          setMessage("error" in body ? body.error : "Refresh failed.");
          return;
        }

        setIsError(false);
        setMessage(
          body.pairsUpserted === 0
            ? "No rates needed — fewer than two currencies in use."
            : `Updated ${body.pairsUpserted} rate${body.pairsUpserted === 1 ? "" : "s"}.` +
                (body.fetchFailures?.length
                  ? ` ${body.fetchFailures.length} pair${body.fetchFailures.length === 1 ? "" : "s"} couldn't be fetched.`
                  : ""),
        );
        router.refresh();
      } catch {
        setIsError(true);
        setMessage("Refresh failed — check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={isPending}
        className="self-start"
      >
        {isPending ? "Refreshing…" : "Refresh rates"}
      </Button>
      {message && (
        <p
          role="status"
          className={
            isError
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
