import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { countryName, type SomedayItemRow } from "@/lib/someday";
import type { Database } from "@/types/database";

type LifeArea = Database["public"]["Tables"]["life_areas"]["Row"];

/**
 * One tile in the photo grid — "Display as a photo grid, not a list"
 * (P6.1 brief). No photo yet still gets a tile (a life-area-tinted
 * gradient standing in), rather than being dropped from the grid or
 * forced to wait on a photo before the item can exist at all — Unsplash
 * being unconfigured, or a place picked without one, shouldn't block
 * adding to the list.
 */
export function SomedayCard({
  item,
  lifeArea,
  promotedTripTitle,
  onClick,
}: {
  item: SomedayItemRow;
  lifeArea: LifeArea | undefined;
  /** Present only for a promoted item whose destination trip's title could be resolved (page.tsx's three-hop chase — see its own comment). */
  promotedTripTitle: string | undefined;
  onClick: () => void;
}) {
  const isPromoted = item.promoted_at != null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ring-foreground/10 group relative flex aspect-[4/5] flex-col overflow-hidden rounded-xl text-left ring-1 transition-transform hover:scale-[1.02]"
    >
      {item.unsplash_thumb_url ? (
        // Hotlinked, same rule as <PhotoPicker> — see P6.0's CLAUDE.md entry.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.unsplash_thumb_url}
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

      {isPromoted && (
        <div className="absolute top-2 right-2 left-2 flex justify-end">
          <Badge variant="default" className="bg-rag-green text-deep">
            {promotedTripTitle ? `In: ${promotedTripTitle}` : "Promoted"}
          </Badge>
        </div>
      )}
    </button>
  );
}
