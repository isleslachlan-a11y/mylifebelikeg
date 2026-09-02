"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * URL-search-param-driven filters, same shape as `goals/goals-filters.tsx`
 * — `page.tsx` reads `year`/`lifeArea` from `searchParams` and does the
 * actual filtering server-side; this only edits the query string.
 * "All" is the absent-param state for both filters (`update`'s
 * `defaultValue` argument), so a bare `/constellations` and an explicit
 * `?year=all&lifeArea=all` are the same URL, never two different ones
 * for the same result.
 */
export function ConstellationFilterBar({
  years,
  lifeAreas,
}: {
  years: number[];
  lifeAreas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const year = searchParams.get("year") ?? "all";
  const lifeArea = searchParams.get("lifeArea") ?? "all";

  function update(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams);
    if (value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/constellations?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={year} onValueChange={(v) => update("year", v, "all")}>
        <SelectTrigger aria-label="Filter by year" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All years</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={lifeArea}
        onValueChange={(v) => update("lifeArea", v, "all")}
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
    </div>
  );
}
