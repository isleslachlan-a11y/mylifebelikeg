import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type ShareResourceType = "goal" | "someday_item" | "trip" | "profile";
type ShareScope = Database["public"]["Enums"]["share_scope"];

type SharedRow = {
  grant_id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  scope: ShareScope;
  shared_at: string;
  title: string;
  owner_id: string;
  owner_name: string;
  owner_handle: string;
  owner_avatar: Json;
};

const TYPE_LABEL: Record<ShareResourceType, string> = {
  goal: "Goal",
  someday_item: "Dream",
  trip: "Trip",
  profile: "Profile",
};

const TYPE_ORDER: ShareResourceType[] = [
  "goal",
  "trip",
  "someday_item",
  "profile",
];

/**
 * F3: "Build /shared from v_shared_with_me_all, which returns every
 * type in one query with a resolved title and owner. Group by resource
 * type" (brief, verbatim). Tapping a goal/trip/profile row opens the
 * real page for it -- RLS (via has_grant, 0037/0044) already lets a
 * view-grant holder read it, and the goal detail page already disables
 * every write path for a non-editor (canEditGoal). Dreams don't yet
 * have a standalone per-item view for someone else's dream (the
 * existing /dreams page only ever lists the signed-in user's own
 * someday_items, and dream-form-dialog.tsx only opens from that list)
 * -- rather than build a whole new page for this one package, a shared
 * dream's own row here shows enough on its own (title, cost) instead
 * of linking out to a page that doesn't exist yet.
 */
export default async function SharedPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }
  const userId = auth.claims.sub;

  const [
    { data: profile, error: profileError },
    { data: rows, error: rowsError },
  ] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", userId).single(),
    supabase
      .from("v_shared_with_me_all")
      .select(
        "grant_id, resource_type, resource_id, scope, shared_at, title, owner_id, owner_name, owner_handle, owner_avatar",
      )
      .order("shared_at", { ascending: false }),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (rowsError) {
    throw new Error(rowsError.message);
  }

  const timezone = profile?.timezone ?? "UTC";
  const shared = (rows ?? []).filter((r): r is SharedRow =>
    Boolean(
      r.grant_id &&
      r.resource_type &&
      r.resource_id &&
      r.scope &&
      r.shared_at &&
      r.title &&
      r.owner_id &&
      r.owner_name &&
      r.owner_handle,
    ),
  );

  const grouped = new Map<ShareResourceType, SharedRow[]>();
  for (const row of shared) {
    grouped.set(row.resource_type, [
      ...(grouped.get(row.resource_type) ?? []),
      row,
    ]);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl">Shared with you</h1>
        <p className="text-muted-foreground text-sm">
          Everything friends have shared with you, in one place — also marked
          wherever it shows up in its own home list.
        </p>
      </div>

      {shared.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing&rsquo;s been shared with you yet.
        </p>
      ) : (
        TYPE_ORDER.filter((type) => (grouped.get(type)?.length ?? 0) > 0).map(
          (type) => (
            <section key={type} className="flex flex-col gap-2">
              <h2 className="font-display text-lg">
                {TYPE_LABEL[type]}s
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {grouped.get(type)!.length}
                </span>
              </h2>
              <ul className="flex flex-col gap-2">
                {grouped.get(type)!.map((row) => (
                  <SharedRowItem
                    key={row.grant_id}
                    row={row}
                    timezone={timezone}
                  />
                ))}
              </ul>
            </section>
          ),
        )
      )}
    </div>
  );
}

function SharedRowItem({
  row,
  timezone,
}: {
  row: SharedRow;
  timezone: string;
}) {
  const content = (
    <>
      <Avatar
        avatar={row.owner_avatar}
        size={32}
        className="shrink-0 rounded-full"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{row.title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {row.owner_name} · shared {formatDate(row.shared_at, timezone)}
        </span>
      </div>
      <Badge variant="outline" className="shrink-0 capitalize">
        {row.scope}
      </Badge>
    </>
  );

  const href =
    row.resource_type === "goal"
      ? `/goals/${row.resource_id}`
      : row.resource_type === "trip"
        ? `/trips/${row.resource_id}`
        : row.resource_type === "profile"
          ? `/profile/${row.owner_handle}`
          : null;

  if (href) {
    return (
      <li>
        <Link
          href={href}
          className="border-subtle hover:bg-raised flex items-center gap-2 rounded-lg border p-3 transition-colors"
        >
          {content}
        </Link>
      </li>
    );
  }

  // someday_item: no standalone view to link to yet (see this page's
  // own header comment) -- the row itself is the whole presentation.
  return (
    <li className="border-subtle flex items-center gap-2 rounded-lg border p-3">
      {content}
    </li>
  );
}
