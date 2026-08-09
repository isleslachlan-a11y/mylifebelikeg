import { defineConfig } from "vitest/config";

// Pure-logic unit tests only for now (no React component tests yet), so
// `environment: "node"` — add `jsdom` + `@testing-library/react` per the
// Next.js Vitest guide (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md)
// if/when component tests show up.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
  },
});
