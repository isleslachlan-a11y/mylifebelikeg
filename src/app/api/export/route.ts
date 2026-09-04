import { Readable } from "node:stream";

// archiver 8.0.0 is a pure-ESM package with no default-export factory
// function — the classic `archiver(format, options)` shape from earlier
// majors is gone; `ZipArchive` (extends the shared `Archiver` class) is
// instantiated directly instead. Confirmed against the installed
// version's real .d.ts, not assumed from training-data memory of older
// archiver releases — same "verify the installed version's actual API"
// discipline P7.0's Avataaars integration already established for
// exactly this kind of cross-major surprise.
import { ZipArchive, type ArchiverError } from "archiver";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { DREAM_PHOTOS_BUCKET } from "@/lib/storage/dream-photos";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Never statically optimized/cached — every hit must read this user's
// live data, not a cached response from whenever the route was last
// warmed for someone else.
export const dynamic = "force-dynamic";

/**
 * P9.1: "a single authenticated action produces a zip" (brief, verbatim),
 * superseding P5.5's plain-JSON version below (kept in spirit: every
 * scoping decision and its reasoning from that pass is unchanged, only
 * the response shape and the two new pieces — CSVs, photos — are new).
 *
 * Uses the ordinary request-scoped server client (`src/lib/supabase/server.ts`),
 * never the service-role one — every query below runs under this
 * caller's own RLS, so a bug in this file's own scoping can leak at
 * most what RLS already lets this user see, never another user's row
 * outright (CLAUDE.md rule 3: RLS is the actual security boundary, this
 * route is not).
 *
 * RLS alone is broader than "owns," though — a collaborator can *see* a
 * shared goal's tasks/milestones through RLS without owning any of it.
 * The acceptance bar here ("nothing of Sophia's") is about ownership,
 * not visibility, so every query below adds its own explicit
 * `owner_id`/`user_id` filter on top of RLS — CLAUDE.md's "add a filter
 * where RLS alone is broader than what the UI should allow," applied to
 * an entire export rather than one query. Concretely: goals (and
 * everything hanging off them — milestones, tasks, dependencies,
 * RAG history, trips) are scoped to goals this user *owns*, not goals
 * they merely collaborate on — a shared goal's own existence, and this
 * user's own participation row on it, still appear (via `goals`/
 * `goal_participants` below), but another participant's pledge details
 * don't, and a goal this user only collaborates on (doesn't own) isn't
 * exported at all. `achievements`/`avatar_presets` are excluded
 * entirely — shared catalog data with no `user_id` column, not personal
 * data to begin with.
 *
 * Two sequential fetch phases, not one big `Promise.all`: `task_dependencies`/
 * `trip_stops`/`trip_legs` don't carry `goal_id` directly (only their
 * parent task/trip does), so their own goal-owned scoping needs this
 * user's task/trip ids first — the same `.in("fk_column", ids)` shape
 * `goals/[id]/page.tsx`'s own dependency fetch already uses, rather than
 * PostgREST embedded-resource filtering (`.in("joined.col", ids)`),
 * which isn't a pattern used (or verified to work) anywhere else in
 * this codebase.
 *
 * Streamed, not buffered — "generate server-side, stream rather than
 * buffer" (brief). `archiver` emits zip bytes as each entry is appended,
 * not after the whole archive is assembled, so `Readable.toWeb(archive)`
 * becomes the response body directly and the client starts receiving
 * bytes as soon as the first entry (the JSON file, appended first) is
 * ready — the server is never holding a complete zip in memory or on
 * disk waiting to send it. The one place this isn't fully streaming
 * end-to-end: each uploaded photo is fetched from Storage as a whole
 * Blob (`supabase.storage...download()` has no streaming API in
 * supabase-js) before being appended — individually small (the 5MB
 * bucket cap from 0032, typically well under 400KB per the P8.1 brief),
 * so buffering one photo at a time is a fixed, bounded cost, not the
 * unbounded "whole export in memory" problem streaming is meant to avoid.
 *
 * Rate-limited two ways (P9.2 added the second): per-account via
 * `profiles.last_export_at` (0041) — the same one-timestamp-on-profiles
 * debounce shape `llama_evaluated_at` (0020) and
 * `achievements_evaluated_at` (0028) already use, chosen for the same
 * reason: one row per user, no new table — and per-IP via
 * `src/lib/rate-limit.ts`'s Postgres-backed `check_rate_limit` (0042),
 * catching one source hammering the endpoint across several accounts,
 * which the account-scoped cooldown alone can't see. A zip with photos
 * is genuinely expensive (Storage bandwidth, CPU to compress), unlike
 * the two silent background sweeps above, so both rejections return 429
 * rather than silently no-op'ing — the user is actively waiting on
 * this one.
 */
const EXPORT_COOLDOWN_MS = 15 * 60 * 1000;
const EXPORT_IP_LIMIT = 20;
const EXPORT_IP_WINDOW_SECONDS = 60 * 60;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Column set is the union of keys across every row, not just row[0]'s
 * keys — PostgREST can return rows with differing null-vs-absent shapes
 * across a `select("*")` in edge cases (e.g. a column added mid-export
 * window), and a fixed header row from only the first row would silently
 * drop a column present on a later one.
 */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return "No rows in this table at export time.\n";
  }
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const header = columns.map(csvEscape).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => csvEscape(row[col])).join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const userId = auth.claims.sub;

  const ip = getClientIp(request.headers);
  const { allowed: ipAllowed } = await checkRateLimit(
    `export:ip:${ip}`,
    EXPORT_IP_LIMIT,
    EXPORT_IP_WINDOW_SECONDS,
  );
  if (!ipAllowed) {
    return NextResponse.json(
      { error: "Too many exports from this network. Try again later." },
      { status: 429 },
    );
  }

  const { data: rateLimitRow, error: rateLimitError } = await supabase
    .from("profiles")
    .select("last_export_at")
    .eq("id", userId)
    .single();
  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.message },
      { status: 500 },
    );
  }
  if (rateLimitRow.last_export_at) {
    const elapsed = Date.now() - new Date(rateLimitRow.last_export_at).getTime();
    if (elapsed < EXPORT_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((EXPORT_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: "You've exported recently — try again in a few minutes.",
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
  }

  const { data: ownedGoals, error: ownedGoalsError } = await supabase
    .from("goals")
    .select("id")
    .eq("owner_id", userId);
  if (ownedGoalsError) {
    return NextResponse.json(
      { error: ownedGoalsError.message },
      { status: 500 },
    );
  }
  const goalIds = (ownedGoals ?? []).map((g) => g.id);
  // .in("goal_id", []) / .in("goal_id", []) are valid, always-empty
  // queries — no special-casing needed for a brand-new account with
  // zero goals yet.

  const { data: ownedTasks, error: ownedTasksError } = await supabase
    .from("tasks")
    .select("id")
    .in("goal_id", goalIds);
  if (ownedTasksError) {
    return NextResponse.json(
      { error: ownedTasksError.message },
      { status: 500 },
    );
  }
  const taskIds = (ownedTasks ?? []).map((t) => t.id);

  const { data: ownedTrips, error: ownedTripsError } = await supabase
    .from("trips")
    .select("id")
    .in("goal_id", goalIds);
  if (ownedTripsError) {
    return NextResponse.json(
      { error: ownedTripsError.message },
      { status: 500 },
    );
  }
  const tripIds = (ownedTrips ?? []).map((t) => t.id);

  const queries = {
    profile: supabase.from("profiles").select("*").eq("id", userId).single(),
    life_areas: supabase.from("life_areas").select("*").eq("user_id", userId),
    pots: supabase.from("pots").select("*").eq("user_id", userId),
    cashflow_items: supabase
      .from("cashflow_items")
      .select("*")
      .eq("user_id", userId),
    goals: supabase.from("goals").select("*").eq("owner_id", userId),
    goal_participants: supabase
      .from("goal_participants")
      .select("*")
      .eq("user_id", userId),
    milestones: supabase.from("milestones").select("*").in("goal_id", goalIds),
    tasks: supabase.from("tasks").select("*").in("goal_id", goalIds),
    // Dependencies never cross goals (P5.0 brief), so scoping by *either*
    // side against this user's own task ids is equivalent — successor is
    // used here, matching goals/[id]/page.tsx's own fetch.
    task_dependencies: supabase
      .from("task_dependencies")
      .select("*")
      .in("successor_task_id", taskIds),
    ledger_entries: supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", userId),
    goal_ratings: supabase
      .from("goal_ratings")
      .select("*")
      .eq("user_id", userId),
    check_ins: supabase.from("check_ins").select("*").eq("user_id", userId),
    rag_snapshots: supabase
      .from("rag_snapshots")
      .select("*")
      .in("goal_id", goalIds),
    rag_override_history: supabase
      .from("rag_override_history")
      .select("*")
      .in("goal_id", goalIds),
    trips: supabase.from("trips").select("*").in("goal_id", goalIds),
    trip_stops: supabase.from("trip_stops").select("*").in("trip_id", tripIds),
    trip_legs: supabase.from("trip_legs").select("*").in("trip_id", tripIds),
    // "dreams" (P8.0's rename of the /someday list) — table itself is
    // still someday_items, only the route/UI moved.
    someday_items: supabase
      .from("someday_items")
      .select("*")
      .eq("user_id", userId),
    llama_messages: supabase
      .from("llama_messages")
      .select("*")
      .eq("user_id", userId),
    user_achievements: supabase
      .from("user_achievements")
      .select("*")
      .eq("user_id", userId),
    capacity_suggestion_dismissals: supabase
      .from("capacity_suggestion_dismissals")
      .select("*")
      .eq("user_id", userId),
    // Grants/invitations this user made on their own resources — not
    // ones made *to* them by someone else about someone else's
    // resource, which would be exporting a fact about that other
    // resource, not this user's own data.
    share_grants: supabase
      .from("share_grants")
      .select("*")
      .eq("grantor_id", userId),
    invitations: supabase
      .from("invitations")
      .select("*")
      .eq("inviter_id", userId),
  } as const;

  const entries = Object.entries(queries);
  const results = await Promise.all(entries.map(([, query]) => query));

  const failed = results
    .map((r, i) => ({ table: entries[i]![0], error: r.error }))
    .filter((r) => r.error != null);
  if (failed.length > 0) {
    console.error("GET /api/export: query failure", failed);
    return NextResponse.json(
      {
        error: `Export failed while reading: ${failed.map((f) => f.table).join(", ")}.`,
      },
      { status: 500 },
    );
  }

  const data: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: userId,
  };
  const tables: Record<string, unknown> = {};
  entries.forEach(([table], i) => {
    const value = results[i]!.data;
    data[table] = value;
    tables[table] = value;
  });

  // Best-effort — a failed timestamp write shouldn't block an export
  // that has already succeeded. Next attempt inside the cooldown just
  // sees a stale `last_export_at` and is refused a little more
  // generously than intended, which is the safe direction to fail in.
  const { error: stampError } = await supabase
    .from("profiles")
    .update({ last_export_at: new Date().toISOString() })
    .eq("id", userId);
  if (stampError) {
    console.error("Failed to stamp last_export_at", stampError);
  }

  // Upload-sourced dream photos only — Unsplash-sourced photos are
  // hotlinked (P6.0's own "never downloaded to our own storage" rule)
  // and have no object in this app's Storage to export in the first
  // place; their URL is already present in the JSON/CSV `someday_items`
  // row (`unsplash_full_url`) for anyone who wants the image itself.
  const dreamItems = (tables.someday_items ?? []) as Array<
    Record<string, unknown>
  >;
  const photoPaths = new Set<string>();
  for (const item of dreamItems) {
    if (
      item.image_source === "upload" &&
      typeof item.storage_path === "string" &&
      item.storage_path
    ) {
      photoPaths.add(item.storage_path);
    }
    if (
      typeof item.achieved_storage_path === "string" &&
      item.achieved_storage_path
    ) {
      photoPaths.add(item.achieved_storage_path);
    }
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("warning", (err: ArchiverError) =>
    console.error("export archive warning", err),
  );
  archive.on("error", (err: ArchiverError) =>
    console.error("export archive error", err),
  );

  archive.append(JSON.stringify(data, null, 2), {
    name: "starmap-export.json",
  });
  for (const [table, rows] of Object.entries(tables)) {
    const asRows = Array.isArray(rows) ? rows : rows ? [rows] : [];
    archive.append(toCsv(asRows as Record<string, unknown>[]), {
      name: `csv/${table}.csv`,
    });
  }

  // Fetched and appended before finalize() so a download failure can
  // still be logged mid-stream without corrupting entries already
  // flushed — archiver supports appending after the response has begun
  // streaming, since the JSON/CSV entries above are queued (and likely
  // already sent) before any photo I/O starts.
  for (const path of photoPaths) {
    const { data: blob, error } = await supabase.storage
      .from(DREAM_PHOTOS_BUCKET)
      .download(path);
    if (error || !blob) {
      console.error("Failed to download dream photo for export", path, error);
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    archive.append(buffer, { name: `photos/${path}` });
  }

  void archive.finalize();

  const filename = `starmap-export-${new Date().toISOString().slice(0, 10)}.zip`;
  const body = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
