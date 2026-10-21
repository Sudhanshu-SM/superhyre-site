import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PhaseLine } from "../agentPhases";
import type { Item } from "../api/outreach";
import type { Approval, LiveTurn } from "../liveChat";

/**
 * What the cards say once a yes did not go through, for every kind of card, and the rest of the turn around
 * them: a run that is only waiting for the person says so, an approved action's lines are on its own card, and
 * the steps offered after a failure are the ones that mend it.
 */

vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => null, messageOf: (e: Error) => e.message };
});

const store = await import("../connectionsStore");
const { ApprovalCard } = await import("../agentCards/ApprovalCard");
const { OutcomeBody } = await import("../agentCards/OutcomeCard");
const { outcomeModel } = await import("../agentCards/outcome");
const { LiveTurnBody, linesOf, waitingOnPerson, WAITING_QUIET_MS } = await import("../LiveTurn");
const { helpLinkOf } = await import("../chatCards");
const { FailedRow } = await import("../Outreach");
const out = await import("../api/outreach");
const { applyEvent, newTurn } = await import("../liveChat");

const html = (el: JSX.Element) => renderToStaticMarkup(el);
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const PAGE = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";
const OFF =
  "Gmail isn't switched on for the Google project this app signs in with yet. Someone with access to that Google Cloud project has to enable the Gmail API there, then try again.";

const approval = (action: string, over: Partial<Approval> = {}, detail: Record<string, unknown> = {}): Approval => ({
  seq: 5, summary: "Do the thing", action, detail: { action, ...detail }, campaignId: null, campaignName: null, people: [],
  decided: null, deciding: false, error: null, notes: [], capability: null, wontDo: [], emails: [], ...over,
});
const card = (a: Approval, extra: { phases?: PhaseLine[] } = {}) => html(<ApprovalCard turnKey="t" approval={a} turnSaid="x" {...extra} />);

beforeEach(() => store.resetConnections());

describe("a card whose yes was refused", () => {
  it("leaves 'Sending…', says why in colour, offers Try again and Not now, and links to where the fix is", () => {
    const a = approval("send_test_email", { error: OFF, help: PAGE, reason: "google_api_disabled" });
    const out = card(a);
    expect(out).toContain('class="kc-problem"');
    expect(text(out)).toContain("isn't switched on for the Google project this app signs in with yet");
    expect(out).toContain(">Try again</button>");
    expect(out).toContain(">Not now</button>");
    expect(out).not.toContain("Sending");
    expect(out).not.toContain(">Approve</button>");
    expect(out).toContain(`href="${PAGE}"`);
    expect(text(out)).toContain("Open Google Cloud");
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("does the same for every kind of card", () => {
    const kinds: Array<[string, Record<string, unknown>]> = [
      ["send_email", { campaignId: "c1" }],
      ["send_test_email", {}],
      ["slack_message", { channelName: "hiring", text: "Hello" }],
      ["notion_note", { title: "Notes", body: "x" }],
      ["fetch_contacts", { campaignId: "c1" }],
      ["shortlist", { campaignId: "c1" }],
      ["save_candidates", { campaignId: "c1" }],
      ["add_candidate", {}],
      ["retry_failed_emails", { campaignId: "c1" }],
      ["schedule", { items: [] }],
    ];
    for (const [action, detail] of kinds) {
      const refused = card(approval(action, { error: "Something specific went wrong. Try later." }, detail));
      expect(text(refused), action).toContain("Something specific went wrong");
      expect(refused, action).toContain(">Try again</button>");
      expect(refused, action).not.toContain("Sending");
      expect(refused, action).not.toContain("Working");
      // No link for a refusal that has nowhere else to go.
      expect(refused, action).not.toContain("Open Google Cloud");
    }
  });

  it("is working only while the request is out, with the lines of what it is doing, and not once it failed", () => {
    const lines: PhaseLine[] = [{ id: "approval:5", phase: "write", state: "running", label: "Preparing the test email", seq: 3 }];
    const working = card(approval("send_test_email", { deciding: true }), { phases: lines });
    expect(working).toContain("Sending…</button>");
    expect(text(working)).toContain("Preparing the test email");
    expect(working).toContain("disabled");

    const failedLines: PhaseLine[] = [{ ...lines[0]!, state: "failed", label: OFF, seq: 4 }];
    const refused = card(approval("send_test_email", { deciding: false, error: OFF }), { phases: failedLines });
    expect(text(refused)).not.toContain("Preparing the test email");
    expect(refused).not.toContain("pt-line");
    expect(refused).toContain(">Try again</button>");
  });

  it("brings the reason and the link back for a card the person returns to, from the line the run kept", () => {
    const kept: PhaseLine[] = [{ id: "approval:5", phase: "write", state: "failed", label: OFF, seq: 9 }];
    const back = card(approval("send_test_email"), { phases: kept });
    expect(text(back)).toContain("has to enable the Gmail API");
    expect(back).toContain(`href="${PAGE}"`);
    expect(back).toContain(">Try again</button>");
  });

  it("is the usual Approve and Not now before anything went wrong, and nothing of a failure after it went through", () => {
    const fresh = card(approval("send_test_email"));
    expect(fresh).toContain(">Approve</button>");
    expect(fresh).not.toContain("kc-problem");
    const done = approval("send_test_email", { decided: { decision: "approve", outcome: { summary: "Test email sent to ana@hirewell.in." } }, error: OFF });
    expect(text(card(done))).toContain("Test email sent to ana@hirewell.in.");
    expect(card(done)).not.toContain("kc-problem");
  });
});

describe("where the fix is", () => {
  it("takes the server's link, or reads the page from the words, and only ever links a web address", () => {
    expect(helpLinkOf(PAGE, "x")).toBe(PAGE);
    expect(helpLinkOf(null, OFF)).toBe(PAGE);
    expect(helpLinkOf(undefined, OFF.replace("Gmail", "Google Sheets"))).toBe("https://console.cloud.google.com/apis/library/sheets.googleapis.com");
    expect(helpLinkOf("javascript:alert(1)", "Gmail is busy right now. Try again in a moment.")).toBeNull();
    expect(helpLinkOf(null, "Gmail is busy right now. Try again in a moment.")).toBeNull();
  });
});

describe("a turn whose run is waiting for the person", () => {
  /* Started a little while ago, whatever day the test runs: a turn older than the server's limit reads as lost, not waiting. */
  const T0 = Date.now() - 70_000;
  const turn = (over: Partial<LiveTurn> = {}): LiveTurn => ({
    ...newTurn("t", "Send me a test email", T0), runId: "r1", status: "working", touchedAt: T0, ...over,
  });
  const open = [approval("send_test_email")];

  it("is waiting once a card is open and the run has gone quiet, not before", () => {
    const t = turn({ approvals: open });
    expect(waitingOnPerson(t, T0 + WAITING_QUIET_MS - 1)).toBe(false);
    expect(waitingOnPerson(t, T0 + WAITING_QUIET_MS)).toBe(true);
  });

  it("is not waiting when there is no card, when every card is answered, when a yes is being carried out, or when the turn is over", () => {
    const later = T0 + 60_000;
    expect(waitingOnPerson(turn(), later)).toBe(false);
    expect(waitingOnPerson(turn({ approvals: [approval("send_test_email", { decided: { decision: "approve", outcome: {} } })] }), later)).toBe(false);
    expect(waitingOnPerson(turn({ approvals: [approval("send_test_email", { deciding: true })] }), later)).toBe(false);
    expect(waitingOnPerson(turn({ approvals: open, status: "done" }), later)).toBe(false);
    // A turn built without a clock on its events is never called quiet.
    const { touchedAt: _t, ...bare } = turn({ approvals: open });
    expect(waitingOnPerson(bare, later)).toBe(false);
  });

  it("says 'Waiting for your OK' with no spinner and no Stop, where 'Thinking it through' and Stop were", () => {
    const lines = [{ id: "think:1", phase: "decide", state: "running" as const, label: "Thinking it through", seq: 2 }];
    const stuck = turn({ approvals: open, phases: lines, touchedAt: Date.now() - 60_000 });
    const out = html(<LiveTurnBody turn={stuck} onAnswer={() => undefined} />);
    expect(text(out)).toContain("Waiting for your OK");
    expect(out).not.toContain("Thinking it through");
    expect(out).not.toContain("lt-stop");
    expect(out).not.toContain("Stop</button>");
    // Busy: the run said something a moment ago, so it is still thinking, with Stop.
    const busy = turn({ approvals: open, phases: lines, touchedAt: Date.now() });
    const working = html(<LiveTurnBody turn={busy} onAnswer={() => undefined} />);
    expect(text(working)).toContain("Thinking it through");
    expect(working).toContain("Stop</button>");
    expect(text(working)).not.toContain("Waiting for your OK");
  });

  it("keeps an approved action's lines on its card, and off the run's own row", () => {
    const lines: PhaseLine[] = [
      { id: "understand", phase: "understand", state: "done", label: "Understood", seq: 1 },
      { id: "approval:5", phase: "write", state: "running", label: "Preparing the test email", seq: 5 },
      { id: "approval:5:draft", phase: "write", state: "running", label: "Writing", seq: 6 },
    ];
    expect(linesOf({ phases: lines, steps: [] }).map((l) => l.id)).toEqual(["understand"]);
    // Only an approved action's lines: nothing of the run's own is dropped, and there is a row when there are none.
    expect(linesOf({ phases: lines.slice(1), steps: [] })).toEqual([]);
  });
});

describe("what a failed send offers next", () => {
  const ev = (type: "approval" | "result", payload: Record<string, unknown>, seq: number) => ({
    ...payload, id: seq, runId: "r", seq, type, at: "2026-10-15T10:00:00.000Z",
  });
  const settled = (action: string, result: Record<string, unknown>, detail: Record<string, unknown> = {}): Approval => {
    const base = { conversationId: "c", turns: [{ ...newTurn("t", "x"), runId: "r", status: "working" as const }], owners: { r: "t" }, orphans: {}, applied: {}, loading: false, error: null };
    let s = applyEvent(base, ev("approval", { action: { action, ...detail }, summary: "x", campaignName: "Senior Backend", people: [] }, 1));
    s = applyEvent(s, ev("result", { approvalSeq: 1, decision: "approve", action, ...result }, 2));
    return s.turns[0]!.approvals[0]!;
  };

  it("keeps only the steps that mend a refused send, with the link out to where it is fixed", () => {
    const a = settled("send_email", {
      summary: `The email to Ana Rao didn't go: ${OFF.replace(/\.$/, "")}.`, counts: { sent: 0, failed: 1 },
      next: [
        { label: "Open Google Cloud", href: PAGE },
        { label: "Try again", text: "Send the failed emails again" },
        { label: "Start outreach", text: "Contact the shortlist for Senior Backend" },
      ],
    }, { campaignId: "c1" });
    const o = outcomeModel(a)!;
    expect(o.tone).toBe("failed");
    expect(o.next.map((s) => s.label)).toEqual(["Open Google Cloud", "Try again"]);
    const markup = html(<OutcomeBody outcome={o} />);
    expect(markup).toContain(`href="${PAGE}" target="_blank"`);
    expect(markup).toContain(">Try again</button>");
  });

  it("offers 'Send the email' under a lookup that found an address, and not under one that found none", () => {
    const found = outcomeModel(settled("fetch_contacts", {
      summary: "Got 2 emails.", counts: { asked: 2, emails: 2 },
      next: [{ label: "Send the email", text: "Email them" }, { label: "Start outreach", text: "Contact the shortlist for Senior Backend" }],
    }, { campaignId: "c1" }))!;
    expect(found.next.map((s) => s.label)).toEqual(["Send the email", "Start outreach"]);
    const none = outcomeModel(settled("fetch_contacts", {
      summary: "No email found.", counts: { asked: 2, emails: 0 },
      next: [{ label: "Send the email", text: "Email them" }, { label: "Start outreach", text: "Contact the shortlist for Senior Backend" }, { label: "Find more people", text: "Find more" }],
    }, { campaignId: "c1" }))!;
    expect(none.next.map((s) => s.label)).toEqual(["Find more people"]);
  });
});

describe("an email that did not go, in Outreach", () => {
  const item = (error: string | null, status: Item["message"]["status"] = "failed", outcome: Item["message"]["outcome"] = null): Item => ({
    thread: { id: "t", campaignCandidateId: "cc", stage: "shortlisted", candidate: { id: "c", name: "Ana Rao", title: null, company: null, primaryEmail: "ana@example.com" }, messages: [] },
    message: { id: "m", direction: "out", subject: "Hi", body: "Hi", status, scheduledFor: null, sentAt: null, error, outcome, createdAt: "2026-10-15T10:00:00Z" },
  });

  it("says the plain reason, where it is fixed, and offers Try again", () => {
    const row = html(<FailedRow item={item(OFF)} onRetry={() => undefined} />);
    expect(text(row)).toContain("Ana Rao");
    expect(text(row)).toContain("has to enable the Gmail API");
    expect(row).toContain(`href="${PAGE}"`);
    expect(row).toContain(">Try again</button>");
  });

  it("always says it didn't send, and says the plain default when no reason was kept, with Try again", () => {
    const bare = html(<FailedRow item={item(null)} onRetry={() => undefined} />);
    expect(text(bare)).toContain("Didn't send");
    expect(text(bare)).toContain("It didn't go out.");
    expect(bare).toContain(">Try again</button>");
    // An empty reason is no reason either.
    expect(text(html(<FailedRow item={item("  ")} onRetry={() => undefined} />))).toContain("It didn't go out.");
    // A reason that was kept is never replaced by the default.
    expect(text(html(<FailedRow item={item(OFF)} onRetry={() => undefined} />))).not.toContain("It didn't go out.");
  });

  it("says what is happening while it is sent again, and why when that is refused too", () => {
    expect(html(<FailedRow item={item(OFF)} busy="Sending again" onRetry={() => undefined} />)).not.toContain("<button");
    const again = html(<FailedRow item={item(OFF)} note="Gmail is busy right now. Try again in a moment." onRetry={() => undefined} />);
    expect(again).toContain('role="alert"');
    expect(text(again)).toContain("Gmail is busy right now");
  });

  it("offers no Try again for a bounce someone logged: it did go, and came back", () => {
    expect(out.canRetry(item("bounced", "failed", "bounced").message)).toBe(false);
    expect(out.canRetry(item(null, "sent").message)).toBe(false);
    expect(out.canRetry(item(OFF).message)).toBe(true);
    expect(html(<FailedRow item={item("bounced", "failed", "bounced")} onRetry={() => undefined} />)).not.toContain("<button");
  });
});
