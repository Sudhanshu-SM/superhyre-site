import { describe, expect, it } from "vitest";
import type { ApiActivity, ApiBoardRow, ApiCampaign, ApiOverview } from "../api/campaigns";
import { createBodyFrom, logLine, movedOnBoard, personFromBoard, reachOf, rowFromApi, shiftFunnel } from "../api/campaigns";
import type { ApiClientDetail, ApiClientRow } from "../api/clients";
import { clientBody, clientFromApi } from "../api/clients";
import type { ApiHome } from "../api/home";
import { weekFromHome } from "../api/home";
import { hitsOf } from "../api/search";
import type { ApiTask } from "../api/tasks";
import { dayTask, daysUntil } from "../api/tasks";
import { rowFromDraft, blankDraft } from "../campaignDraft";
import { defaultCampaign } from "../workspaces";

/**
 * The adapters between the API's shapes and the console's. Every figure on
 * screen in live mode passes through one of these, so each is pinned to a
 * response shaped exactly like the server's (checked against the local API).
 */

const NOW = Date.parse("2026-10-04T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();

const campaign = (over: Partial<ApiCampaign> = {}): ApiCampaign => ({
  id: "c1", name: "Senior Backend", status: "active", department: "Engineering", location: "Bengaluru",
  priority: "normal", visibility: "team", client: { id: "cl1", name: "Acme" },
  owner: { id: "u1", name: "Asha Rao" },
  team: [{ id: "u1", name: "Asha Rao", role: "owner" }, { id: "u2", name: "Vik Shah", role: "member" }],
  funnel: { shortlisted: 4, outreach: 3, interviewing: 2, hired: 1, passed: 5 },
  hired: 1, target: 3, agents: 2, openedAt: ago(9000), closedAt: null, createdAt: ago(3 * 1440), updatedAt: ago(12),
  ...over,
});

const overview = (over: Partial<ApiOverview> = {}): ApiOverview => ({
  campaign: { id: "c1", name: "Senior Backend", status: "active" },
  found: { thisWeek: 9, lastWeek: 4, total: 40 },
  kept: { thisWeek: 3, lastWeek: 5, total: 15 },
  funnel: [
    { stage: "found", count: 40, pct: null }, { stage: "shortlisted", count: 15, pct: 38 },
    { stage: "outreach", count: 10, pct: 67 }, { stage: "replied", count: 4, pct: 40 },
    { stage: "interviewing", count: 3, pct: 75 }, { stage: "hired", count: 1, pct: 33 },
  ],
  repliedPct: 40, hired: 1, target: 3,
  sourcedPerDay: Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(21 + i).padStart(2, "0")}`, count: i % 3 })),
  needsYou: [{ kind: "agent", title: "Reply to Rohan", count: 2, dueAt: null }],
  yourWork: null, hires: null, activity: [],
  ...over,
});

const board = (over: Partial<ApiBoardRow> = {}): ApiBoardRow => ({
  campaignCandidateId: "cc1", candidateId: "cand1", personId: "p1", fullName: "Meera Iyer",
  currentTitle: "Backend Engineer", currentCompanyName: "Razorpay", city: "Bengaluru",
  linkedinUrl: "https://www.linkedin.com/in/meera", stage: "outreach", step: "replied", ownerId: "u2",
  source: "manual", fit: null, tier: null, addedAt: ago(9 * 1440), yearsOfExperience: null, skills: [],
  daysInStage: 2, lastActivityAt: ago(60), hasEmail: true, hasPhone: false,
  ...over,
});

describe("rowFromApi", () => {
  it("maps the list's headcounts and leaves the overview's figures loading", () => {
    const r = rowFromApi(campaign(), undefined, NOW);
    expect(r.funnel).toEqual({ sourced: 0, shortlisted: 4, contacted: 5, replied: 0, interviews: 2, hired: 1 });
    expect(r.loading).toBe(true);
    expect(r.trend).toEqual([]);
    expect(r.owner).toBe("Asha Rao");
    expect(r.team).toEqual(["Asha Rao", "Vik Shah"]);
    expect(r.updatedAgo).toBe("12m ago");
    expect(r.createdAgo).toBe("3d ago");
    expect(r.agents).toHaveLength(2);
    expect(r.needs).toBeUndefined();
  });

  it("takes found, the fortnight, replies and what needs a person from the overview", () => {
    const r = rowFromApi(campaign(), overview(), NOW);
    expect(r.loading).toBeUndefined();
    expect(r.funnel.sourced).toBe(40);
    expect(r.funnel.replied).toBe(4);
    expect(r.trend).toHaveLength(14);
    expect(r.needs).toBe("Reply to Rohan (2)");
  });

  it("keeps the owner on the team even when the team list leaves them out", () => {
    const r = rowFromApi(campaign({ team: [{ id: "u2", name: "Vik Shah", role: "member" }] }), undefined, NOW);
    expect(r.team).toEqual(["Asha Rao", "Vik Shah"]);
  });

  it("names an unowned campaign plainly", () => {
    expect(rowFromApi(campaign({ owner: null, team: [] }), undefined, NOW).owner).toBe("Unassigned");
  });
});

describe("createBodyFrom", () => {
  it("turns the form's row into the create body, with people as ids", () => {
    const d = { ...blankDraft("Asha Rao"), name: "Platform SRE", recruiters: ["Vik Shah", "Nobody Known"], locations: ["Pune"], clientId: "cl1" };
    const row = rowFromDraft(d, ["Asha Rao", "Vik Shah", "Nobody Known"]);
    const ids: Record<string, string> = { "Asha Rao": "u1", "Vik Shah": "u2" };
    const body = createBodyFrom(row, (n) => ids[n]);
    expect(body).toMatchObject({ name: "Platform SRE", clientId: "cl1", target: 1, ownerId: "u1", memberIds: ["u2"], location: "Pune" });
    // A campaign is on from the start: the body does not carry a status.
    expect(body).not.toHaveProperty("status");
    expect(body.setup).not.toHaveProperty("clientId");
    expect(body.setup).not.toHaveProperty("priority");
    expect(body.setup.locations).toEqual(["Pune"]);
  });

  it("leaves out an owner it can't name", () => {
    const row = rowFromDraft({ ...blankDraft("Someone"), name: "Design Lead" }, ["Someone"]);
    const body = createBodyFrom(row, () => undefined);
    expect(body).not.toHaveProperty("ownerId");
    expect(body.clientId).toBeNull();
  });
});

describe("the campaign a live console opens on", () => {
  const row = (id: string, minutesAgo: number, over: Partial<ApiCampaign> = {}) => rowFromApi(campaign({ id, updatedAt: ago(minutesAgo), ...over }), undefined, NOW);
  const all = () => true;

  it("is the most recently updated active campaign", () => {
    const rows = [row("old", 90), row("closed", 1, { status: "closed" }), row("new", 5)];
    expect(defaultCampaign(rows, all)?.id).toBe("new");
  });
  it("skips campaigns the person can't open, and falls back to any they can", () => {
    const rows = [row("theirs", 1), row("mine", 60, { status: "closed" })];
    expect(defaultCampaign(rows, (r) => r.id !== "theirs")?.id).toBe("mine");
  });
  it("is nothing when there are no campaigns", () => {
    expect(defaultCampaign([], all)).toBeUndefined();
  });
});

describe("the board", () => {
  it("makes a pipeline person addressed by the campaign candidate", () => {
    const p = personFromBoard(board(), "c1", (id) => (id === "u2" ? "Vik Shah" : "Unassigned"), NOW);
    expect(p).toMatchObject({
      id: "cc1", candidateId: "cand1", name: "Meera Iyer", stage: "outreach", step: "replied", inStage: 2,
      owner: "Vik Shah", source: "Added by hand", fit: null, linkedin: "www.linkedin.com/in/meera", last: "Replied",
      reach: { email: true, phone: false }, skills: [], years: 0,
    });
  });

  it("dates the shortlist from when they were added, not from their last move", () => {
    expect(personFromBoard(board(), "c1", () => "", NOW).capturedAgo).toBe(9);
    expect(personFromBoard(board({ addedAt: new Date(NOW).toISOString() }), "c1", () => "", NOW).capturedAgo).toBe(0);
  });

  it("carries years and skills when the profile has them", () => {
    const p = personFromBoard(board({ yearsOfExperience: 6.5, skills: ["Go", "Postgres"] }), "c1", () => "", NOW);
    expect(p.years).toBe(6.5);
    expect(p.skills).toEqual(["Go", "Postgres"]);
  });

  it("moves a person to the front of their new stage with its first step and a fresh clock", () => {
    const rows = [board({ campaignCandidateId: "a", stage: "shortlisted", step: null }), board({ campaignCandidateId: "b" })];
    const out = movedOnBoard(rows, "b", "interviewing");
    expect(out.map((r) => r.campaignCandidateId)).toEqual(["b", "a"]);
    expect(out[0]).toMatchObject({ stage: "interviewing", step: "loop", daysInStage: 0 });
    expect(movedOnBoard(rows, "zzz", "hired")).toEqual(rows);
  });

  it("shifts the list's headcounts one at a time and never below zero", () => {
    const c = shiftFunnel(campaign(), "interviewing", "hired");
    expect(c.funnel.interviewing).toBe(1);
    expect(c.funnel.hired).toBe(2);
    expect(c.hired).toBe(2);
    expect(shiftFunnel(campaign({ funnel: { shortlisted: 0, outreach: 0, interviewing: 0, hired: 0, passed: 0 } }), "shortlisted", "passed").funnel.shortlisted).toBe(0);
  });

  it("reads the overview's funnel as how far people got", () => {
    expect(reachOf(overview())).toEqual({ found: 40, shortlisted: 15, outreach: 10, replied: 4, interviewing: 3, hired: 1, target: 3 });
    expect(reachOf(overview({ target: 0 })).target).toBe(1);
  });
});

describe("logLine", () => {
  const act = (over: Partial<ApiActivity>): ApiActivity => ({
    id: "1", subjectKind: "candidate", subjectId: "cand1", subjectName: "Meera Iyer", verb: "moved",
    actorKind: "user", actorId: "u1", actorName: "Asha Rao", data: {}, at: ago(30), ...over,
  });
  const ids = (id: string) => (id === "cand1" ? "cc1" : undefined);

  it("says a move in the board's own words, and You for the signed-in person", () => {
    const l = logLine(act({ data: { from: "outreach", to: "interviewing" } }), "u1", ids, NOW);
    expect(l).toMatchObject({ actor: "You", verb: "moved", from: "In outreach", to: "Interviewing", kind: "move", at: 30, person: { id: "cc1", name: "Meera Iyer" } });
  });

  it("marks a hire, credits the agent, and names other people", () => {
    expect(logLine(act({ data: { to: "hired" } }), "u9", ids, NOW)).toMatchObject({ kind: "hire", actor: "Asha Rao" });
    expect(logLine(act({ verb: "shortlisted", actorKind: "agent", actorId: null, actorName: null }), "u1", ids, NOW))
      .toMatchObject({ who: "agent", kind: "agent", actor: "Agent", to: "Shortlisted" });
  });

  it("has a line for every verb the server writes", () => {
    const say = (over: Partial<ApiActivity>) => {
      const l = logLine(act(over), "u9", ids, NOW);
      return l ? [l.actor, l.verb, l.person?.name, l.detail].filter(Boolean).join(" ") : null;
    };
    const cases: Array<[Partial<ApiActivity>, string]> = [
      [{ verb: "added" }, "Asha Rao added Meera Iyer"],
      [{ verb: "updated", data: { step: "offer" } }, "Asha Rao made an offer to Meera Iyer"],
      [{ verb: "outreach_drafted" }, "Asha Rao drafted an email to Meera Iyer"],
      [{ verb: "outreach_edited" }, "Asha Rao edited the email to Meera Iyer"],
      [{ verb: "outreach_approved" }, "Asha Rao approved the email to Meera Iyer"],
      [{ verb: "outreach_cancelled" }, "Asha Rao cancelled the email to Meera Iyer"],
      [{ verb: "outreach_sent", data: {} }, "Asha Rao emailed Meera Iyer"],
      [{ verb: "outreach_sent", data: { followUp: true } }, "Asha Rao followed up with Meera Iyer"],
      [{ verb: "outreach_failed" }, "Asha Rao couldn't send the email to Meera Iyer"],
      [{ verb: "outreach_logged", data: { outcome: "replied" } }, "Asha Rao logged a reply from Meera Iyer"],
      [{ verb: "outreach_logged", data: { outcome: "bounced" } }, "Asha Rao logged a bounced email to Meera Iyer"],
      [{ subjectKind: "campaign", verb: "updated" }, "Asha Rao edited the campaign"],
      [{ subjectKind: "campaign", verb: "spec_drafted", data: { version: 2 } }, "Asha Rao drafted the role spec (version 2)"],
      [{ subjectKind: "campaign", verb: "spec_approved", data: { version: 2 } }, "Asha Rao approved the role spec (version 2)"],
      [{ subjectKind: "campaign", verb: "exported", data: { kind: "shortlist", format: "csv", rowCount: 7 } }, "Asha Rao exported the shortlist 7 people, CSV"],
      [{ subjectKind: "campaign", verb: "watch_started" }, "Asha Rao started keep-sourcing"],
      [{ subjectKind: "campaign", verb: "watch_stopped" }, "Asha Rao stopped keep-sourcing"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "form_created" }, "Asha Rao created the form Screening"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "form_published" }, "Asha Rao published the form Screening"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "form_closed" }, "Asha Rao closed the form Screening"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "applicant_added" }, "Asha Rao added an applicant from Screening"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "applicant_passed" }, "Asha Rao rejected an applicant from Screening"],
      [{ subjectKind: "form", subjectName: "Screening", verb: "response_received", actorKind: "system" }, "Someone applied through Screening"],
      [{ subjectKind: "task", subjectName: "Call Meera", verb: "created" }, "Asha Rao added a task Call Meera"],
      [{ subjectKind: "task", subjectName: "Call Meera", verb: "completed" }, "Asha Rao finished a task Call Meera"],
    ];
    for (const [over, text] of cases) expect(say(over), String(over.verb)).toBe(text);
  });

  it("leaves out bookkeeping that isn't worth a line", () => {
    expect(logLine(act({ subjectKind: "form", verb: "form_edited" }), "u1", ids, NOW)).toBeNull();
    expect(logLine(act({ verb: "updated", data: { fit: 3 } }), "u1", ids, NOW)).toBeNull();
    expect(logLine(act({ subjectKind: "campaign", verb: "paused" }), "u1", ids, NOW)).toMatchObject({ verb: "paused the campaign" });
  });
});

describe("clientFromApi", () => {
  const row: ApiClientRow = {
    id: "cl1", name: "Acme Fintech", website: "https://www.acme.in", domain: "acme.in", industry: "Fintech", location: "Bengaluru",
    status: "active", ownerId: "u1", ownerName: "Asha Rao", fee: "18% of CTC", notes: null,
    primaryContact: { name: "Neha K", title: "VP Eng", email: "neha@acme.in", phone: null },
    createdAt: "2026-10-04T08:00:27.516Z", lastActivityAt: "2026-10-04T08:00:27.516Z",
  };

  it("flattens the primary contact from the list row", () => {
    const c = clientFromApi(row);
    expect(c).toMatchObject({ id: "cl1", website: "https://www.acme.in", owner: "Asha Rao", fee: "18% of CTC", notes: "", manager: "Neha K", email: "neha@acme.in", phone: "", createdAt: "2026-10-04" });
    expect(c.contacts).toHaveLength(1);
  });

  it("uses every contact, notes and the log from the detail, newest first", () => {
    const d: ApiClientDetail = {
      client: row,
      contacts: [
        { id: "k1", name: "Neha K", title: null, email: "neha@acme.in", phone: null, primary: false },
        { id: "k2", name: "Karthik", title: "Talent", email: null, phone: "+91 98450 11223", primary: true },
      ],
      notes: [{ id: "n1", body: "Likes ledgers", authorName: "Asha Rao", createdAt: "2026-10-04T09:00:00Z" }],
      activity: [
        { id: "2", verb: "contact_added", data: { name: "Karthik" }, at: "2026-10-04T08:30:00Z", actorName: "Asha Rao" },
        { id: "3", verb: "noted", data: {}, at: "2026-10-04T09:00:00Z", actorName: "Asha Rao" },
        { id: "1", verb: "created", data: {}, at: "2026-10-04T08:00:00Z", actorName: "Asha Rao" },
      ],
    };
    const c = clientFromApi(row, d);
    expect(c.manager).toBe("Karthik");
    expect(c.contacts?.map((x) => x.id)).toEqual(["k1", "k2"]);
    expect(c.history?.map((e) => e.text)).toEqual(["Likes ledgers", "Added Karthik as a contact", "Added as a client"]);
    expect(c.history?.[0]?.note).toBe(true);
  });

  it("keeps the full website address, and falls back to the domain only when there is none", () => {
    expect(clientBody(clientFromApi(row)).website).toBe("https://www.acme.in");
    expect(clientFromApi({ ...row, website: null }).website).toBe("acme.in");
  });

  it("sends empty fields as null", () => {
    expect(clientBody(clientFromApi({ ...row, industry: null, fee: null }))).toEqual({
      name: "Acme Fintech", website: "https://www.acme.in", industry: null, location: "Bengaluru", status: "active", fee: null, notes: null,
    });
  });
});

describe("the week on Home", () => {
  const home: ApiHome = {
    days: 7,
    found: { current: 12, previous: 15, series: [{ day: "2026-10-04", count: 3 }] },
    replies: { current: 5, previous: 2 }, interviews: { current: 1, previous: 1 }, offers: { current: 0, previous: 0 },
    hires: { current: 1, previous: 0, hired: 2, target: 6 },
    tasks: { dueToday: 1, upcoming: 0, open: 2 }, campaigns: [],
  };

  it("shows growth only when there was some", () => {
    const cells = weekFromHome(home);
    expect(cells.map((c) => [c.key, c.n, c.up])).toEqual([["hires", 2, undefined], ["replies", 5, 3], ["iv", 1, undefined], ["found", 12, undefined]]);
    expect(cells[0]?.note).toBe("of 6 planned");
    expect(cells[3]?.spark).toEqual([3]);
  });
});

describe("tasks", () => {
  const task = (over: Partial<ApiTask>): ApiTask => ({
    id: "t1", title: "Call Asha", kind: "manual", status: "todo", dueAt: null, assigneeId: "u1",
    campaign: { id: "c1", name: "Senior Backend" }, candidate: null, action: null, createdAt: ago(10), resolvedAt: null, ...over,
  });

  it("counts calendar days, not 24-hour spans", () => {
    const evening = new Date(2026, 9, 4, 22, 0).getTime();
    expect(daysUntil(new Date(2026, 9, 5, 8, 0).toISOString(), evening)).toBe(1);
    expect(daysUntil(new Date(2026, 9, 4, 6, 0).toISOString(), evening)).toBe(0);
    expect(daysUntil(new Date(2026, 9, 1, 6, 0).toISOString(), evening)).toBe(-3);
  });

  it("keeps an undated task undated and treats dismissed as finished", () => {
    expect(dayTask(task({}), NOW)).toMatchObject({ dueInDays: null, campaign: "Senior Backend", campaignId: "c1", state: "todo" });
    expect(dayTask(task({ status: "dismissed", campaign: null }), NOW)).toMatchObject({ state: "done", campaign: null });
  });
});

describe("quick find", () => {
  it("lists each kind under its own name, clients only when sent", () => {
    const hits = hitsOf({
      campaigns: [{ id: "c1", name: "Senior Backend", status: "active", clientName: "Acme" }],
      candidates: [{ id: "p1", fullName: "Asha Rao", currentTitle: "SRE", currentCompanyName: null, city: null }],
      forms: [{ id: "f1", name: "Screening", status: "live", campaignId: "c1", campaignName: "Senior Backend" }],
      tasks: [{ id: "t1", title: "Call Asha", status: "todo", dueAt: null, campaignId: null }],
      conversations: [],
    });
    expect(hits.map((h) => [h.label, h.group])).toEqual([
      ["Senior Backend", "Campaign, Acme"], ["Asha Rao", "Candidate, SRE"], ["Screening", "Form, Senior Backend"], ["Call Asha", "Task"],
    ]);
    expect(hits[2]?.to).toEqual({ kind: "campaign", id: "c1", page: "forms" });
  });
});
