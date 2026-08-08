import type { ReactNode } from "react";

import { SPEAKER_META, type LlamaSpeaker } from "@/lib/llamas/types";
import { cn } from "@/lib/utils";

// For a page with nothing on it yet — a bigger, centred version of the
// llama treatment, with room for a call-to-action underneath the copy.
export function LlamaEmptyState({
  speaker,
  title,
  body,
  action,
  className,
}: {
  speaker: LlamaSpeaker;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-subtle bg-surface flex flex-col items-center gap-4 rounded-xl border px-6 py-16 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "font-display text-deep flex size-14 items-center justify-center rounded-full text-xl",
          speaker === "derek" ? "bg-llama-derek" : "bg-llama-fluffy",
        )}
        aria-hidden
      >
        {SPEAKER_META[speaker].initial}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className="font-display text-foreground text-xl">{title}</h3>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      {action}
    </div>
  );
}
