import { Check, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { countryName, dreamState, type SomedayItemRow } from "@/lib/someday";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

/**
 * One tile in the photo grid — "Grid, not a list" (P8.2 brief). No photo
 * yet still gets a tile (a life-area-tinted gradient standing in),
 * rather than being dropped from the grid or forced to wait on a photo
 * before the item can exist at all — Unsplash being unconfigured, or an
 * upload skipped in favour of the fast title-only path, shouldn't block
 * adding to the diary.
 *
 * Achieved dreams stay in the grid, visually distinct (brief, verbatim:
 * "the point of a diary is the accumulated record") — a star badge
 * (the `--star` token: "completions, achievements, highlights", already
 * this app's established colour for exactly this meaning, e.g.
 * `<AchievementCelebration>`) plus a matching ring, rather than looking
 * abandoned or fading out the way a "done" item often does elsewhere.
 * Archived dreams get no special card treatment here at all — the
 * default filter (`dreamState`'s own "all" meaning "not archived") is
 * what keeps them off the grid in the first place; the only way to see
 * one is to filter to it directly, at which point it should look like
 * an ordinary dream, not a punished one.
 *
 * P8.4: "achieved with one action from the grid or the detail view"
 * (brief, verbatim) — the whole tile is itself a button (opens the
 * detail view), so the quick-achieve action is a second, absolutely
 * positioned button rather than nested inside it (nested `<button>`s
 * aren't valid HTML); `stopPropagation` keeps a tap on it from also
 * opening the detail view underneath.
 */
export function DreamCard({
  item,
  lifeArea,
  promotedTripTitle,
  thumbUrl,
  onClick,
  onAchieve,
}: {
  item: SomedayItemRow;
  lifeArea: LifeArea | undefined;
  /** Present only for a promoted item whose destination trip's title could be resolved (page.tsx's three-hop chase — see its own comment). */
  promotedTripTitle: string | undefined;
  /** A pre-signed thumbnail URL for an upload-sourced item (P8.1) — resolved once, server-side, by page.tsx; absent for an Unsplash-sourced item (which renders straight from `item.unsplash_thumb_url` instead) or one whose signing failed. */
  thumbUrl: string | undefined;
  onClick: () => void;
  onAchieve: () => void;
}) {
  const state = dreamState(item);
  const isPromoted = state === "promoted";
  const isAchieved = state === "achieved";
  const isArchived = state === "archived";
  const photoUrl = item.image_source === "upload" ? thumbUrl : item.unsplash_thumb_url;

  return (
    <div
      className={cn(
        "group relative flex aspect-[4/5] flex-col overflow-hidden rounded-xl ring-1 transition-transform hover:scale-[1.02]",
        isAchieved ? "ring-star/60" : "ring-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`${item.title} — view details`}
        className="absolute inset-0 flex flex-col text-left"
      >
        {photoUrl ? (
          // Unsplash thumbnails are a real hotlink (see P6.0's CLAUDE.md
          // entry on why that stays a plain <img>); an uploaded photo's
          // signed URL is same-origin Supabase Storage, not a remote
          // hotlink, but next/image would still buy nothing for a URL
          // that's already short-lived and server-resolved once — kept as
          // a plain <img> for both so this component doesn't need to know
          // which source it's looking at beyond `photoUrl` itself.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(160deg, ${lifeArea?.colour ?? "#3f3f46"}55, #00000022)`,
            }}
          />
        )}

        <div className="from-background/95 via-background/40 absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t to-transparent p-3 pt-10">
          <div className="flex items-center gap-1.5">
            {lifeArea && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: lifeArea.colour }}
                aria-hidden
              />
            )}
            <p className="font-display truncate text-sm leading-tight">
              {item.title}
            </p>
          </div>

          {(item.place_name || item.country_code) && (
            <p className="text-muted-foreground truncate text-xs">
              {[
                item.place_name,
                item.country_code && countryName(item.country_code.trim()),
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}

          {item.rough_cost_minor != null && item.currency && (
            <Badge variant="outline" className="w-fit">
              {formatMoney(item.rough_cost_minor, item.currency)}
            </Badge>
          )}
        </div>
      </button>

      {isAchieved && (
        <div className="absolute top-2 left-2">
          <span
            className="bg-star text-deep flex size-7 items-center justify-center rounded-full"
            aria-label="Achieved"
            title="Achieved"
          >
            <Sparkles className="size-4" aria-hidden />
          </span>
        </div>
      )}

      {isPromoted && (
        <div className="absolute top-2 right-2 left-2 flex justify-end">
          <Badge variant="default" className="bg-rag-green text-deep">
            {promotedTripTitle ? `In: ${promotedTripTitle}` : "Promoted"}
          </Badge>
        </div>
      )}

      {!isAchieved && !isArchived && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAchieve();
          }}
          aria-label={`Mark ${item.title} achieved`}
          title="Mark achieved"
          className="bg-background/90 hover:bg-star hover:text-deep text-foreground absolute right-2 bottom-2 flex size-11 items-center justify-center rounded-full shadow-sm transition-colors"
        >
          <Check className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
