import { beforeEach, describe, expect, it } from "vitest";
import type { Call, PipelinePerson } from "../campaign";
import { callsFor, pipelineFor } from "../campaign";
import { CAMPAIGN_ROWS, TEAM } from "../campaignsData";
import { campaignRow, resetCampaignRows, setCampaignStatus, setCampaignTeam } from "../campaignStore";
import { can } from "../can";
import type { Capability } from "../can";
import type { Role } from "../roleStore";
import { DEFAULT_SESSION, canOpenCampaign, getSession, isAssigned, normaliseTeam, setSession, visibleCampaigns } from "../roleStore";
import { upLine, yourWork } from "../yourWork";

/**
 * Roles: what each one may do, which campaigns each one sees, and the
 * recruiter's own figures on a campaign.
 */

const ADMIN_ONLY: Capability[] = ["campaign.assign", "campaign.close", "campaign.complete", "contact.delete"];

describe("can(role, action)", () => {
  it("lets an admin do everything", () => {
    for (const a of [...ADMIN_ONLY, "campaign.create", "campaign.work"] as Capability[]) expect(can("admin", a)).toBe(true);
  });
  it("keeps admin-only actions from a recruiter", () => {
    for (const a of ADMIN_ONLY) expect(can("recruiter", a)).toBe(false);
  });
  it("leaves day-to-day work open to a recruiter, and opening a campaign of their own", () => {
    expect(can("recruiter", "campaign.work")).toBe(true);
    expect(can("recruiter", "campaign.create")).toBe(true);
  });
});

describe("assignment filtering", () => {
  const rows = [
    { id: "a", owner: "Punith S", team: ["Punith S", "Riya K"] },
    { id: "b", owner: "Sudhanshu M", team: ["Sudhanshu M"] },
    { id: "c", owner: "Arnab J", team: ["Arnab J", "Punith S"] },
  ];

  it("counts the owner and the team as assigned", () => {
    expect(isAssigned(rows[0]!, "Riya K")).toBe(true);
    expect(isAssigned(rows[1]!, "Riya K")).toBe(false);
    expect(isAssigned({ id: "x", owner: "Riya K", team: [] }, "Riya K")).toBe(true);
  });

  it("shows an admin every campaign, in order", () => {
    expect(visibleCampaigns(rows, { role: "admin", name: "Riya K" }).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("shows a recruiter only the campaigns they are on, in order", () => {
    expect(visibleCampaigns(rows, { role: "recruiter", name: "Punith S" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(visibleCampaigns(rows, { role: "recruiter", name: "Sudhanshu M" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("gives every fixture recruiter at least one campaign, and nobody all of them", () => {
    for (const name of TEAM) {
      const n = visibleCampaigns(CAMPAIGN_ROWS, { role: "recruiter", name }).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(CAMPAIGN_ROWS.length);
    }
  });

  it("lets a recruiter open only assigned campaigns; an unknown id is not blocked", () => {
    const s = { role: "recruiter" as Role, name: "Riya K" };
    expect(canOpenCampaign(rows[0], s)).toBe(true);
    expect(canOpenCampaign(rows[1], s)).toBe(false);
    expect(canOpenCampaign(rows[1], { role: "admin", name: "Riya K" })).toBe(true);
    expect(canOpenCampaign(undefined, s)).toBe(true);
  });

  it("normalises a picked team: owner first, members only, no repeats", () => {
    expect(normaliseTeam("Riya K", ["Punith S", "Riya K", "Nobody", "Punith S", "Arnab J"])).toEqual(["Riya K", "Punith S", "Arnab J"]);
    expect(normaliseTeam("Riya K", [])).toEqual(["Riya K"]);
  });
});

describe("the session and the campaign store", () => {
  beforeEach(() => { setSession(DEFAULT_SESSION); resetCampaignRows(); });

  it("defaults to the admin", () => {
    expect(getSession().role).toBe("admin");
  });

  it("switches role and person", () => {
    setSession({ role: "recruiter" });
    setSession({ name: "Riya K" });
    expect(getSession()).toEqual({ role: "recruiter", name: "Riya K" });
  });

  it("assigning a recruiter puts the campaign in their view", () => {
    const s = { role: "recruiter" as Role, name: "Riya K" };
    expect(canOpenCampaign(campaignRow("backend-snr"), s)).toBe(false);
    setCampaignTeam("backend-snr", normaliseTeam("Punith S", ["Riya K"]));
    expect(campaignRow("backend-snr")!.team).toEqual(["Punith S", "Riya K"]);
    expect(canOpenCampaign(campaignRow("backend-snr"), s)).toBe(true);
  });

  it("closes, stopping the agents, and reopens", () => {
    setCampaignStatus("design-lead", "closed");
    expect(campaignRow("design-lead")).toMatchObject({ status: "closed", agents: [] });
    setCampaignStatus("design-lead", "active");
    expect(campaignRow("design-lead")!.status).toBe("active");
  });
});

/* ── your work on this campaign ── */

const person = (id: string, over: Partial<PipelinePerson>): PipelinePerson =>
  ({ id, name: `P ${id}`, owner: "Riya K", stage: "shortlisted", step: null, inStage: 1, ...over }) as PipelinePerson;
const call = (by: string, daysAgo: number): Call => ({ id: `${by}-${daysAgo}-${Math.random()}`, by, at: daysAgo * 1440, outcome: "connected", duration: 60 } as Call);

describe("yourWork", () => {
  const people = [
    person("1", { stage: "shortlisted" }),
    person("2", { stage: "outreach", step: "waiting", inStage: 2 }),
    person("3", { stage: "outreach", step: "replied" }),
    person("4", { stage: "interviewing", step: "loop", inStage: 3 }),
    person("5", { stage: "hired", inStage: 10 }),
    person("6", { stage: "passed" }),
    person("7", { stage: "interviewing", step: "loop", owner: "Punith S" }),
  ];

  it("counts only what the recruiter owns or did", () => {
    const w = yourWork(people, [call("Riya K", 1), call("Punith S", 1)], [], "Riya K");
    expect(w.reachedOut).toBe(5);        // 2, 3, 4, 5 and 6 (passed people were contacted)
    expect(w.calls).toBe(1);
    expect(w.moved).toBe(2);             // 4 and 5
    expect(w.replied).toBe(3);           // 3, 4 and 5
    expect(w.hires.map((p) => p.id)).toEqual(["5"]);
  });

  it("counts this session's forward moves as theirs, once", () => {
    const moves = [{ person: { id: "3", stage: "outreach" as const }, to: "interviewing" as const }, { person: { id: "4", stage: "outreach" as const }, to: "interviewing" as const }];
    expect(yourWork(people, [], moves, "Riya K").moved).toBe(3);
  });

  it("matches the campaign's own data for a fixture recruiter", () => {
    const ps = pipelineFor("backend-snr"), cs = callsFor("backend-snr");
    const w = yourWork(ps, cs, [], "Punith S");
    expect(w.calls).toBe(cs.filter((c) => c.by === "Punith S").length);
    expect(w.hires.every((p) => p.owner === "Punith S" && p.stage === "hired")).toBe(true);
  });

  it("compares to last week only when it went up", () => {
    const up = yourWork(people, [call("Riya K", 1), call("Riya K", 2), call("Riya K", 9)], [], "Riya K");
    expect(up.up).not.toBeNull();
    const flat = yourWork([], [call("Riya K", 1), call("Riya K", 9)], [], "Riya K");
    expect(flat.up).toBeNull();
    expect(upLine(null)).toBeNull();
    expect(upLine({ what: "calls", by: 1 })).toBe("1 more than last week");
    expect(upLine({ what: "moved", by: 2 })).toBe("2 more than last week");
  });
});
