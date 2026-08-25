"use client";

import { useSyncExternalStore } from "react";

// One less than Tailwind's `md` breakpoint (768px) — matches the app
// shell's own mobile/desktop split (`md:hidden`/`md:flex` in
// src/components/app-shell/*), so "mobile" here means exactly the range
// the sidebar is hidden and the tab bar shows.
const MOBILE_QUERY = "(max-width: 767px)";

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

// Always `false` server-side and on the very first client render — there
// is no viewport to ask yet, and guessing would risk the exact hydration
// mismatch this app already got bitten by once (P0.8's "today" marker,
// PHASE-3-REQUIREMENTS.MD's R2). Unlike that bug, this one uses
// `useSyncExternalStore` correctly: `getSnapshot` reads a genuinely
// stable value that only changes when the media query itself flips, not
// a continuously-changing clock — so there's no infinite-loop risk, just
// the one extra render after mount that every SSR-safe media query hook
// pays.
function getServerSnapshot(): boolean {
  return false;
}

/** Whether the viewport is currently at or below the app's mobile breakpoint. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
