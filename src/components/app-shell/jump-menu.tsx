"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { navLabel } from "@/lib/navigation/labels";
import { getAllEntries } from "@/lib/navigation/manifest";
import { cn } from "@/lib/utils";

/** Any button anywhere in the shell can open the one JumpMenu instance (mounted once in AppLayout) by dispatching this — see jump-menu.tsx's own header for why a window event rather than lifted state. */
export const OPEN_JUMP_MENU_EVENT = "starmap:open-jump-menu";

export function openJumpMenu() {
  window.dispatchEvent(new Event(OPEN_JUMP_MENU_EVENT));
}

/**
 * P10.0's "jump entry point... the mobile equivalent of the desktop
 * hotkey" (brief, verbatim) — built as one shared component for both
 * directions rather than two: a global Cmd+K/Ctrl+K listener is the
 * desktop entry point (this app had no such hotkey before this
 * package; it's new here, not a pre-existing feature this merely
 * exposes to mobile), and a visible search-icon button
 * (`mobile-header.tsx`, and a small trigger in `sidebar.tsx` for
 * discoverability on desktop too) opens the identical instance via
 * `openJumpMenu()` — there is exactly one JumpMenu mounted
 * (`src/app/(app)/layout.tsx`), not a per-surface copy.
 *
 * Searches `getAllEntries()` — the full manifest, not just what's on
 * the tab bar or in the More sheet — so this is the escape valve the
 * brief describes: whatever the four-plus-More structure buries an
 * extra tap behind, typing a few letters here reaches directly.
 */
export function JumpMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleOpenEvent() {
      setOpen(true);
    }
    function handleKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !isTyping) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener(OPEN_JUMP_MENU_EVENT, handleOpenEvent);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener(OPEN_JUMP_MENU_EVENT, handleOpenEvent);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  // Clearing the query lives in the Dialog's own onOpenChange handler
  // below, not a second effect keyed on `open` -- setState directly in
  // an effect body (rather than in response to a real external event,
  // like the keydown/custom-event listeners just above) is the same
  // needless-extra-render shape flagged elsewhere in this app
  // (reset-password-form.tsx's own comment has the fuller version of
  // this reasoning).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  const results = getAllEntries().filter((entry) =>
    navLabel(entry.labelKey).toLowerCase().includes(query.trim().toLowerCase()),
  );

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-24 max-w-md translate-y-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{navLabel("nav.jump")}</DialogTitle>
        <Input
          autoFocus
          placeholder={navLabel("nav.jump")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              go(results[0].href);
            }
          }}
        />
        <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {results.length === 0 && (
            <li className="text-muted-foreground px-2 py-3 text-sm">
              No matches.
            </li>
          )}
          {results.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => go(entry.href)}
                  className={cn(
                    "text-foreground hover:bg-raised flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm",
                    index === 0 && "bg-raised",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {navLabel(entry.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
