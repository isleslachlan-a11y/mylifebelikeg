import {
  UNSPLASH_HOME_URL,
  type UnsplashAttributionInput,
} from "@/lib/unsplash/types";
import { cn } from "@/lib/utils";

/**
 * "Photographer and Unsplash, both linked, with utm_source and
 * utm_medium=referral parameters" (P6.0 brief) — render this wherever a
 * photo appears, not only in the picker. `authorUrl` is expected already
 * carrying the utm params (every write path — `<PhotoPicker>`'s
 * selection, the `unsplash_author_url` column itself — stores it that
 * way), so this component doesn't re-derive them; it only builds the
 * one link it does own, `UNSPLASH_HOME_URL`.
 */
export function UnsplashAttribution({
  authorName,
  authorUrl,
  className,
}: UnsplashAttributionInput & { className?: string }) {
  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      Photo by{" "}
      <a
        href={authorUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        {authorName}
      </a>{" "}
      on{" "}
      <a
        href={UNSPLASH_HOME_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        Unsplash
      </a>
    </p>
  );
}
