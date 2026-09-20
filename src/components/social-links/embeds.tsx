"use client";

import { useEffect, useRef } from "react";

import { loadEmbedScript } from "./embed-loader";

// Instagram's embed.js attaches this global itself once loaded -- no
// package ships types for it, so it's declared narrowly here, scoped
// to exactly the one method this file calls.
declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process?: () => void;
      };
    };
  }
}

/**
 * "We construct all embed markup ourselves from parsed values. Nothing
 * goes through dangerouslySetInnerHTML" (brief, verbatim) -- every
 * element below is real JSX built from `link`'s own already-validated
 * fields (canonicalUrl/providerPostId came out of the parser, never
 * off a third party), not a string of remote HTML rendered blind.
 *
 * TikTok's and Pinterest's own embed scripts scan the DOM for their
 * respective markers (`.tiktok-embed`, `[data-pin-do]`) and keep
 * watching for new ones -- documented behaviour of both widgets, not
 * something this file re-implements. Instagram's script does not: its
 * own docs (and this package's brief) are explicit that
 * `window.instgrm.Embeds.process()` has to be called after the
 * blockquote is in the DOM, every time, which is why only the
 * Instagram component below does anything after `loadEmbedScript`
 * resolves.
 */
export function TiktokEmbed({
  canonicalUrl,
  providerPostId,
}: {
  canonicalUrl: string;
  providerPostId: string;
}) {
  useEffect(() => {
    void loadEmbedScript("https://www.tiktok.com/embed.js");
  }, []);

  return (
    <blockquote className="tiktok-embed" cite={canonicalUrl} data-video-id={providerPostId}>
      <section />
    </blockquote>
  );
}

export function InstagramEmbed({ canonicalUrl }: { canonicalUrl: string }) {
  const ref = useRef<HTMLQuoteElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadEmbedScript("https://www.instagram.com/embed.js").then(() => {
      if (cancelled) return;
      window.instgrm?.Embeds?.process?.();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <blockquote
      ref={ref}
      className="instagram-media"
      data-instgrm-permalink={canonicalUrl}
      data-instgrm-version="14"
    />
  );
}

export function PinterestEmbed({ canonicalUrl }: { canonicalUrl: string }) {
  useEffect(() => {
    void loadEmbedScript("https://assets.pinterest.com/js/pinit.js");
  }, []);

  return <a data-pin-do="embedPin" href={canonicalUrl} />;
}
