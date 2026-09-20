/**
 * P10.3 (briefed as "P9.11" -- see 0045's own migration header for why
 * this repo files it under P10.3 instead). Pure URL parsing and
 * canonicalisation for Instagram/TikTok/Pinterest links pasted into a
 * dream. Deliberately zero network calls -- "no oEmbed calls, no Meta
 * App Review, no scraping, no API keys, no outbound requests from our
 * servers at all" (brief, verbatim) -- everything here is derived from
 * the URL string alone, synchronously, so it's fully unit-testable
 * without a fetch mock anywhere in sight.
 *
 * Every host check goes through `hostMatches`/`isKnownPinterestHost`
 * below -- exact equality or a suffix match anchored on a literal
 * leading dot, never `String.prototype.includes` or a bare regex
 * against the raw URL string. `https://instagram.com.evil.test/p/abc`
 * must never parse as Instagram; the brief calls this out by name, and
 * it's exactly the class of bug a naive `url.includes("instagram.com")`
 * check would let through.
 */

export type SocialLinkProvider = "instagram" | "tiktok" | "pinterest" | "other";

export type ParsedSocialLink = {
  provider: SocialLinkProvider;
  providerPostId: string | null;
  canonicalUrl: string;
};

// "Strip tracking params on canonicalisation: igsh, igshid, utm_*, _t,
// _r, si, fbclid" (brief, verbatim) -- applied to every provider,
// including `other`, since a tracking param doesn't stop mattering
// just because the link isn't one of the three named platforms.
const TRACKING_PARAM_NAMES = new Set(["igsh", "igshid", "_t", "_r", "si", "fbclid"]);

function isTrackingParam(name: string): boolean {
  return TRACKING_PARAM_NAMES.has(name) || name.startsWith("utm_");
}

/**
 * Validates and parses `input` into a `URL`, enforcing every rejection
 * rule the brief lists up front, before any provider-specific logic
 * ever runs: https-only, no userinfo, no non-standard port. Returns
 * `null` for anything that fails any of these, or isn't a URL at all.
 */
function safeParseUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  // WHATWG URL normalises away the port when it matches the scheme's
  // own default (443 for https) -- `.port` is `""` in that case, so
  // this only ever rejects a genuinely non-standard port.
  if (url.port) return null;
  if (url.username || url.password) return null;

  return url;
}

/** Exact match or a suffix anchored on a literal leading dot -- never a bare `includes`. */
function hostMatches(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`);
}

const BRAND_NAMES = ["instagram", "tiktok", "pinterest"] as const;

/**
 * "Lookalike hosts... https://instagram.com.evil.test/p/abc must not
 * parse as Instagram" (brief, verbatim) -- the concrete example given
 * is a subdomain-chain trick (the real brand name sitting in a
 * subdomain position of an attacker-controlled registrable domain),
 * but the brief's own reject list also names two others that are a
 * different shape entirely: `notpinterest.com` and `tiktok.com.co` are
 * real, ordinary domains that merely share a substring with a brand
 * name, not subdomain tricks. `hostMatches`'s suffix check alone
 * already refuses to classify any of these three as the specific
 * platform they resemble (the whole point of anchoring on a leading
 * dot) -- what it doesn't do by itself is stop them from safely
 * falling through to `other`, which is otherwise completely correct
 * behaviour for a URL that just happens to mention a brand name.
 *
 * This check exists only to satisfy the brief's own explicit example
 * set, checked per already-*split* hostname label rather than the raw
 * URL string -- `label.includes(brand)` here is a fundamentally
 * different, safe operation from the `url.includes("instagram.com")`
 * antipattern the "never String.includes" instruction is actually
 * about: it can't be tricked by a path or query string, since it only
 * ever sees the parser-validated hostname's own dot-separated labels.
 * A domain that's genuinely unrelated (example.com) never mentions a
 * brand name in any label and is untouched by this.
 */
function isHostileLookalike(hostname: string): boolean {
  const labels = hostname.split(".");
  return BRAND_NAMES.some((brand) => {
    const mentionsBrand = labels.some((label) => label.includes(brand));
    if (!mentionsBrand) return false;
    const isRealHost =
      (brand === "instagram" && hostMatches(hostname, "instagram.com")) ||
      (brand === "tiktok" && hostMatches(hostname, "tiktok.com")) ||
      (brand === "pinterest" && isPinterestHost(hostname));
    return !isRealHost;
  });
}

/** Strips tracking params, drops any fragment, and re-serialises -- the general-purpose "clean" pass used for `other` and for the short-link cases that keep their own domain as canonical. */
function cleanedUrlString(url: URL): string {
  const cleaned = new URL(url.toString());
  const toDelete: string[] = [];
  cleaned.searchParams.forEach((_value, key) => {
    if (isTrackingParam(key)) toDelete.push(key);
  });
  for (const key of toDelete) cleaned.searchParams.delete(key);
  cleaned.hash = "";
  // A trailing slash on a bare path is cosmetic noise that would
  // otherwise let "the same" short link dedupe as two rows under the
  // (entry_id, canonical_url) unique index -- stripped consistently,
  // never added back (unlike the three named platforms' own
  // constructed-from-scratch canonical forms below, which each pick
  // their own convention deliberately).
  if (cleaned.pathname.length > 1 && cleaned.pathname.endsWith("/")) {
    cleaned.pathname = cleaned.pathname.slice(0, -1);
  }
  return cleaned.toString();
}

const INSTAGRAM_POST_RE = /^\/(p|reel|reels|tv)\/([^/]+)\/?$/;

function parseInstagram(url: URL): ParsedSocialLink | null {
  if (!hostMatches(url.hostname, "instagram.com")) return null;

  const match = INSTAGRAM_POST_RE.exec(url.pathname);
  if (!match) return null;
  const [, kind, code] = match;

  return {
    provider: "instagram",
    providerPostId: code!,
    // Constructed fresh, not derived from the input URL's own
    // scheme/subdomain -- collapses the "with or without www." input
    // variation the brief names into one canonical form, which is
    // what actually makes the (entry_id, canonical_url) uniqueness
    // constraint do its job.
    canonicalUrl: `https://www.instagram.com/${kind}/${code}/`,
  };
}

const TIKTOK_LONG_RE = /^\/(@[^/]+)\/(video|photo)\/(\d+)\/?$/;

function parseTiktok(url: URL): ParsedSocialLink | null {
  // Short forms first, checked by exact hostname -- these are also
  // `*.tiktok.com` suffix matches, but need different treatment (no
  // resolvable post id without the network hop this package
  // deliberately doesn't make) than the long form below.
  if (url.hostname === "vm.tiktok.com" || url.hostname === "vt.tiktok.com") {
    const code = url.pathname.replace(/^\/|\/$/g, "");
    if (!code) return null;
    return {
      provider: "tiktok",
      providerPostId: null,
      canonicalUrl: cleanedUrlString(url),
    };
  }

  if (!hostMatches(url.hostname, "tiktok.com")) return null;

  const match = TIKTOK_LONG_RE.exec(url.pathname);
  if (!match) return null;
  const [, handle, kind, id] = match;

  return {
    provider: "tiktok",
    providerPostId: id!,
    canonicalUrl: `https://www.tiktok.com/${handle}/${kind}/${id}`,
  };
}

// "Regional domains — pinterest.com.au, pinterest.co.uk, pinterest.ca,
// pinterest.de, pinterest.fr, pinterest.nz" (brief, verbatim) -- an
// explicit list, not a generalised pattern, since these are genuinely
// separate registrable domains (multi-label TLDs in most cases), not
// subdomains of pinterest.com the way vm./vt. are subdomains of
// tiktok.com.
const PINTEREST_ROOTS = [
  "pinterest.com",
  "pinterest.com.au",
  "pinterest.co.uk",
  "pinterest.ca",
  "pinterest.de",
  "pinterest.fr",
  "pinterest.nz",
];

function isPinterestHost(hostname: string): boolean {
  return PINTEREST_ROOTS.some((root) => hostMatches(hostname, root));
}

const PINTEREST_PIN_RE = /^\/pin\/(\d+)\/?$/;

function parsePinterest(url: URL): ParsedSocialLink | null {
  if (url.hostname === "pin.it") {
    const code = url.pathname.replace(/^\/|\/$/g, "");
    if (!code) return null;
    return {
      provider: "pinterest",
      providerPostId: null,
      canonicalUrl: cleanedUrlString(url),
    };
  }

  if (!isPinterestHost(url.hostname)) return null;

  const match = PINTEREST_PIN_RE.exec(url.pathname);
  if (!match) return null;
  const id = match[1]!;

  return {
    provider: "pinterest",
    // "Normalise regional pin URLs to www.pinterest.com/pin/{id}/"
    // (brief, verbatim) -- every regional host collapses to this one
    // canonical form, same reactivate-not-duplicate reasoning as
    // Instagram's www-collapsing above.
    providerPostId: id,
    canonicalUrl: `https://www.pinterest.com/pin/${id}/`,
  };
}

function parseOther(url: URL): ParsedSocialLink {
  return {
    provider: "other",
    providerPostId: null,
    canonicalUrl: cleanedUrlString(url),
  };
}

/**
 * The one exported entry point. Returns `null` for anything that
 * isn't a valid, safe https URL; otherwise always succeeds with a
 * real `ParsedSocialLink` -- `other` is the guaranteed fallback for
 * any host/path shape the three named platforms don't specifically
 * recognise (including, e.g., an instagram.com URL that isn't a
 * recognisable post -- a profile page, say), not a second failure mode
 * alongside `null`.
 */
export function parseSocialLink(input: string): ParsedSocialLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const url = safeParseUrl(trimmed);
  if (!url) return null;
  if (isHostileLookalike(url.hostname)) return null;

  return (
    parseInstagram(url) ?? parseTiktok(url) ?? parsePinterest(url) ?? parseOther(url)
  );
}
