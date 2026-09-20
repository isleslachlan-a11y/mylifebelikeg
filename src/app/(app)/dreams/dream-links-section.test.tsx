// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DreamLinksSection } from "./dream-links-section";

// The real action file imports `@/lib/supabase/server`, which reaches
// into `next/headers` -- meaningless (and broken) outside an actual
// Next.js request. Mocked here the same way any component test that
// depends on a server action should: the component under test never
// needs to know its "use server" functions were swapped out.
vi.mock("./link-actions", () => ({
  createDreamLink: vi.fn(),
  deleteDreamLink: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("DreamLinksSection", () => {
  it("shows a provider chip for a recognisable link", async () => {
    const user = userEvent.setup();
    render(<DreamLinksSection entryId="entry-1" initialLinks={[]} />);

    await user.type(
      screen.getByLabelText("Inspiration link"),
      "https://www.instagram.com/p/ABC123/",
    );

    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn.t recognise that as a link/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save link" })).toBeInTheDocument();
  });

  it("keeps the pasted text and shows an inline message for unparseable input", async () => {
    const user = userEvent.setup();
    render(<DreamLinksSection entryId="entry-1" initialLinks={[]} />);

    const input = screen.getByLabelText("Inspiration link");
    await user.type(input, "just some notes, not a link");

    expect(input).toHaveValue("just some notes, not a link");
    expect(screen.getByText(/couldn.t recognise that as a link/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save as a plain link" }),
    ).toBeInTheDocument();
  });

  it("keeps the pasted text after a failed save attempt", async () => {
    const { createDreamLink } = await import("./link-actions");
    vi.mocked(createDreamLink).mockResolvedValue({
      ok: false,
      error: "Something went wrong — please try again.",
    });

    const user = userEvent.setup();
    render(<DreamLinksSection entryId="entry-1" initialLinks={[]} />);

    const input = screen.getByLabelText("Inspiration link");
    await user.type(input, "https://www.instagram.com/p/ABC123/");
    await user.click(screen.getByRole("button", { name: "Save link" }));

    expect(await screen.findByText("Something went wrong — please try again.")).toBeInTheDocument();
    expect(input).toHaveValue("https://www.instagram.com/p/ABC123/");
  });
});
