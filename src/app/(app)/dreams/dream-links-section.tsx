"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DreamLinkCard,
  type DreamLinkCardData,
} from "@/components/social-links/dream-link-card";
import { ProviderChip } from "@/components/social-links/provider-chip";
import { parseSocialLink } from "@/lib/social-links/parse";
import { createDreamLink, deleteDreamLink } from "./link-actions";

/**
 * P10.3: link capture for a dream. "Single paste field, plain-language
 * label... never 'asset', 'resource' or 'artifact'" (brief, verbatim,
 * P9.7's vocabulary rule) -- this whole section calls the thing a
 * "link" or "inspiration" throughout, nothing else.
 *
 * Only ever rendered once a dream has a real id -- same "mode ===
 * 'edit' && item" gate ShareControl and ShareCardButton already use
 * one level up in dream-form-dialog.tsx, for the same reason: a link
 * needs a real `entry_id` to attach to.
 */
export function DreamLinksSection({
  entryId,
  initialLinks,
}: {
  entryId: string;
  initialLinks: DreamLinkCardData[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = url.trim();
  // Re-run on every render -- pure and synchronous, no reason to stash
  // it in state and risk it drifting from `url` itself. "On paste or
  // blur, run the parser locally" (brief) holds here for free: a paste
  // fires the same onChange a keystroke does for a controlled input,
  // so there's no separate handler needed for the two cases.
  const parsed = trimmedUrl ? parseSocialLink(trimmedUrl) : null;
  const showUnparseableMessage = trimmedUrl.length > 0 && parsed === null;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await createDreamLink(
        entryId,
        url,
        title,
        note,
        // "Offer to save it as a plain link" (brief) -- forced only
        // when the parser genuinely couldn't make sense of the input;
        // a real parse always takes the normal path regardless of
        // this flag (see createDreamLink's own comment).
        showUnparseableMessage,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLinks((prev) => [
        ...prev,
        {
          id: result.data.id,
          provider: result.data.provider as DreamLinkCardData["provider"],
          providerPostId: result.data.provider_post_id,
          canonicalUrl: result.data.canonical_url,
          title: result.data.title,
          note: result.data.note,
        },
      ]);
      // Only the success path clears the fields -- "keep the pasted
      // text in the field, do not clear it" (brief) is exactly what
      // *not* touching these on the error branch above already gives.
      setUrl("");
      setTitle("");
      setNote("");
      // The dream detail dialog re-seeds this whole section's initial
      // links whenever it reopens (same key-diffing idiom as the
      // dialog's own form state) -- refreshing here keeps the page's
      // own server-fetched linksByEntryId prefetch (page.tsx) from
      // going stale for the next open, the same reasoning
      // ParticipantsSection/FriendsView already apply after their own
      // mutations.
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteDreamLink(id);
      if (!result.ok) {
        setError(result.error);
        setDeletingId(null);
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="dream-link-url">Inspiration link</Label>
      <div className="flex flex-col gap-1.5">
        <Input
          id="dream-link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link from Instagram, TikTok or Pinterest"
        />
        {parsed && <ProviderChip provider={parsed.provider} />}
        {showUnparseableMessage && (
          <p className="text-muted-foreground text-xs">
            We couldn&rsquo;t recognise that as a link — you can still save it as
            a plain link below.
          </p>
        )}
      </div>

      {trimmedUrl && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-link-title">Title (optional)</Label>
            <Input
              id="dream-link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is it?"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-link-note">Note (optional)</Label>
            <Textarea
              id="dream-link-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why you saved it"
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="w-fit max-md:h-11"
            disabled={isPending}
            onClick={handleSave}
          >
            {isPending
              ? "Saving…"
              : showUnparseableMessage
                ? "Save as a plain link"
                : "Save link"}
          </Button>
        </>
      )}

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.id}>
              <DreamLinkCard
                link={link}
                isDeleting={isPending && deletingId === link.id}
                onDelete={() => handleDelete(link.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
