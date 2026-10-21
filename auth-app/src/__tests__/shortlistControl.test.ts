import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { controlState, stagesFrom, withOverlay } from "../shortlistControl";

describe("the Candidates page's shortlist control", () => {
  const row = (id: string, campaigns: Array<{ id: string; name: string; stage: string; step?: string | null }>) => ({ id, campaigns });

  it("says Shortlist for someone rejected everywhere, with no count and nothing ticked", () => {
    const stages = stagesFrom([row("p1", [{ id: "c1", name: "A", stage: "passed" }, { id: "c2", name: "B", stage: "passed" }])], {});
    expect(controlState(["c1", "c2"], stages.p1 ?? {})).toEqual({ label: "Shortlist", live: [], rejected: ["c1", "c2"], count: 0, active: false });
  });

  it("ticks only the campaigns they are on and not rejected on, and counts only those", () => {
    const stages = stagesFrom([row("p", [
      { id: "c1", name: "A", stage: "passed" },
      { id: "c2", name: "B", stage: "passed" },
      { id: "c3", name: "C", stage: "outreach", step: "waiting" },
      { id: "c4", name: "D", stage: "shortlisted" },
    ])], {});
    expect(controlState(["c1", "c2", "c3", "c4"], stages.p ?? {})).toEqual({
      label: "Shortlisted", live: ["c3", "c4"], rejected: ["c1", "c2"], count: 2, active: true,
    });
  });

  it("names no stage: past the shortlist reads Shortlisted too, whatever the stage", () => {
    const at = (stage: string, step?: string) => controlState(["c1"], stagesFrom([row("a", [{ id: "c1", name: "A", stage, step }])], {}).a ?? {});
    for (const [stage, step] of [["outreach"], ["outreach", "replied"], ["interviewing"], ["hired"], ["shortlisted"]] as const) {
      expect(at(stage, step)).toMatchObject({ label: "Shortlisted", count: 1, active: true });
    }
    const two = stagesFrom([row("b", [{ id: "c1", name: "A", stage: "shortlisted" }, { id: "c2", name: "B", stage: "interviewing" }])], {});
    expect(controlState(["c1", "c2"], two.b ?? {})).toMatchObject({ label: "Shortlisted", count: 2 });
  });

  it("is Shortlist for someone on no campaign", () => {
    expect(controlState([], {})).toEqual({ label: "Shortlist", live: [], rejected: [], count: 0, active: false });
  });

  it("treats a campaign it has no stage for (a change just made on the page) as the first stage", () => {
    expect(controlState(["new"], {})).toMatchObject({ label: "Shortlisted", live: ["new"] });
  });

  it("reads the list over a profile opened earlier, which is older after a rejection; a profile is for someone the list lacks", () => {
    const detail = { detail: { campaigns: [{ id: "c1", name: "A", campaignCandidateId: "x", stage: "shortlisted" }] } };
    expect(stagesFrom([row("p", [{ id: "c1", name: "A", stage: "passed" }])], { p: detail }).p).toEqual({ c1: "passed" });
    expect(stagesFrom([], { q: detail }).q).toEqual({ c1: "shortlisted" });
  });

  it("lays what was just done on the page over the list: a rejected person ticked again is shortlisted, removed is gone", () => {
    const stages = stagesFrom([row("p", [{ id: "c1", name: "A", stage: "passed" }, { id: "c2", name: "B", stage: "outreach" }])], {});
    const next = withOverlay(stages, { p: { c1: "shortlisted", c2: null, c3: "shortlisted" } });
    expect(next.p).toEqual({ c1: "shortlisted", c3: "shortlisted" });
    expect(stages.p).toEqual({ c1: "passed", c2: "outreach" });
  });

  it("draws no stage word or colour in the control or its menu, only Shortlist, Shortlisted and a tick per campaign", () => {
    const code = readFileSync(join(__dirname, "..", "Contacts.tsx"), "utf8");
    const control = code.slice(code.indexOf("function ShortlistControl"), code.indexOf("/* ── popover ──"));
    expect(control).not.toMatch(/statusProps|wasPassed|stageLabel|Passed|ct-menu-tag st/);
    // The one stage word the menu says, quietly and in plain text: a campaign they were rejected from.
    expect(control.match(/Rejected</g)).toHaveLength(1);
    expect(control).toContain('ct-menu-tag is-quiet">Rejected');
    expect(control).toContain("Shortlist for campaign");
    expect(control).toContain('role="menuitemcheckbox"');
  });
});

describe("Candidates is the whole organisation's people", () => {
  const code = readFileSync(join(__dirname, "..", "Contacts.tsx"), "utf8");

  it("always opens on all campaigns, never on the one filtered last time", () => {
    expect(code).toContain('const [camp, setCamp] = useState<string>("all");');
    expect(code).not.toContain("useState<string>(start.camp)");
  });

  it("asks which campaign a press shortlists for when there is more than one to choose from", () => {
    expect(code).toContain("const manyCampaigns = pickableNow.length > 1;");
    expect(code).toContain("onClick={() => (active || manyCampaigns || !suggest ? setMenu(true) : onPick(suggest))}");
  });
});
