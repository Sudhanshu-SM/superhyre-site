import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ownCampaign, rowFromDraft, blankDraft } from "../campaignDraft";
import { createBodyFrom } from "../api/campaigns";
import { can } from "../can";

const root = resolve(__dirname, "..");
const src = (f: string) => readFileSync(resolve(root, f), "utf8");

/**
 * A recruiter opens campaigns of their own: theirs alone (they own it, nobody else is on it until an admin adds
 * them), for a client they can already see or a company they name (the server adds it with the campaign: every
 * campaign has a client). Who owns it, who is on it and the Clients page stay an admin's.
 */
describe("what a recruiter may do about a campaign", () => {
  it("opens one, and nothing that is a manager's about it", () => {
    expect(can("recruiter", "campaign.create")).toBe(true);
    expect(can("recruiter", "campaign.assign")).toBe(false);
    expect(can("recruiter", "campaign.manage")).toBe(false);
    expect(can("recruiter", "client.manage")).toBe(false);
  });

  it("is told to ask an admin to create one nowhere any more", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (n === "__tests__") return [];
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    for (const file of walk(root)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/Only admins can set up campaigns|Ask an admin to create it/);
    }
  });

  it("shows the New campaign button on the list to everyone who may open one, and Duplicate to managers only", () => {
    const page = src("CampaignsPage.tsx");
    expect(page).toContain('const mayCreate = can(standingOf(session), "campaign.create");');
    expect(page).toContain('const manages = can(standingOf(session), "campaign.manage");');
    expect(page).toMatch(/\{mayCreate && \(\s*<button type="button" className="cg-new"/);
    expect(page).toContain("admin={manages}");
  });

  it("draws neither the owner nor the team for a recruiter, and gives them the add by name, not the client's details", () => {
    const dialog = src("NewCampaign.tsx");
    expect(dialog).toContain('const own = standingOf(session) === "recruiter";');
    expect(dialog).toContain('const mayAddClient = can(standingOf(session), "client.manage");');
    // Everyone is offered "Add a new client"; an admin gets the form with the details, anyone else the company's name.
    expect(dialog).not.toContain("{mayAdd && <option");
    expect(dialog).toContain('<option value="+">Add a new client…</option>');
    expect(dialog).toMatch(/\) : !mayAdd \? \(\s*<ClientNameAdd/);
    expect(dialog).toMatch(/\{own \? \(\s*<Field label="Owner" hint="You own it/);
    // What is sent for a recruiter is put back to theirs, whatever a kept draft said.
    expect(dialog).toContain("const draft = own ? ownCampaign(d, me) : d;");
  });

  it("is not sent to the chat's refusal, and asked the new-campaign questions like anyone", () => {
    expect(src("liveViews/NewCampaign.tsx")).not.toMatch(/Refusal|role !== "admin"/);
    expect(src("ClientMoments.tsx")).not.toContain("CAMPAIGN_REFUSAL");
    expect(src("clarify.ts")).toContain('can(standingOf(getSession()), "campaign.create") ? newCampaignQuestion');
  });

  it("names the company, and is not given the client's details, when they set a campaign's client", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toContain('const detailed = useCan("client.manage");');
    expect(page).toContain("<ClientNameAdd");
    // The tab to add one is for everyone now; it is the form inside it that is the admin's.
    expect(page).not.toContain("{mayAdd && <button");
  });
});

describe("a recruiter's campaign on the wire", () => {
  const idOf = (n: string) => ({ "Riya K": "u-riya", "Asha Admin": "u-asha" })[n];

  it("names them as the owner and nobody else, even from a draft that named a team", () => {
    const d = { ...blankDraft("Asha Admin"), name: "DevOps Engineer", recruiters: ["Riya K"], visibility: "team" as const };
    const row = rowFromDraft(ownCampaign(d, "Riya K"), ["Riya K", "Asha Admin"], 1);
    expect(row.owner).toBe("Riya K");
    expect(row.team).toEqual(["Riya K"]);
    const body = JSON.parse(JSON.stringify(createBodyFrom(row, idOf))) as ReturnType<typeof createBodyFrom>;
    expect(body).toMatchObject({ name: "DevOps Engineer", ownerId: "u-riya", memberIds: [] });
  });
});
