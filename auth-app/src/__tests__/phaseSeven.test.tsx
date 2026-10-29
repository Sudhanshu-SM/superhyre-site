import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { firstNamesOrFull } from "../boardStages";
import { isRefusal } from "../formsStore";

/** Phase 7 console findings: refusals settle a card, the Shortlist menu, the inline edit, the disabled look, names, the sign-in code. */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("a refusal that is for good", () => {
  it("is a 403, and nothing else is", () => {
    expect(isRefusal(new ApiError(403, "forbidden", "This campaign isn't on a team you lead."))).toBe(true);
    expect(isRefusal(new ApiError(500, "error", "Something went wrong."))).toBe(false);
    expect(isRefusal(new ApiError(0, "network", "Can't reach SuperHyre."))).toBe(false);
    expect(isRefusal(new Error("403"))).toBe(false);
  });

  it("settles the form-draft card: no Publish, no Try again, the refusal said once", () => {
    const m = src("Moments.tsx");
    expect(m).toContain('const canPublish = given && status === "draft" && !refused;');
    expect(m).toContain("state: isRefusal(err) ? \"refused\" : \"failed\"");
    expect(m).toContain('{refused && refusal && <p className="mo-form-none t-body-sm" role="alert">{refusal}</p>}');
    expect(m).toContain('{saved.save === "error" && !refused && (');
    expect(m).toContain('{publish.state === "failed" && !refused && (');
    expect(src("formsStore.ts")).toContain("refused: isRefusal(err)");
  });
});

describe("the Shortlist menu on Candidates", () => {
  const page = src("Contacts.tsx");
  const css = src("contacts.css");
  it("offers the campaigns the viewer may change, and the ones this person is already on", () => {
    expect(page).toContain('r.status !== "closed" && mayChangeCampaign(session, r)');
    expect(page).toContain("campaignsNow.filter((c) => onIds.includes(c.id) && !pickableNow.some((p) => p.id === c.id))");
    expect(page).toContain("onIds={on}");
  });
  it("never says Their campaign on a campaign they were rejected from, says Rejected, and does not scroll sideways or clip", () => {
    expect(page).toContain('{rejected?.(c.id) ? <span className="ct-menu-tag is-quiet">Rejected</span> : c.id === suggest && <span className="ct-menu-tag">Their campaign</span>}');
    expect(page).toContain('rejected={(c) => stages[c] === "passed"}');
    expect(css).toMatch(/\.ct-menu \{ display: grid; padding: 6px; overflow-x: hidden; \}/);
    expect(css).toMatch(/\.ct-menu-t\.is-name \{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  });
  it("keeps the label whole at 1280px: it has a minimum width and the control a wider box", () => {
    expect(css).toMatch(/\.ct-sl-label \{ flex: 1; min-width: 4\.8em;/);
    expect(css).toMatch(/\.ct-table \.ct-c-act \{ width: 228px; \}[\s\S]*\.ct-c-act \.ct-sl \{ width: 172px; \}/);
  });
});

describe("an email or phone typed in place", () => {
  it("has room to type: at least 200px, and the buttons wrap under it rather than squeeze it", () => {
    const css = src("contactsFetch.css");
    expect(css).toMatch(/\.ce-in \{\s*flex: 1 1 200px; min-width: 200px;/);
    expect(css).toMatch(/\.ce-row \{ display: flex; flex-wrap: wrap;/);
  });
});

describe("what cannot be changed, in one look", () => {
  it("is one class, with muted text, no input chrome and the not-allowed cursor", () => {
    const css = src("access.css");
    const block = css.slice(css.indexOf("what cannot be changed right now"));
    expect(block).toContain(".is-off.is-off, .is-off.is-off * { cursor: not-allowed; }");
    expect(block).toMatch(/color: var\(--ink-2\); background: transparent; border-color: transparent; box-shadow: none;/);
    expect(block).toMatch(/color: var\(--ink-3\); background: transparent; border-color: var\(--hairline\);/);
  });

  it("is on read-only requirements and on a person's stage buttons when they cannot be used, with aria-disabled", async () => {
    const { SpecEditor } = await import("../agentCards/SpecEditor");
    const spec = { title: "Backend Engineer", seniority: null, yearsMin: 4, locations: ["Pune"], remoteOk: true, avoid: [], requirements: [{ id: "r1", kind: "skill", text: "Go", importance: "must", weight: 0.8 }] } as never;
    const html = renderToStaticMarkup(<SpecEditor spec={spec} onChange={() => undefined} readOnly />);
    expect(html).toContain('class="se is-off"');
    expect(html).toContain('aria-disabled="true"');
    const editable = renderToStaticMarkup(<SpecEditor spec={spec} onChange={() => undefined} />);
    expect(editable).toContain('class="se"');
    expect(editable).not.toContain("aria-disabled");
    expect(src("CampaignWorkspace.tsx")).toContain('className={`cw-stagepick${locked ? " is-off" : ""}`} role="radiogroup" aria-label="Stage" aria-disabled={locked || undefined}');
  });
});

describe("two people with the same first name", () => {
  it("are told apart by their full names, and the rest stay first names", () => {
    expect(firstNamesOrFull(["Ananya Rao", "Ananya Das", "Meera Iyer"])).toEqual(["Ananya Rao", "Ananya Das", "Meera"]);
    expect(firstNamesOrFull(["Ananya Rao", "meera Iyer"])).toEqual(["Ananya", "meera"]);
    expect(firstNamesOrFull(["Ravi Kumar", "ravi Shah"])).toEqual(["Ravi Kumar", "ravi Shah"]);
    expect(firstNamesOrFull([])).toEqual([]);
    expect(src("CampaignWorkspace.tsx")).toContain("firstNamesOrFull(ps.slice(0, n).map((p) => p.name))");
  });
});

describe("the sign-in code", () => {
  it("is six digits, and the placeholder shows six", () => {
    const card = src("Cards.tsx");
    expect(card).toContain('placeholder="123456"');
    expect(card).not.toContain('placeholder="12345678"');
  });
});

describe("the Match column and the sheet", () => {
  it("read the same resolved state, the older fit only from a server that has none", () => {
    const ws = src("CampaignWorkspace.tsx");
    expect(ws).toContain("function matchOf(p: PipelinePerson)");
    expect(ws).toContain("matchOf(p)");
  });
});
