import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClosedPanel } from "../OverviewPanel";
import { ReopenDialog } from "../RoleBits";
import { effectsOfWrite } from "../invalidate";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * A closed campaign says so in one calm line with its picture, and the header has the one Reopen control; reopening
 * asks first like closing does, then says what happened and offers Undo; and the Overview's activity is read again after a close or a reopen (it used to keep showing the
 * last visit's top entry until the page was left and re-entered).
 */
describe("a closed campaign", () => {
  it("shows its picture beside one calm line, and no second Reopen: the header has the one control", () => {
    const html = renderToStaticMarkup(<ClosedPanel />);
    expect(html).toContain("This campaign is closed");
    expect(html).toContain("Sourcing and outreach are stopped");
    expect(html).not.toContain("Reopen");
    expect(html).not.toContain("<button");
    expect(html).toContain('class="ea"');
    expect(html).toContain('width="160"');
    // Decoration only: the words carry it.
    expect(html).toContain('aria-hidden="true"');
  });

  it("is drawn in place of the agents panel, from the campaign's own status", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toMatch(/m\.phase === "closed"\s*\?\s*<ClosedPanel \/>\s*:\s*SHOW_AGENTS_PANEL \? <AgentsPanel/);
  });

  it("leaves the agents panel off the Overview for now, behind one flag, with the panel itself kept", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toContain("const SHOW_AGENTS_PANEL = false;");
    expect(src("OverviewPanel.tsx")).toContain("export function AgentsPanel(");
  });

  it("has exactly one Reopen button in the header, and it asks before it acts", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page.match(/>Reopen campaign</g)).toHaveLength(1);
    expect(page).toContain('onClick={() => setReopening(true)}>Reopen campaign</button>');
    expect(page).toContain("<ReopenDialog open={reopening}");
    expect(page).toMatch(/onConfirm=\{\(\) => \{ setReopening\(false\); reopen\(\); \}\}/);
  });
});

describe("reopening", () => {
  it("asks first, the same way closing does, here and in the list", () => {
    const bits = src("RoleBits.tsx");
    expect(typeof ReopenDialog).toBe("function");
    expect(bits).toContain('title="Reopen this campaign?"');
    expect(bits).toContain('confirm="Reopen campaign"');
    // The list no longer reopens straight from the row menu.
    const list = src("CampaignsPage.tsx");
    expect(list).toContain("onReopen={() => setReopening(r.id)}");
    expect(list).toContain("<ReopenDialog");
    expect(list).not.toMatch(/onReopen=\{\(\) => \{\s*\/\* No confirm/);
  });

  it("says what happened and offers Undo, here and in the list", () => {
    const page = src("CampaignWorkspace.tsx");
    expect(page).toContain('setStatus("active", `${name} is active again`, () => setStatus("closed", `${name} closed`))');
    expect(src("CampaignsPage.tsx")).toContain("is active again");
    // The toast carries an action; a bare "reopened" was all it said.
    expect(page).toContain('toast(said, "done", undo ? { label: "Undo", onClick: undo } : undefined)');
  });

  it("reads the campaign's figures, activity and agents again after the status is written", () => {
    expect(effectsOfWrite("PUT", "/v1/campaigns/c1/status")).toEqual({ effects: ["campaign"], campaignId: "c1" });
    // "campaign" refreshes the open campaign (which re-reads its overview and activity) and the list and Home.
    const inv = src("invalidate.ts");
    expect(inv).toMatch(/campaign: \["boards", "campaigns", "week", "candidates"\]/);
    expect(inv).toMatch(/boards: \(c\) => eachCampaign\(c, refreshCampaign\)/);
    expect(inv).toMatch(/campaigns: \(\) => refreshCampaignsNow\(\)/);
    expect(inv).toMatch(/week: \(\) => refreshHome\(\)/);
    expect(src("campaignStore.ts")).toMatch(/\.then\(\(c\) => \{ replaceCampaign\(c\); rebuild\(\); refreshCampaignAgents\(id\); return true; \}/);
  });
});
