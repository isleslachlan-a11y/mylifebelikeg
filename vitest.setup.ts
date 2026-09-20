// Registered globally via vitest.config.mts's setupFiles -- harmless for
// the existing node-environment pure-logic tests (it only extends
// `expect` with DOM matchers nothing but the new jsdom component tests
// ever calls), so there's no reason to scope this to component tests
// specifically.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explicit rather than relying on @testing-library/react's own
// auto-cleanup side effect -- unmounts every rendered component (and
// its DOM) after each test, so one component test's script tags/DOM
// nodes never leak into the next one. A no-op for the node-environment
// pure-logic tests, since nothing ever rendered there to clean up.
afterEach(() => {
  cleanup();
});
