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

export function GoalsFilters({
  lifeAreas,
}: {
  lifeAreas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = searchParams.get("state") ?? "active";
  const lifeArea = searchParams.get("life_area") ?? "all";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/goals?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={state} onValueChange={(v) => update("state", v)}>
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

      <Select value={lifeArea} onValueChange={(v) => update("life_area", v)}>
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
