"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload, type UploadedDreamPhoto } from "@/components/image-upload";
import { achieveDream, type AchieveDreamResult } from "./actions";

/**
 * "A dream is achieved with one action from the grid or the detail
 * view. It asks for two optional things and nothing more: a photo of
 * the real thing and a line about it. Both skippable" (P8.4 brief,
 * verbatim). A separate, small dialog from `<DreamFormDialog>` on
 * purpose -- achieving isn't editing, and the one action the brief
 * describes shouldn't require opening the big form first. Both the grid
 * (`dream-card.tsx`) and the detail view (`dream-form-dialog.tsx`) open
 * this same component.
 *
 * `generateThumbnail={false}` on the photo upload: the achieved photo
 * has no thumbnail column of its own (see `<ImageUpload>`'s own
 * comment) -- it's never shown in the grid, only side by side with the
 * dream photo in the detail view, at full size.
 */
export function AchieveDreamDialog({
  open,
  dreamId,
  userId,
  onOpenChange,
  onAchieved,
}: {
  open: boolean;
  dreamId: string;
  userId: string;
  onOpenChange: (open: boolean) => void;
  onAchieved: (result: AchieveDreamResult) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<UploadedDreamPhoto | null>(null);
  // P8.7: found live -- same gap as <DreamFormDialog>'s Save button (see
  // that file's own comment): "Mark achieved" was clickable while a real
  // photo was still uploading, committing the achievement with no photo
  // at all and no warning.
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);

  function reset() {
    setError(null);
    setNote("");
    setPhoto(null);
    setIsPhotoUploading(false);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await achieveDream(dreamId, {
        note: note.trim() || null,
        achievedStoragePath: photo?.storagePath ?? null,
      });
      if (result.ok) {
        reset();
        onAchieved(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this achieved</DialogTitle>
          <DialogDescription>
            A photo and a note are both optional — a dream achieved on a day
            you don&rsquo;t feel like writing is still achieved.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Photo of the real thing (optional)</Label>
          <ImageUpload
            userId={userId}
            dreamId={dreamId}
            value={photo}
            onChange={setPhoto}
            onBusyChange={setIsPhotoUploading}
            generateThumbnail={false}
            inputId="achieved-photo-input"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="achieved-note">A line about it (optional)</Label>
          <Textarea
            id="achieved-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How does it feel?"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="max-md:h-11"
            disabled={isPending || isPhotoUploading}
            onClick={handleSubmit}
          >
            {isPhotoUploading
              ? "Uploading photo…"
              : isPending
                ? "Marking achieved…"
                : "Mark achieved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
