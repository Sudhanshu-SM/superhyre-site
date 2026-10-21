import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { placeOf } from "../ProfileSidebar";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("where a person is, in the stage's own words", () => {
  it("says the campaign's own name for a stage it made, and the console's word for the default ones", () => {
    expect(placeOf({ stage: "interviewing", stageName: "Client review" })).toMatchObject({ word: "In Client review", own: true });
    expect(placeOf({ stage: "outreach", stageName: "Intro call", step: "waiting" })).toMatchObject({ word: "In Intro call", own: true });
    expect(placeOf({ stage: "interviewing", stageName: "Interviewing" })).toMatchObject({ word: "Interviewing", own: false });
    expect(placeOf({ stage: "outreach", stageName: "Outreach", step: "replied" })).toMatchObject({ word: "Replied", own: false });
    expect(placeOf({ stage: "interviewing" })).toMatchObject({ word: "Interviewing", own: false });
    expect(placeOf({ stage: "hired", stageName: "Hired" })).toMatchObject({ word: "Hired", own: false });
    expect(placeOf({ stage: "passed", stageName: "Rejected" })).toMatchObject({ word: "Rejected", own: false });
  });

  it("keeps the stage's colour from its kind, and reads 'for' the campaign when the name is the stage's own", () => {
    expect(placeOf({ stage: "interviewing", stageName: "Client review" }).tone).toBe("Interviewing");
    const side = src("ProfileSidebar.tsx");
    expect(side).toContain('{place.own ? "for" : "in"} {x.name}');
  });
});

describe("rejecting asks for an optional reason everywhere", () => {
  it("is one dialog on the board, the shortlist table, the responses and the form status", () => {
    for (const f of ["CampaignWorkspace.tsx", "FormResponses.tsx", "liveViews/FormStatus.tsx", "Agent.tsx"]) {
      expect(src(f), f).toContain("<PassReasonDialog");
    }
    expect(src("FormResponses.tsx")).not.toMatch(/onDecide\("pass"\)/);
    expect(src("liveViews/FormStatus.tsx")).not.toMatch(/onDecide\("pass"\)/);
    expect(src("FormResponses.tsx")).not.toMatch(/decisions\.decide\(open, "pass"\)/);
  });

  it("sends the reason with the decision", () => {
    expect(src("api/forms.ts")).toMatch(/decide = \(formId: string, responseId: string, decision: "add" \| "pass" \| "save", linkTo\?: string, reason\?: string\)/);
    expect(src("api/forms.ts")).toContain("...(reason ? { reason } : {})");
    expect(src("formsStore.ts")).toContain("formsApi.decide(await idOf(formId), responseId, decision, linkTo, reason)");
  });
});

describe("the shortlist menu holds still", () => {
  it("lists campaigns A to Z, whoever is saved for what, and keeps the 'Saved for' tag whole", () => {
    const code = src("Contacts.tsx");
    expect(code).toMatch(/const order = \[\.\.\.pickableNow,[^\n]*\]\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name/);
    expect(code).not.toContain("a.id === suggest ? -1");
    const css = src("contacts.css");
    expect(css).toMatch(/\.ct-menu-tag \{ flex: none; white-space: nowrap;/);
    expect(css).toMatch(/\.ct-menu-t\.is-name \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  });
});

describe("the add-client dialog does not jump", () => {
  it("keeps a line under each checked field and says nothing about an empty one until you try to save", () => {
    const code = src("Clients.tsx");
    expect(code).toContain('<small className="ncx-err is-held"');
    expect(code).toContain('if (String(d[k] ?? "").trim()) setTouched');
    expect(src("newcampaign.css")).toMatch(/\.ncx-err\.is-held \{[^}]*min-height: 18px/);
  });
});
