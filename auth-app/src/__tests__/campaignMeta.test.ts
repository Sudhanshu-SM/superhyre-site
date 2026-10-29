import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { metaParts } from "../CampaignsPage";
import type { CampaignRow } from "../campaignsData";

const row = (over: Partial<CampaignRow>): CampaignRow => ({
  id: "c1", name: "Winspire TC", department: "", location: "Pune", status: "active", owner: "Ravi", team: [],
  funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 }, trend: [], target: 1, agents: [],
  updatedAgo: "now", createdAgo: "now", ...over,
});

describe("what sits under a campaign's name", () => {
  it("shows the role it hires for and the company beside the name", () => {
    expect(metaParts(row({ roleTitle: "Technical Consultant", client: "Winspire" }))).toBe("Technical Consultant · Winspire · Pune");
  });
  it("does not say the role twice when it is the campaign's own name", () => {
    expect(metaParts(row({ name: "Technical Consultant", roleTitle: "technical consultant", client: "Winspire" }))).toBe("Winspire · Pune");
  });
  it("leaves the company out when the page draws it beside the name, and says nothing twice", () => {
    expect(metaParts(row({ roleTitle: "Technical Consultant", client: "Winspire" }), { client: false })).toBe("Technical Consultant · Pune");
  });
  it("still reads without a role or a company", () => {
    expect(metaParts(row({}))).toBe("Pune");
  });
});

describe("the client beside a campaign's name on the Campaigns page", () => {
  const page = readFileSync(resolve(__dirname, "..", "CampaignsPage.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "..", "campaigns-page.css"), "utf8");
  it("is drawn after the name, only when the campaign has one, and not again under it", () => {
    expect(page).toContain('{r.client && <span className="cg-client"');
    expect(page.indexOf('className="cg-client"')).toBeGreaterThan(page.indexOf('className="cg-name"'));
    expect(page.indexOf('className="cg-client"')).toBeLessThan(page.indexOf('className="cg-meta"'));
    expect(page).toContain("metaParts(r, { client: false })");
  });
  it("gives way to the name: 13px, one line with an ellipsis, in its own hue", () => {
    expect(css).toMatch(/\.cg-client \{[^}]*max-width: 45%[^}]*white-space: nowrap[^}]*font: 500 13px[^}]*color: var\(--cg-client-ink\)/);
  });
  it("marks the client and the owner each in a hue of the site's palette, so both stand out of the grey line", () => {
    expect(css).toMatch(/\.cg-row \{ --cg-client-ink: var\(--accent-text\); --cg-owner-ink: var\(--stage-teal-text\); \}/);
    expect(css).toMatch(/\.cg-owner \{[^}]*font-weight: 500[^}]*color: var\(--cg-owner-ink\)/);
  });
  it("puts the owner's name, and not the +N after it, in the owner's hue", () => {
    expect(page).toContain('<span className="cg-owner">{plainText(r.owner)}</span>{r.team.length > 1');
  });
  it("takes both hues from tokens that exist in the light theme and in the dark one", () => {
    const light = readFileSync(resolve(__dirname, "..", "access.css"), "utf8");
    const dark = readFileSync(resolve(__dirname, "..", "theme", "theme.css"), "utf8");
    for (const token of ["--accent-text", "--stage-teal-text"]) {
      expect(light).toContain(`${token}:`);
      expect(dark).toContain(`${token}:`);
    }
  });
});
