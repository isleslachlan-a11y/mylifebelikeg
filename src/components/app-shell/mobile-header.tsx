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
        <LlamaInbox initialMessages={inboxMessages} />
        <AccountMenu displayName={displayName} />
      </div>
    </header>
  );
}
