import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * P9.2. Imported from `instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === "edge"` — `proxy.ts` itself runs here, so this is
 * what catches an unhandled error inside the rate-limit/auth-refresh
 * logic that runs on every request, before anything else does. Same
 * DSN-optional, no-tracing posture as `sentry.server.config.ts`; see
 * that file's own comments.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
