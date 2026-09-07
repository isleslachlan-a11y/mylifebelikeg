/**
 * P10.0: label *keys*, not literal strings, on every navigation entry
 * (manifest.ts) — "P9.7 replaces the user-facing vocabulary, and a nav
 * manifest full of literals is eleven more places to miss" (brief,
 * verbatim). This map is the one and only place a key resolves to
 * today's actual wording; P9.7 lands by editing values here, never by
 * touching the manifest or any component that renders it.
 *
 * Keys are dot-namespaced by where they show up, not by English word,
 * so "Dreams" and "Dream photo" (say) can diverge in P9.7 wording even
 * though they'd otherwise collide as the same string today.
 */
export const NAV_LABELS = {
  "nav.dashboard": "Dashboard",
  "nav.timeline": "Timeline",
  "nav.goals": "Goals",
  "nav.trips": "Trips",
  "nav.dreams": "Dreams",
  "nav.map": "Map",
  "nav.money": "Money",
  "nav.checkIn": "Check-in",
  "nav.constellations": "Constellations",
  "nav.retrospective": "Retrospective",
  "nav.profile": "Profile",
  "nav.profileAvatar": "Edit avatar",
  "nav.settingsCapacity": "Capacity",
  "nav.settingsLifeAreas": "Life areas",
  "nav.settingsAccount": "Account",
  "nav.more": "More",
  "nav.primary": "Primary",
  "nav.jump": "Jump to…",
  "nav.signOut": "Sign out",
  "nav.group.core": "Plan",
  "nav.group.lookingBack": "Looking back",
  "nav.group.account": "Account",
} as const;

export type NavLabelKey = keyof typeof NAV_LABELS;

export function navLabel(key: NavLabelKey): string {
  return NAV_LABELS[key];
}
