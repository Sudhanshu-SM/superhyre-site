import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../agentCards/ApprovalCard";
import { Cards } from "../agentCards/ReadCards";
import type { RunEvent } from "../api/events";
import { hitsOf } from "../api/search";
import { mustHaveOf } from "../campaign";
import type { Question } from "../campaign";
import { chartedCampaigns } from "../chatCards";
import type { ChatCard } from "../api/agent";
import { newQuestion } from "../formKit";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { FormStatusList } from "../Moments";
import { isSent } from "../OverviewPanel";
import { isViewKind, VIEW_KINDS } from "../chatViews";
import { callFromRow, recentCalls } from "../campaignCalls";
import type { CallRow } from "../api/calls";

/* An owner: the connect card is for someone who may connect Slack. */
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));
vi.mock("../specDraft", () => ({ useCampaignSpec: () => ({ ready: true, latest: null, approved: null, drafting: false, failed: false, reload: async () => {} }) }));

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * Owner-built pieces that existed but did not appear where they belong (the 13 Oct coverage pass): each
 * test fails without the wiring it names.
 */

let nextId = 0;
const ev = (type: RunEvent["type"], payload: Record<string, unknown> = {}): RunEvent => ({
  ...payload, id: ++nextId, runId: "r1", seq: nextId, type, at: "2026-10-13T10:00:05.000Z",
});
function approvalFor(action: Record<string, unknown>) {
  const turn = { ...newTurn("t1", "Approve the spec", 0), runId: "r1", status: "working" as const };
  const s: ChatState = { conversationId: "c1", turns: [turn], owners: { r1: "t1" }, orphans: {}, applied: {}, loading: false, error: null };
  return applyEvent(s, ev("approval", { summary: "Approve the requirements for Data Analyst", action, campaignName: "Data Analyst", people: [] })).turns[0]!.approvals[0]!;
}

describe("requirements waiting for a yes can be read first", () => {
  it("offers the spec panel on the approval that asks for it, with the version it asks about", () => {
    const a = approvalFor({ action: "approve_spec", campaignId: "c1", specId: "s1" });
    const html = renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={a} turnSaid="Approve the spec" />);
    // A button that opens the spec in a popup, not a written link; the decision stays on the approval's own Approve.
    expect(html).toContain("View the requirements");
    expect(html).not.toContain("lt-link");
    expect(html).toContain(">Approve</button>");
  });

  it("offers nothing to read when no draft exists yet (it is drafted when approved), and nothing on other approvals", () => {
    const none = approvalFor({ action: "approve_spec", campaignId: "c1" });
    expect(renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={none} turnSaid="x" />)).not.toContain("View the requirements");
    const other = approvalFor({ action: "shortlist", campaignId: "c1" });
    expect(renderToStaticMarkup(<ApprovalCard turnKey="t1" approval={other} turnSaid="x" />)).not.toContain("View the requirements");
  });
});

describe("the campaign's charts and its lookup card are not both counting", () => {
  const lookup: ChatCard = {
    kind: "campaign", key: "campaign:c1", campaignId: "c1", name: "Data Analyst", status: "active", client: null, target: 2, location: null,
    stages: [{ stage: "shortlisted", people: 7 }, { stage: "hired", people: 1 }], spec: { title: "Data Analyst", version: 1 },
    draftWaiting: false, sourcing: null, watches: [],
  };
  const charts: ChatCard = { kind: "view", key: "view:campaign:c1:", view: "campaign", campaignId: "c1", campaignName: "Data Analyst", candidateIds: [], personIds: [], query: null };

  it("names the campaigns whose charts are in the answer", () => {
    expect([...chartedCampaigns([lookup, charts])]).toEqual(["c1"]);
    expect([...chartedCampaigns([lookup])]).toEqual([]);
    expect([...chartedCampaigns([{ ...charts, view: "leak" }])]).toEqual([]);
  });

  it("draws the lookup card's stage counts only when the charts are not there to hold them", () => {
    const alone = renderToStaticMarkup(<Cards cards={[lookup]} charted={chartedCampaigns([lookup])} />);
    expect(alone).toContain("lk-funnel");
    const withCharts = renderToStaticMarkup(<Cards cards={[lookup]} charted={chartedCampaigns([lookup, charts])} />);
    expect(withCharts).not.toContain("lk-funnel");
    // The rest of the card (what the role spec says, the links) stays.
    expect(withCharts).toContain("Requirements v1 approved");
  });
});

describe("a form in the chat's status list has a way into its builder", () => {
  it("shows Open the form beside Open responses, and by itself when nobody has answered", () => {
    const both = renderToStaticMarkup(<FormStatusList rows={[{ id: "f1", name: "Screening", sub: "Live", said: "3 answered", onOpen: () => {}, onBuild: () => {} }]} />);
    expect(both).toContain("Open responses");
    expect(both).toContain("Open the form");
    const quiet = renderToStaticMarkup(<FormStatusList rows={[{ id: "f1", name: "Screening", sub: "Draft", said: "None yet", onBuild: () => {} }]} />);
    expect(quiet).not.toContain("Open responses");
    expect(quiet).toContain("Open the form");
  });
});

describe("the form builder's dropdown is a real single pick", () => {
  it("starts with two options so it can be published", () => {
    expect(newQuestion("dropdown").options).toEqual(["Option 1", "Option 2"]);
    expect(newQuestion("choice").options).toEqual(["Option 1", "Option 2"]);
    expect(newQuestion("short").options).toBeUndefined();
  });

  it("holds a must-have like a choice does", () => {
    const q: Question = { id: "q1", type: "dropdown", title: "Notice period?", required: true, options: ["Immediate", "30 days", "90 days"], accept: ["Immediate", "30 days"] };
    expect(mustHaveOf(q)).toEqual(["Immediate", "30 days"]);
    expect(mustHaveOf({ ...q, accept: undefined, knockout: "90 days" })).toEqual(["Immediate", "30 days"]);
  });

  it("has a place to set the lowest number a number question accepts", () => {
    expect(src("CampaignForms.tsx")).toContain("Lowest answer you would accept");
    expect(mustHaveOf({ id: "q2", type: "number", title: "Years?", required: true, unit: "years", atLeast: 5 })).toEqual(["5+ years"]);
  });
});

describe("a live offer that is out is not 'written, not sent'", () => {
  const person = (last: string) => ({ last }) as Parameters<typeof isSent>[0];
  it("reads the live board's wording as well as the prototype's", () => {
    expect(isSent(person("Offer made"))).toBe(true);
    expect(isSent(person("Offer sent, awaiting reply"))).toBe(true);
    expect(isSent(person("Offer drafted"))).toBe(false);
  });
});

describe("quick find opens the thing it found", () => {
  const results = {
    campaigns: [],
    candidates: [{ id: "p1", fullName: "Asha Rao", currentTitle: "SRE", currentCompanyName: null, city: null }],
    forms: [],
    tasks: [],
    conversations: [{ id: "v1", title: "Backend search", updatedAt: "2026-10-13T10:00:00Z" }],
  };
  it("sends a candidate to their profile and a chat to its thread", () => {
    const hits = hitsOf(results);
    expect(hits.find((h) => h.key === "p-p1")?.to).toEqual({ kind: "candidate", id: "p1" });
    expect(hits.find((h) => h.key === "v-v1")?.to).toEqual({ kind: "chat", id: "v1" });
  });
});

describe("pieces the owner built that were waiting on a wire", () => {
  it("opens a person on a campaign page in the console's profile sheet, with the stage beside it", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toContain("<PersonSheet");
    expect(src("PersonSheet.tsx")).toContain("<ProfileSidebar");
    expect(src("ProfileSidebar.tsx")).toContain("extra?: React.ReactNode");
  });

  it("shows the logo-and-ring loader while the public form loads, and art when it stops mid-way", () => {
    expect(src("ApplyPage.tsx")).toMatch(/busy\s*\?\s*<Loader/);
    expect(src("ApplyForm.tsx")).toMatch(/step\.message[\s\S]{0,120}/);
    expect(src("ApplyForm.tsx")).toMatch(/<EmptyArt name="form-closed" size=\{200\} \/>\s*<p className="ap-closed" role="status">\{step\.message\}/);
  });

  it("keeps a live board's filter to what the board knows", () => {
    expect(src("CampaignWorkspace.tsx")).toMatch(/\{!LIVE && opt\(f\.open, "Open to work"/);
  });

  it("reads an uploaded job description on the server, and does not warm a page the owner removed", () => {
    expect(src("NewCampaign.tsx")).toMatch(/attachmentApi\.read\(f,/);
    expect(src("NewCampaign.tsx")).not.toContain("The agent reads it when the campaign starts.`);\n  };");
    const pages = src("consolePages.tsx");
    expect(pages.slice(pages.indexOf("const ORDER"), pages.indexOf("let preloading"))).not.toContain("loaders.activity");
  });

  it("reads the people on the responses page in the profile once they are on the board", () => {
    expect(src("FormResponses.tsx")).toMatch(/\{person && <button[\s\S]{0,140}setProfile\(true\)[\s\S]{0,120}Open profile/);
  });
});

describe("a campaign's real calls feed the Overview's cards", () => {
  const NOW = Date.parse("2026-10-13T12:00:00Z");
  const row = (over: Partial<CallRow>): CallRow => ({
    id: "k1", at: "2026-10-13T10:00:00Z", durationSeconds: 95, direction: "outbound", outcome: "voicemail", outcomeText: null,
    phone: "+919800000000", candidate: { id: "p1", name: "Asha Rao", title: "SRE", company: "Acme" },
    caller: { id: "u1", name: "Meera Pillai", mine: false }, campaign: { id: "c1", name: "Data Analyst", client: null },
    summary: null, preview: null, summaryState: "none", hasRecording: false, hasTranscript: false, ...over,
  });

  it("reads a row as a call: who, by whom, what came of it, how long ago", () => {
    expect(callFromRow(row({}), "Fn3 Owner", NOW)).toMatchObject({
      id: "k1", person: { id: "p1", name: "Asha Rao", title: "SRE", company: "Acme" }, by: "Meera Pillai", outcome: "voicemail", duration: 95, at: 120,
    });
    expect(callFromRow(row({ caller: { id: "u9", name: "Fn3 Owner", mine: true } }), "Fn3 Owner", NOW)?.by).toBe("Fn3 Owner");
    expect(callFromRow(row({ outcome: "call_back" }), "x", NOW)?.outcome).toBe("scheduled");
    expect(callFromRow(row({ outcome: "no_answer" }), "x", NOW)?.outcome).toBe("no-answer");
  });

  it("leaves out what is not a finished call with a person on it", () => {
    expect(callFromRow(row({ outcome: "in_progress" }), "x", NOW)).toBeNull();
    expect(callFromRow(row({ outcome: "failed" }), "x", NOW)).toBeNull();
    expect(callFromRow(row({ candidate: null }), "x", NOW)).toBeNull();
  });

  it("drops a voicemail that was answered since, and anything older than a fortnight", () => {
    const calls = [
      callFromRow(row({ id: "a", at: "2026-10-10T10:00:00Z" }), "x", NOW)!,
      callFromRow(row({ id: "b", at: "2026-10-12T10:00:00Z", outcome: "connected" }), "x", NOW)!,
      callFromRow(row({ id: "c", at: "2026-10-12T09:00:00Z", candidate: { id: "p2", name: "Ravi K", title: null, company: null } }), "x", NOW)!,
      callFromRow(row({ id: "d", at: "2026-09-01T09:00:00Z", candidate: { id: "p3", name: "Old One", title: null, company: null } }), "x", NOW)!,
    ];
    expect(recentCalls(calls).map((c) => c.id).sort()).toEqual(["b", "c"]);
  });
});

describe("what is coming up is answered in the chat with the list Home shows", () => {
  it("is one of the views the chat draws, and the server's list says so too", () => {
    expect(isViewKind("coming-up")).toBe(true);
    expect(VIEW_KINDS).toHaveLength(20);
  });

  it("draws Home's own rows (the same List, the same feed) narrowed to the campaign the request named", () => {
    const view = src("liveViews/ComingUp.tsx");
    expect(view).toContain('import { List, useNow } from "../ComingUp"');
    expect(view).toContain("{ ...UPCOMING, campaignId }");
    // Narrowed to the request's campaign; "Show everything" widens it in place (no message), and meetings are among the rows.
    expect(view).toContain("const campaignId = everything ? null : card.campaignId;");
    expect(view).toContain("kind: \"reminder\", campaignId: null");
    expect(view).toContain("onClear={() => setEverything(true)}");
    expect(view).not.toContain("ctx.send");
    expect(view).toContain("meetings={meetings}");
    expect(src("liveViews/index.tsx")).toContain('"coming-up": lazy(() => import("./ComingUp"))');
  });
});
