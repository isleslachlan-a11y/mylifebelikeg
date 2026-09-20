import { describe, expect, it } from "vitest";

import { parseSocialLink, type ParsedSocialLink } from "./parse";

type Case = {
  name: string;
  input: string;
  expected: ParsedSocialLink | null;
};

const ACCEPT_CASES: Case[] = [
  // ---- Instagram --------------------------------------------------
  {
    name: "instagram /p/ with www and trailing slash",
    input: "https://www.instagram.com/p/ABC123/",
    expected: {
      provider: "instagram",
      providerPostId: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
    },
  },
  {
    name: "instagram /p/ without www, no trailing slash",
    input: "https://instagram.com/p/ABC123",
    expected: {
      provider: "instagram",
      providerPostId: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
    },
  },
  {
    name: "instagram /reel/",
    input: "https://www.instagram.com/reel/XYZ789/",
    expected: {
      provider: "instagram",
      providerPostId: "XYZ789",
      canonicalUrl: "https://www.instagram.com/reel/XYZ789/",
    },
  },
  {
    name: "instagram /reels/",
    input: "https://www.instagram.com/reels/XYZ789/",
    expected: {
      provider: "instagram",
      providerPostId: "XYZ789",
      canonicalUrl: "https://www.instagram.com/reels/XYZ789/",
    },
  },
  {
    name: "instagram /tv/",
    input: "https://www.instagram.com/tv/QRS456",
    expected: {
      provider: "instagram",
      providerPostId: "QRS456",
      canonicalUrl: "https://www.instagram.com/tv/QRS456/",
    },
  },
  {
    name: "instagram strips igsh tracking param",
    input: "https://www.instagram.com/p/ABC123/?igsh=xyz123",
    expected: {
      provider: "instagram",
      providerPostId: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
    },
  },

  // ---- TikTok -------------------------------------------------------
  {
    name: "tiktok /@user/video/id with www",
    input: "https://www.tiktok.com/@someuser/video/7123456789012345678",
    expected: {
      provider: "tiktok",
      providerPostId: "7123456789012345678",
      canonicalUrl: "https://www.tiktok.com/@someuser/video/7123456789012345678",
    },
  },
  {
    name: "tiktok /@user/video/id without www, trailing slash",
    input: "https://tiktok.com/@someuser/video/7123456789012345678/",
    expected: {
      provider: "tiktok",
      providerPostId: "7123456789012345678",
      canonicalUrl: "https://www.tiktok.com/@someuser/video/7123456789012345678",
    },
  },
  {
    name: "tiktok /@user/photo/id",
    input: "https://www.tiktok.com/@someuser/photo/7123456789012345678",
    expected: {
      provider: "tiktok",
      providerPostId: "7123456789012345678",
      canonicalUrl: "https://www.tiktok.com/@someuser/photo/7123456789012345678",
    },
  },
  {
    name: "tiktok short link vm.tiktok.com -- null post id, short url as canonical",
    input: "https://vm.tiktok.com/ZMabc123/",
    expected: {
      provider: "tiktok",
      providerPostId: null,
      canonicalUrl: "https://vm.tiktok.com/ZMabc123",
    },
  },
  {
    name: "tiktok short link vt.tiktok.com -- null post id",
    input: "https://vt.tiktok.com/ZMdef456",
    expected: {
      provider: "tiktok",
      providerPostId: null,
      canonicalUrl: "https://vt.tiktok.com/ZMdef456",
    },
  },
  {
    name: "tiktok short link strips tracking params",
    input: "https://vm.tiktok.com/ZMabc123/?_t=xyz&_r=1",
    expected: {
      provider: "tiktok",
      providerPostId: null,
      canonicalUrl: "https://vm.tiktok.com/ZMabc123",
    },
  },

  // ---- Pinterest ------------------------------------------------------
  {
    name: "pinterest /pin/id on pinterest.com",
    input: "https://www.pinterest.com/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest /pin/id without www",
    input: "https://pinterest.com/pin/123456789012345678",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .com.au normalises to www.pinterest.com",
    input: "https://www.pinterest.com.au/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .co.uk normalises",
    input: "https://pinterest.co.uk/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .ca normalises",
    input: "https://pinterest.ca/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .de normalises",
    input: "https://pinterest.de/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .fr normalises",
    input: "https://pinterest.fr/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest regional domain .nz normalises",
    input: "https://pinterest.nz/pin/123456789012345678/",
    expected: {
      provider: "pinterest",
      providerPostId: "123456789012345678",
      canonicalUrl: "https://www.pinterest.com/pin/123456789012345678/",
    },
  },
  {
    name: "pinterest short link pin.it -- null post id",
    input: "https://pin.it/abc123",
    expected: {
      provider: "pinterest",
      providerPostId: null,
      canonicalUrl: "https://pin.it/abc123",
    },
  },

  // ---- other ----------------------------------------------------------
  {
    name: "any other valid https URL returns provider other",
    input: "https://example.com/some/article?utm_source=newsletter",
    expected: {
      provider: "other",
      providerPostId: null,
      canonicalUrl: "https://example.com/some/article",
    },
  },
  {
    name: "an instagram.com URL that isn't a recognisable post shape falls back to other",
    input: "https://www.instagram.com/someaccount/",
    expected: {
      provider: "other",
      providerPostId: null,
      canonicalUrl: "https://www.instagram.com/someaccount",
    },
  },
];

const REJECT_CASES: { name: string; input: string }[] = [
  { name: "http (not https)", input: "http://www.instagram.com/p/ABC123/" },
  { name: "javascript: scheme", input: "javascript:alert(1)" },
  { name: "data: scheme", input: "data:text/html,<script>alert(1)</script>" },
  { name: "userinfo in the URL", input: "https://user:pass@instagram.com/p/ABC123/" },
  { name: "non-standard port", input: "https://instagram.com:8443/p/ABC123/" },
  {
    name: "lookalike host: instagram.com.evil.test",
    input: "https://instagram.com.evil.test/p/ABC123/",
  },
  { name: "lookalike host: notpinterest.com", input: "https://notpinterest.com/pin/123/" },
  { name: "lookalike host: tiktok.com.co", input: "https://tiktok.com.co/@user/video/123/" },
  { name: "empty string", input: "" },
  { name: "whitespace only", input: "   " },
  { name: "non-URL text", input: "not a url at all" },
];

describe("parseSocialLink", () => {
  it.each(ACCEPT_CASES)("$name", ({ input, expected }) => {
    expect(parseSocialLink(input)).toEqual(expected);
  });

  it.each(REJECT_CASES)("rejects: $name", ({ input }) => {
    expect(parseSocialLink(input)).toBeNull();
  });

  it("default https port (443) is accepted, not treated as non-standard", () => {
    expect(parseSocialLink("https://www.instagram.com:443/p/ABC123/")).toEqual({
      provider: "instagram",
      providerPostId: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
    });
  });

  it("strips utm_* params regardless of the specific suffix", () => {
    expect(
      parseSocialLink("https://example.com/x?utm_source=ig&utm_medium=social&keep=1"),
    ).toEqual({
      provider: "other",
      providerPostId: null,
      canonicalUrl: "https://example.com/x?keep=1",
    });
  });

  it("strips fbclid", () => {
    expect(parseSocialLink("https://example.com/x?fbclid=abc123")).toEqual({
      provider: "other",
      providerPostId: null,
      canonicalUrl: "https://example.com/x",
    });
  });
});
