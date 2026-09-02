import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type FlairAchievement = {
  code: string;
  name: string;
  description: string;
};

/**
 * "Up to three pinned achievements as flair" (P7.3 brief) — shared
 * between the own-profile page (where the achievement grid underneath
 * lets you choose them) and another user's profile (where they're the
 * *only* achievement information ever shown — no grid, no locked
 * hints — see `[handle]/page.tsx`'s own comment on why). Pure display,
 * no interactivity: pinning itself is `achievement-grid.tsx`'s job.
 * `title` carries the achievement's own description as a plain hover
 * tooltip — flair is meant to be glanceable, not another tap target.
 */
export function PinnedFlair({ pinned }: { pinned: FlairAchievement[] }) {
  if (pinned.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {pinned.map((achievement) => (
        <Badge
          key={achievement.code}
          variant="outline"
          title={achievement.description}
          className="border-star/40 text-star gap-1"
        >
          <Star className="size-3" aria-hidden />
          {achievement.name}
        </Badge>
      ))}
    </div>
  );
}
