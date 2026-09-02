import { memo } from "react";

import { parseAvatarSelection } from "@/lib/avatar/types";
import { renderAvatarSvg } from "@/lib/avatar/render";
import type { Json } from "@/types/database";

export type AvatarProps = {
  /** `profiles.avatar` straight off a Supabase row — `Json`, not a
   * pre-narrowed type, so call sites never need their own cast; see
   * `parseAvatarSelection`'s own comment for why. */
  avatar: Json | null | undefined;
  /** Pixel size, both dimensions — the avatar is always square. */
  size: number;
  className?: string;
};

function AvatarImpl({ avatar, size, className }: AvatarProps) {
  const selection = parseAvatarSelection(avatar);
  const svg = renderAvatarSvg(selection, size);

  return (
    <span
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
      // The SVG string is built entirely from renderAvatarSvg's own
      // preset dictionaries (see resolveAvatar's comment) — never from
      // raw, unresolved values out of `avatar` itself — so this is safe
      // even though `avatar` is untrusted jsonb off the database.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Two independent, complementary layers of memoisation, not one:
// `renderAvatarSvg` already caches the expensive part (DiceBear's own
// generation) at module scope, keyed by base/outfit/pose — that's what
// keeps two *different* avatars for the same preset combination cheap
// anywhere in the app. This comparator is the other half, for a *single*
// `<Avatar>` instance sitting inside a client-rendered list (P7.3:
// participant lists, task-owner badges) that re-renders for an unrelated
// reason (a sibling's state changing, a parent list refetching) — without
// it, React would still re-run this component, re-build the SVG string,
// and make the browser re-parse it into the DOM every time, even though
// the output is byte-for-byte identical. `JSON.stringify` rather than a
// reference check: `avatar` is frequently a fresh object literal built
// per-render by the caller (`{...selection, [slot]: code}` in the
// avatar editor, a per-row `profile.avatar` spread elsewhere), so a
// referential comparison would never hit; comparing serialized content
// is what actually catches "same avatar, new object identity."
function areEqual(prev: AvatarProps, next: AvatarProps): boolean {
  return (
    prev.size === next.size &&
    prev.className === next.className &&
    JSON.stringify(prev.avatar) === JSON.stringify(next.avatar)
  );
}

/**
 * Renders a `profiles.avatar` selection as an inline SVG. No hooks, no
 * `"use client"` of its own — plain enough to render from a Server
 * Component (most lists that show an avatar, e.g. participant rows, are
 * server-rendered already), which also means it can't reach for
 * `useId()` for the unique-per-instance ids `renderAvatarSvg` needs
 * internally; that function falls back to its own module-scope counter
 * instead (see its own comment) when no `uid` is supplied, which is
 * enough to keep ids unique within one render pass without needing this
 * component to be a Client Component just to call a hook. `memo` here
 * is inert (harmless, not wrong) when this renders from a Server
 * Component — there's no re-render to skip — and becomes real savings
 * the moment it's used inside a Client Component tree, which is exactly
 * where "avatars appear throughout the app" (P7.3 brief) puts most of
 * them: participant lists, task-owner badges, the achievement grid.
 */
export const Avatar = memo(AvatarImpl, areEqual);
