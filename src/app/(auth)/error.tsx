"use client";

import { useEffect } from "react";
import Link from "next/link";

import { LlamaEmptyState } from "@/components/llama-empty-state";
import { Button } from "@/components/ui/button";

/**
 * P5.5: the `(auth)` route group's error boundary — same reasoning as
 * `(app)/error.tsx`, the sibling this mirrors; see that file's doc for
 * the full rationale. This one links back to `/login` rather than
 * `/dashboard`, since anything under `(auth)` (login, signup,
 * onboarding) runs before a session is guaranteed to exist.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("(auth) route error boundary:", error);
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
              <Link href="/login">Login</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
