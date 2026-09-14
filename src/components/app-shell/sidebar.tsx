import { JumpMenuTrigger } from "./jump-menu-trigger";
import { LlamaInbox, type InboxMessage } from "./llama-inbox";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";
import { navLabel } from "@/lib/navigation/labels";
import { getAllEntries, type NavGroup } from "@/lib/navigation/manifest";

const GROUP_ORDER: NavGroup[] = ["core", "lookingBack", "account"];
const GROUP_LABEL_KEY: Record<NavGroup, "nav.group.core" | "nav.group.lookingBack" | "nav.group.account"> = {
  core: "nav.group.core",
  lookingBack: "nav.group.lookingBack",
  account: "nav.group.account",
};

/**
 * P10.0: reads the same navigation manifest every other surface does
 * (`src/lib/navigation/manifest.ts`) — no array of its own. Renders
 * every entry, grouped, rather than the curated subset the old
 * `NAV_ITEMS` array happened to have: the settings sub-pages
 * (capacity, life areas, account) and the avatar editor used to be
 * reachable only via links inside `/profile`'s own page content, never
 * from here — now that this list is generated instead of hand-typed,
 * there's no reason to keep them one click further away on the one
 * surface with room to spare. Mobile's own equivalent
 * (`more-sheet.tsx`) uses the identical grouping for the same reason:
 * one navigation, one shape, rendered on two surfaces.
 */
export function Sidebar({
  displayName,
  inboxMessages,
  badgedNavEntryIds,
}: {
  displayName: string;
  inboxMessages: InboxMessage[];
  /** Goal sharing package (S2) — see layout.tsx's own comment for how this is computed. */
  badgedNavEntryIds: Set<string>;
}) {
  const entriesByGroup = new Map(
    GROUP_ORDER.map((group) => [
      group,
      getAllEntries().filter((e) => e.group === group),
    ]),
  );

  return (
    <aside className="border-subtle bg-surface hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="flex items-center justify-between px-4 py-5">
        <span className="font-display text-foreground text-xl">Starmap</span>
        <div className="flex items-center gap-1">
          {/* P10.0: same jump entry point mobile's header gets, plus
              the Cmd+K hotkey this button is a visible hint for — see
              jump-menu.tsx's own header. */}
          <JumpMenuTrigger className="size-9" />
          <LlamaInbox initialMessages={inboxMessages} />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        {GROUP_ORDER.map((group) => {
          const entries = entriesByGroup.get(group) ?? [];
          if (entries.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-1">
              <p className="text-muted-foreground px-3 text-xs font-medium tracking-wide uppercase">
                {navLabel(GROUP_LABEL_KEY[group])}
              </p>
              {entries.map((entry) => (
                <NavLink
                  key={entry.id}
                  href={entry.href}
                  label={navLabel(entry.labelKey)}
                  icon={<entry.icon className="size-5 shrink-0" aria-hidden />}
                  orientation="row"
                  hasBadge={badgedNavEntryIds.has(entry.id)}
                />
              ))}
            </div>
          );
        })}
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
