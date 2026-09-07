"use client";

import { Search } from "lucide-react";

import { navLabel } from "@/lib/navigation/labels";
import { openJumpMenu } from "./jump-menu";
import { cn } from "@/lib/utils";

/** The visible button both `sidebar.tsx` and `mobile-header.tsx` render to open the one shared `JumpMenu` instance — see that file's own header for why a window event rather than lifted state. */
export function JumpMenuTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openJumpMenu}
      aria-label={navLabel("nav.jump")}
      className={cn(
        "text-muted-foreground hover:bg-raised hover:text-foreground flex items-center justify-center rounded-full",
        className,
      )}
    >
      <Search className="size-5" aria-hidden />
    </button>
  );
}
