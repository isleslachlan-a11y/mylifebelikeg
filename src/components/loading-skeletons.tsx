import { Skeleton } from "@/components/ui/skeleton";

/**
 * P5.5's shared skeleton building blocks — "skeletons, not spinners"
 * (brief, verbatim), composed differently per route's own `loading.tsx`
 * to roughly match that route's real shape (a list page gets rows, the
 * timeline gets lane-shaped blocks, a detail page gets a header plus
 * sections) rather than one generic centred spinner everywhere. None of
 * these read any data — a `loading.tsx` renders before the page's own
 * server component has resolved anything, so there's nothing to key
 * off yet.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

/** A vertical list of row-shaped blocks — goals/pots/cashflow/ledger-style list pages. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** A grid of card-shaped blocks — the money dashboard's summary tiles, the constellation gallery. */
export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** A goal/constellation detail page: header block, then a couple of section-shaped lists. */
export function DetailPageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <ListSkeleton rows={3} />
      <ListSkeleton rows={4} />
    </div>
  );
}

/**
 * The cross-goal timeline's own shape: a filter-bar-ish row of small
 * blocks, then a handful of lane rows (a fixed-width "label" block
 * beside a wide "items" block) — deliberately not a literal recreation
 * of `HorizontalTimeline`'s gutter/axis layout, just enough of the same
 * silhouette that the real thing doesn't visibly jump into being once
 * `useTimelineItems` resolves.
 */
export function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-32 shrink-0" />
            <Skeleton className="h-10 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
