import { notFound } from "next/navigation";

import { Avatar } from "@/components/avatar";
import {
  ACCESSORY_PRESETS,
  BACKDROP_PRESETS,
  BASE_PRESETS,
  DEFAULT_AVATAR,
  OUTFIT_PRESETS,
  POSE_PRESETS,
} from "@/lib/avatar/presets";
import type { AvatarSlot } from "@/lib/avatar/types";

// Dev-only avatar review page, same convention as /styleguide/llamas:
// every preset, rendered, so "every preset renders visibly and
// distinctly" (P7.0's own acceptance line) is something to actually look
// at rather than take on faith.
export default function AvatarsStyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const slots: { slot: AvatarSlot; codes: string[]; label: string }[] = [
    { slot: "base", codes: Object.keys(BASE_PRESETS), label: "Base" },
    { slot: "outfit", codes: Object.keys(OUTFIT_PRESETS), label: "Outfit" },
    { slot: "pose", codes: Object.keys(POSE_PRESETS), label: "Pose" },
    {
      slot: "backdrop",
      codes: Object.keys(BACKDROP_PRESETS),
      label: "Backdrop",
    },
    {
      slot: "accessory",
      codes: Object.keys(ACCESSORY_PRESETS),
      label: "Accessory",
    },
  ];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-16 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-5xl">Avatar presets</h1>
        <p className="text-muted-foreground max-w-prose font-sans">
          Every preset in every slot, held constant against the default avatar
          everywhere else — so what changes between two tiles is only the one
          thing that slot controls.
        </p>
      </header>

      {slots.map(({ slot, codes, label }) => (
        <section key={slot} className="flex flex-col gap-4">
          <h2 className="font-display text-3xl">{label}</h2>
          <div className="flex flex-wrap gap-6">
            {codes.map((code) => (
              <figure key={code} className="flex flex-col items-center gap-2">
                <Avatar
                  avatar={{ ...DEFAULT_AVATAR, [slot]: code }}
                  size={96}
                />
                <figcaption className="text-muted-foreground font-mono text-xs">
                  {code}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl">Every slot unlocked</h2>
        <p className="text-muted-foreground max-w-prose font-sans text-sm">
          A composite using the last (rarest) preset in every slot at once, to
          check the layers don&apos;t collide.
        </p>
        <Avatar
          avatar={{
            base: Object.keys(BASE_PRESETS).at(-1),
            outfit: Object.keys(OUTFIT_PRESETS).at(-1),
            pose: Object.keys(POSE_PRESETS).at(-1),
            backdrop: Object.keys(BACKDROP_PRESETS).at(-1),
            accessory: Object.keys(ACCESSORY_PRESETS).at(-1),
          }}
          size={160}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-3xl">Sizes</h2>
        <div className="flex flex-wrap items-end gap-6">
          {[24, 40, 64, 96, 160].map((size) => (
            <Avatar key={size} avatar={DEFAULT_AVATAR} size={size} />
          ))}
        </div>
      </section>
    </main>
  );
}
