import { Badge } from "@/components/ui/badge";
import type { SocialLinkProvider } from "@/lib/social-links/parse";

const PROVIDER_LABEL: Record<SocialLinkProvider, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  other: "Link",
};

/**
 * "Show a small provider chip (Instagram / TikTok / Pinterest / Link)
 * so the user gets immediate confirmation it was understood" (brief,
 * verbatim) -- used both live, while typing/pasting (before anything's
 * saved), and on every saved link card afterward, so the same chip
 * reads correctly in both places without duplicating the label map.
 */
export function ProviderChip({ provider }: { provider: SocialLinkProvider }) {
  return <Badge variant="outline">{PROVIDER_LABEL[provider]}</Badge>;
}
