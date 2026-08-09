"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LedgerFilters({
  goalOptions,
  potOptions,
}: {
  goalOptions: { id: string; title: string }[];
  potOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goal = searchParams.get("goal") ?? "all";
  const pot = searchParams.get("pot") ?? "all";
  const type = searchParams.get("type") ?? "all";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/money/ledger?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label>Goal</Label>
        <Select value={goal} onValueChange={(v) => update("goal", v)}>
          <SelectTrigger aria-label="Filter by goal" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All goals</SelectItem>
            <SelectItem value="none">No goal</SelectItem>
            {goalOptions.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Pot</Label>
        <Select value={pot} onValueChange={(v) => update("pot", v)}>
          <SelectTrigger aria-label="Filter by pot" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pots</SelectItem>
            <SelectItem value="none">No pot</SelectItem>
            {potOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => update("type", v)}>
          <SelectTrigger aria-label="Filter by type" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="contribution">Contribution</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ledger-from">From</Label>
        <Input
          id="ledger-from"
          type="date"
          value={from}
          onChange={(e) => update("from", e.target.value)}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ledger-to">To</Label>
        <Input
          id="ledger-to"
          type="date"
          value={to}
          onChange={(e) => update("to", e.target.value)}
          className="w-36"
        />
      </div>
    </div>
  );
}
