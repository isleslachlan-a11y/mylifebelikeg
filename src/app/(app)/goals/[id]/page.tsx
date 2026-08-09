import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateRange, relativeDays } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { goalStateLabel } from "../goal-state-label";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase
      .from("goals")
      .select("*, life_area:life_areas(id, name, colour)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
  ]);

  if (!goal) {
    notFound();
  }
  const timezone = profile?.timezone ?? "UTC";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl">{goal.title}</h1>
          {goal.owner_id === userId && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/goals/${goal.id}/edit`}>Edit</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{goalStateLabel(goal.state)}</Badge>
          {goal.life_area && (
            <Badge variant="outline" className="gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: goal.life_area.colour }}
                aria-hidden
              />
              {goal.life_area.name}
            </Badge>
          )}
          {goal.kind === "trip" && <Badge variant="outline">Trip</Badge>}
        </div>

        {goal.description && (
          <p className="text-muted-foreground text-sm">{goal.description}</p>
        )}

        {goal.start_date ||
        goal.target_date ||
        goal.target_amount_minor != null ? (
          <dl className="flex flex-col gap-1 text-sm">
            {(goal.start_date || goal.target_date) && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Dates</dt>
                <dd>
                  {goal.start_date && goal.target_date
                    ? formatDateRange(
                        goal.start_date,
                        goal.target_date,
                        timezone,
                      )
                    : formatDate(
                        (goal.start_date ?? goal.target_date)!,
                        timezone,
                      )}
                  {goal.target_date && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({relativeDays(goal.target_date, timezone)})
                    </span>
                  )}
                </dd>
              </div>
            )}
            {goal.funding !== "none" && goal.target_amount_minor != null && (
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-muted-foreground">Target</dt>
                <dd>{formatMoney(goal.target_amount_minor, goal.currency)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">No dates set.</p>
        )}
      </div>

      {/* Placeholders — milestones, tasks, and participants are later packages. */}
      <PlaceholderSection title="Milestones" />
      <PlaceholderSection title="Tasks" />
      <PlaceholderSection title="Participants" />
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg">{title}</h2>
      <div className="border-subtle bg-surface text-muted-foreground rounded-xl border px-4 py-8 text-center text-sm">
        {title} aren&rsquo;t built yet.
      </div>
    </section>
  );
}
