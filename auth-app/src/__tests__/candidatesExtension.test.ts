import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyList } from "../emptyStates";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/**
 * The owner's rule: no Extension page or promo, and no extension copy in empty states. Two small, quiet links exist:
 * "Get the extension" in the Candidates header (owner request, 13 Oct) and "Add the Chrome extension" in the Add
 * candidates dialog, where people are added.
 */
describe("the Candidates page and the extension", () => {
  it("has one quiet header link and no extension copy in any empty state", () => {
    const page = src("Contacts.tsx");
    expect(page.match(/Get the extension/g)).toHaveLength(1);
    expect(page.match(/CHROME_STORE_URL/g)?.length).toBeGreaterThanOrEqual(1);
    expect(page).not.toMatch(/Chrome extension|from LinkedIn with the extension/i);
    for (const a of [
      { narrowed: false, campaign: null, live: true },
      { narrowed: false, campaign: "Backend", live: true },
      { narrowed: true, campaign: null, live: true },
      { narrowed: false, campaign: null, live: false },
    ]) {
      const e = emptyList(a);
      expect(`${e.head} ${e.text}`, JSON.stringify(a)).not.toMatch(/extension|chrome/i);
    }
  });

  it("keeps one small link inside the Add candidates dialog, and only there", () => {
    const dialog = src("AddCandidates.tsx");
    expect(dialog.match(/Add the Chrome extension/g)).toHaveLength(1);
    expect(dialog).toContain("CHROME_STORE_URL");
    // Nowhere else in a console page.
    for (const f of ["Contacts.tsx", "Home.tsx", "HomeCards.tsx", "CampaignWorkspace.tsx", "Clients.tsx", "Settings.tsx", "Nav.tsx"]) {
      expect(src(f), f).not.toContain("Add the Chrome extension");
    }
  });
});
