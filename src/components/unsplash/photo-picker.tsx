"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import { cn } from "@/lib/utils";
import { UnsplashAttribution } from "./unsplash-attribution";

const DEBOUNCE_MS = 400;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; results: UnsplashPhotoResult[] };

/**
 * Search Unsplash, pick a photo. Debounced 400ms (P6.0 brief) and backed
 * by a per-mount client-side cache keyed by the normalized query — the
 * thing that actually protects the 50/hour demo-tier limit during normal
 * typing (backspacing to a query already searched this session is a
 * cache hit, no network call), same shape as `use-critical-path-edges.ts`'s
 * debounce-then-cache-check funnel through one `setTimeout`.
 *
 * `onSelect` fires synchronously with the full `UnsplashPhotoResult` the
 * instant a photo is clicked — the caller (a future bucket-list form,
 * P6.1) is responsible for persisting the `unsplash_*` columns from it.
 * The download-tracking trigger fires alongside, fire-and-forget: it's
 * bookkeeping this API's terms require, not something the UI should ever
 * block a selection on.
 */
export function PhotoPicker({
  onSelect,
  className,
}: {
  onSelect: (photo: UnsplashPhotoResult) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<UnsplashPhotoResult | null>(null);
  const cacheRef = useRef<Map<string, UnsplashPhotoResult[]>>(new Map());

  useEffect(() => {
    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();
    const cached = trimmed ? cacheRef.current.get(cacheKey) : undefined;
    // No debounce needed for "nothing to search" or "already cached" —
    // only a real network fetch waits out DEBOUNCE_MS. Every branch,
    // including the empty-query one, funnels through this same single
    // setTimeout so every setState call happens inside its callback
    // rather than synchronously in the effect body — same shape as
    // use-critical-path-edges.ts, for the same lint reason.
    const delay = trimmed && !cached ? DEBOUNCE_MS : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      if (!trimmed) {
        setState({ status: "idle" });
        return;
      }

      if (cached) {
        setState({ status: "ready", results: cached });
        return;
      }

      setState({ status: "loading" });
      void (async () => {
        try {
          const res = await fetch(
            `/api/unsplash/search?q=${encodeURIComponent(trimmed)}`,
          );
          const body = (await res.json()) as
            { results: UnsplashPhotoResult[] } | { error: string };
          if (cancelled) return;

          if (!res.ok || "error" in body) {
            setState({
              status: "error",
              message: "error" in body ? body.error : "Photo search failed.",
            });
            return;
          }

          cacheRef.current.set(cacheKey, body.results);
          setState({ status: "ready", results: body.results });
        } catch {
          if (!cancelled) {
            setState({ status: "error", message: "Photo search failed." });
          }
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function handleSelect(photo: UnsplashPhotoResult) {
    setSelected(photo);
    onSelect(photo);

    void fetch("/api/unsplash/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
    }).then(
      (res) => {
        if (!res.ok) {
          console.error("Unsplash download trigger failed", res.status);
        }
      },
      (error: unknown) => {
        console.error("Unsplash download trigger failed", error);
      },
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Input
        type="search"
        placeholder="Search Unsplash for a photo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search Unsplash"
      />

      {state.status === "loading" && (
        <p className="text-muted-foreground text-sm">Searching…</p>
      )}

      {state.status === "error" && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}

      {state.status === "ready" && state.results.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No photos found for &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {state.status === "ready" && state.results.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {state.results.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => handleSelect(photo)}
              aria-label={
                photo.altDescription ?? `Photo by ${photo.authorName}`
              }
              aria-pressed={photo.id === selected?.id}
              className={cn(
                "ring-foreground/10 aspect-square overflow-hidden rounded-lg ring-1 transition-transform hover:scale-[1.02]",
                photo.id === selected?.id && "ring-ring ring-2",
              )}
            >
              {/* Hotlinked straight from Unsplash's own CDN (P6.0 brief:
                  "never download the image to your own storage") — a
                  plain <img>, deliberately not next/image, since the
                  optimizer would fetch and cache a copy through our own
                  infrastructure rather than serving Unsplash's URL
                  directly. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt={photo.altDescription ?? ""}
                className="size-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <UnsplashAttribution
          authorName={selected.authorName}
          authorUrl={selected.authorUrl}
        />
      )}
    </div>
  );
}
