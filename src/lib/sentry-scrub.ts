import type { ErrorEvent } from "@sentry/nextjs";

/**
 * P9.2: "this app's errors carry salaries and account balances, and an
 * error tracker is a copy of your database you did not plan for"
 * (brief, verbatim). Shared across all three Sentry contexts
 * (`src/instrumentation.ts`'s server/edge init, `src/instrumentation-client.ts`'s
 * browser init) rather than duplicated per-runtime — one scrubbing rule
 * to keep correct, not three copies that could drift.
 *
 * Two different techniques for two different shapes of leak:
 *
 * 1. Request bodies (`event.request.data`) are dropped wholesale, not
 *    selectively redacted. A server action's FormData routinely
 *    carries a goal's target amount, a ledger entry's amount, a task's
 *    estimated cost — trying to allow-list "safe" fields and redact
 *    the rest would mean every new form field this app ever adds is
 *    leaked-by-default until someone remembers to update a filter
 *    here. Dropping the whole body is the only version of this that
 *    can't silently regress.
 * 2. Every other structured field Sentry might carry (`extra`,
 *    `contexts`, breadcrumb `data`) is walked recursively and redacted
 *    by *key name*, using a pattern derived from this codebase's own
 *    hard invariant rather than a hand-maintained list: CLAUDE.md rule
 *    1 requires every monetary value in this schema to be an integer
 *    ending in `_minor` (`amount_minor`, `target_amount_minor`,
 *    `opening_balance_minor`, `pledged_amount_minor`, ...) — so
 *    `/_minor$/i` structurally catches every money field that exists
 *    today *and* every one a future migration adds, with no list to
 *    keep in sync. `email`/`password`/`token`/`secret`/`authorization`/
 *    `cookie`/`currency` round out the pattern for the PII/credential
 *    shapes `_minor` doesn't cover — `currency` alone isn't a balance,
 *    but paired with a redacted amount it's still worth dropping rather
 *    than leaving a "AUD" next to a redacted number inviting a guess.
 */
const SENSITIVE_KEY_PATTERN =
  /_minor$|password|token|secret|authorization|cookie|currency|email|salary|balance/i;

function redactValue(): string {
  return "[Redacted]";
}

function scrubObject(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubObject(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? redactValue()
      : scrubObject(val, depth + 1);
  }
  return result;
}

// Only takes `event` -- `beforeSend`'s second parameter (`hint`, the
// original error/exception) is never needed here, and a function
// accepting fewer parameters than the callback type declares is a
// valid match in TypeScript, so there's no unused `hint` to lint
// against.
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  // Request bodies: dropped entirely, not scrubbed field-by-field (see
  // this file's own header for why). Headers/cookies: the ones that
  // matter are auth material, already covered by the key-name pattern
  // below, but request.cookies is its own top-level field Sentry
  // doesn't run through the same redaction, so it's cleared outright.
  if (event.request) {
    if (event.request.data !== undefined) {
      event.request.data = "[Redacted]";
    }
    if (event.request.cookies) {
      event.request.cookies = {};
    }
    if (event.request.headers) {
      event.request.headers = scrubObject(event.request.headers) as Record<
        string,
        string
      >;
    }
  }

  // A Sentry `user` context should only ever carry a bare id in this
  // app (see instrumentation.ts/instrumentation-client.ts — neither
  // ever calls setUser with an email) but this is defense in depth for
  // exactly the case CLAUDE.md's own "the mapping should exist even if
  // nothing should ever trigger it" reasoning already applies elsewhere
  // (P7.1's avatar editor, P7.3's error mapping): a future call site
  // that isn't as careful shouldn't leak past this layer either.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: crumb.data ? (scrubObject(crumb.data) as typeof crumb.data) : crumb.data,
    }));
  }

  return event;
}
