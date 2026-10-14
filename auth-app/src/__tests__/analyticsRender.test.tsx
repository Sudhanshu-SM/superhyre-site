import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CampaignsBody,
  EmptyBlock,
  MineBody,
  OutreachBody,
  OverviewBody,
  PipelineBody,
  TeamBody,
} from "../AnalyticsPages";
import { callsFixture, campaignsFixture, outreachFixture, overviewFixture, pipelineFixture, recruitersFixture } from "../analyticsFixtures";
import { DEFAULT_FILTERS, type Filters } from "../analyticsFilters";
import { emptyCopy, toRatio } from "../analyticsView";
import type { CampaignStats, Envelope, PersonRow } from "../api/analytics";

const f: Filters = DEFAULT_FILTERS;
const quiet: Filters = { ...DEFAULT_FILTERS, period: { kind: "days", days: 7 } };
const art = (html: string) => (html.match(/class="ea"/g) ?? []).length;
const ghosts = (html: string, kind?: string) =>
  (html.match(new RegExp(`data-ghost="${kind ?? "[a-z]+"}"`, "g")) ?? []).length;
const empty = <T extends Envelope>(d: T, reason: Envelope["emptyReason"]): T => ({ ...d, empty: true, emptyReason: reason });
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (html: string, cls: string) => (html.match(new RegExp(`class="${cls}[ "]`, "g")) ?? []).length;
/** The funnel's rows as [label, count, share] in the order drawn. */
const funnel = (html: string) =>
  [...html.matchAll(/<li[^>]*><span class="anc-hb-l"><span class="an-cut">([^<]+)<\/span>.*?<span class="anc-hb-n">([^<]*)(?:<span class="anc-hb-share">([^<]*)<\/span>)?<\/span><\/li>/g)]
    .map((m) => [m[1], m[2], m[3] ?? null] as const);
/** What a page must not carry any more: chips, icons, rings, rainbows, sparkles, mini charts, gauges. */
const decoration = /an-chip|an-tile|anc-ring|anc-mf|anc-ds|anc-wb|anc-ln|an-pc\b|an-cc\b|tn-(found|short|reach|replied|int|hired|passed)|<svg/;

describe("Overview", () => {
  it("is three figures, the funnel as bars, and a short table of the weeks, and nothing else", () => {
    const html = renderToStaticMarkup(<OverviewBody data={overviewFixture(f)} filters={f} />);
    for (const label of ["Hires", "Moved to interview", "Replies"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(count(html, "an-kpis")).toBe(1);
    expect((html.match(/<dt>/g) ?? []).length).toBe(3);
    // the figure, then what it is out of and how it moved, once, in plain words
    expect(html).toContain("<dd>3</dd>");
    expect(words(html)).toContain("of 8 planned · 2 more than before");
    // the funnel: six plain bars, the hired one orange and no other
    expect(count(html, "anc-hb")).toBe(1);
    expect(funnel(html)).toHaveLength(6);
    expect((html.match(/class="is-accent"/g) ?? []).length).toBe(1);
    // the weeks as a table, the latest first, and the rest behind a link
    expect(words(html)).toContain("By week");
    expect(words(html)).toContain("Week of");
    expect(words(html)).toContain("(so far)");
    expect(words(html)).toContain("Details");
    expect(words(html)).toContain("CSV");
    // no decoration, no picture, no ghost, no worth-a-look on the page itself
    expect(html).not.toMatch(decoration);
    expect(art(html)).toBe(0);
    expect(ghosts(html)).toBe(0);
    expect(words(html)).not.toContain("Worth a look");
    expect(html).not.toMatch(/class="[^"]*(vz-chip|vz-dot|status-pill|donut)/);
  });

  it("prints every funnel step's share as that step's count over the one before it, whatever the API's own rates say", () => {
    const o = overviewFixture(f);
    o.funnel.steps = [
      { id: "found", label: "Found", n: 591 },
      { id: "shortlisted", label: "On the shortlist", n: 223 },
      { id: "contacted", label: "Contacted", n: 103 },
      { id: "replied", label: "Replied", n: 37 },
      { id: "interviewing", label: "Interviewing", n: 23 },
      { id: "hired", label: "Hired", n: 4 },
    ];
    // the API's own rates count other populations (found AND kept; interviewed AND contacted)
    o.funnel.rates = [
      { id: "kept", label: "Kept after search", ...toRatio(140, 591) },
      { id: "reachedOut", label: "Reached out to", ...toRatio(103, 223) },
      { id: "replied", label: "Replied", ...toRatio(37, 103) },
      { id: "interviewing", label: "Moved to interview", ...toRatio(20, 103) },
      { id: "hired", label: "Hired", ...toRatio(4, 23) },
    ];
    const html = renderToStaticMarkup(<OverviewBody data={o} filters={f} />);
    const rows = funnel(html);
    expect(rows.map((r) => r[1])).toEqual(["591", "223", "103", "37", "23", "4"]);
    expect(rows.map((r) => r[2])).toEqual([null, "38%", "46%", "36%", "62%", "17%"]); // not 24% of "kept after search"
    // the API's own figures are kept, for the tooltip, with what they count
    expect(html).toContain("140 of 591");
  });

  it("says nothing to measure yet, once, as a banner over the ghost of the page, instead of a strip of zeros", () => {
    const html = renderToStaticMarkup(<OverviewBody data={empty(overviewFixture(f), "no_campaigns")} filters={f} />);
    expect(words(html)).toContain("Nothing to measure yet");
    expect(words(html)).toContain("Start a campaign and this page fills in as people move through it.");
    expect(html.match(/href="#\/campaigns"/g)?.length).toBe(1); // the one way forward, said once
    expect(art(html)).toBe(1);
    expect(ghosts(html, "bars")).toBe(1);
    expect(ghosts(html, "table")).toBe(1);
    expect(count(html, "an-kpis")).toBe(0); // no strip of dashes over a page with nothing in it
    expect(html).toContain("Shortlist someone and the funnel fills in.");
    expect(html).not.toContain("<dd>0</dd>");
    expect(html).not.toMatch(/No data/i);
  });

  it("says a quiet stretch when campaigns exist and nothing moved, with the ghost of each card", () => {
    const html = renderToStaticMarkup(<OverviewBody data={overviewFixture(quiet)} filters={quiet} />);
    expect(words(html)).toContain("A quiet stretch");
    expect(words(html)).toContain("Nothing moved in the last 7 days.");
    expect(art(html)).toBe(1);
    expect(ghosts(html, "bars")).toBe(1);
  });

  it("offers a longer range, never a create action, when a card is empty but the page is not", () => {
    const o = overviewFixture(quiet);
    const d = { ...o, empty: false, emptyReason: null, tiles: overviewFixture(f).tiles };
    const html = renderToStaticMarkup(<OverviewBody data={d} filters={quiet} />);
    expect(words(html)).toContain("Nothing in the last 7 days.");
    expect(html).toContain("Show 90 days");
    expect(html).toContain("days=90");
    expect(art(html)).toBe(0);
  });
});

describe("Recruiters", () => {
  it("is three figures and one table that sorts: name, emails, replies, calls, interviews, hires", () => {
    const d = recruitersFixture(f, "admin");
    const html = renderToStaticMarkup(<TeamBody data={d} filters={f} />);
    for (const label of ["Emails sent", "Calls placed", "Moved to interview"]) expect(html).toContain(`<dt>${label}</dt>`);
    for (const head of ["Person", "Emails sent", "Replies", "Calls placed", "Moved to interview", "Hires"]) expect(words(html)).toContain(head);
    expect(html).toContain('aria-sort="ascending"'); // by name to begin with
    expect(words(html)).toContain("Team total");
    for (const name of ["Meera Nair", "Dev Menon", "Riya Kapoor", "Arjun Rao"]) expect(words(html)).toContain(name);
    // a row opens the person's drawer; there are no cards and no toggle for them
    expect(html).toContain('class="is-open"');
    expect(html).not.toMatch(decoration);
    expect(words(html)).not.toContain("Cards");
    expect(words(html)).toContain("CSV");
    expect(words(html)).toContain("Details");
    // no rank numbers, medals, or an ordered list of people
    expect(html).not.toMatch(/#\d|rank(ed)?\b(?! )|medal|leaderboard|top performer/i);
    expect(html).not.toContain("<ol");
  });

  it("is a ghost table with one calm line for an admin alone with nothing logged", () => {
    const d = { ...empty(recruitersFixture(f, "admin"), "no_campaigns"), people: [] };
    const html = renderToStaticMarkup(<TeamBody data={d} filters={f} />);
    expect(html).toContain("It&#x27;s just you so far");
    expect(html).toContain("Invite your team");
    expect(art(html)).toBe(1);
    expect(ghosts(html, "table")).toBe(1);
  });

  it("says a quiet stretch once when nobody did anything, and still lists everyone", () => {
    const html = renderToStaticMarkup(<TeamBody data={recruitersFixture(quiet, "admin")} filters={quiet} />);
    expect(words(html)).toContain("No activity in these 7 days");
    expect(art(html)).toBe(1);
    expect(count(html, "an-kpis")).toBe(0); // no strip of zeros
    expect(words(html)).toContain("Meera Nair");
    expect(words(html)).toContain("Dev Menon");
  });

  it("gives a recruiter three figures with a quiet team typical, and the people who have waited longest", () => {
    const html = renderToStaticMarkup(<MineBody data={recruitersFixture(f, "recruiter")} filters={f} standing="recruiter" />);
    for (const label of ["Emails sent", "Calls placed", "Moved to interview"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(words(html)).toMatch(/Team typical \d+/);
    expect(words(html)).toContain("Waiting longest");
    expect(html).not.toMatch(decoration);
    // others are never named
    for (const name of ["Meera Nair", "Dev Menon", "Riya Kapoor", "Punith S"]) expect(html).not.toContain(name);
  });

  it("has no team typical when the API sent none", () => {
    const d = { ...recruitersFixture(f, "recruiter"), typical: null };
    expect(words(renderToStaticMarkup(<MineBody data={d} filters={f} standing="recruiter" />))).not.toMatch(/Team typical \d/);
  });

  it("says, for a recruiter with nothing logged, what to do", () => {
    const html = renderToStaticMarkup(<MineBody data={recruitersFixture(quiet, "recruiter")} filters={quiet} standing="recruiter" />);
    expect(words(html)).toContain("Send an email, place a call or move someone forward and your week shows up here.");
    expect(art(html)).toBe(1);
    expect(ghosts(html)).toBeGreaterThanOrEqual(1);
  });
});

describe("Outreach", () => {
  const server = (role: "admin" | "recruiter" = "admin", f2: Filters = f) => outreachFixture(f2, role);
  /** What an older server sends: emails on one endpoint, calls on another, nothing by channel. */
  const older = () => ({ ...outreachFixture(f), hub: null });
  const body = (o: ReturnType<typeof outreachFixture>, c: ReturnType<typeof callsFixture> | null, channel?: "all" | "email" | "calls" | "whatsapp", f2: Filters = f) =>
    renderToStaticMarkup(<OutreachBody emails={o} calls={c} filters={f2} {...(channel ? { channel } : {})} />);
  const labels = (html: string) => funnel(html).map((r) => r[0]);

  it("All: three figures, the answer rate of each channel, and one table with a column for each channel", () => {
    const html = body(server(), callsFixture(f));
    for (const label of ["Touches sent", "Answered", "Answer rate"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect((html.match(/<dt>/g) ?? []).length).toBe(3);
    // 58 emails and 18 calls; 17 replies and 11 connected: the figures are the sums, with how they moved
    expect(html).toContain("<dd>76</dd>");
    expect(html).toContain("<dd>28</dd>");
    expect(html).toContain("<dd>37%</dd>");
    expect(words(html)).toContain("16 more than before");
    expect(words(html)).toContain("was 33%");
    // the tabs say how many touches each channel sent, WhatsApp none until it is connected
    expect(words(html)).toContain("All 76");
    expect(words(html)).toContain("Email 58");
    expect(words(html)).toContain("Calls 18");
    expect(html).toContain('aria-pressed="true">All');
    expect(html).toMatch(/WhatsApp<\/button>/);
    // the one chart: Email, Calls, WhatsApp, each with n, and WhatsApp says it is not connected
    expect(labels(html)).toEqual(["Email", "Calls", "WhatsApp"]);
    expect(funnel(html).map((r) => r[1])).toEqual(["29%", "61%", "Not connected"]);
    expect(words(html)).toContain("17 of 58 replied");
    expect(words(html)).toContain("11 of 18 connected");
    // the one table: a column for each channel and the answered share; small counts are counts
    for (const head of ["Campaign", "Emails", "Replies", "Calls", "Connected", "WhatsApp", "Answered"]) expect(words(html)).toContain(head);
    expect(words(html)).toContain("Senior Backend Engineers");
    expect(words(html)).toContain("No campaign");
    expect(words(html)).toContain("2 of 4");
    expect(words(html)).toContain("CSV");
    expect(words(html)).toContain("Details");
    expect(html).not.toMatch(decoration);
    expect(art(html)).toBe(0);
    expect(ghosts(html)).toBe(0);
  });

  it("Email: sent, replied and reply rate, the reply rate of each step, and a table by campaign", () => {
    const html = body(server(), callsFixture(f), "email");
    for (const label of ["Sent", "Replied", "Reply rate"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain("<dd>58</dd>");
    expect(html).toContain("<dd>29%</dd>");
    expect(words(html)).toContain("Reply rate by step");
    expect(labels(html)).toEqual(["First email", "Follow-up 1", "Follow-up 2 or later"]);
    expect(funnel(html).map((r) => r[1])).toEqual(["27%", "38%", "1 of 4"]);
    for (const head of ["Campaign", "Sent", "Replied", "Bounced", "Scheduled"]) expect(words(html)).toContain(head);
    expect(words(html)).not.toContain("Connected");
    expect(words(html)).not.toContain("Calls placed");
    expect(html).not.toMatch(decoration);
  });

  it("Calls: placed, connected and connect rate, with talk time and length as muted words, outcomes in reading order", () => {
    const html = body(server(), callsFixture(f), "calls");
    for (const label of ["Placed", "Connected", "Connect rate"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(html).toContain("<dd>61%</dd>");
    expect(words(html)).toContain("Talk time 52 min · Average 4 min 44 s");
    expect(words(html)).toContain("How calls ended");
    expect(labels(html)).toEqual(["Connected", "Call back", "No answer", "Voicemail", "Not interested"]);
    for (const head of ["Campaign", "Placed", "Connected", "Average length"]) expect(words(html)).toContain(head);
    expect(words(html)).not.toContain("Replies");
    expect(html).not.toMatch(decoration);
  });

  it("WhatsApp: one calm line where its results will be, no figures and no zeros", () => {
    const html = body(server(), callsFixture(f), "whatsapp");
    expect(words(html)).toContain("WhatsApp results will appear here once WhatsApp is connected through Magnifi.");
    expect(ghosts(html)).toBe(1);
    expect(count(html, "an-kpis")).toBe(0);
    expect(html).not.toContain("<dd>");
    expect(art(html)).toBe(0);
  });

  it("gives an owner or admin the people, and a recruiter only their own", () => {
    const admin = body(server("admin"), callsFixture(f, "admin"));
    expect(words(admin)).toContain("Person");
    const recruiter = body(server("recruiter"), callsFixture(f, "recruiter"));
    expect(words(recruiter)).not.toContain("Person");
    for (const name of ["Meera Nair", "Dev Menon", "Riya Kapoor"]) expect(recruiter).not.toContain(name);
  });

  it("says no emails and no calls once, with the picture, and the ghost of each card", () => {
    const html = body(server("admin", quiet), callsFixture(quiet), "all", quiet);
    expect(words(html)).toContain("No emails sent in the last 7 days");
    expect(art(html)).toBe(1);
    expect(ghosts(html, "bars")).toBe(1);
    expect(ghosts(html, "table")).toBe(1);
    expect(count(html, "an-kpis")).toBe(0);
    // a tab with nothing says so on its own, without the banner
    const calls = body(server("admin", quiet), callsFixture(quiet), "calls", quiet);
    expect(calls).toContain("No calls yet. Place one and it shows here.");
    expect(art(calls)).toBe(0);
  });

  it("says no replies yet when emails went out and nobody wrote back", () => {
    const o = server();
    const hub = o.hub!;
    const none = { ...o, hub: { ...hub, channels: { ...hub.channels, email: { ...hub.channels.email, replied: 0, reply: toRatio(0, 58) } } } };
    const html = body(none, callsFixture(f), "email");
    expect(words(html)).toContain("No replies yet.");
  });

  it("keeps the emails when the calls are still loading or failed to load, on an older server", () => {
    const loading = body(older(), null, "email");
    expect(words(loading)).toContain("Reply rate by step");
    const failed = renderToStaticMarkup(<OutreachBody emails={older()} calls={null} callsFailed retryCalls={() => {}} filters={f} channel="email" />);
    expect(words(failed)).toContain("Reply rate by step");
    expect(words(failed)).toContain("Try again");
  });

  it("puts the channels together itself for an older server, and says nothing about the period before", () => {
    const html = body(older(), callsFixture(f));
    expect(html).toContain("<dd>76</dd>"); // 58 emails and 18 calls, from the two answers it has
    expect(words(html)).not.toContain("more than before");
    expect(words(html)).not.toContain("was ");
    expect(words(html)).toContain("No campaign");
    expect(words(body(older(), callsFixture(f), "email"))).toContain("Scheduled");
  });

  it("still reads an answer from the oldest server, which has none of the new fields", () => {
    const old = outreachFixture(f);
    const bare = { days: old.days, timeZone: old.timeZone, totals: old.totals, byCampaign: old.byCampaign, byTouch: old.byTouch, byHour: old.byHour, stalls: old.stalls };
    const html = renderToStaticMarkup(<OutreachBody emails={bare} calls={null} filters={f} />);
    expect(html).toContain("<dt>Touches sent</dt>");
    expect(words(html)).toContain("Senior Backend Engineers");
  });
});

describe("Pipeline", () => {
  it("is three figures, a list of the steps with the wait in plain words, and who has waited longest", () => {
    const html = renderToStaticMarkup(<PipelineBody data={pipelineFixture(f)} filters={f} />);
    for (const label of ["In progress", "Waiting longer than usual", "Time to hire"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(words(html)).toContain("Where people are now");
    expect(funnel(html)).toHaveLength(5);
    expect(words(html)).toContain("4 waiting longer than usual"); // plain text, not a chip
    expect(words(html)).toContain("Waiting longest");
    expect(words(html)).toContain("Asha Verma");
    // no orange anywhere on this page's bars, and nothing about conversion (the Overview's)
    expect(html).not.toContain("is-accent");
    expect(words(html)).not.toContain("Where it leaks");
    // sources, offers and forms are behind Details, not on the page
    expect(words(html)).not.toContain("Where people come from");
    expect(words(html)).not.toContain("Application forms");
    expect(html).not.toMatch(decoration);
    expect(ghosts(html)).toBe(0);
  });

  it("says no one is in a pipeline yet, once, over the ghosts", () => {
    const d = empty(pipelineFixture(quiet), "no_campaigns");
    const html = renderToStaticMarkup(<PipelineBody data={{ ...d, stages: [], totals: { inProgress: 0, waiting: 0, hired: 0, passed: 0 }, waitingLongest: [] }} filters={quiet} />);
    expect(words(html)).toContain("No one is in a pipeline yet");
    expect(art(html)).toBe(1);
    expect(ghosts(html, "bars")).toBe(1);
    expect(ghosts(html, "table")).toBe(1);
  });

  it("says time to hire has nothing to measure when there are no hires", () => {
    const d = pipelineFixture(f);
    d.timeToHire = { days: null, n: 0 };
    const html = renderToStaticMarkup(<PipelineBody data={d} filters={f} />);
    expect(words(html)).toContain("Not enough yet");
    expect(words(html)).toContain("no hires yet");
  });

  it("names a peer's person without their owner for a recruiter", () => {
    const d = pipelineFixture(f, "recruiter");
    const html = renderToStaticMarkup(<PipelineBody data={d} filters={f} />);
    expect(words(html)).not.toContain("Meera Nair");
    expect(words(html)).not.toContain("Dev Menon");
  });
});

describe("Campaigns", () => {
  const props = { filters: f, state: "active" as const, setState: () => {} };

  it("is three figures and one table with a thin bar for hired of planned, and when each last moved in plain text", () => {
    const html = renderToStaticMarkup(<CampaignsBody data={campaignsFixture(f)} {...props} />);
    for (const label of ["Active campaigns", "Hired of planned", "Gone quiet"]) expect(html).toContain(`<dt>${label}</dt>`);
    expect(words(html)).toContain("Senior Backend Engineers");
    expect(words(html)).toContain("Razorpay");
    expect(words(html)).toContain("2 of 5");
    expect(count(html, "an-thin")).toBeGreaterThan(0);
    expect(words(html)).toMatch(/Quiet for \d+ days/);
    expect(words(html)).toContain("CSV");
    for (const head of ["Campaign", "Owner", "Hired of planned", "Replied", "Last activity"]) expect(words(html)).toContain(head);
    expect(html).not.toMatch(decoration);
    expect(html).not.toMatch(/class="[^"]*(vz-chip|vz-dot|status-pill)/);
    expect(ghosts(html)).toBe(0);
  });

  it("says no campaigns yet with the banner and the picture once", () => {
    const none = { ...campaignsFixture(f), campaigns: [], clients: [] };
    const html = renderToStaticMarkup(<CampaignsBody data={empty(none, "no_campaigns")} {...props} />);
    expect(words(html)).toContain("No campaigns yet");
    expect(art(html)).toBe(1);
    expect(ghosts(html, "table")).toBe(1);
  });
});

describe("a lot of data", () => {
  const person = (i: number): PersonRow => {
    const p = recruitersFixture(f, "admin").people![0]!;
    return { ...p, userId: `u${i}`, name: `Person number ${i} with a name that goes on and on and on` };
  };
  const camp = (i: number): CampaignStats => ({ ...campaignsFixture(f).campaigns[0]!, campaignId: `c${i}`, name: `Campaign ${i}, with a long name for a long search`, client: `Client ${i}` });
  const rowsOf = (html: string) => (html.match(/<tbody>.*?<\/tbody>/)?.[0].match(/<tr/g) ?? []).length;

  it("shows six people and the rest behind View all", () => {
    for (const n of [3, 12, 60]) {
      const d = { ...recruitersFixture(f, "admin"), people: Array.from({ length: n }, (_, i) => person(i)) };
      const html = renderToStaticMarkup(<TeamBody data={d} filters={f} />);
      expect(rowsOf(html)).toBe(Math.min(6, n));
      if (n > 6) expect(words(html)).toContain(`View all ${n}`);
      else expect(words(html)).not.toContain("View all");
    }
  });

  it("shows six campaigns and the rest behind View all, with the long name whole in its tooltip", () => {
    const props = { filters: f, state: "active" as const, setState: () => {} };
    for (const n of [3, 12, 60]) {
      const d = { ...campaignsFixture(f), campaigns: Array.from({ length: n }, (_, i) => camp(i)) };
      const html = renderToStaticMarkup(<CampaignsBody data={d} {...props} />);
      expect(rowsOf(html)).toBe(Math.min(6, n));
      if (n > 6) expect(words(html)).toContain(`View all ${n}`);
      expect(html).toContain('title="Campaign 0, with a long name for a long search"');
    }
  });

  it("keeps the people who have waited longest to six rows, with the rest behind View all", () => {
    const base = pipelineFixture(f);
    const waitingLongest = Array.from({ length: 60 }, (_, i) => ({ ...base.waitingLongest[0]!, campaignCandidateId: `w${i}`, name: `Candidate ${i}`, days: 60 - i }));
    const html = renderToStaticMarkup(<PipelineBody data={{ ...base, waitingLongest }} filters={f} />);
    expect(words(html)).toContain("View all 60");
    expect(words(html)).toContain("Candidate 0");
    expect(words(html)).not.toContain("Candidate 6");
  });
});

describe("the shared empty block", () => {
  it("is the app's own empty-state markup: title, sentence, one action, the picture once", () => {
    const html = renderToStaticMarkup(<EmptyBlock copy={emptyCopy("overview", "no_campaigns", { days: 30 })} />);
    expect(html).toContain("es is-empty");
    expect(html).toContain('class="es-t t-title-sm"');
    expect(html).toContain('class="ct-btn es-act"');
    expect(art(html)).toBe(1);
  });
});

describe("the pages' source", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");
  it("draws the one picture in one place, and never in a chart", () => {
    expect(read("AnalyticsPages.tsx").match(/<EmptyArt /g)?.length).toBe(1);
    expect(read("AnalyticsCharts.tsx")).not.toContain("EmptyArt");
    expect(read("analyticsKit.tsx")).not.toContain("EmptyArt");
    expect(read("GhostChart.tsx")).not.toContain("EmptyArt");
  });

  it("uses no chart library and no vendor names in what a person reads", () => {
    for (const file of ["AnalyticsPages.tsx", "AnalyticsCharts.tsx", "analyticsKit.tsx", "GhostChart.tsx", "analyticsView.ts"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/from "(recharts|chart\.js|d3|victory|nivo|@visx|echarts)/);
      expect(text, file).not.toMatch(/crust\s?data|apollo|openai|anthropic|supabase|railway|zoho|juicebox/i);
    }
  });

  it("has no icons on the pages, no tone classes and no cheerful copy", () => {
    const pages = read("AnalyticsPages.tsx");
    expect(pages).not.toMatch(/from "@phosphor-icons\/react"/);
    expect(read("AnalyticsCharts.tsx")).not.toMatch(/phosphor/);
    for (const file of ["AnalyticsPages.tsx", "analyticsView.ts", "analyticsKit.tsx"]) {
      expect(read(file), file).not.toMatch(/on a roll|along the way|all calm|nudges|Sparkle|!["`']/i);
    }
  });
});

describe("the page's frame and chrome", () => {
  const css = readFileSync(resolve(__dirname, "..", "analytics.css"), "utf8");
  const dashboard = css.slice(css.indexOf("the dashboard"));

  it("scrolls in the main column when the console locks its frame to a tall window, so a page is never cut off", () => {
    const block = dashboard.match(/@media \(min-height: 1001px\) \{[^}]*\.con-main:has\(> \.an-page\)[^}]*\}/);
    expect(block, "an Analytics page needs its own scroll in the main column above 1000px tall").not.toBeNull();
    expect(block![0]).toContain("overflow-y: auto");
  });

  it("is as tall as its content, never a fixed height, so a short page is short and a long one scrolls", () => {
    expect(dashboard).not.toMatch(/height:\s*calc\(100dvh/);
    expect(dashboard).not.toMatch(/grid-template-rows/);
  });

  it("keeps the chrome of every card the same: 24 px of padding, 24 px between, a hairline border, 16 px corners, no gradients", () => {
    expect(dashboard).toMatch(/--an-gap: 24px/);
    expect(dashboard).toMatch(/\.an-card \{[^}]*padding: 24px[^}]*border-radius: 16px/);
    expect(dashboard).toMatch(/\.an-kpis \{[^}]*padding: 24px[^}]*border-radius: 16px/);
    expect(dashboard).not.toMatch(/gradient\(/);
  });

  it("holds the type to a calm scale: a 24 px title, 14 px card titles, 28 px figures, 13 px for the rest", () => {
    expect(dashboard).toMatch(/\.con-h1 \{[^}]*font-size: 24px/);
    expect(dashboard).toMatch(/\.an-card-h h2 \{[^}]*font: 600 14px\/20px/);
    expect(dashboard).toMatch(/\.an-kpis dd:not\(\.an-muted\) \{[^}]*font: var\(--type-num-lg\)[^}]*tabular-nums/);
    // a card's text is the body-sm step; there is no other size in its table, chart or list
    expect(dashboard).not.toMatch(/\.an-(tbl|facts|look)[^{]*\{[^}]*font: var\(--type-(caption|body|label)\)/);
  });

  it("uses one accent: orange is the hired bar, the hires figures and the thin progress bar, and nothing else", () => {
    const uses = dashboard.match(/var\(--accent-(fill|text)\)/g) ?? [];
    // focus rings are the console's own; the marks are the three below
    const marks = dashboard.match(/(\.anc-hb-track i\.is-accent|\.an-accent|\.an-thin i)[^{]*\{[^}]*var\(--accent-(fill|text)\)/g) ?? [];
    expect(marks.length).toBe(3);
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(dashboard).not.toMatch(/--st-(outreach|replied|interviewing|passed)/);
  });

  it("keeps colour to tokens: no literal colour in the dashboard's styles", () => {
    expect(dashboard.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
  });
});
