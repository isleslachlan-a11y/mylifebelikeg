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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/types/database";
import {
  DEFAULT_SOMEDAY_FILTERS,
  countryName,
  distinctCountryCodes,
  filterSomedayItems,
  sortSomedayItems,
  type SomedayFilters,
  type SomedayItemRow,
  type SomedaySortKey,
} from "@/lib/someday";
import {
  createSomedayItem,
  deleteSomedayItem,
  updateSomedayItem,
} from "./actions";
import { SomedayCard } from "./someday-card";
import { SomedayFormDialog } from "./someday-form-dialog";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type SomedayProgressRow =
  Database["public"]["Views"]["v_someday_progress"]["Row"];

/**
 * Owns the list as client state, same shape as pots/pot-manager.tsx and
 * settings/life-areas' manager — create/edit go through
 * <SomedayFormDialog>'s explicit Save; delete applies optimistically
 * (immediate feedback, reverted on a server error, `router.refresh()`
 * reconciles progress numbers regardless — `v_someday_progress` is a
 * server-side view, not something this component recomputes itself).
 */
export function SomedayManager({
  initialItems,
  lifeAreas,
  progress,
  promotedTripTitles,
  defaultCurrency,
}: {
  initialItems: SomedayItemRow[];
  lifeAreas: LifeArea[];
  progress: SomedayProgressRow;
  promotedTripTitles: Record<string, string>;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [progressRow, setProgressRow] = useState(progress);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<SomedayFilters>(
    DEFAULT_SOMEDAY_FILTERS,
  );
  const [sortKey, setSortKey] = useState<SomedaySortKey>("date_added");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SomedayItemRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SomedayItemRow | null>(
    null,
  );

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
    filters.lifeAreaId !== "all" ||
    filters.countryCode !== "all" ||
    filters.promoted !== "all";

  function handleConfirmDelete() {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setError(null);

    startTransition(async () => {
      const result = await deleteSomedayItem(item.id);
      if (!result.ok) {
        setItems(previous);
        setError(result.error);
      } else {
        setProgressRow((p) => ({
          ...p,
          total_items: (p.total_items ?? 0) - 1,
          still_dreaming: (p.still_dreaming ?? 0) - 1,
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
        <FilterField label="Life area">
          <Select
            value={filters.lifeAreaId}
            onValueChange={(v) => setFilters((f) => ({ ...f, lifeAreaId: v }))}
          >
            <SelectTrigger className="w-40">
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
            <SelectTrigger className="w-40">
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

        <FilterField label="Status">
          <Select
            value={filters.promoted}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                promoted: v as SomedayFilters["promoted"],
              }))
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="not_promoted">Still dreaming</SelectItem>
              <SelectItem value="promoted">Promoted</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Sort by">
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SomedaySortKey)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_added">Date added</SelectItem>
              <SelectItem value="cost">Cost</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilters(DEFAULT_SOMEDAY_FILTERS)}
          >
            Clear filters
          </Button>
        )}

        <Button
          type="button"
          className="ml-auto"
          onClick={() => setIsCreateOpen(true)}
        >
          Add a place
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          No places yet — add the first thing you&rsquo;re dreaming about.
        </p>
      ) : visibleItems.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          Nothing matches these filters.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setFilters(DEFAULT_SOMEDAY_FILTERS)}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => (
            <SomedayCard
              key={item.id}
              item={item}
              lifeArea={
                item.life_area_id
                  ? lifeAreaById.get(item.life_area_id)
                  : undefined
              }
              promotedTripTitle={promotedTripTitles[item.id]}
              onClick={() => setEditingItem(item)}
            />
          ))}
        </div>
      )}

      <SomedayFormDialog
        mode="create"
        open={isCreateOpen}
        lifeAreas={lifeAreas}
        defaultCurrency={defaultCurrency}
        onOpenChange={setIsCreateOpen}
        onSubmit={createSomedayItem}
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

      <SomedayFormDialog
        mode="edit"
        open={editingItem !== null}
        item={editingItem}
        lifeAreas={lifeAreas}
        defaultCurrency={defaultCurrency}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSubmit={(input) => updateSomedayItem(editingItem!.id, input)}
        onSaved={(item) => {
          setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
          setEditingItem(null);
          router.refresh();
        }}
        onRequestDelete={() => {
          setPendingDelete(editingItem);
          setEditingItem(null);
        }}
      />

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
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
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

/** "Progress from v_someday_progress: total, promoted, still dreaming, and distinct countries wanted" (P6.1 brief, verbatim) — read straight off the view's own columns, no client-side recomputation (same "never recompute what a view already computed" rule the money dashboard follows). */
function ProgressRow({ progress }: { progress: SomedayProgressRow }) {
  const stats: { label: string; value: number }[] = [
    { label: "places", value: progress.total_items ?? 0 },
    { label: "promoted", value: progress.promoted_count ?? 0 },
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
