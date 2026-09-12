import path from "node:path";
import type { NextConfig } from "next";
// Not `@sentry/nextjs` -- that re-export path is deprecated as of this
// installed version (a real build-time warning caught it, not assumed)
// and stops working in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    // Unsplash package: "add images.unsplash.com to remotePatterns so
    // next/image will serve these. Use next/image for sizing and lazy
    // loading -- that is transformation of the delivered URL, which is
    // expected, not re-hosting" (brief, verbatim) -- a correction to
    // this app's earlier, overly-cautious "plain <img>, never
    // next/image, for any hotlinked source" stance (see
    // photo-picker.tsx's and dream-form-dialog.tsx's own updated
    // comments). `new URL(...)` is this Next version's own documented
    // shorthand for a single-host remotePattern (checked against
    // node_modules/next/dist/docs, not assumed).
    remotePatterns: [new URL("https://images.unsplash.com/**")],
  },
};

/**
 * P9.2: source maps + release tagging ("a stack trace maps to a
 * commit," brief verbatim). `org`/`project`/`authToken` are left unset
 * here deliberately -- they read from `SENTRY_ORG`/`SENTRY_PROJECT`/
 * `SENTRY_AUTH_TOKEN` env vars automatically (confirmed against this
 * installed version's own type definitions, not assumed), and when
 * `authToken` is absent the plugin skips the upload step with a
 * warning rather than failing the build -- exactly the DSN-optional
 * posture this whole pass uses everywhere else, so a deploy with no
 * Sentry env vars configured at all still builds and runs normally.
 *
 * No `sourcemaps`/`useRunAfterProductionCompileHook` override needed:
 * this app builds with Turbopack (`next build`'s own output says so),
 * and that option already defaults to `true` for Turbopack on Next 15+
 * (this app is on 16.3.0) -- source maps upload via the
 * `runAfterProductionCompile` hook automatically, no webpack-specific
 * config required.
 *
 * `release.name` also defaults to the git HEAD commit SHA
 * automatically when unset -- exactly "a stack trace maps to a
 * commit," for free.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
});
