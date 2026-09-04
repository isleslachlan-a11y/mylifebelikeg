import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry-scrub";

/**
 * P9.2. Next.js's client-side instrumentation convention (stable since
 * v15.3, per this app's own docs snapshot at
 * `node_modules/next/dist/docs/.../file-conventions/instrumentation-client.md`)
 * — replaces the older `sentry.client.config.ts`-imported-from-`_app`
 * pattern earlier Sentry/Next.js integrations used. Runs after the HTML
 * loads, before hydration — exactly where error tracking needs to be
 * live before a user can interact with anything.
 *
 * Same DSN-optional, no-tracing, scrubbed posture as the server/edge
 * configs (`sentry.server.config.ts`'s own comments explain both).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // NODE_ENV, not VERCEL_ENV -- Vercel doesn't expose the latter under
  // a NEXT_PUBLIC_ name automatically, and NODE_ENV is always
  // statically inlined into the client bundle by Next.js itself,
  // production/development, without any extra config.
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});

/** Sentry's own hook for Next.js's router-transition-start event — breadcrumbs for "what page was the user on" without any extra wiring. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
