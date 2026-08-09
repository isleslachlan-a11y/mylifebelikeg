"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATES = [
  { value: "active", label: "Active" },
  { value: "someday", label: "Someday" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
  { value: "abandoned", label: "Abandoned" },
  { value: "all", label: "All states" },
] as const;

const SORTS = [
  { value: "grouped", label: "By life area" },
  { value: "urgency", label: "By urgency" },
] as const;

export function GoalsFilters({
  lifeAreas,
}: {
  lifeAreas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = searchParams.get("state") ?? "active";
  const lifeArea = searchParams.get("life_area") ?? "all";
  const sort = searchParams.get("sort") ?? "grouped";

  // `defaultValue` is whatever page.tsx's own fallback is when the param
  // is absent — deleting the param only produces the intended state if
  // that matches. Found and fixed while adding sort (P1.10): this used
  // to hard-code "all" for every key, which is right for life_area
  // (absent really does mean "all") but wrong for state — page.tsx falls
  // back to "active" when `state` is missing, not "all", so selecting
  // "All states" was silently deleting the param and landing back on
  // "active" instead.
  function update(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams);
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/goals?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={state} onValueChange={(v) => update("state", v, "active")}>
        <SelectTrigger aria-label="Filter by state" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={lifeArea}
        onValueChange={(v) => update("life_area", v, "all")}
      >
        <SelectTrigger aria-label="Filter by life area" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All life areas</SelectItem>
          {lifeAreas.map((area) => (
            <SelectItem key={area.id} value={area.id}>
              {area.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => update("sort", v, "grouped")}>
        <SelectTrigger aria-label="Sort goals" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
