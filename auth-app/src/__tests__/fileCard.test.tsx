import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { RunEvent } from "../api/events";
import type { ChatState } from "../liveChat";

/**
 * The card for a sheet the agent made: what it says (counts and names, never a person), each state of the
 * download (ready, working, done, did not go and why), the link to the Google copy once there is one, and
 * that it arrives from the agent's stream and sits among the turn's other cards.
 */

const { FileCardBody, fileLine, takeFile, takeLabel } = await import("../agentCards/FileCard");
const { Cards } = await import("../agentCards/ReadCards");
const { applyEvent, newTurn } = await import("../liveChat");

type Card = Parameters<typeof FileCardBody>[0]["card"];
const card = (over: Partial<Card> = {}): Card => ({
  kind: "file", key: "file:s1", sheetId: "s1", title: "Shortlist of Senior Backend", filename: "shortlist-of-senior-backend-2026-10-15.xlsx",
  rows: 12, columns: 5, downloadUrl: "/v1/sheets/s1/download", googleUrl: null, capped: false, ...over,
});
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("what the card says", () => {
  it("names the sheet and counts its rows and columns, in the words people use", () => {
    expect(fileLine(12, 5)).toBe("12 rows, 5 columns");
    expect(fileLine(1, 1)).toBe("1 row, 1 column");
    expect(fileLine(0, 4)).toBe("0 rows, 4 columns");
    expect(fileLine(1250, 8)).toBe("1,250 rows, 8 columns");

    const markup = renderToStaticMarkup(<FileCardBody card={card()} state={{ s: "idle" }} onTake={() => {}} />);
    const said = text(markup);
    expect(said).toContain("Shortlist of Senior Backend");
    expect(said).toContain("12 rows, 5 columns");
    expect(said).toContain("Download Excel file");
    // A quiet way on: it is changed by asking.
    expect(said).toContain("Edit it: ask me to add a column, sort or filter.");
    expect(markup).toContain('aria-label="Shortlist of Senior Backend, an Excel sheet"');
    expect(markup).not.toContain("Open in Google Sheets");
    expect(markup).not.toContain("disabled");
  });

  it("says when the list was longer than a file holds", () => {
    const said = text(renderToStaticMarkup(<FileCardBody card={card({ rows: 5000, capped: true })} state={{ s: "idle" }} onTake={() => {}} />));
    expect(said).toContain("5,000 rows, 5 columns. The list is longer than a file holds, so this has the first 5,000");
  });

  it("links to the Google copy once the sheet was put there", () => {
    const markup = renderToStaticMarkup(
      <FileCardBody card={card({ googleUrl: "https://docs.google.com/spreadsheets/d/abc/edit" })} state={{ s: "idle" }} onTake={() => {}} />,
    );
    expect(markup).toContain('href="https://docs.google.com/spreadsheets/d/abc/edit"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(text(markup)).toContain("Open in Google Sheets");
  });
});

describe("each state of the download", () => {
  it("is working while the file is made: the button waits and says what is happening", () => {
    const markup = renderToStaticMarkup(<FileCardBody card={card()} state={{ s: "working" }} onTake={() => {}} />);
    expect(text(markup)).toContain("Preparing");
    expect(text(markup)).toContain("Making the file from your latest rows.");
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
  });

  it("is done once saved, and can be taken again", () => {
    const markup = renderToStaticMarkup(<FileCardBody card={card()} state={{ s: "done" }} onTake={() => {}} />);
    expect(text(markup)).toContain("Download again");
    expect(text(markup)).toContain("Downloaded.");
    expect(markup).not.toContain("disabled");
  });

  it("says plainly why it did not go, and offers to try again", () => {
    const markup = renderToStaticMarkup(
      <FileCardBody card={card()} state={{ s: "failed", message: "That's a lot of exports for one hour. Try again a little later." }} onTake={() => {}} />,
    );
    expect(text(markup)).toContain("That's a lot of exports for one hour. Try again a little later.");
    expect(text(markup)).toContain("Try again");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("disabled");
  });

  it("labels the button for every state", () => {
    expect(takeLabel({ s: "idle" })).toBe("Download Excel file");
    expect(takeLabel({ s: "working" })).toBe("Preparing");
    expect(takeLabel({ s: "done" })).toBe("Download again");
    expect(takeLabel({ s: "failed", message: "x" })).toBe("Try again");
  });
});

describe("taking the file", () => {
  it("fetches it from the sheet's own address and saves it under the card's file name", async () => {
    const file = new Blob(["xlsx bytes"]);
    const fetchFile = vi.fn(async () => file);
    const save = vi.fn();
    const state = await takeFile(card(), { fetchFile, save });
    expect(state).toEqual({ s: "done" });
    expect(fetchFile).toHaveBeenCalledWith("/v1/sheets/s1/download");
    expect(save).toHaveBeenCalledWith(file, "shortlist-of-senior-backend-2026-10-15.xlsx");
  });

  it("turns a refusal into the sentence the server wrote, and saves nothing", async () => {
    const save = vi.fn();
    const state = await takeFile(card(), {
      fetchFile: async () => { throw new ApiError(403, "forbidden", "You're not on this campaign."); },
      save,
    });
    expect(state).toEqual({ s: "failed", message: "You're not on this campaign." });
    expect(save).not.toHaveBeenCalled();
  });

  it("does not throw when saving itself goes wrong", async () => {
    const state = await takeFile(card(), {
      fetchFile: async () => new Blob(["x"]),
      save: () => { throw new Error("disk full"); },
    });
    expect(state.s).toBe("failed");
  });
});

describe("in the chat", () => {
  let seq = 0;
  const ev = (payload: Record<string, unknown>): RunEvent =>
    ({ ...payload, id: ++seq, runId: "r1", seq, type: "artifact", at: "2026-10-15T10:00:05.000Z" }) as RunEvent;
  const chat = (): ChatState => ({
    conversationId: "c1",
    turns: [{ ...newTurn("t1", "give me a sheet of the shortlist", 0), runId: "r1", status: "working" }],
    owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null,
  });

  it("arrives as a card, and an edit replaces it in place with the new counts and the Google link", () => {
    const first = applyEvent(chat(), ev({ kind: "file", key: "file:s1", sheetId: "s1", title: "Shortlist", filename: "shortlist-2026-10-15.xlsx", rows: 12, columns: 5, downloadUrl: "/v1/sheets/s1/download", googleUrl: null }));
    expect(first.turns[0]?.cards).toEqual([
      { kind: "file", key: "file:s1", sheetId: "s1", title: "Shortlist", filename: "shortlist-2026-10-15.xlsx", rows: 12, columns: 5, downloadUrl: "/v1/sheets/s1/download", googleUrl: null, capped: false },
    ]);
    const edited = applyEvent(
      applyEvent(first, ev({ kind: "campaigns", key: "campaigns", items: [] })),
      ev({ kind: "file", key: "file:s1", sheetId: "s1", title: "Shortlist", filename: "shortlist-2026-10-15.xlsx", rows: 3, columns: 6, downloadUrl: "/v1/sheets/s1/download", googleUrl: "https://docs.google.com/spreadsheets/d/x/edit" }),
    );
    const cards = edited.turns[0]?.cards ?? [];
    expect(cards.map((c) => c.key)).toEqual(["file:s1", "campaigns"]);
    expect(cards[0]).toMatchObject({ rows: 3, columns: 6, googleUrl: "https://docs.google.com/spreadsheets/d/x/edit" });
  });

  it("is dropped when it cannot be taken (no sheet or no address), rather than drawn broken", () => {
    const s = applyEvent(chat(), ev({ kind: "file", key: "file:s2", title: "No id" }));
    expect(s.turns[0]?.cards).toEqual([]);
  });

  it("is drawn among the turn's cards", () => {
    const markup = renderToStaticMarkup(<Cards cards={[card()]} />);
    expect(text(markup)).toContain("Shortlist of Senior Backend");
    expect(text(markup)).toContain("Download Excel file");
  });
});
