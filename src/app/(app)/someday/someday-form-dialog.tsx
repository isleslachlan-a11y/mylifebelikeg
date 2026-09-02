"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { PlacePickerField } from "@/components/mapbox/place-picker-field";
import { PhotoPicker } from "@/components/unsplash/photo-picker";
import { UnsplashAttribution } from "@/components/unsplash/unsplash-attribution";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import type { SomedayItemRow } from "@/lib/someday";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import type { Database } from "@/types/database";
import type { ActionResult, SomedayItemInput } from "./actions";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

const CURRENCY_RE = /^[A-Z]{3}$/;

/** Turns an already-saved photo back into the shape <PhotoPicker>'s own selection returns, so an edit dialog can show "here's the photo you picked" without re-fetching it. `downloadLocation` is never re-used for an already-owned photo (the download trigger only ever fires for a *new* selection — see photo-picker.tsx), so an empty placeholder here is harmless. */
function photoFromItem(item: SomedayItemRow): UnsplashPhotoResult | null {
  if (!item.unsplash_photo_id) return null;
  return {
    id: item.unsplash_photo_id,
    thumbUrl: item.unsplash_thumb_url ?? "",
    fullUrl: item.unsplash_full_url ?? "",
    altDescription: null,
    width: 0,
    height: 0,
    authorName: item.unsplash_author_name ?? "",
    authorUrl: item.unsplash_author_url ?? "",
    downloadLocation: "",
  };
}

type FormState = {
  title: string;
  notes: string;
  lifeAreaId: string;
  costText: string;
  currency: string;
  photo: UnsplashPhotoResult | null;
  placeName: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  mapboxPlaceId: string | null;
};

function emptyForm(defaultCurrency: string): FormState {
  return {
    title: "",
    notes: "",
    lifeAreaId: "none",
    costText: "",
    currency: defaultCurrency,
    photo: null,
    placeName: "",
    countryCode: "",
    latitude: null,
    longitude: null,
    mapboxPlaceId: null,
  };
}

function formFromItem(
  item: SomedayItemRow,
  defaultCurrency: string,
): FormState {
  return {
    title: item.title,
    notes: item.notes ?? "",
    lifeAreaId: item.life_area_id ?? "none",
    costText:
      item.rough_cost_minor != null && item.currency
        ? formatMoney(item.rough_cost_minor, item.currency)
        : "",
    currency: item.currency ?? defaultCurrency,
    photo: photoFromItem(item),
    placeName: item.place_name ?? "",
    countryCode: item.country_code?.trim() ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    mapboxPlaceId: item.mapbox_place_id,
  };
}

/**
 * One form, two modes — create (no `item`) and edit (`item` set). "Adding
 * an item should take under 15 seconds: title, search place, pick photo,
 * save. Cost and notes optional" (P6.1 brief) shapes the field order:
 * title first (the only truly required field), then the photo — "place
 * and photo are the point" — then everything else.
 */
export function SomedayFormDialog({
  mode,
  open,
  item,
  lifeAreas,
  defaultCurrency,
  onOpenChange,
  onSubmit,
  onSaved,
  onRequestDelete,
}: {
  mode: "create" | "edit";
  open: boolean;
  item?: SomedayItemRow | null;
  lifeAreas: LifeArea[];
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: SomedayItemInput) => Promise<ActionResult<SomedayItemRow>>;
  onSaved: (item: SomedayItemRow) => void;
  onRequestDelete?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Re-seeds the draft whenever the dialog opens on a different item (or
  // reopens fresh in create mode) — same key-diffing idiom as
  // pots/pot-manager.tsx's EditPotDialog.
  const [key, setKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCurrency));

  const currentKey =
    mode === "edit" ? (item?.id ?? null) : open ? "create" : null;
  if (open && currentKey !== key) {
    setKey(currentKey);
    setForm(
      mode === "edit" && item
        ? formFromItem(item, defaultCurrency)
        : emptyForm(defaultCurrency),
    );
    setError(null);
  }

  const isPromoted = mode === "edit" && item?.promoted_at != null;

  function patch(fields: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const title = form.title.trim();
    if (!title) {
      setError("Title can't be empty.");
      return;
    }

    let roughCostMinor: number | null = null;
    if (form.costText.trim()) {
      try {
        roughCostMinor = parseMoney(form.costText, form.currency);
      } catch {
        setError("Enter a valid cost.");
        return;
      }
      if (roughCostMinor < 0) {
        setError("Cost can't be negative.");
        return;
      }
      if (!CURRENCY_RE.test(form.currency)) {
        setError("Currency must be a 3-letter code.");
        return;
      }
    }

    // form.latitude/longitude only ever come from formFromItem (an
    // already-saved, already-paired pair) or <PlacePicker>'s onSelect
    // (which always sets both at once) or the "Clear" button (which
    // clears both at once) — there's no input path left that could
    // desync them the way free-text lat/lng fields used to, so there's
    // nothing to re-validate here beyond what those call sites already
    // guarantee.
    const countryCode = form.countryCode.trim();
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode)) {
      setError("Country code must be 2 letters, e.g. JP.");
      return;
    }

    const input: SomedayItemInput = {
      title,
      notes: form.notes.trim() || null,
      lifeAreaId: form.lifeAreaId === "none" ? null : form.lifeAreaId,
      cost: {
        roughCostMinor,
        currency: roughCostMinor != null ? form.currency : null,
      },
      place: {
        placeName: form.placeName.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        countryCode: countryCode || null,
        mapboxPlaceId: form.mapboxPlaceId,
      },
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && mode === "create") {
          setForm(emptyForm(defaultCurrency));
          setKey(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Add a place" : "Edit place"}
            </DialogTitle>
            {isPromoted && (
              <DialogDescription>
                This place has already been promoted into a trip — it stays on
                your someday list, but can&rsquo;t be deleted from here.
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="someday-title">Title</Label>
            <Input
              id="someday-title"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
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
            <Label htmlFor="someday-place">Place</Label>
            <Input
              id="someday-place"
              placeholder="e.g. Kyoto, Japan"
              value={form.placeName}
              onChange={(e) => patch({ placeName: e.target.value })}
            />
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label htmlFor="someday-country">Country</Label>
            <Input
              id="someday-country"
              placeholder="JP"
              maxLength={2}
              value={form.countryCode}
              onChange={(e) =>
                patch({ countryCode: e.target.value.toUpperCase() })
              }
            />
          </div>

          {/* P6.2: a real Mapbox Geocoding search replaces P6.1's manual
              lat/lng stub. Place name and country stay separate, plain-
              text fields above — free to fill in by hand whether or not
              a pin is ever set, so the item is still fully saveable if
              Mapbox isn't configured (same graceful-degradation shape as
              the photo section when Unsplash isn't configured). */}
          <PlacePickerField
            value={
              form.latitude != null && form.longitude != null
                ? {
                    name: form.placeName || null,
                    latitude: form.latitude,
                    longitude: form.longitude,
                    placeId: form.mapboxPlaceId,
                    countryCode: form.countryCode || null,
                  }
                : null
            }
            onChange={(place) =>
              patch(
                place
                  ? {
                      latitude: place.latitude,
                      longitude: place.longitude,
                      mapboxPlaceId: place.placeId,
                      placeName: form.placeName || place.name || "",
                      countryCode: form.countryCode || place.countryCode || "",
                    }
                  : { latitude: null, longitude: null, mapboxPlaceId: null },
              )
            }
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="someday-life-area">Life area</Label>
            <Select
              value={form.lifeAreaId}
              onValueChange={(v) => patch({ lifeAreaId: v })}
            >
              <SelectTrigger id="someday-life-area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No life area</SelectItem>
                {lifeAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="someday-cost">Rough cost (optional)</Label>
              <Input
                id="someday-cost"
                inputMode="decimal"
                placeholder="0.00"
                value={form.costText}
                onChange={(e) => patch({ costText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="someday-currency">Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => patch({ currency: v })}
              >
                <SelectTrigger id="someday-currency" className="w-20">
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
            <Label htmlFor="someday-notes">Notes (optional)</Label>
            <Textarea
              id="someday-notes"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>

          <DialogFooter className="flex items-center gap-2 sm:justify-between">
            {mode === "edit" && !isPromoted && onRequestDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={onRequestDelete}
              >
                Delete
              </Button>
            ) : isPromoted ? (
              <Badge variant="outline">Part of a trip</Badge>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {mode === "create" ? "Add place" : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
