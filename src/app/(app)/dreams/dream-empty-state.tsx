import { LlamaEmptyState } from "@/components/llama-empty-state";
import { Button } from "@/components/ui/button";
import type { DreamKind } from "@/lib/someday";

/**
 * "Fluffy inviting the first dream, with three example prompts —
 * somewhere to go, something to own, something to do — rather than a
 * blank grid" (P8.2 brief, verbatim). Each prompt opens the create
 * dialog with that kind already picked -- still an explicit choice the
 * user made by tapping a specific prompt, not the app guessing ("infer
 * nothing" applies here too, just at one remove: nothing is inferred
 * from *content*, only from which of three clearly-labelled buttons was
 * tapped).
 */
const PROMPTS: { kind: DreamKind; label: string }[] = [
  { kind: "place", label: "Somewhere to go" },
  { kind: "object", label: "Something to own" },
  { kind: "experience", label: "Something to do" },
];

export function DreamEmptyState({
  onStart,
}: {
  onStart: (kind: DreamKind) => void;
}) {
  return (
    <LlamaEmptyState
      speaker="fluffy"
      title="Your Dream Diary is empty"
      body="Every diary starts with one entry. A photo and a title is all it takes -- what's something you want?"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {PROMPTS.map((p) => (
            <Button
              key={p.kind}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => onStart(p.kind)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      }
    />
  );
}
