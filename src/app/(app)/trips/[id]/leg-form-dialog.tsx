"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import {
  BOOKING_STATE_PROGRESSION,
  bookingStateLabel,
  travelModeLabel,
} from "@/lib/trips";
import type { Database } from "@/types/database";
import type { ActionResult, TripState } from "./stop-actions";
import type { LegInput } from "./leg-actions";

type TripLeg = Database["public"]["Tables"]["trip_legs"]["Row"];
type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type TravelMode = Database["public"]["Enums"]["travel_mode"];

const CURRENCY_RE = /^[A-Z]{3}$/;
const ORIGIN_VALUE = "__origin__";

const TRAVEL_MODES: TravelMode[] = [
  "flight",
  "train",
  "bus",
  "car",
  "ferry",
  "boat",
  "walk",
  "cycle",
  "other",
];

type FormState = {
  fromStopId: string; // ORIGIN_VALUE or a stop id
  toStopId: string;
  mode: TravelMode;
  durationText: string;
  costText: string;
  currency: string;
  bookingState: BookingStatus;
  bookingReference: string;
  bookingUrl: string;
  notes: string;
};

function emptyForm(defaultCurrency: string): FormState {
  return {
    fromStopId: ORIGIN_VALUE,
    toStopId: ORIGIN_VALUE,
    mode: "flight",
    durationText: "",
    costText: "",
    currency: defaultCurrency,
    bookingState: "idea",
    bookingReference: "",
    bookingUrl: "",
    notes: "",
  };
}

function formFromLeg(leg: TripLeg, defaultCurrency: string): FormState {
  return {
    fromStopId: leg.from_stop_id ?? ORIGIN_VALUE,
    toStopId: leg.to_stop_id ?? ORIGIN_VALUE,
    mode: leg.mode,
    durationText:
      leg.duration_minutes != null ? String(leg.duration_minutes) : "",
    costText:
      leg.cost_minor != null && leg.currency
        ? formatMoney(leg.cost_minor, leg.currency)
        : "",
    currency: leg.currency ?? defaultCurrency,
    bookingState: leg.booking_state,
    bookingReference: leg.booking_reference ?? "",
    bookingUrl: leg.booking_url ?? "",
    notes: leg.notes ?? "",
  };
}

/**
 * "One endpoint may be null for travel from the trip origin" (P6.3
 * brief) — `ORIGIN_VALUE` is this form's own sentinel for that null,
 * never sent to the server as a real value (Radix `<Select>` items can't
 * carry an empty-string value, so a real `null` has no direct
 * representation as a `<SelectItem>` in the first place).
 */
export function LegFormDialog({
  mode,
  open,
  leg,
  stops,
  originName,
  defaultCurrency,
  onOpenChange,
  onSubmit,
  onSaved,
}: {
  mode: "create" | "edit";
  open: boolean;
  leg?: TripLeg | null;
  stops: TripStop[];
  originName: string | null;
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: LegInput) => Promise<ActionResult<TripState>>;
  onSaved: (state: TripState) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCurrency));

  const currentKey =
    mode === "edit" ? (leg?.id ?? null) : open ? "create" : null;
  if (open && currentKey !== key) {
    setKey(currentKey);
    setForm(
      mode === "edit" && leg
        ? formFromLeg(leg, defaultCurrency)
        : emptyForm(defaultCurrency),
    );
    setError(null);
  }

  function patch(fields: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.fromStopId === ORIGIN_VALUE && form.toStopId === ORIGIN_VALUE) {
      setError("A leg needs at least one endpoint.");
      return;
    }
    if (form.fromStopId !== ORIGIN_VALUE && form.fromStopId === form.toStopId) {
      setError("A leg can't start and end at the same stop.");
      return;
    }

    let durationMinutes: number | null = null;
    if (form.durationText.trim()) {
      durationMinutes = Number(form.durationText);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
        setError("Duration must be a whole number of minutes, zero or more.");
        return;
      }
    }

    let costMinor: number | null = null;
    if (form.costText.trim()) {
      try {
        costMinor = parseMoney(form.costText, form.currency);
      } catch {
        setError("Enter a valid cost.");
        return;
      }
      if (costMinor < 0) {
        setError("Cost can't be negative.");
        return;
      }
      if (!CURRENCY_RE.test(form.currency)) {
        setError("Currency must be a 3-letter code.");
        return;
      }
    }

    const input: LegInput = {
      fromStopId: form.fromStopId === ORIGIN_VALUE ? null : form.fromStopId,
      toStopId: form.toStopId === ORIGIN_VALUE ? null : form.toStopId,
      mode: form.mode,
      durationMinutes,
      costMinor,
      currency: costMinor != null ? form.currency : null,
      bookingState: form.bookingState,
      bookingReference: form.bookingReference.trim() || null,
      bookingUrl: form.bookingUrl.trim() || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      const result = await onSubmit(input);
      if (result.ok) {
        onSaved(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  const originLabel = originName?.trim() || "Trip origin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Add leg" : "Edit leg"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="leg-from">From</Label>
              <Select
                value={form.fromStopId}
                onValueChange={(v) => patch({ fromStopId: v })}
              >
                <SelectTrigger id="leg-from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ORIGIN_VALUE}>{originLabel}</SelectItem>
                  {stops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="leg-to">To</Label>
              <Select
                value={form.toStopId}
                onValueChange={(v) => patch({ toStopId: v })}
              >
                <SelectTrigger id="leg-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ORIGIN_VALUE}>{originLabel}</SelectItem>
                  {stops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leg-mode">Mode</Label>
            <Select
              value={form.mode}
              onValueChange={(v) => patch({ mode: v as TravelMode })}
            >
              <SelectTrigger id="leg-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRAVEL_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {travelModeLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leg-duration">Duration, minutes (optional)</Label>
            <Input
              id="leg-duration"
              type="number"
              min={0}
              step={1}
              value={form.durationText}
              onChange={(e) => patch({ durationText: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="leg-cost">Cost (optional)</Label>
              <Input
                id="leg-cost"
                inputMode="decimal"
                placeholder="0.00"
                value={form.costText}
                onChange={(e) => patch({ costText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="leg-currency">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => patch({ currency: v })}
              >
                <SelectTrigger id="leg-currency" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set<string>([
                      ...COMMON_CURRENCIES,
                      defaultCurrency,
                      form.currency,
                    ]),
                  ).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leg-booking-state">Booking state</Label>
            <Select
              value={form.bookingState}
              onValueChange={(v) => patch({ bookingState: v as BookingStatus })}
            >
              <SelectTrigger id="leg-booking-state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...BOOKING_STATE_PROGRESSION, "cancelled" as const].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {bookingStateLabel(s)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="leg-booking-reference">
                Booking reference (optional)
              </Label>
              <Input
                id="leg-booking-reference"
                value={form.bookingReference}
                onChange={(e) => patch({ bookingReference: e.target.value })}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="leg-booking-url">Booking URL (optional)</Label>
              <Input
                id="leg-booking-url"
                type="url"
                value={form.bookingUrl}
                onChange={(e) => patch({ bookingUrl: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="leg-notes">Notes (optional)</Label>
            <Textarea
              id="leg-notes"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {mode === "create" ? "Add leg" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
