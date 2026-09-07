"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Ellipsis, LogOut } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOut } from "@/app/(app)/actions";
import { navLabel } from "@/lib/navigation/labels";
import { getMoreEntries, type NavGroup } from "@/lib/navigation/manifest";
import { cn } from "@/lib/utils";

const GROUP_ORDER: NavGroup[] = ["core", "lookingBack", "account"];
const GROUP_LABEL_KEY: Record<NavGroup, "nav.group.core" | "nav.group.lookingBack" | "nav.group.account"> = {
  core: "nav.group.core",
  lookingBack: "nav.group.lookingBack",
  account: "nav.group.account",
};

/**
 * P10.0's "More" tab — the fifth tab-bar slot, the whole rest of the
 * manifest beyond the four fixed ones. "The More screen is generated
 * from the manifest, so a route added in P9.4 appears there without
 * anyone remembering to add it" (brief, verbatim) — this component
 * takes no list of its own; `getMoreEntries()` is the only source, and
 * a new manifest entry (this file never changes) shows up here
 * automatically, grouped by its own `group` field.
 *
 * Replaces `account-menu.tsx`'s small popover entirely — that
 * component's `PROFILE_MENU_ITEMS` was exactly the kind of hardcoded
 * nav array this whole package exists to delete, and its two links
 * (Money, Profile) plus sign-out all live here now, alongside
 * everything else that doesn't fit the tab bar's four fixed slots.
 */
export function MoreSheet({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = getMoreEntries().some(
    (e) => pathname === e.href || pathname.startsWith(`${e.href}/`),
  );

  const entriesByGroup = new Map(
    GROUP_ORDER.map((group) => [
      group,
      getMoreEntries().filter((e) => e.group === group),
    ]),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-none px-1 py-1 text-xs font-medium transition-colors",
            isActive
              ? "bg-raised text-primary"
              : "text-muted-foreground hover:bg-raised hover:text-foreground",
          )}
        >
          <Ellipsis className="size-5" aria-hidden />
          <span className="text-[11px] leading-none">{navLabel("nav.more")}</span>
        </button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{navLabel("nav.more")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-1 pb-2">
          {GROUP_ORDER.map((group) => {
            const entries = entriesByGroup.get(group) ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
                  {navLabel(GROUP_LABEL_KEY[group])}
                </p>
                {entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      onClick={() => setOpen(false)}
                      className="text-foreground hover:bg-raised flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm"
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      {navLabel(entry.labelKey)}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          <div className="border-subtle flex flex-col gap-1 border-t pt-3">
            <p className="text-muted-foreground truncate px-2 py-1 text-sm">
              {displayName}
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="text-foreground hover:bg-raised flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm"
              >
                <LogOut className="size-5 shrink-0" aria-hidden />
                {navLabel("nav.signOut")}
              </button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
