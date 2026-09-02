import type { Json } from "@/types/database";

/**
 * The shape `profiles.avatar` (jsonb) actually holds — one preset `code`
 * per slot, matching `app.validate_avatar()`'s own slot list exactly
 * (`base`, `outfit`, `pose`, `backdrop`, `accessory`; see migration 0026).
 * Every key is optional: a fresh profile's `avatar` defaults to `{}` at
 * the database level, and `app.validate_avatar()` accepts a missing key
 * for any slot — it only ever rejects a slot that's *present* and wrong.
 * `render.ts`'s `resolveAvatar` is what fills the gaps with
 * `DEFAULT_AVATAR` for actual rendering.
 */
export type AvatarSlot = "base" | "outfit" | "pose" | "backdrop" | "accessory";

export type AvatarSelection = Partial<Record<AvatarSlot, string>>;

const AVATAR_SLOTS: readonly AvatarSlot[] = [
  "base",
  "outfit",
  "pose",
  "backdrop",
  "accessory",
];

/**
 * `profiles.avatar` is generated as the generic `Json` type (rule 6 —
 * database types come from the schema, and Postgres's `jsonb` column
 * type carries no narrower shape) — this is the one place that narrows
 * it defensively into `AvatarSelection`, the same "every key optional,
 * read defensively" posture `rag.ts`'s `ragInputs()` already takes with
 * `v_goal_rag`'s own loosely-typed `inputs` jsonb. Anything that isn't a
 * plain object, or a slot value that isn't a string, is dropped rather
 * than thrown on — `render.ts`'s `resolveAvatar` treats a dropped slot
 * exactly like a missing one.
 */
export function parseAvatarSelection(
  json: Json | null | undefined,
): AvatarSelection {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const record = json as Record<string, Json | undefined>;
  const out: AvatarSelection = {};
  for (const slot of AVATAR_SLOTS) {
    const value = record[slot];
    if (typeof value === "string") out[slot] = value;
  }
  return out;
}
