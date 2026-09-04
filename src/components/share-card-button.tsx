"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * P8.6: "generate, then hand to the native share sheet via the Web
 * Share API with a download fallback" (brief, verbatim) -- no in-app
 * feed, follower graph, or comment system, per the same brief: this
 * component's whole job ends the moment a file leaves the device,
 * either through the OS share sheet or a plain download.
 *
 * Format choice (feed 1080x1350 / story 1080x1920) follows the same
 * `variant={selected ? "default" : "outline"} aria-pressed` toggle-
 * button shape `rating-scale.tsx` already established, rather than a
 * `<Select>` -- two mutually exclusive options, both always visible,
 * is exactly what that shape is for.
 */

type CardFormat = "feed" | "story";

const FORMATS: { value: CardFormat; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "story", label: "Story" },
];

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dream"
  );
}

export function ShareCardButton({
  dreamId,
  dreamTitle,
}: {
  dreamId: string;
  dreamTitle: string;
}) {
  const [format, setFormat] = useState<CardFormat>("feed");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setError(null);
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/dreams/${dreamId}/card?format=${format}`);
      if (!response.ok) {
        throw new Error("Couldn't generate the card.");
      }
      const blob = await response.blob();
      const filename = `${slugify(dreamTitle)}-starmap.png`;
      const file = new File([blob], filename, { type: blob.type || "image/png" });

      // Native share sheet where it exists and can actually take a
      // file -- `canShare` is the one reliable way to know that ahead
      // of calling `share` itself (some browsers implement `share` for
      // text/links only). Everything else falls back to a plain
      // download, same "always fully usable either way" posture P6.0/
      // P6.2's own graceful-degradation paths already take.
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: dreamTitle,
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // A user cancelling the native share sheet also rejects this
      // promise (AbortError) -- not a real failure, nothing to show.
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Couldn't share this dream.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Card format">
          {FORMATS.map((f) => (
            <Button
              key={f.value}
              type="button"
              variant={format === f.value ? "default" : "outline"}
              size="sm"
              aria-pressed={format === f.value}
              className="max-md:h-11"
              onClick={() => setFormat(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11 w-fit"
          disabled={isGenerating}
          onClick={handleShare}
        >
          <Share2 className="size-4" aria-hidden />
          {isGenerating ? "Generating…" : "Share"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
