import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AVATAR } from "@/lib/avatar/presets";
import { parseAvatarSelection, type AvatarSlot } from "@/lib/avatar/types";
import { AvatarEditor, type PresetOption } from "./avatar-editor";

const SLOT_ORDER: AvatarSlot[] = [
  "base",
  "outfit",
  "pose",
  "backdrop",
  "accessory",
];

export default async function AvatarEditorPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile, error: profileError },
    { data: presetRows, error: presetsError },
  ] = await Promise.all([
    supabase.from("profiles").select("avatar").eq("id", userId).single(),
    // v_available_presets (0026) already resolves is_unlocked per-user
    // off auth.uid() inside the view itself, and joins the unlocking
    // achievement's own description in as unlock_hint — nothing here
    // recomputes either.
    supabase
      .from("v_available_presets")
      .select("code, category, name, unlock_hint, is_unlocked")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (presetsError) {
    throw new Error(presetsError.message);
  }

  const presetsBySlot = Object.fromEntries(
    SLOT_ORDER.map((slot) => [
      slot,
      (presetRows ?? []).filter(
        (row): row is PresetOption =>
          row.category === slot &&
          row.code != null &&
          row.name != null &&
          row.is_unlocked != null,
      ),
    ]),
  ) as Record<AvatarSlot, PresetOption[]>;

  // Merged with DEFAULT_AVATAR (rather than the bare parsed selection) so
  // a brand-new profile — `avatar` defaults to `{}` at the database level
  // — opens with its starting tiles (base_1, outfit_tee, ...) already
  // highlighted as selected, matching what the pinned preview actually
  // shows via render.ts's own DEFAULT_AVATAR fallback. Whatever the user
  // already chose always wins over the default for that slot.
  const initialAvatar = {
    ...DEFAULT_AVATAR,
    ...parseAvatarSelection(profile.avatar),
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2 px-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Avatar</h1>
        <p className="text-muted-foreground text-sm">
          Locked options show what unlocks them — earn the achievement and
          they&apos;re yours.
        </p>
      </div>
      <AvatarEditor
        initialAvatar={initialAvatar}
        presetsBySlot={presetsBySlot}
      />
    </div>
  );
}
