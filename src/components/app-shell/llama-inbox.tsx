"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  dismissLlamaMessage,
  markAllLlamaMessagesRead,
  markLlamaMessageRead,
} from "@/lib/llamas/actions";
import { SPEAKER_META, type LlamaSpeaker } from "@/lib/llamas/types";
import { cn } from "@/lib/utils";

export type InboxMessage = {
  id: string;
  speaker: LlamaSpeaker;
  body: string;
  readAt: string | null;
};

/**
 * The message inbox (P4.6): unread count, list, mark-read, dismiss —
 * living in the shared (app) layout (rendered once in Sidebar for
 * desktop, once in MobileHeader for mobile) rather than any one page,
 * since llama_messages isn't goal- or route-scoped. State updates
 * optimistically on every action rather than through revalidatePath:
 * there's no single page route to revalidate that would refresh every
 * page this component appears on, and the server write has already
 * happened underneath by the time the local state changes.
 */
export function LlamaInbox({
  initialMessages,
  triggerClassName,
}: {
  initialMessages: InboxMessage[];
  /**
   * P5.5's mobile pass: this trigger is `size-9` (36px) by default, fine
   * for Sidebar's desktop density but under the 44px tap-target floor
   * for MobileHeader's own instance — rather than bump the shared
   * default (which would make Sidebar's icon oversized), the caller
   * that actually needs 44px passes it here.
   */
  triggerClassName?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [, startTransition] = useTransition();

  const unreadCount = messages.filter((m) => m.readAt == null).length;

  function handleMarkRead(id: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.readAt == null
          ? { ...m, readAt: new Date().toISOString() }
          : m,
      ),
    );
    startTransition(() => {
      void markLlamaMessageRead(id);
    });
  }

  function handleDismiss(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    startTransition(() => {
      void dismissLlamaMessage(id);
    });
  }

  function handleMarkAllRead() {
    const now = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.readAt == null ? { ...m, readAt: now } : m)),
    );
    startTransition(() => {
      void markAllLlamaMessagesRead();
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"
          }
          className={cn(
            "text-muted-foreground hover:bg-raised hover:text-foreground relative flex size-9 items-center justify-center rounded-full",
            triggerClassName,
          )}
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="bg-destructive absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium text-white"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-96 w-80 flex-col overflow-hidden p-0"
      >
        <div className="border-subtle flex items-center justify-between border-b p-3">
          <h2 className="text-sm font-medium">Messages</h2>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-primary text-xs underline-offset-4 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {messages.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            Nothing here right now.
          </p>
        ) : (
          <ul className="divide-border flex flex-col divide-y overflow-y-auto">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "flex gap-2 p-3",
                  m.readAt == null && "bg-muted/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      m.speaker === "derek"
                        ? "text-llama-derek"
                        : "text-llama-fluffy",
                    )}
                  >
                    {SPEAKER_META[m.speaker].name}
                  </p>
                  <p className="text-foreground text-sm">{m.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {m.readAt == null && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(m.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDismiss(m.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
