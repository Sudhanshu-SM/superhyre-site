import type { Match } from "../api/agent";
import type { RunEvent } from "../api/events";

/**
 * A scripted chat for looking at the narration and the cards without a server: a full sourcing run (what it
 * reads, searches, enriches, matches and decides, with people scored as it goes) and an approved action that
 * turns into its outcome in place. Shaped like the server's events (docs/agent-framework.md sections 4 to 6),
 * and replayed by `#/agent-preview` and by the tests.
 */

export type Step = { at: number; event: RunEvent };

const CAMPAIGN = "c0000000-0000-4000-8000-000000000001";
const NAMES = [
  ["Asha Verma", "Staff Engineer", "PhonePe", "Bengaluru", 0.93], ["Ravi Kumar", "Senior Backend Engineer", "Razorpay", "Bengaluru", 0.9],
  ["Meera Nair", "Engineering Manager", "Swiggy", "Bengaluru", 0.86], ["Karan Shah", "Backend Engineer", "Zerodha", "Mumbai", 0.8],
  ["Deepa Rao", "Software Engineer II", "Flipkart", "Bengaluru", 0.74], ["Imran Sheikh", "Platform Engineer", "Cred", "Bengaluru", 0.7],
  ["Priya Nambiar", "Senior Engineer", "Meesho", "Remote", 0.66], ["Nikhil Joshi", "Software Engineer", "Postman", "Remote", 0.61],
] as const;

const match = (i: number): Match => {
  const [fullName, currentTitle, currentCompanyName, city, score] = NAMES[i % NAMES.length]!;
  return {
    personId: `p${i + 1}`, fullName, headline: null, currentTitle, currentCompanyName, city, linkedinUrl: null, profileImageUrl: null,
    yearsOfExperience: 5 + (i % 6), source: "ours", stage: "judged", score, tier: score >= 0.85 ? "A" : score >= 0.7 ? "B" : "C",
    knockedOut: null,
    judgement: { verdicts: [], strengths: ["Has run services at this scale"], concerns: [] },
  };
};

type Build = { run: string; seq: number };

/** A sourcing run's events with the time each lands at, in ms from the start. */
export function sourcingRun(chat = "r1", search = "s1", base = 0): { turn: Step[]; said: string } {
  const chatB: Build = { run: chat, seq: 0 };
  const searchB: Build = { run: search, seq: 0 };
  const out: Step[] = [];
  let id = 100;
  const at0 = Date.parse("2026-10-11T10:00:00.000Z");
  const push = (b: Build, t: number, type: RunEvent["type"], payload: Record<string, unknown>) => {
    out.push({ at: base + t, event: { ...payload, id: ++id, type, runId: b.run, seq: ++b.seq, at: new Date(at0 + base + t).toISOString() } });
  };
  const phase = (b: Build, t: number, p: Record<string, unknown>) => push(b, t, "progress", { step: "phase", ...p });

  phase(chatB, 150, { id: "understand", phase: "understand", state: "running", label: "Reading the role spec", detail: "Software Engineer, Remote, 5+ years" });
  phase(chatB, 900, { id: "understand", phase: "understand", state: "done", label: "Read the role spec" });
  push(chatB, 1000, "approval", {
    summary: "Search for 30 more people for Software Engineer",
    action: { action: "find_people", campaignId: CAMPAIGN, size: 30 }, campaignName: "Software Engineer", people: [],
    wontDo: ["It won't contact anyone. People are only listed for you to decide on."],
  });
  push(chatB, 2200, "result", { approvalSeq: chatB.seq, decision: "approve", action: "find_people", campaignId: CAMPAIGN, searchRunId: search, size: 30 });

  // The search's own run.
  push(searchB, 2300, "plan", { step: "search", batch: 1, size: 30 });
  phase(searchB, 2400, { id: "search", phase: "search", state: "running", label: "Looking through our pool of candidates", detail: "Software Engineer, Remote, 5+ years" });
  push(searchB, 3600, "progress", { step: "pool", found: 18 });
  push(searchB, 4800, "progress", { step: "crustdata", found: 12, repeats: 0 });
  phase(searchB, 4900, { id: "search", phase: "search", state: "done", label: "Got 30 candidates", found: 30 });
  phase(searchB, 5000, { id: "enrich", phase: "enrich", state: "running", label: "Getting contact details", done: 0, total: 30 });
  phase(searchB, 6200, { id: "enrich", phase: "enrich", state: "running", label: "Getting contact details", done: 18, total: 30 });
  phase(searchB, 7000, { id: "enrich", phase: "enrich", state: "done", label: "Contact details for 24 of 30", done: 24, total: 30 });
  push(searchB, 7050, "progress", { step: "scoring", people: 30 });
  phase(searchB, 7100, { id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 0, total: 30 });
  for (let i = 0; i < NAMES.length; i++) {
    const m = match(i);
    push(searchB, 7600 + i * 450, "progress", { step: "scored", personId: m.personId, stage: m.stage, tier: m.tier, item: m });
    if (i === 3) phase(searchB, 7600 + i * 450 + 20, { id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 12, total: 30 });
  }
  phase(searchB, 11400, { id: "match", phase: "match", state: "running", label: "Matching candidates to the role", done: 24, total: 30 });
  push(searchB, 12200, "artifact", { kind: "candidate_list", version: 1, campaignId: CAMPAIGN, items: NAMES.map((_, i) => match(i)), stats: { fromPool: 18, fromCrustdata: 12, repeats: 0 } });
  phase(searchB, 12300, { id: "match", phase: "match", state: "done", label: "Matched 30 candidates", done: 30, total: 30 });
  phase(searchB, 12500, { id: "decide", phase: "decide", state: "done", label: "Ready for your call", detail: "2 strong fits, 4 good fits" });
  push(searchB, 12600, "done", {});

  // The answer streams in once the search is under way.
  const said = "Found 30 people for Software Engineer. Two stand out: Asha Verma and Ravi Kumar both run payments services at scale.";
  const words = said.split(" ");
  words.forEach((w, i) => push(chatB, 9000 + i * 90, "message", { delta: `${w} ` }));
  push(chatB, 9000 + words.length * 90 + 100, "message", { text: said, final: true });
  push(chatB, 9000 + words.length * 90 + 200, "done", {});
  return { turn: out.sort((a, b) => a.at - b.at), said };
}

/** An approved action: the card, what it says while it runs, the effect, and the outcome it turns into. */
export function approvedShortlist(run = "r2", base = 0): Step[] {
  const b: Build = { run, seq: 0 };
  const out: Step[] = [];
  let id = 500;
  const at0 = Date.parse("2026-10-11T10:05:00.000Z");
  const push = (t: number, type: RunEvent["type"], payload: Record<string, unknown>) => {
    out.push({ at: base + t, event: { ...payload, id: ++id, type, runId: run, seq: ++b.seq, at: new Date(at0 + base + t).toISOString() } });
  };
  push(100, "progress", { step: "phase", id: "understand", phase: "understand", state: "running", label: "Reading your request" });
  push(700, "progress", { step: "phase", id: "understand", phase: "understand", state: "done", label: "Read your request" });
  push(800, "progress", { step: "phase", id: "decide", phase: "decide", state: "running", label: "Preparing the change" });
  push(1300, "approval", {
    summary: "Add 25 people to the shortlist of Software Engineer",
    action: { action: "shortlist", campaignId: CAMPAIGN },
    capability: "pipeline.shortlist",
    campaignName: "Software Engineer",
    people: NAMES.map(([name, title, company, city]) => ({ name, title, company, city })),
    wontDo: ["It won't contact anyone. People are only put on the shortlist.", "It won't change anyone already in outreach."],
  });
  const asked = b.seq;
  push(1350, "progress", { step: "phase", id: "decide", phase: "decide", state: "done", label: "Change ready for your yes" });
  push(1400, "done", {});
  // The person says yes: the action runs, says what it is doing, commits and says what it changed.
  push(4000, "progress", { step: "phase", id: "act", phase: "write", state: "running", label: "Adding 25 people to the shortlist" });
  push(4900, "progress", { step: "phase", id: "act", phase: "write", state: "done", label: "Added 25", done: 25, total: 25 });
  push(5000, "progress", {
    step: "effect", capability: "pipeline.shortlist", effects: ["pipeline", "candidates", "campaign"], campaignId: CAMPAIGN,
    summary: "Added 25 people to the shortlist of Software Engineer.", counts: { added: 25, alreadyThere: 0 },
  });
  push(5050, "result", {
    approvalSeq: asked, decision: "approve", action: "shortlist", campaignId: CAMPAIGN,
    summary: "Added 25 people to the shortlist of Software Engineer.", counts: { added: 25, alreadyThere: 0, skipped: 0 },
    next: [
      { label: "Open the shortlist", href: `#/campaign/shortlisted?campaign=${CAMPAIGN}` },
      { label: "Start outreach", text: "Start outreach for the Software Engineer shortlist" },
    ],
  });
  return out;
}

/** A connection the agent needs, as it arrives in a turn. */
export function connectCard(run = "r3", provider: "google" | "slack" | "notion" = "google", base = 0): Step[] {
  const at = Date.parse("2026-10-11T10:10:00.000Z");
  const e = (t: number, seq: number, type: RunEvent["type"], payload: Record<string, unknown>): Step => ({
    at: base + t, event: { ...payload, id: 900 + seq, type, runId: run, seq, at: new Date(at + base + t).toISOString() },
  });
  return [
    e(150, 1, "progress", { step: "phase", id: "understand", phase: "understand", state: "done", label: "Read your request" }),
    e(400, 2, "artifact", {
      kind: "connect", key: `connect:${provider}`, provider, url: "https://accounts.example.test/authorise",
      reason: provider === "google" ? "Emails go out from your own Gmail, so this is the one thing to connect before I can send them." : undefined,
    }),
    e(500, 3, "done", {}),
  ];
}
