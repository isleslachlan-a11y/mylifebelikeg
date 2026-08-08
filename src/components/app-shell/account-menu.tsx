"use client";

import { DropdownMenu } from "radix-ui";
import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";

import { signOut } from "@/app/(app)/actions";
import { PROFILE_MENU_ITEMS } from "./nav-items";

// Mobile only. Money and Profile don't fit in the five-slot tab bar, so
// they — along with sign-out — live behind this small account menu
// instead. A popover, not a hamburger drawer: it doesn't take over the
// screen or need its own route.
export function AccountMenu({ displayName }: { displayName: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="text-muted-foreground hover:bg-raised hover:text-foreground flex size-9 items-center justify-center rounded-full"
        >
          <CircleUser className="size-6" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-subtle bg-popover text-popover-foreground z-50 w-48 rounded-lg border p-1 shadow-md"
        >
          <p className="text-muted-foreground truncate px-3 py-2 text-sm">
            {displayName}
          </p>
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          {PROFILE_MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenu.Item key={item.href} asChild>
                <Link
                  href={item.href}
                  className="text-foreground data-highlighted:bg-raised flex items-center gap-2 rounded-md px-3 py-2 text-sm outline-none"
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <DropdownMenu.Item asChild>
            <form action={signOut}>
              <button
                type="submit"
                className="text-foreground data-highlighted:bg-raised flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none"
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                Sign out
              </button>
            </form>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
