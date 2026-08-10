import { notFound } from "next/navigation";

import { LlamaMessage } from "@/components/llama-message";
import { LlamaEmptyState } from "@/components/llama-empty-state";
import { COPY_VARIANTS } from "@/lib/llamas/copy";
import { TRIGGER_REGISTRY, type Priority } from "@/lib/llamas/registry";
import {
  SPEAKER_META,
  type LlamaSpeaker,
  type TriggerCode,
  type TriggerParams,
} from "@/lib/llamas/types";

// Example parameters for every trigger, just for this review page — real
// values come from real events later (explicitly out of scope for now).
const EXAMPLES: { [K in TriggerCode]: TriggerParams[K] } = {
  goal_red: { goalTitle: "Move to London" },
  goal_amber: { goalTitle: "Emergency Fund" },
  task_overdue: { taskTitle: "Book flights", daysOverdue: 3 },
  budget_exceeded: {
    goalTitle: "Japan Fund",
    spentPercent: 60,
    elapsedPercent: 30,
  },
  goal_undefined: { goalTitle: "Someday: New Car" },
  capacity_exceeded: { percentOver: 15 },
  capacity_shortfall: { capacityMinor: -12000, currency: "AUD" },
  allocation_over_capacity: { overMinor: 35000, currency: "AUD" },
  checkin_due: { goalTitle: "Move to London" },
  goal_green: { goalTitle: "Wedding Fund" },
  goal_completed: { goalTitle: "Pay off credit card" },
  checkin_streak: { weeks: 6 },
  first_goal: { goalTitle: "Move to London" },
  trip_booked: { tripTitle: "Japan 2027" },
  goal_improved: { goalTitle: "Emergency Fund" },
};

// Every variant, rendered — not a random pick — so all copy is reviewable
// at once. Generic so TriggerParams narrows correctly per call below.
function variantsFor<K extends TriggerCode>(trigger: K): string[] {
  return COPY_VARIANTS[trigger].map((fn) => fn(EXAMPLES[trigger]));
}

const PRIORITY_LABEL: Record<Priority, string> = {
  1: "1 · important",
  2: "2 · normal",
  3: "3 · incidental",
};

export default function LlamaStyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const bySpeaker = (speaker: LlamaSpeaker) =>
    (Object.keys(TRIGGER_REGISTRY) as TriggerCode[]).filter(
      (trigger) => TRIGGER_REGISTRY[trigger].speaker === speaker,
    );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-16 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-5xl">Derek &amp; Fluffy</h1>
        <p className="text-muted-foreground max-w-prose font-sans">
          Every trigger, both copy variants, read against each other. Read them
          aloud — with the names hidden you should still be able to tell which
          llama is talking.
        </p>
      </header>

      {(["derek", "fluffy"] as const).map((speaker) => (
        <section key={speaker} className="flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-3xl">
              {SPEAKER_META[speaker].name}
            </h2>
            <p className="text-muted-foreground text-sm">
              {SPEAKER_META[speaker].description}
            </p>
          </div>

          {bySpeaker(speaker).map((trigger) => (
            <div key={trigger} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <code className="text-foreground font-mono text-sm">
                  {trigger}
                </code>
                <span className="text-muted-foreground text-xs">
                  {PRIORITY_LABEL[TRIGGER_REGISTRY[trigger].priority]}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {variantsFor(trigger).map((body, i) => (
                  <LlamaMessage key={i} speaker={speaker} body={body} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      <section className="flex flex-col gap-8">
        <h2 className="font-display text-3xl">Empty states</h2>
        <LlamaEmptyState
          speaker="derek"
          title="No goals yet"
          body="Nothing to track until there's something to track. Add a goal when you're ready."
        />
        <LlamaEmptyState
          speaker="fluffy"
          title="Your trips will show up here"
          body="Once you plan your first trip, this is where it'll live. Exciting stuff!"
        />
      </section>
    </main>
  );
}
