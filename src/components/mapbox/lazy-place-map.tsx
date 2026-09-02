"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The actual import boundary every caller should use — `place-map.tsx`
 * itself only lazy-loads the `mapbox-gl` *library*; wrapping it here in
 * `next/dynamic({ ssr: false })` additionally keeps `<PlaceMap>`'s own
 * (small, but non-zero) component code out of any route's bundle unless
 * that route actually renders a map, and sidesteps SSR entirely for a
 * component whose effects touch `window`/`document` the moment they run.
 */
export const LazyPlaceMap = dynamic(
  () => import("./place-map").then((mod) => mod.PlaceMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
  },
);
