import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientBar, copyLink, verdictSummary } from "../ClientBar";
import type { StageDef } from "../boardStages";
import { stagesFrom } from "../boardStages";
import type { PipelinePerson } from "../campaign";
import { makeClientLink, resetClientReviews, turnOffClientLink } from "../clientReviewStore";

/**
 * The line over the board when one stage is shown to the client: nothing without such a stage, a calm offer to make
 * the link when there is none, and once it is on, how the client has answered (as words in colour) with Copy link,
 * New link and Turn off for the people on the campaign.
 */

const def = (id: string, name: string, kind: StageDef["kind"], position: number, extra: Partial<StageDef> = {}): StageDef =>
  ({ id, name, kind, position, color: null, clientView: false, locked: kind === "hired" || kind === "passed", ...extra });
const PLAIN = stagesFrom([def("s", "Shortlisted", "shortlisted", 0), def("h", "Hired", "hired", 1), def("p", "Rejected", "passed", 2)]);
const WITH_CLIENT = stagesFrom([def("s", "Shortlisted", "shortlisted", 0), def("c", "Client review", "outreach", 1, { clientView: true }), def("h", "Hired", "hired", 2), def("p", "Rejected", "passed", 3)]);
const at = (id: string, stageId: string, verdict?: "approved" | "declined") =>
  ({ id, stage: "outreach", step: "waiting", stageId, ...(verdict ? { clientVerdict: { verdict, note: null, reviewerName: null, at: "2026-10-18T10:00:00Z" } } : {}) }) as unknown as PipelinePerson;

beforeEach(() => {
  resetClientReviews();
  vi.stubGlobal("window", { location: { origin: "https://app.test", pathname: "/access/" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("the client line", () => {
  it("is not there when no stage is shown to the client", () => {
    expect(renderToStaticMarkup(<ClientBar campaignId="k1" stages={PLAIN} people={[]} mayChange />)).toBe("");
  });

  it("offers to make the link, in a calm sentence, to the people on the campaign only", () => {
    const html = renderToStaticMarkup(<ClientBar campaignId="k1" stages={WITH_CLIENT} people={[]} mayChange />);
    expect(html).toContain("Your client can review the people in <b>Client review</b>");
    expect(html).toContain("no contact details");
    expect(html).toContain(">Create link<");
    expect(renderToStaticMarkup(<ClientBar campaignId="k1" stages={WITH_CLIENT} people={[]} mayChange={false} />)).toBe("");
  });

  it("once the link is on, shows how the client has answered, and Copy link, New link, Turn off", async () => {
    await makeClientLink("k1", 3, "c");
    const people = [at("a", "c"), at("b", "c", "approved"), at("d", "c")];
    const html = renderToStaticMarkup(<ClientBar campaignId="k1" stages={WITH_CLIENT} people={people} mayChange />);
    expect(html).toContain("<b>Client review</b> is shared with your client.");
    for (const word of ["Copy link", "New link", "Turn off"]) expect(html).toContain(`>${word}<`);
    // the figures are the link's (the server's), as coloured words
    expect(html).toContain("3 waiting");
    expect(html).toMatch(/data-st="muted"[^>]*>3 waiting</);
  });

  it("lets someone who only follows the campaign copy the link, and nothing more", async () => {
    await makeClientLink("k1", 1, "c");
    const html = renderToStaticMarkup(<ClientBar campaignId="k1" stages={WITH_CLIENT} people={[at("a", "c")]} mayChange={false} />);
    expect(html).toContain(">Copy link<");
    expect(html).not.toContain("New link");
    expect(html).not.toContain("Turn off");
    expect(html).not.toContain("Create link");
  });

  it("goes back to the offer when the link is turned off", async () => {
    await makeClientLink("k1", 1, "c");
    await turnOffClientLink("k1");
    const html = renderToStaticMarkup(<ClientBar campaignId="k1" stages={WITH_CLIENT} people={[]} mayChange />);
    expect(html).toContain(">Create link<");
    expect(html).not.toContain("Copy link");
  });
});

describe("what the client has said, in words", () => {
  it("leads with who is waiting and adds approved and rejected only when there are some, in the statuses' colours", () => {
    expect(verdictSummary(3, 0, 0)).toEqual([{ key: "waiting", text: "3 waiting", tone: "muted" }]);
    expect(verdictSummary(0, 0, 0)[0]!.text).toBe("Nobody waiting");
    expect(verdictSummary(2, 4, 1).map((v) => [v.text, v.tone])).toEqual([["2 waiting", "muted"], ["4 approved", "replied"], ["1 rejected", "passed"]]);
  });
});

describe("copying the link", () => {
  it("says yes when the clipboard took it, and no, without throwing, when there is none or it refuses", async () => {
    const taken: string[] = [];
    expect(await copyLink({ writeText: async (t) => { taken.push(t); } }, "https://x.test/#/review/abc")).toBe(true);
    expect(taken).toEqual(["https://x.test/#/review/abc"]);
    expect(await copyLink({ writeText: () => Promise.reject(new Error("NotAllowedError")) }, "u")).toBe(false);
    expect(await copyLink({ writeText: () => { throw new Error("blocked"); } }, "u")).toBe(false);
    expect(await copyLink(undefined, "u")).toBe(false);
    expect(await copyLink(null, "u")).toBe(false);
  });

  it("shows the link in a read-only field when copying did not work, not just a toast", () => {
    const bar = readFileSync(resolve(__dirname, "../ClientBar.tsx"), "utf8");
    expect(bar).toContain("setBare(url)");
    expect(bar).toMatch(/readOnly value=\{bare \?\? ""\} aria-label="Client link"/);
    expect(bar).toContain("e.currentTarget.select()");
    expect(bar).not.toContain("Select it from the address");
  });
});
