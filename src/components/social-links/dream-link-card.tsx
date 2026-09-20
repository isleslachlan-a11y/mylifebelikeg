"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { dreamLinkDisplayTitle } from "@/lib/social-links/display";
import type { SocialLinkProvider } from "@/lib/social-links/parse";
import { InstagramEmbed, PinterestEmbed, TiktokEmbed } from "./embeds";
import { ProviderChip } from "./provider-chip";

export type DreamLinkCardData = {
  id: string;
  provider: SocialLinkProvider;
  providerPostId: string | null;
  canonicalUrl: string;
  title: string | null;
  note: string | null;
};

/**
 * "Saved links render as a local card first... No third-party request
 * is made on page load. The card has an 'Show post' control. Only on
 * click do we inject the platform embed" (brief, verbatim). Activation
 * is `useState`, deliberately not persisted anywhere -- "per-card and
 * per-session... do not add a global 'always load embeds' setting in
 * this package" (brief) -- so it always starts inactive on a fresh
 * page load, every time.
 *
 * "Short-link TikTok and Pinterest entries have no post id, so they
 * render as link cards with the activate control hidden" and "other --
 * no embed, the anchor is the whole feature. Hide the activate
 * control" (brief, verbatim) -- both collapse to the same condition
 * here: no activate control unless there's a real provider *and* a
 * real post id to embed.
 */
export function DreamLinkCard({
  link,
  onDelete,
  isDeleting,
}: {
  link: DreamLinkCardData;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [activated, setActivated] = useState(false);
  const canActivate = link.provider !== "other" && link.providerPostId != null;

  return (
    <div className="border-subtle flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <ProviderChip provider={link.provider} />
            <span className="truncate text-sm font-medium">
              {dreamLinkDisplayTitle(link)}
            </span>
          </div>
          <a
            href={link.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground truncate text-xs underline underline-offset-2"
          >
            {link.canonicalUrl}
          </a>
          {link.note && <p className="text-muted-foreground text-sm">{link.note}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDeleting}
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>

      {canActivate && !activated && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setActivated(true)}
        >
          Show post
        </Button>
      )}

      {activated && canActivate && (
        <div className="overflow-hidden rounded-lg">
          {link.provider === "tiktok" && (
            <TiktokEmbed canonicalUrl={link.canonicalUrl} providerPostId={link.providerPostId!} />
          )}
          {link.provider === "instagram" && (
            <InstagramEmbed canonicalUrl={link.canonicalUrl} />
          )}
          {link.provider === "pinterest" && (
            <PinterestEmbed canonicalUrl={link.canonicalUrl} />
          )}
        </div>
      )}
    </div>
  );
}
