import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "No code path", on the console's side: what draws and sends a sheet or a resume added as Candidates (the people card, the resume
 * card, their pure modules and their two API files) imports no job description, spec or campaign-creation code, and names none of
 * its API calls. The one door to the roles import in them is the people card's own, for words typed as a request for roles with no
 * file chosen: a file chosen as Candidates never opens it (the card takes its scope from its seed; tested in peopleImportCard).
 */

const SRC = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(SRC, f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The places a source's imports go, as the paths they name (relative ones, from the file's own folder `dir`, as a path under src). */
function importsFromSource(source: string, dir: string): string[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const froms = [
    ...text.matchAll(/\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\s*from\s*["']([^"']+)["']/g),
    // (An import for its effects, with nothing taken, names no `from`.)
    ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ];
  const out: string[] = [];
  for (const m of froms) {
    const from = m[1] ?? "";
    if (from.startsWith(".")) out.push(resolve("/", dir, from).slice(1));
  }
  return out;
}
const importsOf = (file: string): string[] =>
  importsFromSource(read(file), file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "");

const FILES = [
  "peopleSheet.ts",
  "peopleSeed.ts",
  "resumeSheet.ts",
  "sheetRoute.ts",
  "api/peopleSheet.ts",
  "api/resumes.ts",
  "liveViews/ResumeImport.tsx",
  "liveViews/PeopleImport.tsx",
];

/** Job descriptions, specs and the making of campaigns: the roles import's screen and its file, the campaign's own API, and the spec's. */
const NEVER = [
  "JdIntake",
  "jdIntake",
  "api/jdIntake",
  "api/campaigns",
  "campaignJd",
  "campaignDraft",
  "NewCampaign",
  "NewCampaignIntake",
  "JdDialog",
  "RoleSpecPanel",
  "roleSpec",
  "api/agent",
];

/** The calls that make a campaign, or read, set or draft a job description or a spec. */
const CALLS = /\b(jdApi|specApi|campaignsApi|jdIntakeApi|createCampaign|draftSpec|setJobDescription|newCampaign)\b/;

describe("the people card and the resume card, and what they use", () => {
  it("import no job description, spec or campaign-creation code, but for the people card's one door to the roles import", () => {
    const found: string[] = [];
    for (const file of FILES) {
      for (const target of importsOf(file)) {
        if (NEVER.includes(target)) found.push(`${file} -> ${target}`);
      }
    }
    // The one: words typed as a request for roles (no file chosen) are answered by the people card with the roles import.
    expect(found).toEqual(["liveViews/PeopleImport.tsx -> JdIntake"]);
  });

  it("name none of the calls that make a campaign or touch a job description or a spec", () => {
    for (const file of FILES) expect(code(file), file).not.toMatch(CALLS);
  });

  it("reach the server only through the sheet, resume and import routes", () => {
    for (const file of ["api/peopleSheet.ts", "api/resumes.ts"]) {
      const paths = [...code(file).matchAll(/["'`](\/v1\/[^"'`?$]*)/g)].map((m) => m[1]);
      expect(paths.length, file).toBeGreaterThan(0);
      for (const p of paths) expect(p, file).toMatch(/^\/v1\/(candidates\/(sheet\/(read|plan)|resumes\/read|import)|campaigns\/)/);
    }
    // (The one under /campaigns is the place route, which moves people the sheet card has just added: tickets for hires and rejections come with it.)
    expect(code("api/peopleSheet.ts")).toContain("/place`");
  });

  it("is a test that can fail: a made-up file that imports the campaign's API, with or without taking anything, is caught", () => {
    const sample = 'import { jdApi } from "../api/campaigns";\nimport "../JdIntake";\nimport type { X } from "./peopleSheet";';
    expect(importsFromSource(sample, "liveViews")).toEqual(["api/campaigns", "liveViews/peopleSheet", "JdIntake"]);
    expect(CALLS.test(sample)).toBe(true);
  });
});
