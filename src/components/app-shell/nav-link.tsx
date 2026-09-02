"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// The one piece of the shell that has to be a client component: knowing
// which item is "active" requires the current pathname, which isn't
// available to a server-rendered layout. Icon comes in pre-rendered —
// a component reference (like the raw NavItem) can't cross the
// server/client boundary as a prop, only a rendered element can.
export function NavLink({
  href,
  label,
  icon,
  orientation,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  orientation: "row" | "col";
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        // P5.5's mobile pass: min-h-11/min-w-11 (44px) is the tab bar's
        // own tap-target floor — measured under 44px in both dimensions
        // before this (as small as 34x43), the wrapping <div>'s own
        // py-2 in tab-bar.tsx doesn't count toward the tappable area
        // since only this <a> itself receives the click. "row"
        // orientation (the desktop sidebar) is untouched — sidebar
        // items aren't touch targets in the same sense.
        orientation === "col" &&
          "min-h-11 min-w-11 flex-col gap-1 rounded-none px-1 py-1 text-xs",
        isActive
          ? "bg-raised text-primary"
          : "text-muted-foreground hover:bg-raised hover:text-foreground",
      )}
    >
      {icon}
      <span className={orientation === "col" ? "text-[11px] leading-none" : ""}>
        {label}
      </span>
    </Link>
  );
}
