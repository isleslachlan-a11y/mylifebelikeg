"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
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
import {
  PlacePickerField,
  type PickedPlace,
} from "@/components/mapbox/place-picker-field";
import { PhotoPicker } from "@/components/unsplash/photo-picker";
import { UnsplashAttribution } from "@/components/unsplash/unsplash-attribution";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import { BOOKING_STATE_PROGRESSION, bookingStateLabel } from "@/lib/trips";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import type { Database } from "@/types/database";
import type { ActionResult, StopInput, TripState } from "./stop-actions";

type TripStop = Database["public"]["Tables"]["trip_stops"]["Row"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];

const CURRENCY_RE = /^[A-Z]{3}$/;

function photoFromStop(stop: TripStop): UnsplashPhotoResult | null {
  if (!stop.unsplash_photo_id) return null;
  return {
    id: stop.unsplash_photo_id,
    thumbUrl: stop.unsplash_thumb_url ?? "",
    fullUrl: stop.unsplash_full_url ?? "",
    altDescription: null,
    width: 0,
    height: 0,
    authorName: stop.unsplash_author_name ?? "",
    authorUrl: stop.unsplash_author_url ?? "",
    downloadLocation: "",
  };
}

type FormState = {
  name: string;
  placeName: string;
  countryCode: string;
  place: PickedPlace | null;
  nights: string;
  costText: string;
  currency: string;
  bookingState: BookingStatus;
  bookingReference: string;
  bookingUrl: string;
  notes: string;
  photo: UnsplashPhotoResult | null;
};

function emptyForm(defaultCurrency: string): FormState {
  return {
    name: "",
    placeName: "",
    countryCode: "",
    place: null,
    nights: "1",
    costText: "",
    currency: defaultCurrency,
    bookingState: "idea",
    bookingReference: "",
    bookingUrl: "",
    notes: "",
    photo: null,
  };
}

function formFromStop(stop: TripStop, defaultCurrency: string): FormState {
  return {
    name: stop.name,
    placeName: stop.place_name ?? "",
    countryCode: stop.country_code?.trim() ?? "",
    place:
      stop.latitude != null && stop.longitude != null
        ? {
            name: stop.place_name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            placeId: stop.mapbox_place_id,
            countryCode: stop.country_code,
          }
        : null,
    nights: String(stop.nights),
    costText:
      stop.estimated_cost_minor != null && stop.currency
        ? formatMoney(stop.estimated_cost_minor, stop.currency)
        : "",
    currency: stop.currency ?? defaultCurrency,
    bookingState: stop.booking_state,
    bookingReference: stop.booking_reference ?? "",
    bookingUrl: stop.booking_url ?? "",
    notes: stop.notes ?? "",
    photo: photoFromStop(stop),
  };
}

/**
 * One form, two modes — create (no `stop`) and edit (`stop` set). Same
 * "picked place summary + map, or search" shape as
 * `someday-form-dialog.tsx` via the shared `<PlacePickerField>`, and the
 * same "current photo + Change, or search" shape via `<PhotoPicker>`.
 */
export function StopFormDialog({
  mode,
  open,
  stop,
  defaultCurrency,
  onOpenChange,
  onSubmit,
  onSaved,
}: {
  mode: "create" | "edit";
  open: boolean;
  stop?: TripStop | null;
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StopInput) => Promise<ActionResult<TripState>>;
  onSaved: (state: TripState) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCurrency));

  const currentKey =
    mode === "edit" ? (stop?.id ?? null) : open ? "create" : null;
  if (open && currentKey !== key) {
    setKey(currentKey);
    setForm(
      mode === "edit" && stop
        ? formFromStop(stop, defaultCurrency)
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

    const name = form.name.trim();
    if (!name) {
      setError("Name can't be empty.");
      return;
    }

    const nights = Number(form.nights);
    if (!Number.isInteger(nights) || nights < 0) {
      setError("Nights must be a whole number, zero or more.");
      return;
    }

    let estimatedCostMinor: number | null = null;
    if (form.costText.trim()) {
      try {
        estimatedCostMinor = parseMoney(form.costText, form.currency);
      } catch {
        setError("Enter a valid cost.");
        return;
      }
      if (estimatedCostMinor < 0) {
        setError("Cost can't be negative.");
        return;
      }
      if (!CURRENCY_RE.test(form.currency)) {
        setError("Currency must be a 3-letter code.");
        return;
      }
    }

    const countryCode = form.countryCode.trim();
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) {
      setError("Country code must be 2 letters, e.g. JP.");
      return;
    }

    const input: StopInput = {
      name,
      placeName: form.placeName.trim() || null,
      latitude: form.place?.latitude ?? null,
      longitude: form.place?.longitude ?? null,
      countryCode: countryCode || null,
      mapboxPlaceId: form.place?.placeId ?? null,
      nights,
      estimatedCostMinor,
      currency: estimatedCostMinor != null ? form.currency : null,
      bookingState: form.bookingState,
      bookingReference: form.bookingReference.trim() || null,
      bookingUrl: form.bookingUrl.trim() || null,
      notes: form.notes.trim() || null,
      photo: form.photo,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Add stop" : "Edit stop"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-name">Name</Label>
            <Input
              id="stop-name"
              placeholder="e.g. Tokyo"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Photo</Label>
            {form.photo ? (
              <div className="flex flex-col gap-2">
                <div className="ring-foreground/10 aspect-video w-full overflow-hidden rounded-lg ring-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.photo.fullUrl || form.photo.thumbUrl}
                    alt={form.photo.altDescription ?? ""}
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <UnsplashAttribution
                    authorName={form.photo.authorName}
                    authorUrl={form.photo.authorUrl}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch({ photo: null })}
                  >
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <PhotoPicker onSelect={(photo) => patch({ photo })} />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-place">Place</Label>
            <Input
              id="stop-place"
              placeholder="e.g. Shibuya, Tokyo"
              value={form.placeName}
              onChange={(e) => patch({ placeName: e.target.value })}
            />
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label htmlFor="stop-country">Country</Label>
            <Input
              id="stop-country"
              placeholder="JP"
              maxLength={2}
              value={form.countryCode}
              onChange={(e) =>
                patch({ countryCode: e.target.value.toUpperCase() })
              }
            />
          </div>
          <PlacePickerField
            value={form.place}
            onChange={(place) => {
              patch({
                place,
                placeName: form.placeName || place?.name || form.placeName,
                countryCode:
                  form.countryCode || place?.countryCode || form.countryCode,
              });
            }}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-nights">Nights</Label>
            <Input
              id="stop-nights"
              type="number"
              min={0}
              step={1}
              value={form.nights}
              onChange={(e) => patch({ nights: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="stop-cost">Estimated cost (optional)</Label>
              <Input
                id="stop-cost"
                inputMode="decimal"
                placeholder="0.00"
                value={form.costText}
                onChange={(e) => patch({ costText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stop-currency">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => patch({ currency: v })}
              >
                <SelectTrigger id="stop-currency" className="w-20">
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
            <Label htmlFor="stop-booking-state">Booking state</Label>
            <Select
              value={form.bookingState}
              onValueChange={(v) => patch({ bookingState: v as BookingStatus })}
            >
              <SelectTrigger id="stop-booking-state">
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
              <Label htmlFor="stop-booking-reference">
                Booking reference (optional)
              </Label>
              <Input
                id="stop-booking-reference"
                value={form.bookingReference}
                onChange={(e) => patch({ bookingReference: e.target.value })}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="stop-booking-url">Booking URL (optional)</Label>
              <Input
                id="stop-booking-url"
                type="url"
                value={form.bookingUrl}
                onChange={(e) => patch({ bookingUrl: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-notes">Notes (optional)</Label>
            <Textarea
              id="stop-notes"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          {mode === "edit" && stop?.someday_item_id && (
            <Badge variant="outline" className="w-fit">
              Promoted from your someday list
            </Badge>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {mode === "create" ? "Add stop" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
