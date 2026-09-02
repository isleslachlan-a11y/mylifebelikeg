"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LazyPlaceMap } from "./lazy-place-map";
import { PlacePicker } from "./place-picker";

export type PickedPlace = {
  name: string | null;
  latitude: number;
  longitude: number;
  placeId: string | null;
  countryCode: string | null;
};

/**
 * The "pin on map, optional" field shape shared by every form that
 * stores a `latitude`/`longitude` pair alongside a `mapbox_place_id` —
 * `someday-form-dialog.tsx` (P6.1), trip creation and stop editing
 * (P6.3). Unpicked: `<PlacePicker>`'s search UI. Picked: a
 * `<LazyPlaceMap>` preview with a "Clear pin" way back to unpicked —
 * deliberately not "search a different place" here (that's
 * `<PlacePicker>`'s own internal affordance once *it's* shown something);
 * this field only ever has the two states, picked or not.
 */
export function PlacePickerField({
  value,
  onChange,
  label = "Pin on map (optional)",
}: {
  value: PickedPlace | null;
  onChange: (next: PickedPlace | null) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {value ? (
        <div className="flex flex-col gap-2">
          <LazyPlaceMap
            markers={[
              {
                id: value.placeId ?? "pinned",
                latitude: value.latitude,
                longitude: value.longitude,
                label: value.name ?? undefined,
              },
            ]}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onChange(null)}
          >
            Clear pin
          </Button>
        </div>
      ) : (
        <PlacePicker
          onSelect={(place) =>
            onChange({
              name: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
              placeId: place.id,
              countryCode: place.countryCode,
            })
          }
        />
      )}
    </div>
  );
}
