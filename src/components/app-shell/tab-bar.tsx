import { NavLink } from "./nav-link";
import { MoreSheet } from "./more-sheet";
import { navLabel } from "@/lib/navigation/labels";
import { getTabBarEntries } from "@/lib/navigation/manifest";

/**
 * P10.0: four fixed slots plus More, both read from the one navigation
 * manifest (`src/lib/navigation/manifest.ts`) — no array of its own.
 * `getTabBarEntries()` is the manifest's four lowest-`priority` values;
 * reordering which four show up here is a one-line change to a
 * `priority` field there, never a change to this file.
 */
export function TabBar({
  displayName,
  badgedNavEntryIds,
}: {
  displayName: string;
  /** Goal sharing package (S2) — see layout.tsx's own comment for how this is computed. */
  badgedNavEntryIds: Set<string>;
}) {
  const entries = getTabBarEntries();

  return (
    <nav
      className="border-subtle bg-surface fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label={navLabel("nav.primary")}
    >
      {entries.map((entry) => (
        <div key={entry.id} className="flex flex-1 justify-center py-2">
          <NavLink
            href={entry.href}
            label={navLabel(entry.labelKey)}
            icon={<entry.icon className="size-5" aria-hidden />}
            orientation="col"
            hasBadge={badgedNavEntryIds.has(entry.id)}
          />
        </div>
      ))}
      <div className="flex flex-1 justify-center py-2">
        <MoreSheet displayName={displayName} />
      </div>
    </nav>
  );
}
