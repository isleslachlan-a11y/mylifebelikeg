import { NavLink } from "./nav-link";
import { TAB_BAR_ITEMS } from "./nav-items";

export function TabBar() {
  return (
    <nav
      className="border-subtle bg-surface fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {TAB_BAR_ITEMS.map((item) => (
        <div key={item.href} className="flex flex-1 justify-center py-2">
          <NavLink
            href={item.href}
            label={item.label}
            icon={<item.icon className="size-5" aria-hidden />}
            orientation="col"
          />
        </div>
      ))}
    </nav>
  );
}
