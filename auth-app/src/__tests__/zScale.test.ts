import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One z-index scale. A question asked from a person's sheet (reject, hire, remove, close) must never open under the
 * sheet: dialogs, popovers and toasts always sit above sheets, drawers and the scrim that dims them.
 */

const SRC = resolve(__dirname, "..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? (n === "__tests__" || n === "node_modules" || n === "assets" ? [] : walk(p)) : /\.css$/.test(n) ? [p] : [];
});
const access = readFileSync(join(SRC, "access.css"), "utf8");
const token = (name: string): number => Number(new RegExp(`${name}:\\s*(\\d+);`).exec(access)?.[1]);

/** A z-index value as a number: a number, a token, or calc(token + n). */
function value(v: string): number | null {
  const plain = /^(-?\d+)$/.exec(v.trim());
  if (plain) return Number(plain[1]);
  const t = /^var\(--z-([a-z]+)(?:,\s*\d+)?\)$/.exec(v.trim());
  if (t) return token(`--z-${t[1]}`);
  const c = /^calc\(var\(--z-([a-z]+)\)\s*\+\s*(\d+)\)$/.exec(v.trim());
  return c ? token(`--z-${c[1]}`) + Number(c[2]) : null;
}

const rules: { file: string; selector: string; z: number }[] = [];
for (const file of walk(SRC)) {
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const z = /(?:^|;|\s)z-index:\s*([^;]+)/.exec(m[2]!)?.[1];
    const n = z ? value(z) : null;
    if (n !== null) rules.push({ file: file.replace(`${SRC}/`, ""), selector: m[1]!.trim().replace(/\s+/g, " "), z: n });
  }
}
const zOf = (selector: string, file: string) => rules.find((r) => r.file === file && r.selector === selector)?.z;

describe("the z-index scale", () => {
  it("is ordered: nav popovers, page panels, sheets, the scrim, dialogs", () => {
    const t = { pop: token("--z-pop"), panel: token("--z-panel"), sheet: token("--z-sheet"), scrim: token("--z-scrim"), dialog: token("--z-dialog") };
    expect(Object.values(t).every(Number.isFinite)).toBe(true);
    expect(t.pop).toBeLessThan(t.panel);
    expect(t.panel).toBeLessThan(t.sheet);
    expect(t.sheet).toBeLessThan(t.scrim);
    expect(t.scrim).toBeLessThan(t.dialog);
  });

  it("puts the person's sheet and drawer on the sheet tier and the ranked-matches panel under them", () => {
    expect(zOf(".ps", "candidates.css")).toBe(token("--z-sheet"));
    expect(zOf(".and", "analytics.css")).toBe(token("--z-sheet"));
    expect(zOf(".rm", "candidates.css")).toBe(token("--z-panel"));
  });

  it("puts every dialog above every sheet, and popovers and toasts above dialogs", () => {
    const sheets = rules.filter((r) => (r.selector === ".ps" || r.selector === ".and")).map((r) => r.z);
    expect(sheets.length).toBeGreaterThan(0);
    const dialogs = rules.filter((r) => /(^|[\s,])\.(dg|pal-scrim)$/.test(r.selector) || r.selector === ".dg");
    expect(dialogs.length).toBeGreaterThan(0);
    for (const d of dialogs) expect(d.z, `${d.file} ${d.selector}`).toBeGreaterThan(Math.max(...sheets));
    expect(zOf(".dg", "ui.css")).toBe(token("--z-dialog"));
    expect(zOf(".ct-toast-host", "contacts.css")!).toBeGreaterThan(token("--z-dialog"));
  });

  it("lets no rule for a dialog sit below a sheet", () => {
    const sheet = token("--z-sheet");
    // the dialog frames themselves (.dg, .*-dialog), not the small parts stacked inside them (.dg-close)
    const below = rules.filter((r) => /(^|[\s,])\.(dg|[a-z-]*dialog)$/.test(r.selector) && r.z < sheet);
    expect(below).toEqual([]);
  });
});

describe("the questions asked from a sheet", () => {
  const src = (f: string) => readFileSync(join(SRC, f), "utf8");
  it("all open in the console's one Dialog, which is on the dialog tier", () => {
    for (const f of ["PassReason.tsx", "CloseDialog.tsx", "FilledBar.tsx", "CampaignWorkspace.tsx"]) expect(src(f), f).toMatch(/<Dialog\b/);
    expect(src("RoleBits.tsx")).toMatch(/export function ConfirmDialog[\s\S]*<Dialog/);
    for (const f of ["HiredConfirm.tsx", "TeamsPeople.tsx"]) expect(src(f), f).toContain("<ConfirmDialog");
  });
});
