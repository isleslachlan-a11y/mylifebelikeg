import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar({ displayName }: { displayName: string }) {
  return (
    <aside className="border-subtle bg-surface hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="px-4 py-5">
        <span className="font-display text-foreground text-xl">Starmap</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={<item.icon className="size-5 shrink-0" aria-hidden />}
            orientation="row"
          />
        ))}
      </nav>

      <div className="border-subtle flex flex-col gap-1 border-t px-3 py-3">
        <p className="text-foreground truncate px-3 py-1 text-sm">
          {displayName}
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}
