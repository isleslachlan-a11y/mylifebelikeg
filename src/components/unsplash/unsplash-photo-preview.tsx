"use client";

import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import { UnsplashAttribution } from "./unsplash-attribution";

/**
 * The larger (more-than-thumbnail) preview of a selected Unsplash
 * photo, shared between `dream-form-dialog.tsx` and
 * `stop-form-dialog.tsx` — previously two near-identical copies of the
 * same `<img>` + attribution + Change-button block, now one component
 * so the next/image conversion and the deleted-photo fallback below
 * only need to exist once.
 *
 * "An Unsplash photo can be removed by its photographer and the stored
 * URL will then 404. Render a placeholder with the title rather than a
 * broken image, and offer to replace it" (Unsplash package brief) —
 * `next/image`'s own `onError` is what actually catches this; a plain
 * `<img>` failing silently leaves a broken-image glyph, not a
 * placeholder. The "offer to replace it" half is the `onChange` button
 * already rendered here regardless — no separate affordance needed,
 * since "Change" already does exactly that.
 */
export function UnsplashPhotoPreview({
  photo,
  onChange,
}: {
  photo: UnsplashPhotoResult;
  onChange: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="ring-foreground/10 bg-muted relative aspect-video w-full overflow-hidden rounded-lg ring-1">
        {imageFailed ? (
          <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-1 p-4 text-center text-sm">
            <p>This photo is no longer available.</p>
          </div>
        ) : (
          <Image
            src={photo.fullUrl || photo.thumbUrl}
            alt={photo.altDescription ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, 480px"
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {!imageFailed && (
          <UnsplashAttribution
            authorName={photo.authorName}
            authorUrl={photo.authorUrl}
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          onClick={onChange}
        >
          Change
        </Button>
      </div>
    </div>
  );
}
