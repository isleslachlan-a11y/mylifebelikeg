import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import { DREAM_PHOTOS_BUCKET } from "@/lib/storage/dream-photos";
import { GRACE_PERIOD_DAYS } from "@/app/(app)/settings/account/deletion";

// Never statically optimized/cached — every hit must run the real,
// current-time query for who's due, not a cached response.
export const dynamic = "force-dynamic";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * P9.1: the scheduled half of account deletion — everything up to this
 * point (request, confirm-by-email, sign-out) happens in
 * src/app/(app)/settings/account/actions.ts and only ever sets
 * `profiles.deletion_requested_at`. Nothing is actually destroyed until
 * this route runs, past the grace window, driven by vercel.json's daily
 * cron (see DEPLOYMENT.md).
 *
 * Secret-only, unlike /api/fx/refresh's secret-or-any-signed-in-session
 * split — fx refresh writes shared, non-sensitive reference data;
 * this deletes accounts. There is no "any authenticated user" bar that
 * makes sense here at all.
 *
 * `CRON_SECRET`, not a custom-named env var like fx/refresh's own
 * `FX_REFRESH_CRON_SECRET` — this is Vercel's own reserved name for
 * exactly this purpose: when a `CRON_SECRET` env var is set, Vercel
 * automatically attaches `Authorization: Bearer $CRON_SECRET` to every
 * request it sends to a `vercel.json`-declared cron endpoint, with no
 * way to configure a different header from vercel.json itself. fx/refresh
 * predates any Vercel Cron entry in this repo (DEPLOYMENT.md: "no
 * vercel.json... add one only when a real requirement shows up") and was
 * always meant for a generic external scheduler that can set its own
 * headers; this route is the first genuine Vercel Cron consumer, so it
 * uses Vercel's own convention rather than inventing another one.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * "Every storage object under their prefix, verified by listing the
 * prefix afterwards rather than trusting the delete call" (brief,
 * verbatim). Two-level list, matching dream-photos' own
 * `{user_id}/{dream_id}/{uuid}.webp` convention (0032) — Storage has no
 * real recursive listing, only one directory level per call, so a
 * top-level `list(userId)` returns each `dream_id` as a pseudo-folder
 * entry (no `id`, since folders aren't real objects — only inferred
 * from a shared prefix), and each of those needs its own `list()` to
 * reach the actual files. A relist of the top level afterward is a
 * sufficient recursive check on its own: Storage folders are purely
 * inferred from prefixes, so a `dream_id` folder can only still appear
 * in that relist if an object somewhere under it survived.
 */
async function wipeUserStorage(
  service: ServiceClient,
  userId: string,
): Promise<{ removedCount: number; remaining: string[] }> {
  const bucket = service.storage.from(DREAM_PHOTOS_BUCKET);

  const { data: topLevel, error: listError } = await bucket.list(userId, {
    limit: 1000,
  });
  if (listError) {
    throw new Error(`Failed to list storage for ${userId}: ${listError.message}`);
  }

  const allPaths: string[] = [];
  for (const entry of topLevel ?? []) {
    if (entry.id === null) {
      // A pseudo-folder (dream_id) — descend one level for the real files.
      const subPath = `${userId}/${entry.name}`;
      const { data: files, error: subError } = await bucket.list(subPath, {
        limit: 1000,
      });
      if (subError) {
        throw new Error(
          `Failed to list storage for ${subPath}: ${subError.message}`,
        );
      }
      for (const file of files ?? []) {
        allPaths.push(`${subPath}/${file.name}`);
      }
    } else {
      // A real object directly under {userId}/ — not the documented
      // convention, but removed all the same if it somehow exists.
      allPaths.push(`${userId}/${entry.name}`);
    }
  }

  if (allPaths.length > 0) {
    const { error: removeError } = await bucket.remove(allPaths);
    if (removeError) {
      throw new Error(
        `Failed to remove storage objects for ${userId}: ${removeError.message}`,
      );
    }
  }

  // The verification the brief asks for, not a trust of the call above.
  const { data: recheck, error: recheckError } = await bucket.list(userId, {
    limit: 1000,
  });
  if (recheckError) {
    throw new Error(
      `Failed to verify storage removal for ${userId}: ${recheckError.message}`,
    );
  }
  const remaining = (recheck ?? []).map((entry) => `${userId}/${entry.name}`);

  return { removedCount: allPaths.length, remaining };
}

type ProcessResult =
  | { userId: string; ok: true }
  | { userId: string; ok: false; stage: string; error: string };

/**
 * Order matters, and is the one thing this function must never get
 * wrong (see migration 0041's own header for the full reasoning):
 * storage first, then the two FK reassignments
 * (`prepare_user_deletion`), then — last — `auth.admin.deleteUser()`,
 * whose cascade is what actually removes `profiles` and everything
 * hanging off it. If any step fails, later steps are skipped for that
 * user and `deletion_requested_at` is left untouched, so the next run
 * finds them "still due" and retries the whole thing — every step here
 * is safe to repeat.
 */
async function processOneUser(
  service: ServiceClient,
  userId: string,
): Promise<ProcessResult> {
  try {
    const { remaining } = await wipeUserStorage(service, userId);
    if (remaining.length > 0) {
      return {
        userId,
        ok: false,
        stage: "storage",
        error: `${remaining.length} object(s) survived removal: ${remaining.join(", ")}`,
      };
    }
  } catch (error) {
    return {
      userId,
      ok: false,
      stage: "storage",
      error: error instanceof Error ? error.message : "unknown error",
    };
  }

  const { error: prepareError } = await service.rpc("prepare_user_deletion", {
    p_user_id: userId,
  });
  if (prepareError) {
    return { userId, ok: false, stage: "prepare", error: prepareError.message };
  }

  const { error: authError } = await service.auth.admin.deleteUser(userId);
  if (authError) {
    return { userId, ok: false, stage: "auth", error: authError.message };
  }

  return { userId, ok: true };
}

async function handleProcessDeletions(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const service = createServiceClient();

  const cutoff = new Date(
    Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: dueProfiles, error: queryError } = await service
    .from("profiles")
    .select("id")
    .not("deletion_requested_at", "is", null)
    .lte("deletion_requested_at", cutoff);
  if (queryError) {
    console.error("process-deletions: failed to query due accounts", queryError);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const results: ProcessResult[] = [];
  // Sequential, not Promise.all — this is destructive, low-volume (a
  // handful of accounts a day at most for an app this size), and
  // sequential means one account's storage-listing failure can't
  // interleave with another's in a way that's harder to reason about
  // in the logs.
  for (const { id } of dueProfiles ?? []) {
    const result = await processOneUser(service, id);
    if (!result.ok) {
      console.error("process-deletions: failed", result);
    }
    results.push(result);
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: true,
    checked: dueProfiles?.length ?? 0,
    succeeded,
    failed,
  });
}

// Both methods run the same logic — POST for a scheduler that supports
// it, GET for one that only knows how to hit a URL on a timer, same
// dual-method shape /api/fx/refresh already uses for the same reason.
export async function POST(request: Request): Promise<NextResponse> {
  return handleProcessDeletions(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleProcessDeletions(request);
}
