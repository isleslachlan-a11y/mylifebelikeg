import { describe, expect, it } from "vitest";

import { UNSPLASH_HOME_URL, withUnsplashUtmParams } from "./types";

describe("withUnsplashUtmParams", () => {
  it("appends utm_source=starmap and utm_medium=referral", () => {
    const result = withUnsplashUtmParams("https://unsplash.com/@someone");
    const url = new URL(result);
    expect(url.searchParams.get("utm_source")).toBe("starmap");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
  });

  it("preserves the rest of the URL", () => {
    const result = withUnsplashUtmParams("https://unsplash.com/@someone");
    expect(result.startsWith("https://unsplash.com/@someone")).toBe(true);
  });

  it("overwrites rather than duplicates existing utm params", () => {
    const result = withUnsplashUtmParams(
      "https://unsplash.com/@someone?utm_source=old&utm_medium=old",
    );
    const url = new URL(result);
    expect(url.searchParams.getAll("utm_source")).toEqual(["starmap"]);
    expect(url.searchParams.getAll("utm_medium")).toEqual(["referral"]);
  });

  it("matches the fixture format already stored by supabase/local/001 smoke test", () => {
    // That fixture hand-writes
    // 'https://unsplash.com/@someone?utm_source=starmap&utm_medium=referral'
    // as a valid unsplash_author_url — this asserts our own generator
    // produces the same param values, not a byte-identical string (query
    // param order isn't guaranteed).
    const result = withUnsplashUtmParams("https://unsplash.com/@someone");
    const url = new URL(result);
    expect(url.origin + url.pathname).toBe("https://unsplash.com/@someone");
    expect(url.searchParams.get("utm_source")).toBe("starmap");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
  });
});

describe("UNSPLASH_HOME_URL", () => {
  it("points at unsplash.com with the required utm params", () => {
    const url = new URL(UNSPLASH_HOME_URL);
    expect(url.hostname).toBe("unsplash.com");
    expect(url.searchParams.get("utm_source")).toBe("starmap");
    expect(url.searchParams.get("utm_medium")).toBe("referral");
  });
});
