import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../agentCards/ApprovalCard";
import { ExportCard } from "../agentCards/ExportCard";
import { OutcomeBody } from "../agentCards/OutcomeCard";
import { campaignsHeading } from "../agentCards/ReadCards";
import { PhaseTimeline } from "../agentCards/PhaseTimeline";
import { ConnectCard, isConnected, linkFor } from "../agentCards/ConnectCard";
import { countsLine, outcomeModel, withoutRepeat, wontDo } from "../agentCards/outcome";
import type { RunEvent } from "../api/events";
import { approvalLines } from "../agentPhases";
import type { PhaseLine } from "../agentPhases";
import { applyEvent, newTurn } from "../liveChat";
import type { Approval, ChatState } from "../liveChat";

/* An owner: the connect card is for someone who may connect Slack. */
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));

/**
 * The cards in a chat turn: an approval says what it will do, who it is for and what it will not do, and
 * turns into what it did, in place, with the counts and the next step; a declined one says "Not done".
 */

let nextId = 0;
const seqs: Record<string, number> = {};
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: ++nextId, runId: "r1", seq: (seqs.r1 = (seqs.r1 ?? 0) + 1), type, at: "2026-10-11T10:00:05.000Z",
});

function approvalFor(action: Record<string, unknown>, extra: Record<string, unknown> = {}): ChatState {
  const turn = { ...newTurn("t1", "Shortlist them", 0), runId: "r1", status: "working" as const };
  const s: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
  return applyEvent(s, ev("approval", { summary: "Add 25 people to the shortlist", action, campaignName: "Software Engineer", people: [], ...extra }));
}
const answered = (s: ChatState, result: Record<string, unknown>): Approval => {
  const seq = s.turns[0]!.approvals[0]!.seq;
  return applyEvent(s, ev("result", { approvalSeq: seq, ...result })).turns[0]!.approvals[0]!;
};

describe("what an answered approval says", () => {
  it("turns into its outcome with the counts and one click to the page it changed", () => {
    const a = answered(approvalFor({ action: "shortlist", campaignId: "c1" }), { decision: "approve", action: "shortlist", added: 25, alreadyThere: 3 });
    const o = outcomeModel(a)!;
    expect(o).toMatchObject({ tone: "done", summary: "Added 25 to the shortlist.", counts: "25 added, 3 already there" });
    expect(o.next).toEqual([{ label: "Open the shortlist", href: "#/campaign/shortlisted?campaign=c1" }]);
  });

  it("uses the server's own sentence, counts and next steps when it sends them", () => {
    const a = answered(approvalFor({ action: "campaign_set_status", campaignId: "c1" }), {
      decision: "approve", action: "campaign_set_status", summary: "Software Engineer is active.", counts: { added: 0 },
      next: [{ label: "Find people", text: "Find 20 people for Software Engineer" }],
    });
    expect(outcomeModel(a)).toEqual({
      tone: "done", summary: "Software Engineer is active.", counts: "0 added", next: [{ label: "Find people", text: "Find 20 people for Software Engineer" }],
    });
  });

  it("says a declined one is not done, quietly, with nothing to click", () => {
    const a = answered(approvalFor({ action: "shortlist", campaignId: "c1" }), { decision: "decline" });
    expect(outcomeModel(a)).toEqual({ tone: "declined", summary: "Not done.", counts: "", next: [] });
    const note = answered(approvalFor({ action: "remember", level: "org", text: "x" }), { decision: "decline" });
    expect(outcomeModel(note)?.summary).toBe("Not saved.");
  });

  it("does not say a number twice: the counts line goes when the sentence above it has every number in it", () => {
    expect(withoutRepeat("25 added", "Added 25 people to the shortlist of Software Engineer.")).toBe("");
    expect(withoutRepeat("25 added, 3 already there", "Added 25 to the shortlist.")).toBe("25 added, 3 already there");
    expect(withoutRepeat("", "Done.")).toBe("");
    const a = answered(approvalFor({ action: "shortlist", campaignId: "c1" }), {
      decision: "approve", action: "shortlist", summary: "Added 25 people to the shortlist of Software Engineer.", counts: { added: 25 },
    });
    expect(outcomeModel(a)).toMatchObject({ summary: "Added 25 people to the shortlist of Software Engineer.", counts: "" });
  });

  it("never says a finished search is still searching: the card outlives the run", () => {
    const a = answered(approvalFor({ action: "find_people", campaignId: "c1" }), { decision: "approve", action: "find_people", campaignId: "c1", searchRunId: "s1", size: 30 });
    expect(outcomeModel(a)?.summary).toBe("Started the search. The people it finds are listed below.");
    expect(outcomeModel(a)?.summary).not.toMatch(/searching now/i);
  });

  it("has no outcome while it waits", () => {
    expect(outcomeModel(approvalFor({ action: "shortlist" }).turns[0]!.approvals[0]!)).toBeNull();
  });

  it("puts only the counts that mean something into the line", () => {
    expect(countsLine({ added: 25, alreadyThere: 0, skipped: 2 })).toBe("25 added, 2 skipped");
    expect(countsLine({ added: 0 })).toBe("0 added");
    expect(countsLine({ mystery: 4 })).toBe("");
    expect(countsLine(null)).toBe("");
  });
});

describe("what an approval will not do", () => {
  it("is said in plain words for the actions the console knows, and the server's words win", () => {
    const a = approvalFor({ action: "shortlist", campaignId: "c1" }).turns[0]!.approvals[0]!;
    expect(wontDo(a)).toEqual(["It won't contact anyone. People are only put on the shortlist."]);
    expect(wontDo({ ...a, wontDo: ["It won't change the role spec."] })).toEqual(["It won't change the role spec."]);
    expect(wontDo({ action: "something_new", wontDo: [] })).toEqual([]);
  });

  it("reads who it is for and what it will not do from the approval event", () => {
    const s = approvalFor({ action: "shortlist" }, {
      capability: "pipeline.shortlist", wontDo: ["It won't email anyone."],
      people: [{ name: "Asha Verma", title: "Staff Engineer", company: "PhonePe", city: "Bengaluru" }],
    });
    expect(s.turns[0]!.approvals[0]).toMatchObject({ capability: "pipeline.shortlist", wontDo: ["It won't email anyone."], people: [{ name: "Asha Verma" }] });
  });
});

describe("the card markup", () => {
  it("draws an outcome's sentence, counts and next steps as one click each", () => {
    const html = renderToStaticMarkup(
      <OutcomeBody outcome={{ tone: "done", summary: "Added 25 to the shortlist.", counts: "25 added", next: [{ label: "Open the shortlist", href: "#/x" }, { label: "Start outreach", text: "Start outreach" }] }} />,
    );
    expect(html).toContain("Added 25 to the shortlist.");
    expect(html).toContain("25 added");
    expect(html).toContain('<a class="rep-opt" href="#/x">Open the shortlist</a>');
    expect(html).toContain('<button type="button" class="rep-opt">Start outreach</button>');
  });

  it("draws the narration with a loader on what is running, a check on what is done and no blank row", () => {
    const html = renderToStaticMarkup(
      <PhaseTimeline
        working
        lines={[
          { id: "a", phase: "search", state: "done", label: "Got 30 candidates", seq: 1 },
          { id: "b", phase: "match", state: "running", label: "Matching candidates to the role", done: 12, total: 30, seq: 2 },
        ]}
      />,
    );
    expect(html).toContain("Got 30 candidates");
    expect(html).toContain("12 of 30");
    expect(html.match(/class="ldr is-sm"/g)).toHaveLength(1);
    expect(html).toContain("is-done");
    expect(renderToStaticMarkup(<PhaseTimeline lines={[]} working />)).toContain("Getting started");
    expect(renderToStaticMarkup(<PhaseTimeline lines={[]} working={false} />)).toBe("");
  });

  it("says a phase that didn't finish calmly", () => {
    const html = renderToStaticMarkup(<PhaseTimeline working={false} lines={[{ id: "a", phase: "enrich", state: "failed", label: "Getting contact details", seq: 1 }]} />);
    expect(html).toMatch(/Didn(&#x27;|')t finish/);
    // What is read, not the class names.
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/error|failed|sorry/i);
  });
});

describe("connecting from the chat", () => {
  const none = { google: null, slack: null, notion: null };
  it("knows when each provider is connected", () => {
    expect(isConnected(none, "slack")).toBe(false);
    expect(isConnected({ ...none, slack: { status: "connected" } as never }, "slack")).toBe(true);
    expect(isConnected({ ...none, notion: { status: "expired" } as never }, "notion")).toBe(false);
    expect(isConnected({ ...none, google: { status: "connected", products: ["gmail"] } as never }, "google")).toBe(true);
    // Connected to Google, but not for Gmail: email still can't go.
    expect(isConnected({ ...none, google: { status: "connected", products: ["sheets"] } as never }, "google")).toBe(false);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("opens the link the server made, and falls back to the connections page for a token-only provider", async () => {
    vi.stubGlobal("window", { location: { origin: "https://app.test", pathname: "/access/" } });
    const known = { oauth: { slack: false, notion: false } };
    expect(await linkFor("google", "https://accounts.example/auth", known)).toBe("https://accounts.example/auth");
    expect(await linkFor("slack", "#/settings/connections", known)).toBe("https://app.test/access/#/settings/connections");
    expect(await linkFor("notion", null, known)).toBe("https://app.test/access/#/settings/connections");
  });
});

describe("the way back, the file and the token field", () => {
  it("carries an outcome's undo to the card, and has none when the server sent none", () => {
    const withUndo = answered(approvalFor({ action: "unshortlist", campaignId: "c1" }), {
      decision: "approve",
      action: "unshortlist",
      summary: "Took Karthik Bose off the shortlist of Android.",
      undo: { label: "Undo", text: "Shortlist Karthik Bose again for Android" },
    });
    expect(outcomeModel(withUndo)).toMatchObject({
      undo: { label: "Undo", text: "Shortlist Karthik Bose again for Android" },
    });
    const without = answered(approvalFor({ action: "unshortlist", campaignId: "c1" }), {
      decision: "approve",
      action: "unshortlist",
      summary: "Done.",
    });
    expect(outcomeModel(without)).not.toHaveProperty("undo");
    // On the card, it is a button like the next steps, last.
    const html = renderToStaticMarkup(
      <OutcomeBody outcome={outcomeModel(withUndo)!} campaignId="c1" />,
    );
    expect(html).toMatch(/Undo/);
  });

  it("reads a card of a file, and a connect card that asks for a token", () => {
    const base: ChatState = {
      conversationId: "c1",
      turns: [{ ...newTurn("t1", "Download it", 0), runId: "r1", status: "working" as const }],
      owners: { r1: "t1" },
      orphans: {},
      applied: {},
      loading: false,
      error: null,
    };
    const cards = (payload: Record<string, unknown>) => applyEvent(base, ev("artifact", payload)).turns[0]!.cards;
    expect(
      cards({ kind: "export", key: "e", campaignId: "c1", campaignName: "Android", list: "shortlist", format: "csv" }),
    ).toEqual([{ kind: "export", key: "e", campaignId: "c1", campaignName: "Android", list: "shortlist", format: "csv" }]);
    // One that names no campaign or no file kind is not drawn.
    expect(cards({ kind: "export", key: "e2", campaignId: "c1", list: "all", format: "csv" })).toEqual([]);
    expect(
      cards({
        kind: "connect",
        key: "connect:slack",
        provider: "slack",
        mode: "token",
        url: null,
        field: { label: "Slack bot token", help: "Starts with xoxb-." },
        reason: "Connect Slack so I can post to your team.",
      }),
    ).toMatchObject([{ kind: "connect", mode: "token", field: { label: "Slack bot token", help: "Starts with xoxb-." } }]);
  });

  it("shows an email as the message it is, under 'Send this to Nandini?', with Approve and Not now", () => {
    const state = approvalFor(
      { action: "send_email", campaignId: "c1", messageIds: ["m1"] },
      {
        summary: 'Email Nandini Nair. Subject: "Interview tomorrow". Message: "Hi Nandini, 11 am. Ana"',
        capability: "outreach.send_email",
        people: [{ name: "Nandini Nair", title: "DevOps Engineer", company: "Amazon", city: null }],
        emails: [{ to: "Nandini Nair", subject: "Interview tomorrow", body: "Hi Nandini,\n\nYour interview is at 11 am.\n\nAna" }],
      },
    );
    const html = renderToStaticMarkup(
      <ApprovalCard turnKey="t1" approval={state.turns[0]!.approvals[0]!} turnSaid="email Nandini" />,
    );
    expect(html).toContain("Send this to Nandini?");
    expect(html).toContain("To Nandini Nair");
    expect(html).toContain("Interview tomorrow");
    expect(html).toContain("Your interview is at 11 am.");
    expect(html).toContain("Approve");
    expect(html).toContain("Not now");
    // The summary line is the same words as the message under it, so it is not said twice.
    expect(html).not.toContain("Subject: &quot;Interview tomorrow&quot;");
    expect(html).not.toMatch(/ready to review and send in Outreach/i);
  });

  it("asks for the token in the card itself where Slack has no sign-in, and never sends anyone to Settings", () => {
    const html = renderToStaticMarkup(
      <ConnectCard
        provider="slack"
        mode="token"
        field={{ label: "Slack bot token", help: "Starts with xoxb-. Paste it here and I'll connect Slack." }}
        reason="Connect Slack so I can post to your team."
      />,
    );
    expect(html).toContain("Slack isn&#x27;t connected");
    expect(html).toContain("Slack bot token");
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toContain("Connect Slack</button>");
    expect(html).not.toMatch(/Settings/);
    expect(html).not.toMatch(/Finish signing in/);
  });

  it("opens the sign-in, with no token field, where there is one", () => {
    const html = renderToStaticMarkup(
      <ConnectCard provider="google" mode="oauth" url="https://accounts.example.test/authorise" reason="Connect Gmail." />,
    );
    expect(html).toContain("Connect Google</button>");
    expect(html).not.toMatch(/type="password"/);
  });

  it("offers the file as a button, naming what it holds", () => {
    const html = renderToStaticMarkup(
      <ExportCard campaignId="c1" campaignName="Android Engineer" list="shortlist" format="csv" />,
    );
    expect(html).toContain("The shortlist of Android Engineer");
    expect(html).toContain("Download CSV");
    const xlsx = renderToStaticMarkup(<ExportCard campaignId="c1" campaignName="Android" list="pipeline" format="xlsx" />);
    expect(xlsx).toContain("Download Excel file");
  });

  it("counts the closed campaigns the agent lists, instead of calling them all open", () => {
    expect(campaignsHeading([{ status: "active" }, { status: "active" }])).toBe("2 open campaigns");
    expect(campaignsHeading([{ status: "active" }])).toBe("1 open campaign");
    expect(campaignsHeading([{ status: "active" }, { status: "closed" }, { status: "closed" }])).toBe("1 open, 2 closed");
    expect(campaignsHeading([{ status: "closed" }])).toBe("1 closed campaign");
  });
});

describe("a yes that takes a while says what it is doing on its own card", () => {
  const line = (id: string, label: string, state: PhaseLine["state"], seq: number, detail?: string): PhaseLine => ({
    id, phase: "write", state, label, seq, ...(detail ? { detail } : {}),
  });

  it("picks the lines that belong to one approval, in order, and no one else's", () => {
    const lines: PhaseLine[] = [
      line("understand", "Understood", "done", 1),
      line("approval:7", "Preparing the role spec", "running", 2),
      line("approval:7:read", "Read the job description", "done", 3),
      line("approval:7:draft", "Drafting the role spec", "running", 4, "Product Designer, 12 s"),
      line("approval:70", "Moving people on the board", "running", 5),
      line("approval:8:draft", "Drafting the role spec", "running", 6),
    ];
    expect(approvalLines(lines, 7).map((l) => l.id)).toEqual(["approval:7", "approval:7:read", "approval:7:draft"]);
  });

  it("shows the steps instead of only 'Working' while the approval is being decided", () => {
    const state = approvalFor(
      { action: "approve_spec", campaignId: "c1" },
      { summary: "Draft the role spec for Product Designer from its job description, approve it and start finding people", capability: "campaign.approve_spec" },
    );
    const approval = { ...state.turns[0]!.approvals[0]!, deciding: true };
    const lines = [
      line("approval:1:read", "Read the job description", "done", 1),
      line("approval:1:draft", "Drafting the role spec", "running", 2, "Product Designer, 21 s"),
    ];
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={approval} turnSaid="go" phases={lines} />);
    expect(html).toContain("Working");
    expect(html).toContain("Read the job description");
    expect(html).toContain("Drafting the role spec");
    expect(html).toContain("Product Designer, 21 s");
    // Waiting for the person's yes, nothing is narrated yet.
    const waiting = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={{ ...approval, deciding: false }} turnSaid="go" phases={lines} />);
    expect(waiting).not.toContain("Drafting the role spec");
  });
});
