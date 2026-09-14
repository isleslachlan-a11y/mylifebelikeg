"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// F4's own boolean toggles (auto_share_profile/auto_share_someday) are
// the first place this app has needed a real on/off switch — every
// other UI primitive so far (Select, Dialog, Popover) already existed
// before this package. Same shadcn "radix-ui" import convention every
// other primitive in this directory already uses (see popover.tsx).
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background pointer-events-none block size-5 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
