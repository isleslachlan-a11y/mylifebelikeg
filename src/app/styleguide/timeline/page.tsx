import { notFound } from "next/navigation";

import { GoalTimeline } from "@/components/timeline/goal-timeline";
import type { Database } from "@/types/database";

type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

// Fixed, not new Date() — a reproducible demo shouldn't shift with when
// it happens to be viewed. Mirrors the "London move" scenario used
// throughout supabase/local/001 smoke test.
const TODAY = "2026-06-15";
const NOW_ISO = "2026-01-01T00:00:00Z";

function task(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    goal_id: "demo-goal",
    owner_id: "demo-user",
    milestone_id: null,
    notes: null,
    offset_days: 0,
    duration_days: 1,
    computed_start: null,
    computed_end: null,
    status: "not_started",
    completed_at: null,
    estimated_cost_minor: null,
    cost_currency: null,
    total_float_days: null,
    is_critical: false,
    sort_order: 0,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    deleted_at: null,
    ...overrides,
  };
}

function milestone(
  overrides: Partial<Milestone> & Pick<Milestone, "id" | "title" | "due_date">,
): Milestone {
  return {
    goal_id: "demo-goal",
    completed_at: null,
    sort_order: 0,
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    deleted_at: null,
    ...overrides,
  };
}

// Three tasks that all overlap each other -> should stack into three
// sub-rows (the acceptance example), not render on top of one another.
const tasks: Task[] = [
  task({
    id: "a",
    title: "Job offer",
    computed_start: "2026-06-01",
    computed_end: "2026-06-20",
    status: "in_progress",
  }),
  task({
    id: "b",
    title: "Visa application",
    computed_start: "2026-06-05",
    computed_end: "2026-06-25",
    status: "not_started",
  }),
  task({
    id: "c",
    title: "Ship belongings",
    computed_start: "2026-06-10",
    computed_end: "2026-06-30",
    status: "not_started",
  }),
  task({
    id: "d",
    title: "Notify landlord",
    computed_start: "2026-07-01",
    computed_end: "2026-07-10",
    status: "done",
    completed_at: "2026-07-08T00:00:00Z",
  }),
  task({
    id: "e",
    title: "Book flights (overdue)",
    computed_start: "2026-05-01",
    computed_end: "2026-05-15",
    status: "in_progress",
  }),
  task({
    id: "f",
    title: "Cancelled — should not render at all",
    computed_start: "2026-08-01",
    computed_end: "2026-08-05",
    status: "cancelled",
  }),
];

const milestones: Milestone[] = [
  milestone({
    id: "m1",
    title: "Lease signed",
    due_date: "2026-07-15",
  }),
  milestone({
    id: "m2",
    title: "Visa approved",
    due_date: "2026-06-01",
    completed_at: "2026-06-01T00:00:00Z",
  }),
  milestone({
    id: "m3",
    title: "Ship belongings booked (overdue)",
    due_date: "2026-05-01",
  }),
];

// Dev-only visual review harness for GoalTimeline (P1.11) — same
// convention as /styleguide/llamas: no real auth/goal data needed to
// check colours, stacking, and the today marker render correctly.
export default function TimelineStyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-16 px-8 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-sans text-sm">
          Dev-only · not part of the product
        </p>
        <h1 className="font-display text-5xl">Goal timeline</h1>
        <p className="text-muted-foreground max-w-prose font-sans">
          Fixed fake data (the &ldquo;London move&rdquo; scenario), not a real
          goal — for reviewing collision stacking, the three fill colours,
          and the today marker without needing real auth or database rows.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">
          Full span — three overlapping tasks, one done, one overdue, one
          cancelled (excluded)
        </h2>
        <div className="border-subtle bg-surface rounded-xl border p-4">
          <GoalTimeline
            startDate="2026-01-01"
            targetDate="2026-12-31"
            today={TODAY}
            tasks={tasks}
            milestones={milestones}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">No dates set</h2>
        <div className="border-subtle bg-surface rounded-xl border p-4">
          <GoalTimeline
            startDate={null}
            targetDate="2026-12-31"
            today={TODAY}
            tasks={[]}
            milestones={[]}
          />
        </div>
      </section>
    </main>
  );
}
