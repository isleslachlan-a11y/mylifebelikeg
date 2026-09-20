"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

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
import { UnsplashPhotoPreview } from "@/components/unsplash/unsplash-photo-preview";
import { ImageUpload } from "@/components/image-upload";
import { LlamaMessage } from "@/components/llama-message";
import { ShareCardButton } from "@/components/share-card-button";
import { ShareControl } from "@/components/sharing/share-control";
import type { DreamLinkCardData } from "@/components/social-links/dream-link-card";
import { DreamLinksSection } from "./dream-links-section";
import {
  describeDreamAffordability,
  type DreamAffordabilityRow,
} from "@/lib/dream-affordability";
import { COMMON_CURRENCIES, formatMoney, parseMoney } from "@/lib/money";
import {
  DREAM_KIND_LABELS,
  DREAM_KIND_OPTIONS,
  describeWantedDuration,
  type DreamKind,
  type SomedayItemRow,
} from "@/lib/someday";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { ActionResult, PhotoInput, SomedayItemInput } from "./actions";
import {
  getDreamAffordability,
  promoteDreamToGoal,
  unachieveDream,
} from "./actions";
import { getDreamPhotoSignedUrl } from "./photo-actions";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * The dialog's own richer photo shape -- carries a `previewUrl` for
 * *both* sources (P8.1 adds the upload one), whereas `PhotoInput`
 * (actions.ts) is the minimal transport shape the server actually needs
 * to persist. `handleSubmit` maps this down to `PhotoInput` at the point
 * of submission, so the preview URL (a signed URL that expires, or a
 * local blob URL that's meaningless off this tab) never gets anywhere
 * near a server action or the database, matching the P8.0/P8.1 briefs'
 * "never store a signed URL" rule.
 */
type PhotoSelection =
  | { source: "unsplash"; photo: UnsplashPhotoResult }
  | { source: "upload"; storagePath: string; previewUrl: string }
  | null;

/** Turns an already-saved photo back into the shape this dialog's own state uses, so an edit dialog can show "here's the photo you picked" without re-fetching an Unsplash one (a plain hotlinked URL, already on the row) — an *uploaded* one still needs its signed URL resolved separately, see the effect below; it starts with an empty previewUrl on purpose. `downloadLocation` is never re-used for an already-owned Unsplash photo (the download trigger only ever fires for a *new* selection — see photo-picker.tsx), so an empty placeholder there is harmless. */
function photoSelectionFromItem(item: SomedayItemRow): PhotoSelection {
  if (item.image_source === "upload" && item.storage_path) {
    return { source: "upload", storagePath: item.storage_path, previewUrl: "" };
  }
  if (item.unsplash_photo_id) {
    return {
      source: "unsplash",
      photo: {
        id: item.unsplash_photo_id,
        thumbUrl: item.unsplash_thumb_url ?? "",
        fullUrl: item.unsplash_full_url ?? "",
        altDescription: null,
        width: 0,
        height: 0,
        authorName: item.unsplash_author_name ?? "",
        authorUrl: item.unsplash_author_url ?? "",
        downloadLocation: "",
      },
    };
  }
  return null;
}

type FormState = {
  title: string;
  kind: DreamKind;
  notes: string;
  lifeAreaId: string;
  costText: string;
  currency: string;
  photo: PhotoSelection;
  placeName: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  mapboxPlaceId: string | null;
};

function emptyForm(
  defaultCurrency: string,
  kind: DreamKind = "place",
): FormState {
  return {
    title: "",
    kind,
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
    kind: item.kind,
    notes: item.notes ?? "",
    lifeAreaId: item.life_area_id ?? "none",
    costText:
      item.rough_cost_minor != null && item.currency
        ? formatMoney(item.rough_cost_minor, item.currency)
        : "",
    currency: item.currency ?? defaultCurrency,
    photo: photoSelectionFromItem(item),
    placeName: item.place_name ?? "",
    countryCode: item.country_code?.trim() ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    mapboxPlaceId: item.mapbox_place_id,
  };
}

function toPhotoInput(photo: PhotoSelection): PhotoInput {
  if (!photo) return null;
  if (photo.source === "unsplash")
    return { source: "unsplash", photo: photo.photo };
  return { source: "upload", storagePath: photo.storagePath };
}

/**
 * One form, two modes — create (no `item`) and edit (`item` set). P8.2's
 * whole reason for existing: "capture must be fast enough to use while
 * standing in a shop... photo, title, save. Everything else optional and
 * revealable" (brief, verbatim). Photo is the *first* field in the DOM,
 * not an afterthought below title — "it is the thing that makes the
 * entry worth making, and asking for a title first turns it into a
 * form" (brief) — and every other field (kind, price, life area, place,
 * notes) lives behind a single collapsed "Add details" disclosure,
 * closed by default in create mode so the fast path really is just
 * three taps: pick/take a photo, type a title, hit Save. Edit mode opens
 * with details already expanded — there's usually real data back there
 * worth seeing, and nothing about editing needs to be fast the way
 * standing-in-a-shop capture does.
 */
export function DreamFormDialog({
  mode,
  open,
  item,
  initialKind,
  userId,
  lifeAreas,
  defaultCurrency,
  onOpenChange,
  onSubmit,
  onSaved,
  onRequestDelete,
  onRequestAchieve,
  links,
}: {
  mode: "create" | "edit";
  open: boolean;
  item?: SomedayItemRow | null;
  /** P10.3: this dream's already-saved social links, edit mode only -- create mode never has any, since a link needs a real entry_id to attach to. */
  links?: DreamLinkCardData[];
  /** Create mode only -- the empty state's three prompts (`<DreamEmptyState>`) each open the dialog with a kind already picked, still an explicit choice the user made by tapping one of three labelled buttons, not a guess. Defaults to "place" (the column's own default) when absent, same as before this prop existed. */
  initialKind?: DreamKind;
  /** For <ImageUpload>'s own path convention ({user_id}/{dream_id}/{uuid}.webp) — never trusted as authorization by itself (storage RLS, migration 0032, is what actually enforces it), just what a fresh upload's path is built from. */
  userId: string;
  lifeAreas: LifeArea[];
  defaultCurrency: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    input: SomedayItemInput,
    id?: string,
  ) => Promise<ActionResult<SomedayItemRow>>;
  onSaved: (item: SomedayItemRow) => void;
  onRequestDelete?: () => void;
  /** P8.4: same "close this dialog, let the manager open a different one" shape `onRequestDelete` already established -- achieving opens `<AchieveDreamDialog>`, a separate small dialog, not something nested inside this one. */
  onRequestAchieve?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Re-seeds the draft whenever the dialog opens on a different item (or
  // reopens fresh in create mode) — same key-diffing idiom as
  // pots/pot-manager.tsx's EditPotDialog.
  const [key, setKey] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultCurrency));
  // Create mode has no real dream id yet -- <ImageUpload> needs one up
  // front for its {user_id}/{dream_id}/{uuid}.webp path (see
  // photo-actions.ts's comment on why this is safe to generate
  // client-side), and it has to stay the *same* id for the lifetime of
  // this dialog session, not a fresh one per render. Re-seeded alongside
  // `form`/`key` below, exactly when a fresh create-mode session starts.
  const [createDreamId, setCreateDreamId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  // Upload is the default and first tab (P8.2 brief); Unsplash stays for
  // places you haven't been yet.
  const [photoTab, setPhotoTab] = useState<"upload" | "unsplash">("upload");
  // P8.7: found live -- Save was clickable while a real (multi-second,
  // multi-megapixel) photo upload was still in flight, saving the dream
  // with no photo at all and no warning. Gates Save the same way
  // `<ImageUpload>`'s own Replace/Remove buttons already gate themselves
  // on this exact value (`isBusy`) -- see that component's own comment.
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(mode === "edit");
  // P8.3: the affordability row for this dream, fetched once when the
  // dialog opens on a priced, edit-mode item -- null while loading or
  // when the dream has no price yet (v_dream_affordability's own WHERE
  // clause also excludes achieved/archived dreams, so this doubles as
  // "nothing to show" for those cases too, no separate check needed).
  const [affordability, setAffordability] =
    useState<DreamAffordabilityRow | null>(null);
  const [isPromotingToGoal, startPromoteTransition] = useTransition();
  const [promoteError, setPromoteError] = useState<string | null>(null);
  // P8.4: the achieved photo's signed URL and the un-achieve action's
  // own pending/error state -- kept separate from `photo`/`error` above
  // since un-achieving isn't part of the normal Save flow at all.
  const [achievedPhotoUrl, setAchievedPhotoUrl] = useState<string | null>(null);
  const [isUnachieving, startUnachieveTransition] = useTransition();
  const [unachieveError, setUnachieveError] = useState<string | null>(null);

  const currentKey =
    mode === "edit" ? (item?.id ?? null) : open ? "create" : null;
  if (open && currentKey !== key) {
    setKey(currentKey);
    setForm(
      mode === "edit" && item
        ? formFromItem(item, defaultCurrency)
        : emptyForm(defaultCurrency, initialKind),
    );
    setError(null);
    setDetailsOpen(mode === "edit");
    setAffordability(null);
    setAchievedPhotoUrl(null);
    setUnachieveError(null);
    setPromoteError(null);
    if (mode === "create") {
      setCreateDreamId(crypto.randomUUID());
    }
  }

  const dreamId = mode === "edit" ? (item?.id ?? "") : createDreamId;
  const isPromoted = mode === "edit" && item?.promoted_at != null;
  const isPromotedToGoal = mode === "edit" && item?.promoted_goal_id != null;
  const isAchieved = mode === "edit" && item?.achieved_at != null;
  const isArchived = mode === "edit" && item?.archived_at != null;

  // The achieved photo's signed URL -- same "resolve once, cache in
  // component state" shape as the dream photo's own effect just below,
  // for the same reason (P8.1 brief: never regenerate a signed URL per
  // render).
  useEffect(() => {
    if (!isAchieved || !item?.achieved_storage_path) return;
    const path = item.achieved_storage_path;
    let cancelled = false;
    void getDreamPhotoSignedUrl(path).then((url) => {
      if (!cancelled) setAchievedPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [isAchieved, item]);

  function handleUnachieve() {
    if (!item) return;
    setUnachieveError(null);
    startUnachieveTransition(async () => {
      const result = await unachieveDream(item.id);
      if (result.ok) {
        onSaved(result.data);
      } else {
        setUnachieveError(result.error);
      }
    });
  }

  // Fetched once per item, not on every render -- "at the point of
  // asking" (P8.3 brief) means whenever the dialog is open on a priced
  // dream, not a live-recomputed value tracking every keystroke in the
  // (unsaved) cost field above.
  useEffect(() => {
    if (mode !== "edit" || !item || item.rough_cost_minor == null) return;
    let cancelled = false;
    void getDreamAffordability(item.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setAffordability(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, item]);

  function handlePromoteToGoal() {
    if (!item) return;
    setPromoteError(null);
    startPromoteTransition(async () => {
      const result = await promoteDreamToGoal(item.id);
      if (result.ok) {
        onSaved(result.data);
      } else {
        setPromoteError(result.error);
      }
    });
  }

  function patch(fields: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  // Resolves the signed URL for an already-saved *uploaded* photo once,
  // when the dialog opens on it -- "only the detail view loads the full
  // image," "cache... rather than regenerating per render" (P8.1 brief).
  // Guarded on `!previewUrl` so this never re-fires once resolved, even
  // though `form.photo` itself changes identity on every `patch()` call
  // (e.g. editing the title triggers this effect's dependency to
  // "change" by reference, but not by the one thing it actually cares
  // about).
  useEffect(() => {
    if (form.photo?.source !== "upload" || form.photo.previewUrl) return;
    const path = form.photo.storagePath;
    let cancelled = false;
    void getDreamPhotoSignedUrl(path).then((url) => {
      if (cancelled || !url) return;
      setForm((prev) =>
        prev.photo?.source === "upload" && prev.photo.storagePath === path
          ? { ...prev, photo: { ...prev.photo, previewUrl: url } }
          : prev,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [form.photo]);

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
      kind: form.kind,
      notes: form.notes.trim() || null,
      lifeAreaId: form.lifeAreaId === "none" ? null : form.lifeAreaId,
      cost: {
        roughCostMinor,
        currency: roughCostMinor != null ? form.currency : null,
      },
      // Place fields are only ever meaningful (and only ever shown) when
      // kind === 'place' -- but if a draft was switched *away* from
      // place after already having coordinates set, sending whatever's
      // still in form state is "infer nothing" applied to saving too:
      // this form never silently clears fields the user can't currently
      // see, it just stops showing them.
      place: {
        placeName: form.placeName.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        countryCode: countryCode || null,
        mapboxPlaceId: form.mapboxPlaceId,
      },
      // Maps the dialog's own richer PhotoSelection (which carries a
      // previewUrl -- a signed URL that expires, or a local blob URL
      // meaningless off this tab) down to PhotoInput, the minimal shape
      // the server actually persists. Never sends a URL, only a path.
      photo: toPhotoInput(form.photo),
    };

    startTransition(async () => {
      const result = await onSubmit(
        input,
        mode === "create" ? dreamId : undefined,
      );
      if (result.ok) {
        onSaved(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  const isPlace = form.kind === "place";

  // The dream's own display photo -- reused from whatever `form.photo`
  // already resolved to (both sources, see the Photo section below) for
  // the achieved section's "wanted" side, rather than re-deriving it a
  // second way.
  const dreamPhotoUrl =
    form.photo?.source === "unsplash"
      ? form.photo.photo.fullUrl || form.photo.photo.thumbUrl
      : (form.photo?.previewUrl ?? null);

  const priceFields = (
    <div className="flex gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="dream-cost">Rough cost (optional)</Label>
        <Input
          id="dream-cost"
          inputMode="decimal"
          placeholder="0.00"
          value={form.costText}
          onChange={(e) => patch({ costText: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dream-currency">Currency</Label>
        <Select
          value={form.currency}
          onValueChange={(v) => patch({ currency: v })}
        >
          <SelectTrigger id="dream-currency" className="w-20">
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
  );

  const placeFields = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dream-place">Place</Label>
        <Input
          id="dream-place"
          placeholder="e.g. Kyoto, Japan"
          value={form.placeName}
          onChange={(e) => patch({ placeName: e.target.value })}
        />
      </div>
      <div className="flex w-24 flex-col gap-1.5">
        <Label htmlFor="dream-country">Country</Label>
        <Input
          id="dream-country"
          placeholder="JP"
          maxLength={2}
          value={form.countryCode}
          onChange={(e) => patch({ countryCode: e.target.value.toUpperCase() })}
        />
      </div>
      {/* P6.2: a real Mapbox Geocoding search replaces P6.1's manual
          lat/lng stub. Place name and country stay separate, plain-text
          fields above — free to fill in by hand whether or not a pin is
          ever set, so the item is still fully saveable if Mapbox isn't
          configured (same graceful-degradation shape as the photo
          section when Unsplash isn't configured). */}
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
    </div>
  );

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
              {mode === "create" ? "Add a dream" : "Edit dream"}
            </DialogTitle>
            {isPromoted && (
              <DialogDescription>
                This place has already been promoted into a trip — it stays in
                your Dream Diary, but can&rsquo;t be deleted from here.
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          {/* Photo first -- not an afterthought below the title. Two
              sources, one control: upload (default, first tab) or search
              Unsplash for places you haven't been. Attribution renders
              wherever the Unsplash image itself renders, further down. */}
          <div className="flex flex-col gap-1.5">
            <Label>Photo</Label>
            {form.photo?.source === "unsplash" ? (
              <UnsplashPhotoPreview
                photo={form.photo.photo}
                onChange={() => patch({ photo: null })}
              />
            ) : form.photo?.source === "upload" || photoTab === "upload" ? (
              <ImageUpload
                userId={userId}
                dreamId={dreamId}
                value={
                  form.photo?.source === "upload"
                    ? {
                        storagePath: form.photo.storagePath,
                        previewUrl: form.photo.previewUrl,
                      }
                    : null
                }
                onChange={(photo) =>
                  patch({
                    photo: photo
                      ? {
                          source: "upload",
                          storagePath: photo.storagePath,
                          previewUrl: photo.previewUrl,
                        }
                      : null,
                  })
                }
                onBusyChange={setIsPhotoUploading}
              />
            ) : (
              <PhotoPicker
                onSelect={(photo) =>
                  patch({ photo: { source: "unsplash", photo } })
                }
              />
            )}

            {!form.photo && (
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className={cn(
                    "text-muted-foreground hover:text-foreground min-h-11 py-2.5",
                    photoTab === "upload" &&
                      "text-foreground font-medium underline underline-offset-2",
                  )}
                  onClick={() => setPhotoTab("upload")}
                >
                  Upload a photo
                </button>
                <button
                  type="button"
                  className={cn(
                    "text-muted-foreground hover:text-foreground min-h-11 py-2.5",
                    photoTab === "unsplash" &&
                      "text-foreground font-medium underline underline-offset-2",
                  )}
                  onClick={() => setPhotoTab("unsplash")}
                >
                  Search Unsplash
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-title">Title</Label>
            <Input
              id="dream-title"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              autoFocus
              required
            />
          </div>

          {/* F2: view-only friend sharing -- every dream is always
              your own (this dialog never opens for someone else's), so
              isOwner is unconditionally true here. */}
          {mode === "edit" && item && (
            <ShareControl
              resourceType="someday_item"
              resourceId={item.id}
              isOwner
              path="/dreams"
            />
          )}

          {/* P10.3: social link capture. Same "needs a real id" gate
              as ShareControl above -- a link's entry_id has to point
              at something that actually exists. */}
          {mode === "edit" && item && (
            <DreamLinksSection entryId={item.id} initialLinks={links ?? []} />
          )}

          {/* P8.4: "achieved is not promoted... promoting is the dream
              becoming a plan; achieving is having it" (brief, verbatim) --
              this section is independent of the promotion one above and
              below it; a dream can show both, either, or neither. */}
          {isAchieved && item ? (
            <div className="border-star/30 bg-star/5 flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="text-star size-4" aria-hidden />
                <p className="text-sm font-medium">Achieved</p>
              </div>

              {/* "The detail view of an achieved dream shows both photos
                  -- the one you saved when you wanted it, and the one you
                  took when you had it" (brief, verbatim). */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <div className="ring-foreground/10 aspect-square overflow-hidden rounded-lg ring-1">
                    {dreamPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dreamPhotoUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="bg-muted size-full" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-center text-xs">
                    Wanted
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="ring-foreground/10 aspect-square overflow-hidden rounded-lg ring-1">
                    {achievedPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={achievedPhotoUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="bg-muted size-full" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-center text-xs">
                    Achieved
                  </p>
                </div>
              </div>

              {/* "That interval is the single most affecting thing this
                  feature produces, and it costs one date subtraction"
                  (brief, verbatim). */}
              <p className="text-sm">
                {describeWantedDuration(item.created_at, item.achieved_at!)}
              </p>

              {item.achieved_note && (
                <p className="text-muted-foreground text-sm">
                  {item.achieved_note}
                </p>
              )}

              {/* P8.6: "an achieved dream produces a card that looks
                  intentional in a feed... shares through the phone's
                  share sheet" (brief, verbatim) -- the route handler
                  itself is what actually enforces "never the price,
                  never anyone else's data"; this button only ever
                  triggers it for the dream already open in this dialog.
                  Unsplash correction: not rendered at all when the only
                  photo this dream has is Unsplash-sourced with no
                  achieved photo to fall back to -- "offer no card"
                  (brief, verbatim), not a button that fails when
                  pressed. The route itself still refuses that case too
                  (defense in depth, same posture as every other
                  client-side gate in this app), so a stale render of
                  this dialog can't reach a working button either. */}
              {(item.achieved_storage_path ||
                item.image_source !== "unsplash") && (
                <ShareCardButton dreamId={item.id} dreamTitle={item.title} />
              )}

              {unachieveError && (
                <p role="alert" className="text-destructive text-xs">
                  {unachieveError}
                </p>
              )}

              {/* "Un-achieve must exist and must be quiet. Mis-taps
                  happen." (brief, verbatim) -- one tap, no confirmation
                  dialog, no llama message on the way back. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit max-md:h-11"
                disabled={isUnachieving}
                onClick={handleUnachieve}
              >
                {isUnachieving ? "Undoing…" : "Un-achieve"}
              </Button>
            </div>
          ) : (
            mode === "edit" &&
            !isArchived &&
            onRequestAchieve && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit max-md:h-11"
                onClick={onRequestAchieve}
              >
                Mark achieved
              </Button>
            )
          )}

          {/* Everything past this point is optional and revealable
              (brief, verbatim) -- collapsed by default in create mode so
              the fast path really is photo, title, save. */}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex min-h-11 items-center gap-1 self-start text-sm"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
            {detailsOpen ? "Hide details" : "Add details"}
          </button>

          {detailsOpen && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dream-kind">Kind</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => patch({ kind: v as DreamKind })}
                >
                  <SelectTrigger id="dream-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DREAM_KIND_OPTIONS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {DREAM_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Kind changes the form (brief, verbatim): place shows the
                  place picker with price after it; object/experience hide
                  the place picker entirely and put price forward instead. */}
              {isPlace ? (
                <>
                  {placeFields}
                  {priceFields}
                </>
              ) : (
                priceFields
              )}

              {mode === "edit" &&
                item &&
                item.rough_cost_minor != null &&
                item.currency && (
                  <div className="flex flex-col gap-2">
                    {isPromotedToGoal ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="default"
                          className="bg-rag-green text-deep"
                        >
                          Promoted to goal
                        </Badge>
                        <Link
                          href={`/goals/${item.promoted_goal_id}`}
                          className="text-primary text-xs underline underline-offset-2"
                        >
                          View goal →
                        </Link>
                      </div>
                    ) : (
                      <>
                        {affordability && (
                          <>
                            {/* "Show both the original and the base-currency
                              conversion" (P8.3 brief, verbatim). */}
                            <p className="text-muted-foreground text-xs">
                              {formatMoney(
                                item.rough_cost_minor,
                                item.currency,
                              )}
                              {affordability.cost_base_currency &&
                                affordability.cost_base_minor != null &&
                                affordability.cost_base_currency !==
                                  item.currency && (
                                  <>
                                    {" "}
                                    (~
                                    {formatMoney(
                                      affordability.cost_base_minor,
                                      affordability.cost_base_currency,
                                    )}
                                    )
                                  </>
                                )}
                            </p>
                            <LlamaMessage
                              speaker="derek"
                              body={describeDreamAffordability(affordability)}
                            />
                          </>
                        )}

                        {promoteError && (
                          <p role="alert" className="text-destructive text-xs">
                            {promoteError}
                          </p>
                        )}

                        {!item.achieved_at && !item.archived_at && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-fit max-md:h-11"
                            disabled={isPromotingToGoal}
                            onClick={handlePromoteToGoal}
                          >
                            {isPromotingToGoal
                              ? "Promoting…"
                              : "Promote to goal"}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dream-life-area">Life area</Label>
                <Select
                  value={form.lifeAreaId}
                  onValueChange={(v) => patch({ lifeAreaId: v })}
                >
                  <SelectTrigger id="dream-life-area">
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dream-notes">Notes (optional)</Label>
                <Textarea
                  id="dream-notes"
                  value={form.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center gap-2 sm:justify-between">
            {mode === "edit" && !isPromoted && onRequestDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive max-md:h-11"
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
                className="max-md:h-11"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {/* The one button "under fifteen seconds" actually turns on
                  -- full-height on mobile even though this app's default
                  Button size is 32px everywhere else, per this package's
                  own "standing in a shop" framing. Also disabled while a
                  photo is still uploading (P8.7) -- a real phone photo
                  is slow enough to process/upload that "Save" could
                  otherwise be tapped before it's done, saving the dream
                  with no photo at all, silently. */}
              <Button
                type="submit"
                disabled={isPending || isPhotoUploading}
                className="max-md:h-11"
              >
                {isPhotoUploading
                  ? "Uploading photo…"
                  : mode === "create"
                    ? "Save"
                    : "Save changes"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
