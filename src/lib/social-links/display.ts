import type { SocialLinkProvider } from "./parse";

const PROVIDER_NAME: Record<SocialLinkProvider, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  other: "Link",
};

/**
 * "Title is optional; if left empty, display falls back to the
 * provider name plus the handle or id where we have one" (brief,
 * verbatim). This schema never captures a separate handle field (only
 * `provider_post_id`), so "the handle or id" is always the post id
 * here -- still exactly what the brief means by it, just never a
 * distinct value from the id in this package.
 */
export function dreamLinkDisplayTitle(link: {
  title: string | null;
  provider: SocialLinkProvider;
  providerPostId: string | null;
}): string {
  if (link.title) return link.title;
  const name = PROVIDER_NAME[link.provider];
  return link.providerPostId ? `${name} · ${link.providerPostId}` : name;
}
