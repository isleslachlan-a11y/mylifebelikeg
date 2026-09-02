"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { SPEAKER_META, type LlamaSpeaker } from "@/lib/llamas/types";
import { cn } from "@/lib/utils";

// A simple circular initial for now — illustrations come later.
function LlamaAvatar({ speaker }: { speaker: LlamaSpeaker }) {
  return (
    <div
      className={cn(
        "font-display text-deep flex size-9 shrink-0 items-center justify-center rounded-full text-sm",
        speaker === "derek" ? "bg-llama-derek" : "bg-llama-fluffy",
      )}
      aria-hidden
    >
      {SPEAKER_META[speaker].initial}
    </div>
  );
}

export function LlamaMessage({
  speaker,
  body,
  onDismiss,
  className,
}: {
  speaker: LlamaSpeaker;
  body: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        speaker === "derek"
          ? "border-llama-derek/30 bg-llama-derek/10"
          : "border-llama-fluffy/25 bg-llama-fluffy/10",
        className,
      )}
    >
      <LlamaAvatar speaker={speaker} />
      <div className="flex-1">
        <p
          className={cn(
            "text-xs font-medium",
            speaker === "derek" ? "text-llama-derek" : "text-llama-fluffy",
          )}
        >
          {SPEAKER_META[speaker].name}
        </p>
        <p className="text-foreground mt-0.5 text-sm">{body}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          onDismiss?.();
        }}
        // P5.5's mobile pass: max-md:size-11 gives this a proper 44px
        // tap target below the desktop breakpoint (measured 24x24
        // before, from the plain p-1 padding alone) without growing it
        // past that on desktop, where a mouse doesn't need the room.
        className="text-muted-foreground hover:bg-raised hover:text-foreground flex shrink-0 items-center justify-center rounded-full p-1 transition-colors max-md:size-11"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
