"use client";

import { useEffect } from "react";
import Link from "next/link";

import { LlamaEmptyState } from "@/components/llama-empty-state";
import { Button } from "@/components/ui/button";

/**
 * P5.5: the `(app)` route group's error boundary — "a Derek message
 * rather than a stack trace" (brief, verbatim). "A blank content area
 * is the worst possible failure mode — you already lost time to one"
 * is the brief's own reasoning for building this at all; the previous
 * failure mode for anything throwing under this layout was a fully
 * blank page (no boundary existed), not even a broken-but-visible one.
 *
 * Next.js requires this to be a Client Component and to accept exactly
 * `error`/`reset` — `reset()` re-renders the segment that threw without
 * a full page reload, so a transient failure (the exact kind the
 * Supabase-call audit above found lurking in `layout.tsx`/`page.tsx`'s
 * profile lookups) can often just be retried in place. The raw
 * `error.message` is deliberately never rendered — same reasoning
 * `humanizeDbError`'s own doc gives for never showing `error.message`
 * directly: it's written for developers, not end users. Logged to the
 * console instead, which is where a real stack trace belongs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("(app) route error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <LlamaEmptyState
        speaker="derek"
        title="Something broke"
        body="Not going to pretend that didn't happen. Try again — if it keeps happening, it's not you."
        action={
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
