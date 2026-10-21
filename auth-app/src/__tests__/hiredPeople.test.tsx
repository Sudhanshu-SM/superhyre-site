import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rowFromApi } from "../api/campaigns";
import type { ApiCampaign } from "../api/campaigns";
import { pipelineStrip, placeLabel, stagesFrom } from "../boardStages";
import { CAMPAIGN_ROWS } from "../campaignsData";
import { ClosedBar, FilledBar } from "../FilledBar";
import { filledLine, hiresOf, hiresText, listOf, openPeople, removalLine, rolesFilled } from "../hired";
import { effectsOfWrite } from "../invalidate";

/** Hired people: where they were hired, how many roles are filled, and what is offered once they are. */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const at = (stage: string) => ({ stage }) as { stage: "shortlisted" | "outreach" | "interviewing" | "hired" | "passed" };

describe("hired, in words", () => {
  it("counts hires of the target, or just the hires when there is no target", () => {
    expect(hiresText({ count: 2, target: 3 })).toBe("2 of 3 hired");
    expect(hiresText({ count: 2, target: null })).toBe("2 hired");
    expect(hiresOf({ hires: { count: 1, target: 4 }, target: 9 }, [])).toEqual({ count: 1, target: 4 });
    expect(hiresOf({ target: 3 }, [at("hired"), at("hired"), at("outreach")])).toEqual({ count: 2, target: 3 });
    expect(hiresOf(undefined, [at("hired")])).toEqual({ count: 1, target: null });
  });

  it("is filled only with a target that is met, and says so calmly", () => {
    expect(rolesFilled({ count: 3, target: 3 })).toBe(true);
    expect(rolesFilled({ count: 4, target: 3 })).toBe(true);
    expect(rolesFilled({ count: 2, target: 3 })).toBe(false);
    expect(rolesFilled({ count: 5, target: null })).toBe(false);
    expect(rolesFilled({ count: 0, target: 0 })).toBe(false);
    expect(filledLine(3)).toBe("All 3 roles are filled");
    expect(filledLine(1)).toBe("The role is filled");
  });

  it("leaves out the hired and the passed when it counts who is still open", () => {
    expect(openPeople([at("shortlisted"), at("outreach"), at("interviewing"), at("hired"), at("passed")])).toHaveLength(3);
  });
});

describe("the line over the board", () => {
  const board = stagesFrom([]);
  const people = [at("shortlisted"), at("hired"), at("hired"), at("passed")];
  it("says 2 of 3 hired from the campaign's own count, or just 2 hired with no target", () => {
    expect(pipelineStrip(board, people, { count: 2, target: 3 }).line).toBe("3 in the pipeline · 2 of 3 hired");
    expect(pipelineStrip(board, people, { count: 2, target: null }).line).toBe("3 in the pipeline · 2 hired");
    expect(pipelineStrip(board, people, { count: 0, target: null }).line).toBe("3 in the pipeline");
    expect(pipelineStrip(board, people).line).toBe("3 in the pipeline · 2 hired");
  });
});

describe("a hired person is simply not marked on the Candidates page or the boards", () => {
  it("has no Hired chip, no menu text and no 'Hired at' line left anywhere", () => {
    for (const f of ["Contacts.tsx", "CampaignWorkspace.tsx", "shortlistControl.ts", "api/candidates.ts", "api/campaigns.ts", "campaign.ts", "hired.ts"]) {
      const text = src(f);
      expect(text, f).not.toMatch(/hiredElsewhere|hiredAtLine|hiredFrom|hiredOfNow|ct-sl-at|HiredAt\b/);
    }
  });

  it("brings a campaign's hires with its row", () => {
    const c = { id: "c1", name: "X", status: "active", department: null, location: null, priority: "normal", visibility: "team", client: null, owner: null, team: [], funnel: { shortlisted: 0, outreach: 0, interviewing: 0, hired: 2, passed: 0 }, hired: 2, target: 3, agents: 0, openedAt: null, closedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", hires: { count: 2, target: 3 } } as unknown as ApiCampaign;
    expect(rowFromApi(c).hires).toEqual({ count: 2, target: 3 });
    expect(rowFromApi({ ...c, hires: undefined } as ApiCampaign).hires).toBeUndefined();
    expect(src("CampaignsPage.tsx")).toContain("hired={r.hires?.count ?? r.funnel.hired} target={r.hires?.target ?? r.target}");
  });
});

describe("hiring takes someone off other shortlists, and says so first", () => {
  it("names the other campaigns, one or many, and how to undo it", () => {
    expect(listOf(["A"])).toBe("A");
    expect(listOf(["A", "B"])).toBe("A and B");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
    expect(removalLine("Priya", [{ name: "Data Lead" }, { name: "Platform Lead" }])).toBe("Priya will be removed from the shortlists of Data Lead and Platform Lead (2 other campaigns). You can move them back from the board.");
    expect(removalLine("Priya", [{ name: "Data Lead" }])).toBe("Priya will be removed from the shortlist of Data Lead (1 other campaign). You can move them back from the board.");
  });

  it("asks in one dialog mounted over every page, with Cancel and Hire and remove", () => {
    const d = src("HiredConfirm.tsx");
    expect(d).toContain("title={`Hire ${name}?`}");
    expect(d).toContain('confirm="Hire and remove"');
    expect(d).toContain("onClose={cancelHiredAsk}");
    expect(d).toContain("onConfirm={confirmHiredAsk}");
    expect(src("Console.tsx")).toContain("<HiredConfirm />");
  });

  it("is asked on every path that moves someone into Hired, none of which shows the move before the server agrees", () => {
    const store = src("campaignStore.ts");
    expect(store).toContain('if (stage === "hired" && before.stage !== "hired") {');
    expect(store).toContain('err.code === "needs_confirm_hired"');
    const ws = src("CampaignWorkspace.tsx");
    // the board's move, the Overview's person sheet, the Shortlisted page: each hands Hired to the store and shows nothing itself
    expect(ws).toContain('if (kind === "hired" && LIVE) { movePerson(ctx.campaignId, p.id, to, reason); return 0; }');
    expect(ws).toContain('if (!(into === "hired" && LIVE)) toast(moveLine(firstName(p.name), to, stages));');
    expect(ws).toContain('if (s === "hired" && LIVE) { movePerson(ctx.campaignId, p.id, to); return; }');
    expect(ws).toContain('if (kind !== "passed" && !(kind === "hired" && LIVE)) {');
    expect(src("api/campaigns.ts")).toContain("...(removeFromOthers ? { removeFromOthers: true } : {})");
  });
});

describe("when the roles are filled", () => {
  const id = CAMPAIGN_ROWS[0]!.id;
  const target = CAMPAIGN_ROWS[0]!.target;
  const person = (stage: string, n: number) => ({ id: `p${n}`, stage }) as never;
  const filled = [...Array.from({ length: target }, (_, i) => person("hired", i)), person("outreach", 90), person("shortlisted", 91), person("passed", 92)];

  it("shows one calm line with Close campaign and Reject the rest (N), N being who is still open", () => {
    const html = renderToStaticMarkup(<FilledBar campaignId={id} people={filled} />);
    expect(html).toContain(filledLine(target));
    expect(html).toContain(">Close campaign<");
    expect(html).toContain(">Reject the rest (2)<");
  });

  it("says nothing until the target is met, and offers no pass when nobody is open", () => {
    expect(renderToStaticMarkup(<FilledBar campaignId={id} people={[...Array.from({ length: target - 1 }, (_, i) => person("hired", i)), person("outreach", 2)]} />)).toBe("");
    const none = renderToStaticMarkup(<FilledBar campaignId={id} people={filled.filter((p) => (p as { stage: string }).stage === "hired")} />);
    expect(none).toContain(">Close campaign<");
    expect(none).not.toContain("Reject the rest");
  });

  it("never happens by itself: each choice asks first, and uses the existing close and the new pass-open", () => {
    const bar = src("FilledBar.tsx");
    expect(bar).toContain('onClick={() => setAsking("close")}');
    expect(bar).toContain('onClick={() => setAsking("pass")}');
    expect(bar).toContain('setCampaignStatus(campaignId, "closed", { closeForms: forms })');
    expect(bar).toContain("passOpenPeople(campaignId, reason)");
    expect(src("campaignStore.ts")).toContain("campaignsApi.passOpen(id, reason)");
    expect(src("api/campaigns.ts")).toContain('"POST", `/v1/campaigns/${id}/pass-open`');
  });
});

describe("what a hire or a pass leaves stale", () => {
  it("reads the board, the list, Candidates and Home again after the rest are passed", () => {
    const w = effectsOfWrite("POST", "/v1/campaigns/c1/pass-open")!;
    expect(w.campaignId).toBe("c1");
    expect([...w.effects].sort()).toEqual(["campaign", "candidates", "pipeline"]);
  });

  it("is told by the store when someone moves into or out of Hired, and invalidate.ts reads everything again", () => {
    expect(src("campaignStore.ts")).toContain('if (before.stage === "hired" || stage === "hired") hiredChanged();');
    expect(src("invalidate.ts")).toContain('onHiredChange(() => invalidate(["pipeline", "candidates", "campaign"]))');
  });
});

describe("hiring from the person's sheet", () => {
  const ws = src("CampaignWorkspace.tsx");
  it("hands the sheet over before the first-hire dialog opens, and the sheet reads where they are now", () => {
    expect(ws).toContain("setOpenId(null); setFirstHire(hired);");
    expect(ws).toContain("setOpenId(null); setFirstHire(p);");
    expect(src("PersonSheet.tsx")).toContain("refresh={where}");
    expect(src("ProfileSidebar.tsx")).toContain("useWorkspaceRow(c.id, c.inWorkspace === true, fetched + refresh)");
  });

  it("says Hired, not an accepted offer", () => {
    expect(ws).toContain("<p>They are hired and on the Hired list. Well done.</p>");
    expect(ws).not.toContain("Their offer is accepted");
    expect(ws).toContain("hired: (f) => `${f} is hired`,");
  });
});

describe("a closed campaign's Pipeline", () => {
  const closed = CAMPAIGN_ROWS.find((r) => r.status === "closed")!;
  it("says so calmly, with Reopen as a secondary button, and the Close button is the same style", () => {
    const html = renderToStaticMarkup(<ClosedBar campaignId={closed.id} />);
    expect(html).toContain("This campaign is closed.");
    expect(html).toContain('class="cw-btn is-quiet"');
    expect(html).toContain(">Reopen<");
    expect(renderToStaticMarkup(<ClosedBar campaignId={CAMPAIGN_ROWS.find((r) => r.status === "active")!.id} />)).toBe("");
    const bar = src("FilledBar.tsx");
    expect(bar).toContain('className="cw-btn is-quiet" onClick={() => setAsking("close")}>Close campaign');
    expect(bar).not.toContain('className="cw-link"');
  });

  it("is read-only: no dragging, no menus, no Add people, no client link controls, no pass strip, no moving from the sheet", () => {
    const ws = src("CampaignWorkspace.tsx");
    expect(ws).toContain('const closed = row?.status === "closed";');
    expect(ws).toContain("if (readOnly) { onOpen(p.id); return; }");
    expect(ws).toContain("{s.id === addAt && !readOnly && (");
    expect(ws).toContain("menu={readOnly ? undefined : <MoveMenu");
    expect(ws).toContain("mayChange={mayChange && !closed}");
    expect(ws).toMatch(/locked=\{(closed|locked)\}/);
    expect(src("boardStages.css")).toContain(".cw-board.is-readonly .pl-bin { display: none; }");
  });

  it("gives the Overview's Hires card room for what is under the hires, so the list never runs over it", () => {
    expect(src("boardStages.css")).toMatch(/\.hp-body > \.hp-hires:not\(:only-child\) \{ flex: 0 0 auto; min-height: auto; \}/);
  });
});

describe("a person's place, by the campaign's own words", () => {
  const stages = stagesFrom([
    { id: "s", name: "Shortlisted", kind: "shortlisted", position: 0 }, { id: "o", name: "Outreach", kind: "outreach", position: 1 },
    { id: "t", name: "Technical round", kind: "interviewing", position: 2 }, { id: "i", name: "Interviewing", kind: "interviewing", position: 3 },
  ]);
  it("is the stage's own name, and Replied or Offer out only under the default columns", () => {
    expect(placeLabel({ stage: "interviewing", stageId: "t", step: "loop" }, stages)).toBe("Technical round");
    expect(placeLabel({ stage: "interviewing", stageId: "t", step: "offer" }, stages)).toBe("Technical round");
    expect(placeLabel({ stage: "interviewing", stageId: "i", step: "offer" }, stages)).toBe("Offer out");
    expect(placeLabel({ stage: "outreach", stageId: "o", step: "replied" }, stages)).toBe("Replied");
    expect(placeLabel({ stage: "outreach", stageId: "o", step: "waiting" }, stages)).toBe("Outreach");
  });

  it("lists every stage of the campaign in the Shortlisted status menu, moving by stage, and keeps one wording for an offer", () => {
    const ws = src("CampaignWorkspace.tsx");
    const menu = ws.slice(ws.indexOf("function SlStatus("), ws.indexOf("function SlSortMenu("));
    expect(menu).toContain("useCampaignStages(p.campaign)");
    expect(menu).toContain("<StageChoices");
    expect(menu).not.toContain("STATUS_OPTIONS");
    expect(ws).toContain('!stages.some((st) => /offer/i.test(st.name)) && (');
  });
});
