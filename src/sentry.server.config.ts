import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * P9.2. Imported from `instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === "nodejs"` — Server Components, Server Actions, and
 * `/api/*` route handlers running on Node all go through this.
 *
 * DSN-optional by design (not every environment has one configured
 * yet): `Sentry.init()` with an empty `dsn` is itself inert — every
 * `captureException` call becomes a silent no-op — so there's no
 * `if (dsn)` branch needed here or at any call site; the SDK already
 * degrades gracefully on its own.
 *
 * `tracesSampleRate: 0` — this pass is error monitoring, not
 * performance tracing (brief: "Sentry or equivalent... server and
 * client"). Turning on tracing pulls in a second, paid-tier-hungry
 * feature nobody asked for; enable it deliberately later if it's ever
 * actually wanted, not as an accidental default here.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
