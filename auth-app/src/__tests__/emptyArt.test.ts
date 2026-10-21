import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { EMPTY_ART, emptyArtUrl } from "../EmptyArt";

/**
 * The art on disk is the owner's set of 42 pictures (scripts/build-empty-art.py fits each one). Not every one is
 * drawn: EMPTY_ART is the list of the pictures a screen draws, and the files that stay on disk without a place
 * are named here with the owner's reason, so adding a picture to a screen is a deliberate change to both.
 */
const UNWIRED: Readonly<Record<string, string>> = {
  "agent-welcome": "owner: no art on the agent's avatar or hero (the faint mark behind the hero is the only picture there)",
  "sourcing-working": "owner: the loader is the logo mark with a ring everywhere, never artwork",
  "empty-chat-history": "owner: no art in the right rail (the History row is one line of text)",
  "empty-extension": "owner: no Extension page, promo or copy anywhere",
  "su-work-email": "owner: no art in the set-up",
  "su-site-unreadable": "owner: no art in the set-up (and no website is asked for)",
  "su-workspace-setup": "owner: no art in the set-up",
  "form-thanks": "owner: the thank-you screen is a small check mark and two lines, never a picture",
  "empty-replies": "analytics: each Analytics page draws empty-analytics once, and a chart that is empty says it in words",
};

const SRC = resolve(__dirname, "..");
const DIR = resolve(SRC, "assets/empty");

const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, "")).sort();

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === "__tests__" || f === "__harness__" || f === "assets" || f === "node_modules") continue;
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(tsx?|css)$/.test(f) && f !== "EmptyArt.tsx") out.push(p);
  }
  return out;
}

describe("empty-state art", () => {
  it("is every file on disk, either drawn by a screen or named as unwired with a reason", () => {
    expect([...EMPTY_ART, ...Object.keys(UNWIRED)].sort()).toEqual(onDisk);
  });

  it("has a file for every name it draws, and no name is both drawn and unwired", () => {
    for (const name of EMPTY_ART) {
      expect(onDisk, name).toContain(name);
      expect(UNWIRED, name).not.toHaveProperty(name);
    }
  });

  it("resolves every drawn name to a URL", () => {
    for (const name of EMPTY_ART) expect(emptyArtUrl(name), name).not.toBe("");
  });

  it("names are unique", () => {
    expect(new Set(EMPTY_ART).size).toBe(EMPTY_ART.length);
  });

  it("is what the code uses: every drawn name is referenced by a screen, and no unwired name is", () => {
    const code = sources(SRC).map((p) => readFileSync(p, "utf8")).join("\n");
    for (const name of EMPTY_ART) expect(code.includes(`"${name}"`), `${name} is listed but no screen draws it`).toBe(true);
    for (const name of Object.keys(UNWIRED)) expect(code.includes(`"${name}"`), `${name} must stay unwired`).toBe(false);
  });

  it("draws the pictures the brief wired: coming up, a closed campaign, nothing to measure, nothing to approve", () => {
    const at = (file: string) => readFileSync(join(SRC, file), "utf8");
    expect(at("ComingUp.tsx")).toContain('"empty-schedules"');
    expect(at("CampaignWorkspace.tsx") + at("OverviewPanel.tsx")).toContain('"campaign-paused"');
    expect(at("AnalyticsPages.tsx")).toContain('"empty-analytics"');
    // Once per page: the art is drawn in one place, the empty block, and never inside a chart.
    expect(at("AnalyticsPages.tsx").match(/<EmptyArt /g)?.length).toBe(1);
    expect(at("AnalyticsCharts.tsx")).not.toContain("EmptyArt");
    expect(at("Outreach.tsx")).toContain('"empty-approvals"');
  });
});
