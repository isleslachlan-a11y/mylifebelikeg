"use client";

import { useState } from "react";
import { notFound } from "next/navigation";

import { PhotoPicker } from "@/components/unsplash/photo-picker";
import { UnsplashAttribution } from "@/components/unsplash/unsplash-attribution";
import type { UnsplashPhotoResult } from "@/lib/unsplash/types";

/**
 * Dev-only verification harness for P6.0's Unsplash integration — inside
 * `(app)` because `<PhotoPicker>`'s fetches to `/api/unsplash/search` and
 * `/api/unsplash/download` need a real signed-in session, same reasoning
 * as `timeline/debug-items`. Same dev-only/`notFound()`-in-production
 * convention as `/styleguide`.
 *
 * To verify the P6.0 acceptance criteria by hand: search "Kyoto", pick a
 * photo, confirm it renders full-size below with attribution — then
 * check the Network tab for a POST to /api/unsplash/download firing at
 * the moment of selection (not before), and re-run the same search to
 * confirm no second GET to /api/unsplash/search fires (client cache hit).
 */
export default function DebugUnsplashPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [selected, setSelected] = useState<UnsplashPhotoResult | null>(null);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-3xl">Unsplash integration (P6.0)</h1>
      </header>

      <PhotoPicker onSelect={setSelected} />

      {selected && (
        <section className="border-subtle flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-display text-lg">Selected</h2>
          {/* Full-size preview, same hotlink-directly rule as the picker's grid. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.fullUrl}
            alt={selected.altDescription ?? ""}
            className="max-h-96 w-full rounded-lg object-cover"
          />
          <UnsplashAttribution
            authorName={selected.authorName}
            authorUrl={selected.authorUrl}
          />
          <pre className="bg-raised overflow-x-auto rounded-lg p-3 text-xs">
            {JSON.stringify(selected, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
