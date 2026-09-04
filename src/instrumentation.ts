import type { Instrumentation } from "next";

/**
 * P9.2. Next.js's own instrumentation hook (stable since v15, this
 * app's own docs snapshot at `node_modules/next/dist/docs/.../file-conventions/instrumentation.md`
 * confirms both `register` and `onRequestError` for this version) —
 * the one place that sees both runtimes uniformly, so it's what
 * decides which Sentry config to load rather than either config file
 * guessing its own context.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Server-side errors Next.js itself catches (a thrown error in a
 * Server Component, Route Handler, or Server Action that never reaches
 * a `try/catch` of its own) — `captureRequestError` is Sentry's own
 * wiring for exactly this hook, requiring no scrubbing of its own
 * since it ultimately funnels through the same `Sentry.init()`
 * (`beforeSend: scrubSentryEvent`) already configured per-runtime
 * above.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  const Sentry = await import("@sentry/nextjs");
  await Sentry.captureRequestError(...args);
};
