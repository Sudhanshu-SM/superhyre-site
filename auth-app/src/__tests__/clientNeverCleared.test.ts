import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every campaign has a client. Nothing in the console takes it away or offers a campaign without one: no button that
 * removes the client, no "No client" choice, no write of a client that is none. Changing it to another is fine.
 */

const SRC = resolve(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "__tests__" || n === "assets") return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const sources = files(SRC).map((f) => ({ name: relative(SRC, f), text: readFileSync(f, "utf8") }));
const hits = (re: RegExp) => sources.flatMap((s) => (re.test(s.text) ? [s.name] : []));

describe("a campaign's client is never taken away", () => {
  it("has no call that sets a campaign's client to none", () => {
    expect(hits(/setCampaignClient\([^)]*\bnull\b/)).toEqual([]);
    expect(hits(/setCampaignClient\([^)]*undefined/)).toEqual([]);
    expect(hits(/patchCampaign\([^)]*clientId:\s*null/)).toEqual([]);
  });

  it("has no button or wording that removes it", () => {
    expect(hits(/Remove client from this campaign|Client removed|Unlink (the )?client|cl-remove/)).toEqual([]);
  });

  it("offers no 'No client' choice and no internal hire: not in the form, the intake, the chat's questions or the cards", () => {
    expect(hits(/["'>`]No client[,"'<`]/)).toEqual(["AnalyticsPages.tsx"]);
    expect(hits(/internal hire/i)).toEqual([]);
    expect(hits(/\bNO_CLIENT\b/)).toEqual([]);
    expect(hits(/clientId:\s*NO_CLIENT|noClient/)).toEqual([]);
  });

  it("types a campaign's client write so that it cannot be none", () => {
    const api = sources.find((s) => s.name === "api/campaigns.ts")!.text;
    expect(api).toContain("export const patchCampaign = (id: string, body: { clientId?: string; newClient?: string })");
    const store = sources.find((s) => s.name === "campaignStore.ts")!.text;
    expect(store).toContain("export function setCampaignClient(campaignId: string, clientId: string): Promise<boolean>");
  });
});
