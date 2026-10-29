import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mayChangeCampaign, mayCloseCampaign } from "../campaignRights";
import type { Session } from "../roleStore";

/**
 * Seeing a campaign is reading it. Every surface that changes one answers to the same flag, the server's `canManage`
 * on the campaign's row, so the Pipeline, the Shortlisted table, a person's sheet, a form, the emails waiting to go and
 * the Campaigns menu agree with each other and with the API (campaign-write-matrix.test.ts there).
 */

const owner: Session = { role: "admin", standing: "owner", name: "Olivia", userId: "u-owner" };
const lead: Session = { role: "admin", standing: "admin", name: "Lena", userId: "u-lead" };
const other: Session = { role: "admin", standing: "admin", name: "Omar", userId: "u-other" };
const member: Session = { role: "recruiter", standing: "recruiter", name: "Mina", userId: "u-member" };
const follower: Session = { role: "recruiter", standing: "recruiter", name: "Faye", userId: "u-follower" };

const row = (canManage: boolean) => ({ id: "c", owner: "Ana", team: ["Ana", "Mina"], ownerId: "u-ana", teamIds: ["u-ana", "u-member"], canManage });

describe("the one answer", () => {
  it("is the server's, for the owner, a team's lead, another team's admin, a recruiter on it and one who follows it", () => {
    const cases: Array<[string, Session, boolean]> = [
      ["owner", owner, true],
      ["lead of its team", lead, true],
      ["admin of another team", other, false],
      ["recruiter on it", member, true],
      ["recruiter who follows it", follower, false],
    ];
    for (const [who, session, may] of cases) {
      expect(mayChangeCampaign(session, row(may)), who).toBe(may);
    }
  });

  it("does not let an admin close or reopen a campaign they do not manage", () => {
    expect(mayCloseCampaign(other, { ...row(false), ownerId: "u-other" })).toBe(false);
    expect(mayCloseCampaign(lead, { ...row(true), ownerId: "u-ana" })).toBe(true);
  });
});

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("the surfaces that change a campaign ask it", () => {
  it("the Pipeline's board and table, and a person's sheet, are locked unless the person may change it", () => {
    const text = source("CampaignWorkspace.tsx");
    expect(text).toMatch(/const locked = closed \|\| !mayChange;/);
    expect(text).toContain("<Board readOnly={locked}");
    expect(text).toContain("<Table readOnly={locked}");
    expect(text).toContain("locked={locked} />");
  });

  it("the Shortlisted table has no status menu, no selection and no bulk actions for someone who only follows", () => {
    const text = source("CampaignWorkspace.tsx");
    expect(text).toContain("<SlStatus p={p} may={mayChange}");
    expect(text).toContain("{mayChange && picked.size > 0 ? (");
    expect(text).toContain("{mayChange && <input type=\"checkbox\" checked={on}");
    expect(text).toContain("{mayChange && <ContactsAllButton");
    expect(text).toContain("{mayChange && <ContactHeadCta");
    expect(text).toContain("if (!may) return <span {...tone}");
  });

  it("the overview's person sheet is locked the same way", () => {
    expect(source("CampaignWorkspace.tsx")).toContain("campaignId={resolveCampaignId(ctx.campaignId)} locked={!mayChange} />");
  });

  it("forms: no new form, no editing, no publishing and no decisions", () => {
    const forms = source("CampaignForms.tsx");
    expect(forms).toContain("{may && <button type=\"button\" className=\"cw-btn is-primary\" onClick={() => setCreating(true)}>");
    expect(forms).toContain("if (!may) return;");
    expect(forms).toContain("{!may ? (");
    expect(forms).toContain("{mode === \"edit\" && may ? (");
    expect(source("FormResponses.tsx")).toContain("const decisions: Decisions | null = LIVE && may ? {");
  });

  it("the emails waiting to go can be read, and only approved, edited, retried or logged by the campaign's people", () => {
    const text = source("Outreach.tsx");
    expect(text).toContain("const may = useMayChangeCampaign(campaignId);");
    expect(text).toContain("{may && drafts.length > 0 && (");
    expect(text).toContain("<SentRow key={i.message.id} item={i} may={may}");
    expect(text).toContain("<FailedRow key={i.message.id} item={i} may={may}");
  });

  it("the Campaigns menu offers Duplicate, Close and Assign only for a campaign the person manages", () => {
    const text = source("CampaignsPage.tsx");
    expect(text).toContain("{admin && mayAssign && item(\"Duplicate\", onDuplicate)}");
    expect(text).toContain("mayClose={mayCloseCampaign(session, r)}");
  });

  it("a person's sheet: Edit email and Add phone only where the server says the details are theirs to change", () => {
    const text = source("ProfileSidebar.tsx");
    expect(text).toContain("const mayEdit = row?.canEdit !== false;");
    expect(text).toMatch(/\{mayEdit\s*\? <ContactEditable candidateId=\{row\.candidate\.id\} kind="email"/);
    expect(text).toMatch(/\{mayEdit\s*\? <ContactEditable candidateId=\{row\.candidate\.id\} kind="phone"/);
  });

  it("a match result's Change this result, a thread's follow-up and Log a call, and Change client follow the campaign's flag", () => {
    expect(source("MatchResult.tsx")).toContain("const canAct = Boolean(campaignId) && may;");
    const sheet = source("OutreachSheet.tsx");
    expect(sheet).toContain("const may = useMayChangeCampaign(row.campaignId ?? null);");
    expect(sheet).toContain("const canFollowUp = may && Boolean(onAgent)");
    expect(sheet).toContain("const canLog = may && Boolean(onLogCall)");
    // Change client: anyone on the campaign sets a client while it has none; changing one it has is the owner's or an admin's.
    expect(source("CampaignWorkspace.tsx")).toContain("const canClient = mayChangeCampaignClient(session, row, !!client);");
    expect(source("CampaignWorkspace.tsx")).toContain("const mayChange = mayChangeCampaign(session, row);");
  });

  it("a stage that cannot be changed looks it: aria-disabled, muted, no hover", () => {
    expect(source("CampaignWorkspace.tsx")).toContain("disabled={locked} aria-disabled={locked || undefined}");
    const css = source("workspace.css");
    expect(css).toContain('.cw-stagepick button:disabled, .cw-stagepick button[aria-disabled="true"]');
    expect(css).toContain('.cw-stagepick button:disabled:hover');
  });

  it("the agent panel for someone with no campaign yet names no owner and no team", () => {
    expect(source("railConfig.ts")).toContain("const noCampaigns = v.campaignsReady && !v.campaignsFailed && v.campaigns.length === 0;");
  });

  it("asks for the owner or the team lead, never 'an admin', where a person is told how to get onto a campaign", () => {
    expect(source("campaignRights.ts")).toContain("Ask its owner or the team lead to add you");
    expect(source("RoleBits.tsx")).toContain("Ask its owner or the team lead to add you");
  });
});
