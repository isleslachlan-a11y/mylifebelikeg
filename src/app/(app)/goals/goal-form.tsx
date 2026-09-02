"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { Database } from "@/types/database";
import { createGoal, updateGoal, type GoalFormInput } from "./actions";

type Goal = Database["public"]["Tables"]["goals"]["Row"];
type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type GoalKind = Database["public"]["Enums"]["goal_kind"];
type FundingType = Database["public"]["Enums"]["funding_type"];
type VisibilityLevel = Database["public"]["Enums"]["visibility_level"];

const CURRENCY_RE = /^[A-Z]{3}$/;

export function GoalForm({
  goal,
  lifeAreas,
  defaultCurrency,
}: {
  goal?: Goal;
  lifeAreas: LifeArea[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const uncategorisedId = lifeAreas.find((a) => a.is_system)?.id ?? "";

  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [lifeAreaId, setLifeAreaId] = useState(
    goal?.life_area_id ?? uncategorisedId,
  );
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "standard");
  const [funding, setFunding] = useState<FundingType>(goal?.funding ?? "none");
  const [currency, setCurrency] = useState(goal?.currency ?? defaultCurrency);
  const [targetAmount, setTargetAmount] = useState(
    goal?.target_amount_minor != null
      ? formatMoney(goal.target_amount_minor, goal.currency)
      : "",
  );
  const [startDate, setStartDate] = useState(goal?.start_date ?? "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [visibility, setVisibility] = useState<VisibilityLevel>(
    goal?.visibility ?? "private",
  );

  // The database only checks currency ~ '^[A-Z]{3}$' — not that Intl
  // actually recognises it. Keeping this a bounded Select (rather than
  // free text) is what guarantees formatMoney/parseMoney never throw on
  // a well-formed but made-up code.
  const currencyOptions = Array.from(
    new Set<string>([...COMMON_CURRENCIES, defaultCurrency, currency]),
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title can't be empty.");
      return;
    }
    if (!CURRENCY_RE.test(currency)) {
      setError("Currency must be a 3-letter code.");
      return;
    }

    let targetAmountMinor: number | null = null;
    if (funding !== "none") {
      if (!targetAmount.trim()) {
        setError("Target amount is required for this funding type.");
        return;
      }
      try {
        targetAmountMinor = parseMoney(targetAmount, currency);
      } catch {
        setError("Enter a valid target amount.");
        return;
      }
      if (targetAmountMinor < 0) {
        setError("Target amount can't be negative.");
        return;
      }
    }

    const input: GoalFormInput = {
      title,
      description: description.trim() || null,
      lifeAreaId: lifeAreaId || null,
      kind,
      funding,
      currency,
      targetAmountMinor,
      startDate: startDate || null,
      targetDate: targetDate || null,
      visibility,
    };

    startTransition(async () => {
      const result = goal
        ? await updateGoal(goal.id, input)
        : await createGoal(input);
      // A successful create/update redirects server-side and this branch
      // never runs — only a failure returns a value to display here.
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="life-area">Life area</Label>
        <Select value={lifeAreaId} onValueChange={setLifeAreaId}>
          <SelectTrigger id="life-area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lifeAreas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* P6.3: kind isn't a plain choice here anymore. A trip-kind goal
          needs a matching trips row (created atomically by
          app.create_trip_goal — see /trips/new) or it's an orphan: tagged
          as a trip with no stops/legs/estimates to show for it. So this
          form can't be where kind flips to "trip" (no "Trip" option in
          create mode), and can't be where an existing trip-kind goal
          flips back to "standard" either (the select is disabled once
          kind is already "trip" — nothing enforces that direction at the
          database level, unlike trips_kind_check's own goal_id → kind
          check, so the UI is what holds the line). */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kind">Kind</Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as GoalKind)}
          disabled={kind === "trip"}
        >
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            {kind === "trip" && <SelectItem value="trip">Trip</SelectItem>}
          </SelectContent>
        </Select>
        {kind === "trip" ? (
          <p className="text-muted-foreground text-xs">
            Stops, legs and the budget rollup live on the trip&rsquo;s own page
            — this form only edits the goal itself.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Building a trip?{" "}
            <Link href="/trips/new" className="underline">
              Start a trip
            </Link>{" "}
            instead — it creates the goal and trip together.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="funding">Funding</Label>
        <Select
          value={funding}
          onValueChange={(v) => setFunding(v as FundingType)}
        >
          <SelectTrigger id="funding">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="save_toward">Save toward</SelectItem>
            <SelectItem value="spend_against">Spend against</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {funding !== "none" && (
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="target-amount">Target amount</Label>
            <Input
              id="target-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="currency" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="start-date">Start date</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-date">Target date</Label>
          <Input
            id="target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="visibility">Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(v) => setVisibility(v as VisibilityLevel)}
        >
          <SelectTrigger id="visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="shared">Shared</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {goal ? "Save changes" : "Create goal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
