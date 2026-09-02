import { AccountMenu } from "./account-menu";
import { LlamaInbox, type InboxMessage } from "./llama-inbox";

export function MobileHeader({
  displayName,
  inboxMessages,
}: {
  displayName: string;
  inboxMessages: InboxMessage[];
}) {
  return (
    <header className="border-subtle bg-surface flex items-center justify-between border-b px-4 py-3 md:hidden">
      <span className="font-display text-foreground text-lg">Starmap</span>
      <div className="flex items-center gap-1">
        {/* P5.5's mobile pass: both bumped to size-11 (44px) here
            specifically — the shared 36px default (LlamaInbox's own
            Sidebar usage) measured under the tap-target floor on this,
            the mobile-only header. */}
        <LlamaInbox
          initialMessages={inboxMessages}
          triggerClassName="size-11"
        />
        <AccountMenu displayName={displayName} />
      </div>
    </header>
  );
}
