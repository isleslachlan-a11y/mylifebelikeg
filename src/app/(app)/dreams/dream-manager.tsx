"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AchievementCelebration } from "@/components/achievement-celebration";
import type { DreamLinkCardData } from "@/components/social-links/dream-link-card";
import type { NewlyUnlockedAchievement } from "@/lib/achievements/types";
import type { Database } from "@/types/database";
import {
  DEFAULT_SOMEDAY_FILTERS,
  DREAM_KIND_LABELS,
  DREAM_KIND_OPTIONS,
  countryName,
  distinctCountryCodes,
  filterSomedayItems,
  sortSomedayItems,
  type DreamKind,
  type SomedayFilters,
  type SomedayItemRow,
  type SomedaySortKey,
} from "@/lib/someday";
import { createDream, deleteDream, updateDream } from "./actions";
import { AchieveDreamDialog } from "./achieve-dream-dialog";
import { DreamCard } from "./dream-card";
import { DreamEmptyState } from "./dream-empty-state";
import { DreamFormDialog } from "./dream-form-dialog";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type SomedayProgressRow =
  Database["public"]["Views"]["v_someday_progress"]["Row"];

const STATE_OPTIONS: { value: SomedayFilters["state"]; label: string }[] = [
  { value: "all", label: "All (except archived)" },
  { value: "dreaming", label: "Dreaming" },
  { value: "promoted", label: "Promoted" },
  { value: "achieved", label: "Achieved" },
  { value: "archived", label: "Archived" },
];

const SORT_OPTIONS: { value: SomedaySortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price", label: "Price" },
  { value: "longest_held", label: "Longest-held" },
];

/**
 * Plain decimal, scaled by 100 -- the same "raw minor units, no currency
 * conversion" simplification `sortSomedayItems`'s own "price" sort and
 * `filterSomedayItems`'s price range already document, applied to
 * parsing the filter's own text inputs. A real per-currency parse
 * (`parseMoney`) needs a currency to pick decimal digits from, and this
 * filter deliberately has no single currency to hand it -- it's a rough
 * personal range across whatever currencies are actually in use, not a
 * precise figure.
 */
function parsePriceFilterValue(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/**
 * Owns the list as client state, same shape as pots/pot-manager.tsx and
 * settings/life-areas' manager — create/edit go through
 * <DreamFormDialog>'s explicit Save; delete applies optimistically
 * (immediate feedback, reverted on a server error, `router.refresh()`
 * reconciles progress numbers regardless — `v_someday_progress` is a
 * server-side view, not something this component recomputes itself).
 */
export function DreamManager({
  initialItems,
  lifeAreas,
  userId,
  thumbUrlsByPath,
  progress,
  promotedTripTitles,
  defaultCurrency,
  linksByEntryId,
}: {
  initialItems: SomedayItemRow[];
  lifeAreas: LifeArea[];
  userId: string;
  /** Signed thumbnail URLs for every upload-sourced item, keyed by that item's own `storage_path` -- resolved once, server-side, at page load (see page.tsx's own comment). */
  thumbUrlsByPath: Record<string, string>;
  progress: SomedayProgressRow;
  promotedTripTitles: Record<string, string>;
  defaultCurrency: string;
  /** P10.3: every dream's own saved social links, prefetched once at page load and keyed by entry id -- same "no N+1, resolve it all up front" shape thumbUrlsByPath already established. */
  linksByEntryId: Record<string, DreamLinkCardData[]>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [progressRow, setProgressRow] = useState(progress);
  // P8.7: `useState(progress)` only ever seeds from the initial prop --
  // `router.refresh()` re-fetching `v_someday_progress` server-side and
  // handing this component a fresh `progress` object does *not* by
  // itself flow into `progressRow`, since this is the same client
  // component instance across that refresh, not a remount. Found live:
  // deleting an already-achieved dream left the header stuck at "-1
  // still dreaming" indefinitely, past the refresh that was supposed to
  // reconcile it (this component's own doc comment above already
  // promises that reconciliation) -- the fix below is what actually
  // makes that promise true, on top of (not instead of) the delete
  // handler's own optimistic-math fix.
  //
  // React's own documented "adjusting state when a prop changes"
  // pattern (react.dev), not a `useEffect` -- calling `setState`
  // synchronously inside an effect body is exactly what
  // `react-hooks/set-state-in-effect` flags (an extra commit+paint for
  // no reason); doing the comparison and the `setState` call inline
  // during render lets React bail out and re-render immediately,
  // without ever painting the stale intermediate state.
  const [lastProgress, setLastProgress] = useState(progress);
  if (progress !== lastProgress) {
    setLastProgress(progress);
    setProgressRow(progress);
  }

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<SomedayFilters>(
    DEFAULT_SOMEDAY_FILTERS,
  );
  const [priceMinText, setPriceMinText] = useState("");
  const [priceMaxText, setPriceMaxText] = useState("");
  const [sortKey, setSortKey] = useState<SomedaySortKey>("newest");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialKind, setCreateInitialKind] = useState<DreamKind>("place");
  const [editingItem, setEditingItem] = useState<SomedayItemRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SomedayItemRow | null>(
    null,
  );
  // P8.4: which dream is being achieved (grid's own quick action or the
  // detail view's "Mark achieved" button, both funnel through the same
  // dialog) and the live celebration -- see <AchievementCelebration>'s
  // own comment on why no dedupe state is needed beyond "this render's
  // own non-empty array".
  const [achievingItem, setAchievingItem] = useState<SomedayItemRow | null>(
    null,
  );
  const [unlockedAchievements, setUnlockedAchievements] = useState<
    NewlyUnlockedAchievement[]
  >([]);

  const lifeAreaById = useMemo(
    () => new Map(lifeAreas.map((a) => [a.id, a])),
    [lifeAreas],
  );
  const countryOptions = useMemo(() => distinctCountryCodes(items), [items]);
  const visibleItems = useMemo(
    () => sortSomedayItems(filterSomedayItems(items, filters), sortKey),
    [items, filters, sortKey],
  );
  const hasActiveFilters =
    filters.kind !== "all" ||
    filters.lifeAreaId !== "all" ||
    filters.countryCode !== "all" ||
    filters.priceMin != null ||
    filters.priceMax != null ||
    filters.state !== "all";

  function clearFilters() {
    setFilters(DEFAULT_SOMEDAY_FILTERS);
    setPriceMinText("");
    setPriceMaxText("");
  }

  function openCreate(kind: DreamKind) {
    setCreateInitialKind(kind);
    setIsCreateOpen(true);
  }

  function handleConfirmDelete() {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setError(null);

    startTransition(async () => {
      const result = await deleteDream(item.id);
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
      } else {
        // P8.7: found live -- this unconditionally decremented
        // `still_dreaming`, which is only correct when the deleted item
        // was actually still in that bucket. Deleting an *achieved*
        // dream (already excluded from still_dreaming the moment it was
        // achieved, per the achieve handler below) drove this negative
        // -- "-1 still dreaming" on screen, confirmed against a real
        // delete. Mirrors `v_someday_progress`'s own per-column filters
        // (0034) instead of assuming every deleted item was the same
        // kind of item; `Math.max(0, ...)` guards throughout as the same
        // defense-in-depth the achieve handler below already uses, on
        // top of (not instead of) getting the field selection right.
        setProgressRow((p) => ({
          ...p,
          total_items: Math.max(0, (p.total_items ?? 0) - 1),
          promoted_count:
            item.promoted_at != null
              ? Math.max(0, (p.promoted_count ?? 0) - 1)
              : p.promoted_count,
          still_dreaming:
            item.promoted_at == null && item.achieved_at == null
              ? Math.max(0, (p.still_dreaming ?? 0) - 1)
              : p.still_dreaming,
          achieved_count:
            item.achieved_at != null
              ? Math.max(0, (p.achieved_count ?? 0) - 1)
              : p.achieved_count,
          archived_count:
            item.archived_at != null
              ? Math.max(0, (p.archived_count ?? 0) - 1)
              : p.archived_count,
        }));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ProgressRow progress={progressRow} />

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Kind">
          <Select
            value={filters.kind}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, kind: v as SomedayFilters["kind"] }))
            }
          >
            <SelectTrigger className="w-36 max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {DREAM_KIND_OPTIONS.map((k) => (
                <SelectItem key={k} value={k}>
                  {DREAM_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Life area">
          <Select
            value={filters.lifeAreaId}
            onValueChange={(v) => setFilters((f) => ({ ...f, lifeAreaId: v }))}
          >
            <SelectTrigger className="w-40 max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All life areas</SelectItem>
              {lifeAreas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Country">
          <Select
            value={filters.countryCode}
            onValueChange={(v) => setFilters((f) => ({ ...f, countryCode: v }))}
          >
            <SelectTrigger className="w-40 max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countryOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {countryName(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Price range">
          <div className="flex items-center gap-1.5">
            <Input
              inputMode="decimal"
              placeholder="Min"
              className="w-20 max-md:h-11"
              value={priceMinText}
              onChange={(e) => {
                setPriceMinText(e.target.value);
                setFilters((f) => ({
                  ...f,
                  priceMin: parsePriceFilterValue(e.target.value),
                }));
              }}
            />
            <span className="text-muted-foreground text-xs" aria-hidden>
              –
            </span>
            <Input
              inputMode="decimal"
              placeholder="Max"
              className="w-20 max-md:h-11"
              value={priceMaxText}
              onChange={(e) => {
                setPriceMaxText(e.target.value);
                setFilters((f) => ({
                  ...f,
                  priceMax: parsePriceFilterValue(e.target.value),
                }));
              }}
            />
          </div>
        </FilterField>

        <FilterField label="State">
          <Select
            value={filters.state}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, state: v as SomedayFilters["state"] }))
            }
          >
            <SelectTrigger className="w-44 max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Sort by">
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SomedaySortKey)}
          >
            <SelectTrigger className="w-36 max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:h-11"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        )}

        <Button
          type="button"
          className="ml-auto min-h-11"
          onClick={() => openCreate("place")}
        >
          Add a dream
        </Button>
      </div>

      {items.length === 0 ? (
        <DreamEmptyState onStart={openCreate} />
      ) : visibleItems.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          Nothing matches these filters.{" "}
          <button type="button" className="underline" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => (
            <DreamCard
              key={item.id}
              item={item}
              lifeArea={
                item.life_area_id
                  ? lifeAreaById.get(item.life_area_id)
                  : undefined
              }
              promotedTripTitle={promotedTripTitles[item.id]}
              thumbUrl={
                item.storage_path ? thumbUrlsByPath[item.storage_path] : undefined
              }
              onClick={() => setEditingItem(item)}
              onAchieve={() => setAchievingItem(item)}
            />
          ))}
        </div>
      )}

      <AchievementCelebration unlocked={unlockedAchievements} />

      <DreamFormDialog
        mode="create"
        open={isCreateOpen}
        initialKind={createInitialKind}
        lifeAreas={lifeAreas}
        userId={userId}
        defaultCurrency={defaultCurrency}
        onOpenChange={setIsCreateOpen}
        onSubmit={createDream}
        onSaved={(item) => {
          setItems((prev) => [item, ...prev]);
          setProgressRow((p) => ({
            ...p,
            total_items: (p.total_items ?? 0) + 1,
            still_dreaming: (p.still_dreaming ?? 0) + 1,
          }));
          setIsCreateOpen(false);
          router.refresh();
        }}
      />

      <DreamFormDialog
        mode="edit"
        open={editingItem !== null}
        item={editingItem}
        links={editingItem ? (linksByEntryId[editingItem.id] ?? []) : []}
        lifeAreas={lifeAreas}
        userId={userId}
        defaultCurrency={defaultCurrency}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSubmit={(input) => updateDream(editingItem!.id, input)}
        onSaved={(item) => {
          setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
          setEditingItem(null);
          router.refresh();
        }}
        onRequestDelete={() => {
          setPendingDelete(editingItem);
          setEditingItem(null);
        }}
        onRequestAchieve={() => {
          setAchievingItem(editingItem);
          setEditingItem(null);
        }}
      />

      {achievingItem && (
        <AchieveDreamDialog
          open={achievingItem !== null}
          dreamId={achievingItem.id}
          userId={userId}
          onOpenChange={(open) => !open && setAchievingItem(null)}
          onAchieved={(result) => {
            setItems((prev) =>
              prev.map((i) => (i.id === result.dream.id ? result.dream : i)),
            );
            setProgressRow((p) => ({
              ...p,
              achieved_count: (p.achieved_count ?? 0) + 1,
              still_dreaming: Math.max(0, (p.still_dreaming ?? 0) - 1),
            }));
            setAchievingItem(null);
            if (result.unlockedAchievements.length > 0) {
              setUnlockedAchievements(result.unlockedAchievements);
            }
            router.refresh();
          }}
        />
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete &ldquo;{pendingDelete?.title}&rdquo;?
            </DialogTitle>
            <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="max-md:h-11"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="max-md:h-11"
              onClick={handleConfirmDelete}
              disabled={isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** "Progress from v_someday_progress: total, promoted, still dreaming, and distinct countries wanted" (P6.1 brief, verbatim) — read straight off the view's own columns, no client-side recomputation (same "never recompute what a view already computed" rule the money dashboard follows). "dreams" replaces the old "places" label (P8.2) since a dream is no longer necessarily a place. */
function ProgressRow({ progress }: { progress: SomedayProgressRow }) {
  const stats: { label: string; value: number }[] = [
    { label: "dreams", value: progress.total_items ?? 0 },
    { label: "promoted", value: progress.promoted_count ?? 0 },
    { label: "achieved", value: progress.achieved_count ?? 0 },
    { label: "still dreaming", value: progress.still_dreaming ?? 0 },
    { label: "countries wanted", value: progress.countries_wanted ?? 0 },
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className="font-display text-2xl">{s.value}</span>
          <span className="text-muted-foreground text-sm">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
