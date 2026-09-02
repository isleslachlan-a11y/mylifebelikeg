import Link from "next/link";

import {
  ConstellationFigure,
  type ConstellationPoint,
} from "@/components/constellations/constellation-figure";
import type { DepthStyle } from "@/lib/constellations/layout";

export type ConstellationTileProps = {
  goalId: string;
  title: string;
  colour: string | null;
  lit: boolean;
  points: ConstellationPoint[];
  /** Only ever shown for an unlit (abandoned) tile — brief: "with their reasons visible." */
  abandonReason?: string | null;
  depth: DepthStyle;
};

const BASE_SIZE_PX = 140;

/**
 * One tile in the `/constellations` gallery grid: the figure itself
 * (`ConstellationFigure`), a caption, and the depth/recede treatment
 * (brief: "newer constellations sit in the foreground; older ones
 * recede") — `depth.scale` shrinks the actual rendered SVG size (not a
 * CSS transform) so an older constellation is a genuinely smaller
 * image, and `depth.opacity` fades the whole tile including its
 * caption. Both come from `computeDepth` (`layout.ts`), keyed by the
 * tile's year-group rank — this component just applies whatever it's
 * handed, it doesn't compute depth itself.
 */
export function ConstellationTile({
  goalId,
  title,
  colour,
  lit,
  points,
  abandonReason,
  depth,
}: ConstellationTileProps) {
  return (
    <Link
      href={`/constellations/${goalId}`}
      className="group flex w-36 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-transform hover:z-10 hover:scale-110"
      style={{ opacity: depth.opacity }}
    >
      <ConstellationFigure
        points={points}
        colour={colour}
        lit={lit}
        size={Math.round(BASE_SIZE_PX * depth.scale)}
        title={title}
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-foreground group-hover:text-primary-soft w-32 truncate text-xs font-medium">
          {title}
        </span>
        {!lit && abandonReason && (
          <span className="text-muted-foreground w-32 truncate text-[10px]">
            {abandonReason}
          </span>
        )}
      </div>
    </Link>
  );
}
