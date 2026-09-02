import {
  CircleUser,
  ClipboardCheck,
  Compass,
  GanttChart,
  History,
  LayoutDashboard,
  Map,
  Plane,
  Sparkles,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// The full set, in the order the desktop sidebar shows them.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timeline", label: "Timeline", icon: GanttChart },
  { href: "/goals", label: "Goals", icon: Target },
  // P6.1: the bucket list — sits beside Trips (someday items promote
  // into a trip's stops) rather than in the "looking back" group below.
  { href: "/someday", label: "Someday", icon: Compass },
  { href: "/trips", label: "Trips", icon: Plane },
  // P6.4: dreams and trip stops together on one map — sits right after
  // the two pages it draws from.
  { href: "/map", label: "Map", icon: Map },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/check-in", label: "Check-in", icon: ClipboardCheck },
  // P5.3: the archive — completed/abandoned goals, looking back rather
  // than forward, so it sits after every forward-looking item above.
  { href: "/constellations", label: "Constellations", icon: Sparkles },
  // P5.4: same "looking back" grouping as Constellations, right beside it.
  { href: "/retrospective", label: "Retrospective", icon: History },
  { href: "/profile", label: "Profile", icon: CircleUser },
];

// Mobile's bottom tab bar only has room for the five most important
// destinations — Money and Profile move into the profile menu instead.
const MOBILE_TAB_HREFS = new Set([
  "/dashboard",
  "/timeline",
  "/goals",
  "/trips",
  "/check-in",
]);

export const TAB_BAR_ITEMS = NAV_ITEMS.filter((item) =>
  MOBILE_TAB_HREFS.has(item.href),
);

export const PROFILE_MENU_ITEMS = NAV_ITEMS.filter(
  (item) => !MOBILE_TAB_HREFS.has(item.href),
);
