"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";
import { cn } from "@/lib/utils";
import { UnsplashAttribution } from "./unsplash-attribution";

const DEBOUNCE_MS = 400;
const RESULTS_PER_PAGE = 24;
// "Do not search on empty or single-character input" (Unsplash package
// brief) — a lone character is almost never a useful query and would
// otherwise burn one of the demo tier's 50 requests/hour on every
// keystroke of a longer word being typed out.
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "rateLimited"; message: string }
  | {
      status: "ready";
      results: UnsplashPhotoResult[];
      page: number;
      canLoadMore: boolean;
      loadingMore: boolean;
    };

type CacheEntry = { results: UnsplashPhotoResult[]; canLoadMore: boolean };

/**
 * Search Unsplash, pick a photo. Debounced 400ms (Unsplash package
 * brief) and backed by a per-mount client-side cache keyed by
 * normalized-query-and-page — the thing that actually protects the
 * 50/hour demo-tier limit during normal typing/re-search (backspacing
 * to a query already searched this session is a cache hit, no network
 * call), same shape as `use-critical-path-edges.ts`'s debounce-then-
 * cache-check funnel through one `setTimeout`.
 *
 * `onSelect` fires synchronously with the full `UnsplashPhotoResult` the
 * instant a photo is clicked — the caller is responsible for persisting
 * the `unsplash_*` columns from it. The download-tracking trigger fires
 * alongside, fire-and-forget: it's bookkeeping this API's terms
 * require, not something the UI should ever block a selection on.
 *
 * Rate-limiting gets its own `SearchState` branch, not a string tucked
 * inside the generic error state — "never a generic error... upload a
 * photo instead" (brief, verbatim) means the exhausted-quota case needs
 * to be structurally distinguishable so this component can point
 * somewhere else (the caller's own upload tab), not just show
 * different words.
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
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  async function fetchPage(
    trimmed: string,
    page: number,
  ): Promise<{ results: UnsplashPhotoResult[]; error?: string; rateLimited?: boolean }> {
    const res = await fetch(
      `/api/unsplash/search?q=${encodeURIComponent(trimmed)}&page=${page}`,
    );
    const body = (await res.json()) as
      | { results: UnsplashPhotoResult[] }
      | { error: string; rateLimited?: boolean };
    if (!res.ok || "error" in body) {
      return {
        results: [],
        error: "error" in body ? body.error : "Photo search failed.",
        rateLimited: "rateLimited" in body ? body.rateLimited : false,
      };
    }
    return { results: body.results };
  }

  useEffect(() => {
    const trimmed = query.trim();
    const searchable = trimmed.length >= MIN_QUERY_LENGTH;
    const cacheKey = `${trimmed.toLowerCase()}::1`;
    const cached = searchable ? cacheRef.current.get(cacheKey) : undefined;
    // No debounce needed for "nothing to search" or "already cached" —
    // only a real network fetch waits out DEBOUNCE_MS. Every branch,
    // including the too-short-to-search one, funnels through this same
    // single setTimeout so every setState call happens inside its
    // callback rather than synchronously in the effect body — same
    // shape as use-critical-path-edges.ts, for the same lint reason.
    const delay = searchable && !cached ? DEBOUNCE_MS : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;

      if (!searchable) {
        setState({ status: "idle" });
        return;
      }

      if (cached) {
        setState({
          status: "ready",
          results: cached.results,
          page: 1,
          canLoadMore: cached.canLoadMore,
          loadingMore: false,
        });
        return;
      }

      setState({ status: "loading" });
      void (async () => {
        const { results, error, rateLimited } = await fetchPage(trimmed, 1);
        if (cancelled) return;

        if (error) {
          setState(
            rateLimited
              ? { status: "rateLimited", message: error }
              : { status: "error", message: error },
          );
          return;
        }

        const canLoadMore = results.length >= RESULTS_PER_PAGE;
        cacheRef.current.set(cacheKey, { results, canLoadMore });
        setState({ status: "ready", results, page: 1, canLoadMore, loadingMore: false });
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handleLoadMore() {
    if (state.status !== "ready") return;
    const trimmed = query.trim();
    const nextPage = state.page + 1;
    setState({ ...state, loadingMore: true });

    const { results: nextResults, error, rateLimited } = await fetchPage(
      trimmed,
      nextPage,
    );
    if (error) {
      // A load-more failure keeps the results already on screen — only
      // the message changes, never a step backward to "loading" or an
      // empty grid over something that was working a moment ago.
      setState(
        rateLimited
          ? { status: "rateLimited", message: error }
          : { status: "error", message: error },
      );
      return;
    }

    const combined = [...state.results, ...nextResults];
    const canLoadMore = nextResults.length >= RESULTS_PER_PAGE;
    cacheRef.current.set(`${trimmed.toLowerCase()}::${nextPage}`, {
      results: combined,
      canLoadMore,
    });
    setState({
      status: "ready",
      results: combined,
      page: nextPage,
      canLoadMore,
      loadingMore: false,
    });
  }

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
        <p className="text-muted-foreground text-sm" role="status">
          Searching…
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}

      {state.status === "rateLimited" && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}

      {state.status === "ready" && state.results.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No photos found for &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {state.status === "ready" && state.results.length > 0 && (
        <>
          {/* Two columns at the narrowest width this needs to work at
              (390px, Unsplash package brief), growing to more on wider
              viewports — not a fixed 3/4 grid that never adapts down. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
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
                  "ring-foreground/10 relative aspect-square min-h-11 min-w-11 overflow-hidden rounded-lg ring-1 transition-transform hover:scale-[1.02]",
                  photo.id === selected?.id && "ring-ring ring-2",
                )}
              >
                {/* Hotlinked straight from Unsplash's own CDN via
                    next/image (images.unsplash.com is an allowed
                    remotePattern, next.config.ts) — sizing/lazy-loading
                    is transformation of the delivered URL, not
                    re-hosting (Unsplash package brief, correcting this
                    component's own earlier plain-<img> stance). */}
                <Image
                  src={photo.thumbUrl}
                  alt={photo.altDescription ?? ""}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  className="object-cover"
                  loading="lazy"
                />
                {/* The photographer's name, visible under the thumbnail
                    at all times — not a hover-only reveal, which a
                    touch device could never trigger. Small and
                    low-contrast is fine (same posture
                    <UnsplashAttribution> already takes); invisible
                    until hover is not. */}
                <div className="from-background/90 pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-1.5 pt-4 pb-1">
                  <p className="truncate text-[11px] text-white/90">
                    {photo.authorName}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {state.canLoadMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={state.loadingMore}
              onClick={handleLoadMore}
              className="max-md:h-11"
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
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
