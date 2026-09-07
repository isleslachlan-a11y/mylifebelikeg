import { JumpMenuTrigger } from "./jump-menu-trigger";
import { LlamaInbox, type InboxMessage } from "./llama-inbox";

export function MobileHeader({
  inboxMessages,
}: {
  inboxMessages: InboxMessage[];
}) {
  return (
    <header className="border-subtle bg-surface flex items-center justify-between border-b px-4 py-3 md:hidden">
      <span className="font-display text-foreground text-lg">Starmap</span>
      <div className="flex items-center gap-1">
        {/* P5.5's mobile pass: both bumped to size-11 (44px) here
            specifically — the shared 36px default (LlamaInbox's own
            Sidebar usage) measured under the tap-target floor on this,
            the mobile-only header. P10.0: AccountMenu's old small
            popover (Money/Profile links + sign out — a hardcoded array
            this package deletes) is gone; everything it held lives in
            the tab bar's own More sheet now, one tap away via the tab
            bar itself rather than a second, separate menu here. Its
            replacement, the jump entry point, earns the header slot
            instead — reachable from literally every page without
            first going through More. */}
        <JumpMenuTrigger className="size-11" />
        <LlamaInbox
          initialMessages={inboxMessages}
          triggerClassName="size-11"
        />
      </div>
    </header>
  );
}
