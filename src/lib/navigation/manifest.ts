import {
  BookImage,
  CircleUser,
  ClipboardCheck,
  Gauge,
  GanttChart,
  History,
  LayoutDashboard,
  Map,
  Palette,
  Plane,
  ShieldAlert,
  Sparkles,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { NavLabelKey } from "./labels";

/**
 * P10.0: the single navigation manifest. "The desktop sidebar and the
 * mobile navigation are maintained separately, so mobile has drifted
 * behind... That drift is the thing to fix" (brief, verbatim) — every
 * surface that shows navigation (Sidebar, TabBar, the More sheet, the
 * jump menu) reads from this one array and nothing else. There is
 * deliberately no `surfaces: ['desktop']`-shaped field anywhere on
 * `NavEntry`: that field is exactly how the two lists diverged in the
 * first place, since it's an open invitation to add something "for
 * desktop only" and never circle back. A surface that wants to show
 * less (the tab bar's four-plus-More limit, the sidebar's own choice
 * not to list every settings sub-page inline) filters or groups this
 * same data at render time — the manifest itself carries no opinion
 * about which surface shows what.
 *
 * `group` is presentational (how the More sheet buckets entries under
 * a heading) — it is not a "which surface" flag and must never become
 * one. `priority` is the one true ranking: lower is higher-traffic.
 * `getTabBarEntries()` below takes the lowest four; everything else is
 * reachable through the More sheet or the jump menu. Reordering which
 * four make the tab bar is exactly one line — change a `priority`
 * value, nothing else.
 *
 * Route coverage (checked mechanically, not just by eye — see
 * `src/lib/navigation/reachability.ts` and its `.test.ts`): every
 * `page.tsx` under `src/app/(app)/**` is covered by exactly one entry
 * here, either directly (`href` matches) or by prefix (a dynamic/
 * nested route under an entry's `href`, e.g. `/goals/[id]/edit` under
 * the `goals` entry) — full mapping and reasoning live in
 * `reachability.ts`'s own header. `(auth)` routes, the root `/`
 * (which does its own auth/profile redirect branch), and the dev-only
 * `notFound()`-gated routes (`/styleguide/**`, `/timeline/debug-*`,
 * `/trips/debug-unsplash`) are outside this manifest by design — none
 * of them render inside the `(app)` shell this navigation belongs to.
 * `/someday` is a permanent redirect to `/dreams`, not a destination
 * of its own, so it's covered by the `dreams` entry's prefix match.
 */
export type NavGroup = "core" | "lookingBack" | "account";

export type NavEntry = {
  id: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  href: string;
  group: NavGroup;
  /** Lower is higher-traffic. The four lowest values become the tab bar's fixed slots (getTabBarEntries). */
  priority: number;
};

export const NAV_MANIFEST: NavEntry[] = [
  // Tab-bar slots (priority 1-4) — the highest-traffic routes,
  // provisional per the brief ("set them by manifest priority and
  // confirm them against the unassisted test in P9.10"). Trips was the
  // fifth item in the old hardcoded TAB_BAR_HREFS list (mobile-only, a
  // second source of truth this manifest replaces) — dropped to a
  // priority-5 More entry since a trip is planned occasionally, not
  // checked daily the way the other four are.
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    group: "core",
    priority: 1,
  },
  {
    id: "goals",
    labelKey: "nav.goals",
    icon: Target,
    href: "/goals",
    group: "core",
    priority: 2,
  },
  {
    id: "timeline",
    labelKey: "nav.timeline",
    icon: GanttChart,
    href: "/timeline",
    group: "core",
    priority: 3,
  },
  {
    id: "check-in",
    labelKey: "nav.checkIn",
    icon: ClipboardCheck,
    href: "/check-in",
    group: "core",
    priority: 4,
  },

  // Everything else — reachable via the More sheet (desktop: the
  // sidebar's own remaining list) and the jump menu, grouped for the
  // More sheet's headings.
  {
    id: "trips",
    labelKey: "nav.trips",
    icon: Plane,
    href: "/trips",
    group: "core",
    priority: 5,
  },
  {
    id: "dreams",
    labelKey: "nav.dreams",
    icon: BookImage,
    href: "/dreams",
    group: "core",
    priority: 6,
  },
  {
    id: "map",
    labelKey: "nav.map",
    icon: Map,
    href: "/map",
    group: "core",
    priority: 7,
  },
  {
    id: "money",
    labelKey: "nav.money",
    icon: Wallet,
    href: "/money",
    group: "core",
    priority: 8,
  },
  {
    id: "constellations",
    labelKey: "nav.constellations",
    icon: Sparkles,
    href: "/constellations",
    group: "lookingBack",
    priority: 9,
  },
  {
    id: "retrospective",
    labelKey: "nav.retrospective",
    icon: History,
    href: "/retrospective",
    group: "lookingBack",
    priority: 10,
  },
  {
    id: "profile",
    labelKey: "nav.profile",
    icon: CircleUser,
    href: "/profile",
    group: "account",
    priority: 11,
  },
  {
    id: "profile-avatar",
    labelKey: "nav.profileAvatar",
    icon: Palette,
    href: "/profile/avatar",
    group: "account",
    priority: 12,
  },
  {
    id: "settings-capacity",
    labelKey: "nav.settingsCapacity",
    icon: Gauge,
    href: "/settings/capacity",
    group: "account",
    priority: 13,
  },
  {
    id: "settings-life-areas",
    labelKey: "nav.settingsLifeAreas",
    icon: Tags,
    href: "/settings/life-areas",
    group: "account",
    priority: 14,
  },
  {
    id: "settings-account",
    labelKey: "nav.settingsAccount",
    icon: ShieldAlert,
    href: "/settings/account",
    group: "account",
    priority: 15,
  },
];

const TAB_BAR_SIZE = 4;

/** The tab bar's fixed slots — the `TAB_BAR_SIZE` lowest-priority entries, in priority order. */
export function getTabBarEntries(): NavEntry[] {
  return [...NAV_MANIFEST].sort((a, b) => a.priority - b.priority).slice(0, TAB_BAR_SIZE);
}

/** Everything not on the tab bar — what the More sheet renders, still in priority order within each group. */
export function getMoreEntries(): NavEntry[] {
  const tabBarIds = new Set(getTabBarEntries().map((e) => e.id));
  return [...NAV_MANIFEST]
    .filter((e) => !tabBarIds.has(e.id))
    .sort((a, b) => a.priority - b.priority);
}

/** Full manifest, priority order — what the sidebar and the jump menu search over. */
export function getAllEntries(): NavEntry[] {
  return [...NAV_MANIFEST].sort((a, b) => a.priority - b.priority);
}
