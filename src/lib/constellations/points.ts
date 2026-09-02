import type { ConstellationPoint } from "./layout";

/** Loosely-typed against `tasks`'s real columns — only what `buildConstellationPoints` needs. */
export type ConstellationTaskInput = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  computed_end: string | null;
  computed_start: string | null;
  created_at: string;
};

/** Loosely-typed against `milestones`'s real columns — only what `buildConstellationPoints` needs. */
export type ConstellationMilestoneInput = {
  id: string;
  title: string;
  completed_at: string | null;
  due_date: string;
  created_at: string;
};

/**
 * Bridges raw `tasks`/`milestones` rows into `layout.ts`'s
 * `ConstellationPoint[]` — the same role `timeline-item-adapter.ts`
 * plays for the cross-goal timeline, one level up from the pure
 * geometry module.
 *
 * A completed goal (`lit = true`) only ever shows items that actually
 * completed: `completed_at` is the star's date (brief: "positioned by
 * completion date"), and an item without one simply isn't a star — a
 * completed goal can be a real, if sparse, constellation even if only a
 * few of its tasks were ever finished.
 *
 * An abandoned goal (`lit = false`) uses the same completed-items-first
 * rule, but falls back to an outline built from whatever non-cancelled
 * tasks/milestones exist when *nothing* was ever completed (the
 * ordering date there is `computed_end`, else `computed_start`, else
 * `created_at` for tasks; `due_date`, else `created_at` for milestones)
 * — an abandoned goal that never finished anything is still worth an
 * outline in the archive, not a blank space where a constellation
 * should be. If it *did* complete a few things before being abandoned,
 * those keep their real completion dates and the fallback never runs.
 */
export function buildConstellationPoints(
  lit: boolean,
  tasks: ConstellationTaskInput[],
  milestones: ConstellationMilestoneInput[],
): ConstellationPoint[] {
  const completedPoints: ConstellationPoint[] = [
    ...tasks
      .filter((t) => t.completed_at != null)
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: t.completed_at!,
        brightness: "normal" as const,
      })),
    ...milestones
      .filter((m) => m.completed_at != null)
      .map((m) => ({
        id: m.id,
        title: m.title,
        date: m.completed_at!,
        brightness: "bright" as const,
      })),
  ];

  if (lit || completedPoints.length > 0) {
    return completedPoints;
  }

  const fallbackTasks: ConstellationPoint[] = tasks
    .filter((t) => t.status !== "cancelled")
    .map((t) => ({
      id: t.id,
      title: t.title,
      date: t.computed_end ?? t.computed_start ?? t.created_at,
      brightness: "normal" as const,
    }));
  const fallbackMilestones: ConstellationPoint[] = milestones.map((m) => ({
    id: m.id,
    title: m.title,
    date: m.due_date ?? m.created_at,
    brightness: "bright" as const,
  }));

  return [...fallbackTasks, ...fallbackMilestones];
}
