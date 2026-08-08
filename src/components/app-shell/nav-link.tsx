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
        orientation === "col" &&
          "flex-col gap-1 rounded-none px-1 py-1 text-xs",
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
