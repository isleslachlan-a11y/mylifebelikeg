// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { __resetEmbedScriptCacheForTests } from "./embed-loader";
import { DreamLinkCard, type DreamLinkCardData } from "./dream-link-card";

const TIKTOK_LINK: DreamLinkCardData = {
  id: "link-1",
  provider: "tiktok",
  providerPostId: "7123456789012345678",
  canonicalUrl: "https://www.tiktok.com/@someuser/video/7123456789012345678",
  title: "Kyoto in autumn",
  note: null,
};

const INSTAGRAM_LINK: DreamLinkCardData = {
  id: "link-2",
  provider: "instagram",
  providerPostId: "ABC123",
  canonicalUrl: "https://www.instagram.com/p/ABC123/",
  title: null,
  note: null,
};

const OTHER_LINK: DreamLinkCardData = {
  id: "link-3",
  provider: "other",
  providerPostId: null,
  canonicalUrl: "https://example.com/article",
  title: "An article",
  note: null,
};

const SHORT_TIKTOK_LINK: DreamLinkCardData = {
  id: "link-4",
  provider: "tiktok",
  providerPostId: null,
  canonicalUrl: "https://vm.tiktok.com/ZMabc123",
  title: null,
  note: null,
};

function tiktokScriptTags(): NodeListOf<HTMLScriptElement> {
  return document.querySelectorAll('script[src="https://www.tiktok.com/embed.js"]');
}

function instagramScriptTags(): NodeListOf<HTMLScriptElement> {
  return document.querySelectorAll('script[src="https://www.instagram.com/embed.js"]');
}

beforeEach(() => {
  __resetEmbedScriptCacheForTests();
});

afterEach(() => {
  // Scripts get appended to document.body directly by the embed
  // loader, outside of Testing Library's own render tree -- its
  // automatic cleanup unmounts components but has no reason to know
  // about a script tag it never rendered, so this needs its own
  // explicit sweep between tests.
  document.querySelectorAll("script[src]").forEach((el) => el.remove());
});

describe("DreamLinkCard", () => {
  it("renders no third-party script tag before activation", () => {
    render(<DreamLinkCard link={TIKTOK_LINK} onDelete={() => {}} isDeleting={false} />);

    expect(tiktokScriptTags()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Show post" })).toBeInTheDocument();
  });

  it("clicking activate injects exactly one script tag", async () => {
    const user = userEvent.setup();
    render(<DreamLinkCard link={TIKTOK_LINK} onDelete={() => {}} isDeleting={false} />);

    await user.click(screen.getByRole("button", { name: "Show post" }));

    expect(tiktokScriptTags()).toHaveLength(1);
  });

  it("a second card of the same platform does not inject a second script tag", async () => {
    const user = userEvent.setup();
    const second: DreamLinkCardData = {
      ...TIKTOK_LINK,
      id: "link-1b",
      canonicalUrl: "https://www.tiktok.com/@otheruser/video/999",
    };

    render(
      <>
        <DreamLinkCard link={TIKTOK_LINK} onDelete={() => {}} isDeleting={false} />
        <DreamLinkCard link={second} onDelete={() => {}} isDeleting={false} />
      </>,
    );

    const [firstButton, secondButton] = screen.getAllByRole("button", { name: "Show post" });
    await user.click(firstButton!);
    await user.click(secondButton!);

    expect(tiktokScriptTags()).toHaveLength(1);
  });

  it("activating an Instagram card loads the Instagram script, not TikTok's", async () => {
    const user = userEvent.setup();
    render(<DreamLinkCard link={INSTAGRAM_LINK} onDelete={() => {}} isDeleting={false} />);

    await user.click(screen.getByRole("button", { name: "Show post" }));

    expect(instagramScriptTags()).toHaveLength(1);
    expect(tiktokScriptTags()).toHaveLength(0);
  });

  it("hides the activate control for provider 'other'", () => {
    render(<DreamLinkCard link={OTHER_LINK} onDelete={() => {}} isDeleting={false} />);

    expect(screen.queryByRole("button", { name: "Show post" })).not.toBeInTheDocument();
  });

  it("hides the activate control for a short link with no post id", () => {
    render(<DreamLinkCard link={SHORT_TIKTOK_LINK} onDelete={() => {}} isDeleting={false} />);

    expect(screen.queryByRole("button", { name: "Show post" })).not.toBeInTheDocument();
    // Still a real, clickable link -- the brief's "the anchor is the
    // whole feature" applies just as much to an unresolved short link
    // as it does to `other`.
    expect(screen.getByRole("link")).toHaveAttribute("href", SHORT_TIKTOK_LINK.canonicalUrl);
  });
});
