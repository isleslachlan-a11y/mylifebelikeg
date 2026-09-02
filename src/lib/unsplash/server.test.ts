import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  searchUnsplashPhotos,
  triggerUnsplashDownload,
  UnsplashConfigError,
  UnsplashRateLimitError,
} from "./server";

function rawPhoto(id: string) {
  return {
    id,
    width: 4000,
    height: 3000,
    description: null,
    alt_description: `a photo of ${id}`,
    urls: {
      thumb: `https://images.unsplash.com/${id}?thumb`,
      small: `https://images.unsplash.com/${id}?small`,
      regular: `https://images.unsplash.com/${id}?regular`,
      full: `https://images.unsplash.com/${id}?full`,
    },
    links: {
      download_location: `https://api.unsplash.com/photos/${id}/download`,
    },
    user: {
      name: "Someone Photogenic",
      links: { html: "https://unsplash.com/@someone" },
    },
  };
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

beforeEach(() => {
  vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-access-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchUnsplashPhotos", () => {
  it("returns [] for a blank query without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchUnsplashPhotos("   ");
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a raw Unsplash search response to the trimmed shape, utm-tagging the author link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [rawPhoto("kyoto-1")] }));
    vi.stubGlobal("fetch", fetchMock);

    const [photo] = await searchUnsplashPhotos("kyoto unique query one");
    expect(photo).toMatchObject({
      id: "kyoto-1",
      thumbUrl: "https://images.unsplash.com/kyoto-1?small",
      fullUrl: "https://images.unsplash.com/kyoto-1?regular",
      altDescription: "a photo of kyoto-1",
      authorName: "Someone Photogenic",
      downloadLocation: "https://api.unsplash.com/photos/kyoto-1/download",
    });
    const authorUrl = new URL(photo!.authorUrl);
    expect(authorUrl.searchParams.get("utm_source")).toBe("starmap");
    expect(authorUrl.searchParams.get("utm_medium")).toBe("referral");

    // Sends the access key as a Client-ID bearer, never exposed to a caller.
    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(requestInit.headers.Authorization).toBe("Client-ID test-access-key");
  });

  it("caches results by normalized query — a second identical search doesn't refetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [rawPhoto("cache-1")] }));
    vi.stubGlobal("fetch", fetchMock);

    const query = "  Cache Test Query Unique  ";
    await searchUnsplashPhotos(query);
    await searchUnsplashPhotos(query.trim().toLowerCase());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws UnsplashRateLimitError on a 403 with zero remaining quota", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { errors: ["Rate Limit Exceeded"] },
          { status: 403, headers: { "X-Ratelimit-Remaining": "0" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchUnsplashPhotos("rate limited unique query"),
    ).rejects.toBeInstanceOf(UnsplashRateLimitError);
  });

  it("throws a plain error on a 403 that isn't quota exhaustion (e.g. a bad key)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ errors: ["Invalid access token"] }, { status: 403 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchUnsplashPhotos("bad key unique query"),
    ).rejects.not.toBeInstanceOf(UnsplashRateLimitError);
  });

  it("throws UnsplashConfigError when the access key isn't configured", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchUnsplashPhotos("unconfigured unique query"),
    ).rejects.toBeInstanceOf(UnsplashConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("triggerUnsplashDownload", () => {
  it("calls the given download_location with the access key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await triggerUnsplashDownload(
      "https://api.unsplash.com/photos/abc/download",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe(
      "https://api.unsplash.com/photos/abc/download",
    );
  });

  it("refuses a downloadLocation that isn't an api.unsplash.com URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      triggerUnsplashDownload("https://evil.example.com/steal"),
    ).rejects.toThrow(/non-Unsplash/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerUnsplashDownload("not a url")).rejects.toThrow(
      /Invalid download location/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
