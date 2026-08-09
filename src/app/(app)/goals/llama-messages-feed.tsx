"use client";

import { useTransition } from "react";

import { LlamaMessage } from "@/components/llama-message";
import { dismissLlamaMessage } from "@/lib/llamas/actions";
import type { Database } from "@/types/database";

type LlamaMessageRow = Pick<
  Database["public"]["Tables"]["llama_messages"]["Row"],
  "id" | "speaker" | "body"
>;

/**
 * The first real read/dismiss surface for llama_messages — P1.3 only
 * ever wrote to it (goal_completed). LlamaMessage (P0.6) already hides
 * itself on click; this just persists that dismissal server-side.
 */
export function LlamaMessagesFeed({
  messages,
}: {
  messages: LlamaMessageRow[];
}) {
  const [, startTransition] = useTransition();

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <LlamaMessage
          key={m.id}
          speaker={m.speaker}
          body={m.body}
          onDismiss={() =>
            startTransition(async () => {
              await dismissLlamaMessage(m.id);
            })
          }
        />
      ))}
    </div>
  );
}
