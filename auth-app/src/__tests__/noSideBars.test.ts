import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No thick bar on one side of a card, panel, row or callout, anywhere in the console.
 *
 * A coloured edge on the left of a rounded block ("a stripe") reads as a cheap accent and looks wrong against the
 * rounded corner. The product's quiet alternatives are a 1px border in a slightly stronger neutral, a faint tint of
 * the surface, or (for focus) a 1px border in the accent with a faint ring all round. This reads every stylesheet
 * and every inline style in `src` and fails on:
 *
 *   - `border-left` / `border-inline-start` (and their `-width`) of 2px or more with a colour;
 *   - an inset `box-shadow` with a 2 to 4px horizontal offset (an edge drawn as a shadow);
 *   - a `::before` / `::after` bar hugging the left edge (left 0, 2 to 4px wide).
 *
 * There is no list of exceptions. A one pixel rule, a timeline's connector that is not at the edge of a block, and
 * an all-round ring (inset 0 0 0 Npx) are not what it looks for.
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" || name === "assets" ? [] : walk(path, ext);
    return ext.test(name) ? [path] : [];
  });
}

type Decl = { file: string; selector: string; prop: string; value: string };

/** Every declaration of a stylesheet, with its selector (media and container blocks unwrapped), comments removed. */
export function declarations(file: string, css: string): Decl[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Decl[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.trim().replace(/\s+/g, " ");
    for (const part of m[2]!.split(";")) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      out.push({ file, selector, prop: part.slice(0, at).trim().toLowerCase(), value: part.slice(at + 1).trim() });
    }
  }
  return out;
}

const px = (v: string): number | null => {
  const m = /(-?\d*\.?\d+)(px|rem|em)?\b/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
};

const NO_COLOUR = /^\s*(0|0px|none|medium)?\s*$/;

/** Thick one-sided borders with a colour. */
export function sideBorders(decls: Decl[]): string[] {
  return decls
    .filter((d) => /^border-(left|inline-start)(-width)?$/.test(d.prop))
    .filter((d) => {
      if (NO_COLOUR.test(d.value) || /\b(none|transparent)\b/.test(d.value) || /^0(px)?\b/.test(d.value)) return false;
      const w = px(d.value);
      return w !== null && w >= 2;
    })
    .map((d) => `${d.file}: ${d.selector} { ${d.prop}: ${d.value} }`);
}

/** An inset shadow whose horizontal offset is 2 to 4px: an edge drawn as a shadow. */
export function insetEdges(decls: Decl[]): string[] {
  const bad: string[] = [];
  for (const d of decls) {
    if (d.prop !== "box-shadow") continue;
    // The shadows, split at the commas that are not inside a colour function.
    const shadows: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of d.value) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { shadows.push(cur); cur = ""; } else cur += ch;
    }
    shadows.push(cur);
    for (const sh of shadows) {
      if (!/\binset\b/.test(sh)) continue;
      const lengths = sh.replace(/\b(rgba?|hsla?|color-mix|var)\([^)]*(\([^)]*\)[^)]*)*\)/g, " ").replace(/#[0-9a-f]{3,8}\b/gi, " ")
        .replace(/\binset\b/g, " ").trim().split(/\s+/).filter((t) => /^-?\d*\.?\d+(px|rem|em)?$/.test(t));
      const x = lengths[0] === undefined ? 0 : px(lengths[0]) ?? 0;
      if (Math.abs(x) >= 2 && Math.abs(x) <= 4) bad.push(`${d.file}: ${d.selector} { box-shadow: ${d.value.replace(/\s+/g, " ")} }`);
    }
  }
  return bad;
}

/** A pseudo-element bar on the left edge of its block, 2 to 4px wide. */
export function edgeBars(decls: Decl[]): string[] {
  const bySel = new Map<string, Decl[]>();
  for (const d of decls) {
    if (!/::?(before|after)\b/.test(d.selector)) continue;
    bySel.set(`${d.file}|${d.selector}`, [...(bySel.get(`${d.file}|${d.selector}`) ?? []), d]);
  }
  const bad: string[] = [];
  for (const [key, ds] of bySel) {
    const get = (p: string) => ds.find((d) => d.prop === p)?.value;
    if (get("position") !== "absolute") continue;
    const w = get("width");
    const width = w ? px(w) : null;
    if (width === null || width < 2 || width > 4 || !/px$/.test(w ?? "")) continue;
    const left = get("left") ?? get("inset-inline-start");
    const inset = get("inset");
    const atLeft = (left !== undefined && /^0(px)?$/.test(left)) || (inset !== undefined && /^0\s+auto\s+0\s+0$/.test(inset));
    if (atLeft) bad.push(key.replace("|", ": "));
  }
  return bad;
}

const sheets = walk(SRC, /\.css$/).map((f) => ({ file: relative(SRC, f), css: readFileSync(f, "utf8") }));
const all = sheets.flatMap((s) => declarations(s.file, s.css));

describe("no thick bar on one side of a block", () => {
  it("has no left border of 2px or more with a colour, in any stylesheet", () => {
    expect(sideBorders(all)).toEqual([]);
  });

  it("has no inset shadow with a 2 to 4px horizontal offset, in any stylesheet", () => {
    expect(insetEdges(all)).toEqual([]);
  });

  it("has no pseudo-element bar on the left edge of a block", () => {
    expect(edgeBars(all)).toEqual([]);
  });

  it("has none in an inline style either", () => {
    const code = walk(SRC, /\.tsx?$/).map((f) => ({ file: relative(SRC, f), text: readFileSync(f, "utf8") }));
    const hits = code.flatMap((c) =>
      c.text.split("\n").flatMap((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return [];
        const inlineBorder = /\bborder(Left|InlineStart)(Width)?\s*:\s*["'`]?\s*([2-9]|\d{2,})\s*px/.test(line);
        const inlineInset = /\bboxShadow\s*:\s*["'`][^"'`]*\binset\s+-?[2-4]px\b/.test(line);
        return inlineBorder || inlineInset ? [`${c.file}:${i + 1}: ${line.trim().slice(0, 120)}`] : [];
      }),
    );
    expect(hits).toEqual([]);
  });

  it("knows what it is looking for (the checks themselves)", () => {
    const d = (prop: string, value: string): Decl => ({ file: "x.css", selector: ".a", prop, value });
    expect(sideBorders([d("border-left", "3px solid var(--accent-fill)")])).toHaveLength(1);
    expect(sideBorders([d("border-inline-start", "2px solid #0a66c2")])).toHaveLength(1);
    expect(sideBorders([d("border-left", "1px solid var(--hairline)")])).toEqual([]);
    expect(sideBorders([d("border-left", "0")])).toEqual([]);
    expect(sideBorders([d("border-left", "none")])).toEqual([]);
    expect(insetEdges([d("box-shadow", "inset 3px 0 0 var(--accent), 0 1px 2px rgba(0, 0, 0, 0.04)")])).toHaveLength(1);
    expect(insetEdges([d("box-shadow", "0 1px 2px rgba(0,0,0,.1), inset -2px 0 0 #c2410c")])).toHaveLength(1);
    expect(insetEdges([d("box-shadow", "inset 0 0 0 1px var(--rule)")])).toEqual([]);
    expect(insetEdges([d("box-shadow", "inset 1px 0 0 0 #c2410c")])).toEqual([]);
    expect(insetEdges([d("box-shadow", "0 0 0 1px rgba(255, 255, 255, 0.6) inset")])).toEqual([]);
    expect(
      edgeBars([
        { file: "x.css", selector: ".a::before", prop: "position", value: "absolute" },
        { file: "x.css", selector: ".a::before", prop: "left", value: "0" },
        { file: "x.css", selector: ".a::before", prop: "width", value: "3px" },
      ]),
    ).toHaveLength(1);
    expect(
      edgeBars([
        { file: "x.css", selector: ".a::before", prop: "position", value: "absolute" },
        { file: "x.css", selector: ".a::before", prop: "left", value: "6px" },
        { file: "x.css", selector: ".a::before", prop: "width", value: "1px" },
      ]),
    ).toEqual([]);
  });
});
