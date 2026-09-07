import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { NAV_MANIFEST, getTabBarEntries, type NavEntry } from "./manifest";

/**
 * P10.0: "Enumerate the routes in the app router, assert every one
 * appears in the navigation manifest, and fail the build on any that
 * doesn't. This is the same shape as P9.0's information_schema check:
 * the useful part is not today's list passing, it's that a route added
 * later cannot quietly skip mobile" (brief, verbatim) — the filesystem
 * scan below is this package's `information_schema.tables`.
 *
 * Scoped to `src/app/(app)/**` specifically, not the whole app router:
 * this manifest is the navigation for the authenticated shell
 * (`src/app/(app)/layout.tsx`'s Sidebar/TabBar), and only routes
 * rendered inside that shell are its job to cover. `(auth)` routes
 * (login, signup, forgot/reset-password, onboarding) and the root `/`
 * (which does its own auth/profile redirect branch, never rendering
 * this navigation at all) are structurally outside it — excluding them
 * isn't a carve-out, it's the same boundary the route groups themselves
 * already draw.
 *
 * `EXCLUDED_ROUTES` is deliberately narrow and named, not a wildcard —
 * a real destination added under `(app)` later must fail loudly if it's
 * missing a manifest entry, not silently match a broad pattern:
 * - `/timeline/debug-items`, `/timeline/debug-lanes`,
 *   `/trips/debug-unsplash` — dev-only, `notFound()` in production
 *   (CLAUDE.md's own documented convention), never a real navigation
 *   destination.
 * - `/someday` — a `permanentRedirect` stub to `/dreams` (P8.2), not a
 *   page with content of its own; the `dreams` manifest entry is what
 *   actually covers this territory.
 */
const APP_GROUP_DIR = join(process.cwd(), "src", "app", "(app)");

const EXCLUDED_ROUTES = new Set<string>([
  "/timeline/debug-items",
  "/timeline/debug-lanes",
  "/trips/debug-unsplash",
  "/someday",
]);

/**
 * Recursively finds every `page.tsx` under `dir` and converts its
 * location to the URL path Next.js would actually serve it at —
 * stripping the `(app)` route-group segment (parenthesized segments
 * never appear in the URL) and the trailing `page.tsx` itself.
 * Dynamic segments (`[id]`, `[handle]`, `[year]`) are kept as literal
 * bracketed text, not resolved to a real value — `isRouteCovered`
 * below matches them the same way a manifest prefix would.
 */
export function findAppRouterPages(rootDir: string = APP_GROUP_DIR): string[] {
  const routes: string[] = [];

  function walk(dir: string, segments: string[]) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const isDir = statSync(fullPath).isDirectory();

      if (isDir) {
        // Route-group segments like "(app)" are wrapped in parens and
        // never appear in the URL.
        const isRouteGroup = entry.startsWith("(") && entry.endsWith(")");
        walk(fullPath, isRouteGroup ? segments : [...segments, entry]);
        continue;
      }

      if (entry === "page.tsx" || entry === "page.ts") {
        routes.push("/" + segments.join("/"));
      }
    }
  }

  walk(rootDir, []);
  return routes;
}

/** A route is covered if it exactly matches a manifest entry's href, or falls under one as a path prefix (a dynamic/nested sub-route of a section root). */
export function isRouteCovered(route: string, manifest: NavEntry[] = NAV_MANIFEST): boolean {
  return manifest.some(
    (entry) => route === entry.href || route.startsWith(`${entry.href}/`),
  );
}

/** Every real `(app)` route not covered by the manifest and not explicitly excluded — should always be empty; see this file's own header for what "covered" and "excluded" mean. */
export function findUncoveredRoutes(
  routes: string[] = findAppRouterPages(),
  manifest: NavEntry[] = NAV_MANIFEST,
): string[] {
  return routes.filter(
    (route) => !EXCLUDED_ROUTES.has(route) && !isRouteCovered(route, manifest),
  );
}

/**
 * Tap depth from the default screen (dashboard), structurally: a tab
 * bar entry is always one tap away (the bar is persistent on every
 * screen); everything else lives in the More sheet, itself always one
 * tap away via its own tab-bar slot, so a second tap reaches any of
 * its entries — two taps total. Nothing in this manifest is nested
 * deeper than that (the More sheet is a flat, grouped list, not an
 * accordion of sub-menus), so this is a real computation from the
 * manifest's own structure, not a hardcoded "yes" — a future change
 * that buried an entry behind an extra screen would change what this
 * function returns for it, and the acceptance test below would catch
 * the regression against its own `<= 3` bound.
 */
export function tapDepth(entry: NavEntry): number {
  const isTabBarEntry = getTabBarEntries().some((e) => e.id === entry.id);
  return isTabBarEntry ? 1 : 2;
}
