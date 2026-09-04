"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  ImageProcessingError,
  ImageValidationError,
  processImageForUpload,
  validateImageFile,
} from "@/lib/image-processing";
import {
  DREAM_PHOTOS_BUCKET,
  buildDreamPhotoPath,
  deriveThumbPath,
} from "@/lib/storage/dream-photos";
import { cn } from "@/lib/utils";

export type UploadedDreamPhoto = {
  storagePath: string;
  /** A local `URL.createObjectURL` preview (just uploaded, this session) or a signed URL (an already-saved photo passed in from the server) — either way, just something to point an `<img>` at. */
  previewUrl: string;
};

type Stage =
  | { status: "empty" }
  | { status: "processing" }
  | { status: "uploading"; step: "thumbnail" | "full" }
  | { status: "ready" }
  | { status: "error"; message: string };

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/**
 * Tap to choose or take a photo, progress while it uploads, a preview
 * once it has, replace/remove after. The one binary-content upload
 * surface in this app (P8.1) — everything before the actual `.upload()`
 * call (type sniffing, size check, resize, WebP re-encode, EXIF strip)
 * happens in `src/lib/image-processing.ts`; this component owns only the
 * picking/progress/preview/replace state machine and the two
 * `supabase.storage` calls themselves.
 *
 * Uploads go straight from the browser to Storage via the anon-key
 * client (`src/lib/supabase/client.ts`) — never through a server
 * action or the service-role key (rule 2) — because migration 0032's
 * storage policies are already the exact authorization surface wanted:
 * an insert under the caller's own `{user_id}/...` path succeeds by RLS,
 * anything else is refused by RLS, with no server-side code needed in
 * between to re-decide that.
 *
 * `dreamId` is the real `someday_items.id` in edit mode, or a
 * `crypto.randomUUID()` the parent form generated once (before the row
 * exists) in create mode — see `someday-form-dialog.tsx` and
 * `photo-actions.ts`'s own comment on why that's safe to do client-side.
 */
export function ImageUpload({
  userId,
  dreamId,
  value,
  onChange,
  onBusyChange,
  className,
  generateThumbnail = true,
  inputId = "dream-photo-input",
}: {
  userId: string;
  dreamId: string;
  value: UploadedDreamPhoto | null;
  onChange: (photo: UploadedDreamPhoto | null) => void;
  /**
   * P8.7: found live -- a real phone photo (multi-megapixel, genuinely
   * slow to decode/resize/re-encode/upload on a real connection) leaves
   * a multi-second window where `stage` is "processing"/"uploading" but
   * nothing stopped the parent's Save/Mark-achieved button from being
   * clicked in the meantime -- `onChange` only ever fires once the
   * upload actually finishes, so a save that races ahead of it commits
   * with no photo at all, silently, no error anywhere. `isBusy` already
   * existed for this component's own UI (the spinner/disabled Replace-
   * Remove buttons below); this is that same value, just also handed to
   * whichever caller needs to gate its own submit button on it -- optional
   * so callers that don't render a submit button next to this (none
   * today) aren't forced to wire up a callback they'd never use.
   */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
  /**
   * P8.4: the *achieved* photo has no thumbnail column of its own
   * (`someday_items.achieved_storage_path`, unlike `storage_path`, was
   * given a single column in P8.0 -- "no achieved thumb column" is that
   * decision, not an oversight) -- uploading one anyway would just be an
   * immediate, permanent orphan, exactly what P8.1's whole cleanup
   * design exists to avoid. `true` (the dream photo's own default) still
   * uploads both, since the grid needs a real thumbnail object to sign.
   */
  generateThumbnail?: boolean;
  /** Two <ImageUpload> instances never render at once today (dream photo vs. achieved photo live in different dialogs), but a shared literal id would still collide if that ever changes -- callers that mount more than one on a page at once should pass distinct ids. */
  inputId?: string;
}) {
  const [stage, setStage] = useState<Stage>(
    value ? { status: "ready" } : { status: "empty" },
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Paths this component instance has itself uploaded, this mount --
  // *not* whatever `value` originally arrived with (an already-saved
  // photo, which only the server-side "delete path" ever cleans up, see
  // someday/actions.ts). If the user tries a second photo before ever
  // saving the form, the first one they just uploaded is deleted here
  // rather than left as an immediate, easily-avoidable orphan; RLS makes
  // this safe to do directly from the browser client, since it can only
  // ever reach objects under this user's own path.
  const ownUploadsRef = useRef<Set<string>>(new Set());

  async function deleteOwnUpload(storagePath: string) {
    if (!ownUploadsRef.current.has(storagePath)) return;
    const supabase = createClient();
    const targets = generateThumbnail
      ? [storagePath, deriveThumbPath(storagePath)]
      : [storagePath];
    const { error } = await supabase.storage
      .from(DREAM_PHOTOS_BUCKET)
      .remove(targets);
    if (error) {
      console.error("Failed to remove a just-replaced dream photo", storagePath, error);
    }
    ownUploadsRef.current.delete(storagePath);
  }

  async function handleFile(file: File) {
    setStage({ status: "processing" });
    const previous = value;

    try {
      await validateImageFile(file);
      const { full, thumb } = await processImageForUpload(file);

      const fullPath = buildDreamPhotoPath(userId, dreamId, crypto.randomUUID());
      const thumbPath = deriveThumbPath(fullPath);
      const supabase = createClient();

      if (generateThumbnail) {
        setStage({ status: "uploading", step: "thumbnail" });
        const thumbUpload = await supabase.storage
          .from(DREAM_PHOTOS_BUCKET)
          .upload(thumbPath, thumb, { contentType: "image/webp", upsert: false });
        if (thumbUpload.error) throw thumbUpload.error;
      }

      setStage({ status: "uploading", step: "full" });
      const fullUpload = await supabase.storage
        .from(DREAM_PHOTOS_BUCKET)
        .upload(fullPath, full, { contentType: "image/webp", upsert: false });
      if (fullUpload.error) throw fullUpload.error;

      ownUploadsRef.current.add(fullPath);
      // Instant local preview -- the blob is already sitting right here,
      // no need to round-trip for a signed URL just to show what was
      // just uploaded (see photo-actions.ts's own comment on when a
      // signed URL actually is needed: an *already-saved* photo, not
      // this one).
      const previewUrl = URL.createObjectURL(full);
      setStage({ status: "ready" });
      onChange({ storagePath: fullPath, previewUrl });

      if (previous) {
        await deleteOwnUpload(previous.storagePath);
      }
    } catch (error) {
      const message =
        error instanceof ImageValidationError || error instanceof ImageProcessingError
          ? error.message
          : "Upload failed. Try again.";
      if (!(error instanceof ImageValidationError || error instanceof ImageProcessingError)) {
        console.error("Dream photo upload failed", error);
      }
      setStage({ status: "error", message });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    const current = value;
    setStage({ status: "empty" });
    onChange(null);
    if (current) {
      void deleteOwnUpload(current.storagePath);
    }
  }

  const isBusy = stage.status === "processing" || stage.status === "uploading";

  useEffect(() => {
    onBusyChange?.(isBusy);
    // Report "not busy" once more on unmount -- a caller that keeps its
    // own gate state around past this component's lifetime (shouldn't
    // happen today, cheap to guard against regardless) shouldn't get
    // stuck permanently disabled by a stale "busy" it can never clear.
    return () => onBusyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onBusyChange is expected to be a stable or freshly-bound callback each render, not a dependency whose identity should retrigger this.
  }, [isBusy]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        id={inputId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value && !value.previewUrl ? (
        // A saved photo whose signed URL the parent hasn't resolved yet
        // (someday-form-dialog.tsx fetches it once, on open, for the
        // detail view -- "only the detail view loads the full image").
        // Shown instead of the empty-state dropzone so an item that
        // *does* have a photo never flashes "no photo" while that
        // resolves.
        <div className="border-foreground/15 flex aspect-video w-full items-center justify-center rounded-lg border">
          <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden />
        </div>
      ) : value && stage.status !== "empty" ? (
        <div className="flex flex-col gap-2">
          <div className="ring-foreground/10 relative aspect-video w-full overflow-hidden rounded-lg ring-1">
            {/* Same-origin signed URL or a local blob URL -- neither is a
                remote hotlink, so next/image would buy nothing here and
                cost a round trip through the optimizer for no reason. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.previewUrl}
              alt=""
              className="size-full object-cover"
            />
            {isBusy && (
              <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-6 animate-spin" aria-hidden />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            {stage.status === "error" ? (
              <p role="alert" className="text-destructive text-xs">
                {stage.message}
              </p>
            ) : (
              <span className="text-muted-foreground text-xs">
                {isBusy ? uploadingLabel(stage) : "Your own photo"}
              </span>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-11"
                disabled={isBusy}
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                className="text-destructive hover:text-destructive"
                onClick={handleRemove}
                aria-label="Remove photo"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "border-foreground/15 text-muted-foreground flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors hover:bg-raised",
            isBusy && "pointer-events-none",
          )}
        >
          {isBusy ? (
            <>
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <span>{uploadingLabel(stage)}</span>
            </>
          ) : (
            <>
              <ImageOff className="size-6" aria-hidden />
              <span>Tap to choose or take a photo</span>
            </>
          )}
          {stage.status === "error" && (
            <p role="alert" className="text-destructive px-4 text-center text-xs">
              {stage.message}
            </p>
          )}
        </label>
      )}
    </div>
  );
}

function uploadingLabel(stage: Stage): string {
  if (stage.status === "processing") return "Preparing photo…";
  if (stage.status === "uploading") {
    return stage.step === "thumbnail" ? "Uploading…" : "Almost done…";
  }
  return "";
}
