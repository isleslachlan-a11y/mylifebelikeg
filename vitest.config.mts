import { defineConfig } from "vitest/config";

// P10.3 (social link capture) is the first package with real component
// tests -- jsdom + @testing-library/react added per the Next.js Vitest
// guide (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md),
// exactly as this file's own comment said to when the day came. No
// `@vitejs/plugin-react` -- tsconfig's `"jsx": "react-jsx"` is already
// enough for Vite's default esbuild transform to handle JSX/TSX without
// it, and adding it hit a real peer-dependency conflict in this
// project's current dependency tree (a stray Babel 8 resolution) that
// wasn't worth pulling in a whole plugin to route around.
//
// `environment: "node"` stays the *default* -- every existing pure-logic
// test still runs there, untouched. Component test files opt into jsdom
// individually via a `// @vitest-environment jsdom` docblock at the top
// of the file (Vitest's own per-file override), rather than flipping the
// global default and risking a behavior change for tests that were never
// written with a DOM in mind.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
