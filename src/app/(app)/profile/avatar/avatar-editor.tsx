"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AvatarSelection, AvatarSlot } from "@/lib/avatar/types";
import { saveAvatar } from "./actions";

/** The exact columns `v_available_presets` returns, narrowed to what this
 * editor actually reads. */
export type PresetOption = {
  code: string;
  category: string;
  name: string;
  unlock_hint: string | null;
  is_unlocked: boolean;
};

const SLOTS: { slot: AvatarSlot; label: string }[] = [
  { slot: "base", label: "Base" },
  { slot: "outfit", label: "Outfit" },
  { slot: "pose", label: "Pose" },
  { slot: "backdrop", label: "Backdrop" },
  { slot: "accessory", label: "Accessory" },
];

// Not a real avatar_presets row — a synthetic tile prepended to the
// accessory section only, since accessory is the one slot with no
// DEFAULT_AVATAR fallback (going without one is a valid, always-unlocked
// "look" — see src/lib/avatar/presets.ts's own comment). Selecting it
// clears the slot rather than writing a code.
const NONE_ACCESSORY: PresetOption = {
  code: "",
  category: "accessory",
  name: "None",
  unlock_hint: null,
  is_unlocked: true,
};

export function AvatarEditor({
  initialAvatar,
  presetsBySlot,
}: {
  initialAvatar: AvatarSelection;
  presetsBySlot: Record<AvatarSlot, PresetOption[]>;
}) {
  const [selection, setSelection] = useState<AvatarSelection>(initialAvatar);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  function select(slot: AvatarSlot, code: string) {
    setError(null);
    setJustSaved(false);
    setSelection((prev) => {
      if (!code) {
        const rest = { ...prev };
        delete rest[slot];
        return rest;
      }
      return { ...prev, [slot]: code };
    });
  }

  function handleRandomise() {
    setError(null);
    setJustSaved(false);
    setSelection((prev) => {
      const next: AvatarSelection = { ...prev };
      for (const { slot } of SLOTS) {
        const unlocked = presetsBySlot[slot].filter((p) => p.is_unlocked);
        if (unlocked.length === 0) {
          delete next[slot];
          continue;
        }
        const choice = unlocked[Math.floor(Math.random() * unlocked.length)]!;
        next[slot] = choice.code;
      }
      return next;
    });
  }

  function handleSave() {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await saveAvatar(selection);
      if (!result.ok) {
        setError(result.error);
      } else {
        setJustSaved(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pinned preview — sticky against the viewport (the app shell's
          <main> has no overflow-auto of its own, so top:0 here really
          does mean the top of the screen, not some inner scroll box).
          Mobile brief: "preview pinned at top, options scrolling
          beneath" — this is that, and it costs nothing extra on desktop
          either. */}
      <div className="bg-background border-border sticky top-0 z-10 -mx-6 flex flex-col items-center gap-3 border-b px-6 py-4">
        <Avatar avatar={selection} size={120} />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRandomise}
          >
            Randomise
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {justSaved && !error && (
          <p className="text-muted-foreground text-sm">Saved.</p>
        )}
      </div>

      <div className="flex flex-col gap-8">
        {SLOTS.map(({ slot, label }) => {
          const options =
            slot === "accessory"
              ? [NONE_ACCESSORY, ...presetsBySlot[slot]]
              : presetsBySlot[slot];
          return (
            <section key={slot} className="flex flex-col gap-3">
              <h2 className="font-display text-xl">{label}</h2>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
                {options.map((preset) => (
                  <PresetTile
                    key={preset.code || "none"}
                    preset={preset}
                    selected={
                      slot === "accessory"
                        ? (selection.accessory ?? "") === preset.code
                        : selection[slot] === preset.code
                    }
                    previewAvatar={
                      preset.code
                        ? { ...selection, [slot]: preset.code }
                        : { ...selection, accessory: undefined }
                    }
                    onSelect={() => select(slot, preset.code)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PresetTile({
  preset,
  selected,
  previewAvatar,
  onSelect,
}: {
  preset: PresetOption;
  selected: boolean;
  previewAvatar: AvatarSelection;
  onSelect: () => void;
}) {
  if (!preset.is_unlocked) {
    // Locked: no onSelect wired at all — clicking this tile can never
    // write a locked code into `selection`, which is the client-side
    // prevention the brief asks for (the database trigger is still the
    // real boundary, this just means a real user never reaches it). The
    // popover (tap) and native `title` (hover) both surface the same
    // unlock_hint text — "hidden unlocks motivate nothing" (brief).
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={preset.unlock_hint ?? undefined}
            className="flex flex-col items-center gap-1.5 opacity-45 grayscale"
          >
            <div className="relative">
              <Avatar avatar={previewAvatar} size={64} />
              <Lock className="text-star bg-deep absolute -right-1 -bottom-1 size-4 rounded-full p-0.5" />
            </div>
            <span className="text-muted-foreground max-w-16 truncate text-center text-xs">
              {preset.name}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="max-w-64 text-sm">
          <p className="text-foreground font-medium">{preset.name} — locked</p>
          <p className="text-muted-foreground mt-1">{preset.unlock_hint}</p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg p-1 transition-colors",
        selected ? "ring-primary ring-2" : "hover:bg-muted",
      )}
    >
      <Avatar avatar={previewAvatar} size={64} />
      <span className="max-w-16 truncate text-center text-xs">
        {preset.name}
      </span>
    </button>
  );
}
