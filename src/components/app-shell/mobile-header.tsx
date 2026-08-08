import { AccountMenu } from "./account-menu";

export function MobileHeader({ displayName }: { displayName: string }) {
  return (
    <header className="border-subtle bg-surface flex items-center justify-between border-b px-4 py-3 md:hidden">
      <span className="font-display text-foreground text-lg">Starmap</span>
      <AccountMenu displayName={displayName} />
    </header>
  );
}
