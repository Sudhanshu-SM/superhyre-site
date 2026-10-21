import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Wind-down, in the dialogs: what rejecting or hiring leaves loose, the rest of a campaign, a member's work, closing a
 * campaign's forms, and the client's page once the role has closed.
 */

const { calls } = vi.hoisted(() => ({ calls: [] as { method: string; path: string; body: unknown }[] }));
vi.mock("../api/client", () => ({
  LIVE: false,
  API_URL: "http://api.test",
  api: async (method: string, path: string, body?: unknown) => { calls.push({ method, path, body }); return {}; },
}));

const { looseEnds, passOpenPreview, removalPreview } = await import("../api/windDown");
const { setCampaignStatus, passOpen } = await import("../api/campaigns");
const { TiedBlock, LooseEndsNote } = await import("../TiedBlock");
const { Screen, CLOSED_LINE } = await import("../ReviewPage");
const { REVIEW_FIXTURE } = await import("../reviewFixture");
const w = await import("../windDown");

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("what the console asks", () => {
  it("asks the server for each preview at the paths it serves them", async () => {
    calls.length = 0;
    await passOpenPreview("c1");
    await looseEnds("c1", ["a", "b"], "passed");
    await looseEnds("c1", ["a"], "hired");
    await removalPreview("u9");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v1/campaigns/c1/pass-open/preview",
      "GET /v1/campaigns/c1/loose-ends?ids=a%2Cb&to=passed",
      "GET /v1/campaigns/c1/loose-ends?ids=a&to=hired",
      "GET /v1/members/u9/removal-preview",
    ]);
  });

  it("sends the reason with 'reject the rest', and closeForms only when it was asked for", async () => {
    calls.length = 0;
    await passOpen("c1", "Role filled");
    await passOpen("c1");
    await setCampaignStatus("c1", "closed", true);
    await setCampaignStatus("c1", "closed");
    expect(calls.map((c) => c.body)).toEqual([{ reason: "Role filled" }, {}, { status: "closed", closeForms: true }, { status: "closed" }]);
  });
});

describe("the words", () => {
  const ends = { counts: { total: 5, reminders: 2, meetings: 1, tasks: 2 } };
  it("uses the server's summary, else builds the same sentence from the counts", () => {
    expect(w.tiedLine({ ...ends, summary: "2 reminders, 1 interview and 2 tasks are tied to these people and will be cancelled or closed." })).toBe("2 reminders, 1 interview and 2 tasks are tied to these people and will be cancelled or closed.");
    expect(w.tiedLine(ends)).toBe("2 reminders, 1 interview and 2 tasks are tied to these people and will be cancelled or closed.");
    expect(w.tiedLine({ counts: { total: 1, meetings: 1 } })).toBe("1 interview is tied to this person and will be cancelled or closed.");
    expect(w.tiedLine({ counts: { total: 0 } })).toBe("");
    expect(w.tiedLine(null)).toBe("");
  });

  it("says nothing when there is nothing tied", () => {
    expect(w.hasLooseEnds(ends)).toBe(true);
    expect(w.hasLooseEnds({ counts: { total: 0 } })).toBe(false);
    expect(w.hasLooseEnds({})).toBe(false);
    expect(w.hasLooseEnds(null)).toBe(false);
    expect(w.tiedCounts({ meetings: [{}, {}], tasks: [{}] })).toMatchObject({ meetings: 2, tasks: 1, total: 3 });
  });

  it("lists what is tied with who it is about and when, in IST", () => {
    const rows = w.tiedRows({ meetings: [{ id: "m1", title: "Tech round", person: "Priya Nair", at: "2026-10-21T04:30:00Z" }], tasks: [{ title: null, person: "Rahul" }], reminders: [{ title: "Call back" }] });
    expect(rows.map((r) => [r.kind, r.title, r.person])).toEqual([["interview", "Tech round", "Priya Nair"], ["reminder", "Call back", ""], ["task", "Task", "Rahul"]]);
    expect(rows[0]!.when).toMatch(/Wed, 21 Oct.*10:00\s?AM/);
    expect(rows[1]!.when).toBe("");
  });

  it("offers 'Role filled' as the reason unless the server has its own, and names who is rejected", () => {
    expect(w.reasonFor(null)).toBe("Role filled");
    expect(w.reasonFor({ defaultReason: " Position closed " })).toBe("Position closed");
    expect(w.peopleNames({ people: [{ name: "Ravi" }, "Meera", { name: " " }, { id: "x" }] })).toEqual(["Ravi", "Meera"]);
  });

  it("always says where a removed member's work goes, even when they own nothing", () => {
    expect(w.handoverLine({ holdings: { openTasks: 2, reminders: 1 } }, "Asha")).toBe("Their 2 open tasks and 1 reminder go to Asha. Choose someone else:");
    expect(w.handoverLine({ holdings: { campaigns: 2, candidates: 5, openTasks: 1, reminders: 3 } }, "Asha")).toBe("Their 2 campaigns, 5 candidates, 1 open task and 3 reminders go to Asha. Choose someone else:");
    expect(w.handoverLine({ holdings: { campaigns: 0, openTasks: 0 } }, "Asha")).toBe("They have no work to hand over. Anything else of theirs goes to Asha. Choose someone else:");
    expect(w.handoverLine(null, "Asha")).toContain("goes to Asha");
    expect(w.teamNames({ teams: [{ name: "Tech" }, "Sales", { name: "" }] })).toEqual(["Tech", "Sales"]);
  });
});

describe("the block in a dialog", () => {
  it("holds its place with ghosts while the server answers, and draws nothing for none or for no answer", () => {
    const loading = renderToStaticMarkup(<TiedBlock loading data={null} />);
    expect(loading).toContain('class="tb"');
    expect(loading).toContain("shm");
    expect(renderToStaticMarkup(<TiedBlock loading={false} data={null} />)).toBe("");
    expect(renderToStaticMarkup(<TiedBlock loading={false} data={{ counts: { total: 0 } }} />)).toBe("");
  });

  it("says the summary and offers the list", () => {
    const html = renderToStaticMarkup(<TiedBlock loading={false} data={{ counts: { total: 2, tasks: 1, meetings: 1 }, meetings: [{ title: "Tech round", person: "Priya" }], tasks: [{ title: "Send offer" }] }} />);
    expect(html).toContain("1 interview and 1 task are tied to these people and will be cancelled or closed.");
    expect(html).toContain("See the list");
  });

  it("asks nothing without a server, and nothing for nobody", () => {
    expect(renderToStaticMarkup(<LooseEndsNote on campaignId="c1" ccIds={["a"]} to="passed" />)).toBe("");
    expect(renderToStaticMarkup(<LooseEndsNote on={false} campaignId="c1" ccIds={["a"]} to="hired" />)).toBe("");
  });
});

describe("where it is wired", () => {
  it("shows what is tied in the reject-with-reason dialog (one person or several) and in the hire confirm", () => {
    expect(src("PassReason.tsx")).toContain("{tied}");
    const ws = src("CampaignWorkspace.tsx");
    expect(ws.match(/<LooseEndsNote on=\{!!passing\}/g)).toHaveLength(2);
    expect(src("HiredConfirm.tsx")).toContain('<LooseEndsNote on campaignId={ask.campaignId} ccIds={[ask.ccId]} to="hired" />');
  });

  it("makes 'Reject the rest' show the summary, an expandable list and a reason offered as 'Role filled', then send it", () => {
    const bar = src("FilledBar.tsx");
    expect(bar).toContain("passOpenPreview(resolveId(campaignId))");
    expect(bar).toContain("<Guard><TiedBlock loading={loading} data={data} one={count === 1} /></Guard>");
    expect(bar).toContain("setReason(reasonFor(data))");
    expect(bar).toContain("passOpenPeople(campaignId, reason)");
    expect(src("campaignStore.ts")).toContain("campaignsApi.passOpen(id, reason)");
  });

  it("shows where a removed member's work goes, always, with the picker defaulting to the server's choice, and the teams they leave", () => {
    const t = src("TeamsPeople.tsx");
    const dlg = t.slice(t.indexOf("function RemoveDialog("));
    expect(dlg).toContain("removalPreview(member!.userId)");
    expect(dlg).toContain("setTo(data?.reassignTo?.id ?? me)");
    expect(dlg).toContain("handoverLine(data,");
    expect(dlg).toContain("They will leave");
    expect(dlg).not.toContain("ownsWork");
    expect(dlg).toContain("onConfirm={() => { if (member) onRemove(member, to); }}");
  });

  it("offers 'Also close its forms' wherever a campaign is closed, off until chosen", () => {
    const d = src("CloseDialog.tsx");
    expect(d).toContain("Also close its forms");
    expect(d).toContain("useState(false)");
    for (const f of ["CampaignWorkspace.tsx", "CampaignsPage.tsx", "FilledBar.tsx"]) expect(src(f), f).toContain("<CloseDialog");
    expect(src("CampaignWorkspace.tsx")).toContain("setCampaignStatus(ctx.campaignId, to, { closeForms })");
  });
});

describe("the client's page once the role has closed", () => {
  const closed = { ...REVIEW_FIXTURE, campaign: { ...REVIEW_FIXTURE.campaign, closed: true } };
  const send = () => Promise.resolve();

  it("thanks them, takes no more answers, and hides Approve and Not for us", () => {
    const html = renderToStaticMarkup(<Screen review={closed} send={send} />);
    expect(html).toContain("This role has closed. Thank you.");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain("Not for us");
    expect(html).not.toContain("Add a note");
    expect(html).toContain("Meera Iyer");
  });

  it("still tells back an answer already given, with no way to change it", () => {
    const answered = { ...closed, candidates: closed.candidates.map((c, i) => (i === 0 ? { ...c, verdict: { verdict: "approved" as const, note: "Lovely.", at: "2026-10-18T10:00:00Z" } } : c)) };
    const html = renderToStaticMarkup(<Screen review={answered} send={send} />);
    expect(html).toContain("You approved this person.");
    expect(html).toContain("Lovely.");
    expect(html).not.toContain(">Change<");
  });

  it("is calm when it closed with nobody left to look at, and an open role is unchanged", () => {
    const html = renderToStaticMarkup(<Screen review={{ ...closed, candidates: [] }} send={send} />);
    expect(html).toContain(CLOSED_LINE);
    expect(html).not.toMatch(/error|wrong|sorry/i);
    expect(renderToStaticMarkup(<Screen review={REVIEW_FIXTURE} send={send} />)).toContain(">Approve<");
  });
});

describe("a bad shape never takes the page down", () => {
  it("reads people, lists and counts that arrive as numbers or objects without throwing", () => {
    const odd = { people: 3, meetings: { n: 1 }, reminders: 2, sends: "x", tasks: null, counts: "many", teams: 4, holdings: [] } as never;
    expect(() => w.peopleNames(odd)).not.toThrow();
    expect(w.peopleNames(odd)).toEqual([]);
    expect(w.peopleCount(odd)).toBe(3);
    expect(w.tiedRows(odd)).toEqual([]);
    expect(w.tiedLine(odd)).toBe("");
    expect(w.hasLooseEnds(odd)).toBe(false);
    expect(w.teamNames(odd)).toEqual([]);
    expect(w.handoverLine(odd, "Asha")).toContain("goes to Asha");
    expect(w.reasonFor({ defaultReason: 5 } as never)).toBe("Role filled");
    expect(renderToStaticMarkup(<TiedBlock loading={false} data={odd} />)).toBe("");
  });

  it("counts people from the count, the list or a bare number, in that order", () => {
    expect(w.peopleCount({ peopleCount: 4, people: [{ name: "A" }] } as never)).toBe(4);
    expect(w.peopleCount({ people: [{ name: "A" }, { name: "B" }] })).toBe(2);
    expect(w.peopleCount({ people: 5 })).toBe(5);
    expect(w.peopleCount({})).toBeNull();
    expect(w.peopleNames({ people: [{ id: "1", name: "Ravi", stage: "outreach" }] })).toEqual(["Ravi"]);
  });

  it("leaves a block out, and carries on, when it cannot be drawn", async () => {
    const { Guard } = await import("../Guard");
    expect(Guard.getDerivedStateFromError()).toEqual({ failed: true });
    const g = new Guard({ children: "block", fallback: "plain" });
    expect(g.render()).toBe("block");
    g.state = { failed: true };
    expect(g.render()).toBe("plain");
    const none = new Guard({ children: "block" });
    none.state = { failed: true };
    expect(none.render()).toBeNull();
    for (const f of ["TiedBlock.tsx", "FilledBar.tsx", "TeamsPeople.tsx"]) expect(src(f), f).toContain("<Guard");
  });
});

describe("the list under one person's name", () => {
  it("does not repeat that person on every row, and names them when there are several", () => {
    const x = { meetings: [{ title: "Tech round", person: "Priya", at: "2026-10-21T04:30:00Z" }], tasks: [{ title: "Send offer", person: "Priya" }] };
    expect(w.tiedRows(x, { withPerson: false }).map((r) => r.person)).toEqual(["", ""]);
    expect(w.tiedRows(x).map((r) => r.person)).toEqual(["Priya", "Priya"]);
    expect(src("TiedBlock.tsx")).toContain("one={ccIds.length === 1}");
    expect(src("FilledBar.tsx")).toContain("one={count === 1}");
  });
});
