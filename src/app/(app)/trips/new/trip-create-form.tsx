"use client";

import { useState, useTransition, type FormEvent } from "react";
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
import {
  PlacePickerField,
  type PickedPlace,
} from "@/components/mapbox/place-picker-field";
import { COMMON_CURRENCIES, parseMoney } from "@/lib/money";
import type { Database } from "@/types/database";
import { createTripGoal, type CreateTripInput } from "../actions";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];
type FundingType = Database["public"]["Enums"]["funding_type"];

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * "Under 15 seconds" (P6.1's bar for a someday item) is the same
 * instinct here: title first, everything else optional. Funding
 * defaults to `spend_against` rather than goal-form.tsx's plain `none`
 * default — a trip is spent against, essentially always, so this saves
 * the one click most trips need anyway; still changeable.
 */
export function TripCreateForm({
  lifeAreas,
  defaultCurrency,
}: {
  lifeAreas: LifeArea[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const uncategorisedId = lifeAreas.find((a) => a.is_system)?.id ?? "";

  const [title, setTitle] = useState("");
  const [lifeAreaId, setLifeAreaId] = useState(uncategorisedId);
  const [funding, setFunding] = useState<FundingType>("spend_against");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [targetAmount, setTargetAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [originName, setOriginName] = useState("");
  const [origin, setOrigin] = useState<PickedPlace | null>(null);
  const [notes, setNotes] = useState("");

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

    const input: CreateTripInput = {
      title,
      lifeAreaId: lifeAreaId || null,
      funding,
      currency,
      targetAmountMinor,
      startDate: startDate || null,
      targetDate: targetDate || null,
      origin:
        originName.trim() || origin
          ? {
              name: originName.trim() || origin?.name || null,
              latitude: origin?.latitude ?? null,
              longitude: origin?.longitude ?? null,
            }
          : null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = await createTripGoal(input);
      // A successful create redirects server-side and this branch never
      // runs — only a failure returns a value to display here.
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
        <Label htmlFor="trip-title">Title</Label>
        <Input
          id="trip-title"
          placeholder="e.g. Japan 2027"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-life-area">Life area</Label>
        <Select value={lifeAreaId} onValueChange={setLifeAreaId}>
          <SelectTrigger id="trip-life-area">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-funding">Funding</Label>
        <Select
          value={funding}
          onValueChange={(v) => setFunding(v as FundingType)}
        >
          <SelectTrigger id="trip-funding">
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
            <Label htmlFor="trip-target-amount">Target amount</Label>
            <Input
              id="trip-target-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trip-currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="trip-currency" className="w-20">
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
          <Label htmlFor="trip-start-date">Start date</Label>
          <Input
            id="trip-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trip-target-date">Target date</Label>
          <Input
            id="trip-target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Stop dates are derived from the start date plus each stop&rsquo;s nights
        — set once here, never edited directly on a stop.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-origin-name">Starting from (optional)</Label>
        <Input
          id="trip-origin-name"
          placeholder="e.g. Home"
          value={originName}
          onChange={(e) => setOriginName(e.target.value)}
        />
      </div>
      <PlacePickerField
        value={origin}
        onChange={(place) => {
          setOrigin(place);
          if (place && !originName.trim() && place.name) {
            setOriginName(place.name);
          }
        }}
        label="Pin your starting point (optional)"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trip-notes">Notes (optional)</Label>
        <Textarea
          id="trip-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          Create trip
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
