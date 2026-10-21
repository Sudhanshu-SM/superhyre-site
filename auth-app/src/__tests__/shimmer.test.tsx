import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Shimmer, ShimmerRegion, ShimmerBoard, ShimmerCards, ShimmerChart, ShimmerGrid, ShimmerPage, ShimmerPanel, ShimmerRows, ShimmerTable, ShimmerTableRows, ShimmerText,
} from "../components/Shimmer";
import { postcssDark } from "../theme/postcssDark";
import { HBarsGhost, KpisGhost, TableGhost } from "../analyticsGhosts";
import { KlGroupsGhost, KlRowsGhost } from "../klGhosts";
import { SmPageGhost, SmRowsGhost, StItemsGhost } from "../settingsGhosts";

/**
 * The shimmer is how a part of a page says it is loading; the Loader (mark and ring) is for a whole screen. These pin
 * what a screen reader is told, that the sweep holds still for reduced motion, that the colours are the theme's own,
 * and where the Loader is still used.
 */

const SRC = resolve(__dirname, "..");
const css = readFileSync(join(SRC, "components/shimmer.css"), "utf8");
const html = (el: JSX.Element) => renderToStaticMarkup(el);

describe("the shimmer tile", () => {
  it("is hidden from assistive tech and sized by prop", () => {
    const out = html(<Shimmer w={120} h={14} r={7} />);
    expect(out).toContain('class="shm"');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain("--shm-w:120px");
    expect(out).toContain("--shm-h:14px");
    expect(out).toContain("--shm-r:7px");
  });

  it("can be round, for an avatar", () => {
    expect(html(<Shimmer circle w={34} h={34} />)).toContain("is-circle");
  });

  it("is lines of text with the last one shorter", () => {
    const out = html(<ShimmerText lines={3} last="40%" />);
    expect(out.match(/class="shm"/g)).toHaveLength(3);
    expect(out.match(/--shm-w:40%/g)).toHaveLength(1);
    expect(html(<ShimmerText lines={1} last="40%" />)).not.toContain("--shm-w");
  });
});

describe("the tile in the shape of the page", () => {
  it("can be a donut: a round tile with its middle cut out, as thick as asked", () => {
    const out = html(<Shimmer ring={9} w={104} h={104} />);
    expect(out).toContain("is-circle");
    expect(out).toContain("is-ring");
    expect(out).toContain("--shm-ring:9px");
    expect(out).toContain("--shm-r:50%");
    expect(css).toMatch(/\.shm\.is-ring \{[^}]*mask: radial-gradient/);
  });

  it("can stand for a line of text: centred in a line as tall as the real one, so a stack is as tall as the text", () => {
    expect(html(<Shimmer h={13} lh={20} />)).toContain("--shm-m:3.5px");
    expect(html(<Shimmer h={11} lh={16} />)).toContain("--shm-m:2.5px");
    expect(html(<Shimmer h={13} />)).not.toContain("--shm-m");
    expect(css).toMatch(/margin-block: var\(--shm-m, 0\)/);
  });

  it("does not set its own display on a region, so it can carry the page's own layout classes", () => {
    expect(/\.shm-region \{[^}]*display/.test(css)).toBe(false);
    const out = html(<ShimmerRegion label="Loading clients" className="cw sl cli"><span /></ShimmerRegion>);
    expect(out).toContain('class="shm-region cw sl cli"');
    expect(out).toContain('role="status"');
  });
});

describe("rows in a real table", () => {
  const cells = [{ cls: "cli-c-name", lead: 26, w: "72%" }, { cls: "cli-c-ind", w: "70%" }, { cls: "cli-c-num", w: 18, fixed: true }, { cls: "cli-c-owner", lead: 20, round: true, sub: "60%" }];

  it("carries each real column's class, so the width, padding and height are the real ones", () => {
    const out = html(<table><tbody><ShimmerTableRows rows={2} cells={cells} /></tbody></table>);
    expect(out.match(/<td class="cli-c-name"/g)).toHaveLength(2);
    expect(out.match(/<td class="cli-c-num"/g)).toHaveLength(2);
    expect(out).not.toContain('class="shm-td"');
    expect(out).toContain("shm-tr is-real");
    expect(out).not.toContain("height:");
  });

  it("draws a person's cell as a lead and lines, a figure as one short fixed tile, and varies the lines row to row", () => {
    const out = html(<table><tbody><ShimmerTableRows rows={3} cells={cells} /></tbody></table>);
    expect(out.match(/shm-td-who/g)).toHaveLength(6);
    expect(out).toContain("--shm-w:18px");
    expect(new Set(out.match(/--shm-w:calc\(72% \* [0-9.]+\)/g)).size).toBeGreaterThan(1);
    expect(out).toContain("is-circle");
  });

  it("announces once, from the first row", () => {
    const out = html(<table><tbody><ShimmerTableRows rows={4} cells={cells} label="Loading clients" /></tbody></table>);
    expect(out.match(/role="status"/g)).toHaveLength(1);
    expect(out).toContain("Loading clients");
  });
});

describe("the composed skeletons", () => {
  const withLabel: [string, JSX.Element][] = [
    ["rows", <ShimmerRows label="Loading calls" />],
    ["cards", <ShimmerCards label="Loading campaigns" />],
    ["table", <ShimmerTable label="Loading responses" />],
    ["grid", <ShimmerGrid label="Loading the grid" />],
    ["chart", <ShimmerChart label="Loading the funnel" />],
    ["panel", <ShimmerPanel label="Loading the role spec" />],
    ["board", <ShimmerBoard label="Loading the campaign" />],
    ["page", <ShimmerPage label="Loading clients" />],
  ];

  it.each(withLabel)("%s is a busy status that says what it waits for", (_name, el) => {
    const out = html(el);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-busy="true"');
    expect(out).toMatch(/<span class="sr-only">Loading [^<]+<\/span>/);
  });

  it("leaves the status to its parent when it has no label, so a nested skeleton announces once", () => {
    const out = html(<ShimmerBoard />);
    expect(out).not.toContain('role="status"');
    expect(html(<ShimmerPage label="Loading clients"><ShimmerBoard /></ShimmerPage>).match(/role="status"/g)).toHaveLength(1);
  });

  it("hides every row, card and tile from assistive tech", () => {
    for (const el of [<ShimmerRows n={3} label="x" />, <ShimmerCards n={3} label="x" />, <ShimmerGrid n={3} label="x" />]) {
      const out = html(el);
      const blocks = out.match(/class="shm(?: is-circle)?"/g) ?? [];
      const hidden = out.match(/class="shm(?: is-circle)?"[^>]*aria-hidden="true"/g) ?? [];
      expect(hidden).toHaveLength(blocks.length);
    }
  });

  it("takes the real row height, so nothing jumps when the data arrives", () => {
    expect(html(<ShimmerRows h={58} />)).toContain("--shm-row-h:58px");
    expect(html(<ShimmerRows n={4} />).match(/class="shm-row"/g)).toHaveLength(4);
    expect(html(<ShimmerRows lead={false} />)).not.toContain("is-circle");
  });

  it("sits inside a real table body, announced from its first row", () => {
    const out = html(<table><tbody><ShimmerTableRows rows={3} cols={4} h={62} label="Loading candidates" /></tbody></table>);
    expect(out.match(/<tr /g)).toHaveLength(3);
    expect(out.match(/role="status"/g)).toHaveLength(1);
    expect(out).toContain("Loading candidates");
    expect(out).toContain("height:62px");
    expect(out.match(/<td/g)).toHaveLength(12);
  });

  it("is a table with a header row of its own", () => {
    const out = html(<ShimmerTable rows={2} cols={3} label="Loading" />);
    expect(out).toContain("<thead>");
    expect(out.match(/<th[ >]/g)).toHaveLength(3);
    expect(out.match(/<tbody><tr/g)).toHaveLength(1);
  });

  it("draws one bar per column of the chart", () => {
    expect(html(<ShimmerChart bars={5} />).match(/shm-bar"/g)).toHaveLength(5);
  });
});

describe("the stylesheet", () => {
  it("holds the sweep still for reduced motion and lets the tiles breathe instead", () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block).toMatch(/\.shm::after \{ display: none; \}/);
    expect(block).toMatch(/animation: shm-pulse/);
    expect(css).toMatch(/@keyframes shm-pulse/);
    expect(css).toMatch(/@keyframes shm-sweep/);
  });

  it("sweeps for about a second and a half, on a diagonal", () => {
    expect(css).toMatch(/--shm-period: 1\.6s/);
    expect(css).toMatch(/linear-gradient\(105deg/);
  });

  it("spends only the theme's tokens, and turns the highlight up in the dark theme", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(css).toMatch(/:root\[data-theme="dark"\] \.shm \{ --shm-hi:/);
  });

  it("gives the dark-theme build nothing to rewrite", async () => {
    const out = (await postcss([postcssDark()]).process(css, { from: join(SRC, "components/shimmer.css") })).css;
    expect(out.replace(/\s+/g, " ").trim()).toBe(css.replace(/\s+/g, " ").trim());
  });

  it("has no dots, pills or bars down an edge", () => {
    expect(css).not.toMatch(/border-radius:\s*(100px|999|9999)/);
    expect(css).not.toMatch(/border-left:\s*[2-9]px/);
  });
});

describe("where the Loader is still used", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? (f === "__tests__" || f === "node_modules" ? [] : walk(p)) : /\.tsx$/.test(f) ? [p] : [];
    });

  /** The page-level loader: boot, sign-in, the route fallback, the public pages, the set-up. Every other wait shimmers. */
  const ALLOWED = [/^main\.tsx$/, /^App\.tsx$/, /^consolePages\.tsx$/, /^setup\//, /^ApplyPage\.tsx$/, /^ReviewPage\.tsx$/, /^components\/Loader\.tsx$/];

  it("is a whole-screen loader outside inline busy buttons and rows", () => {
    const stray: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f);
      if (ALLOWED.some((a) => a.test(rel))) continue;
      const hits = readFileSync(f, "utf8").split("\n").filter((l) => /<Loader\b/.test(l) && !/size="sm"/.test(l));
      if (hits.length) stray.push(`${rel}: ${hits.map((h) => h.trim()).join(" | ")}`);
    }
    expect(stray, `These wait on a part of a page; give them a Shimmer:\n${stray.join("\n")}`).toEqual([]);
  });
});

describe("the ghosts of the pages", () => {
  it("shows calls and outreach in the real group and row classes, announced once", () => {
    for (const kind of ["call", "outreach"] as const) {
      const out = html(<KlGroupsGhost kind={kind} n={3} label="Loading" />);
      expect(out.match(/role="status"/g)).toHaveLength(1);
      expect(out.match(/class="kl-group( is-open)?"/g)).toHaveLength(3);
      expect(out.match(/class="kl-group is-open"/g)).toHaveLength(1);
      expect(out).toContain("kl-gbtn");
      expect(out).toContain(kind === "call" ? "kl-gstats" : "ko-gstats");
      expect(out).toContain(kind === "call" ? 'class="kl-row"' : 'class="kl-row ko-row"');
      expect(out).not.toContain("<button");
    }
  });

  it("frames a campaign's own list as the one open card, a group's rows as bare rows, a dialog's as its own list", () => {
    expect(html(<KlRowsGhost variant="page" label="x" />)).toContain("kl-groups is-flat");
    const group = html(<KlRowsGhost variant="group" n={3} label="x" />);
    expect(group).not.toContain("kl-group");
    expect(group.match(/class="kl-row"/g)).toHaveLength(3);
    expect(html(<KlRowsGhost variant="modal" label="x" />)).toContain("kl-rows klm-rows");
  });

  it("shows settings rows in the real list classes", () => {
    expect(html(<SmRowsGhost n={3} label="Loading" />).match(/class="sm-row"/g)).toHaveLength(3);
    expect(html(<StItemsGhost n={2} label="Loading" />).match(/class="st-item"/g)).toHaveLength(2);
    const page = html(<SmPageGhost label="Loading" />);
    expect(page).toContain("sm-bar");
    expect(page).toContain("sm-type");
  });

  it("shows analytics in the real card parts, with the real labels", () => {
    const k = html(<KpisGhost labels={["Hires", "Replies"]} />);
    expect(k).toContain("<dt>Hires</dt>");
    expect(k.match(/an-muted/g)).toHaveLength(2);
    expect(html(<HBarsGhost n={4} />).match(/<li>/g)).toHaveLength(4);
    const t = html(<TableGhost heads={["Week", ">Hired"]} rows={3} />);
    expect(t).toContain('<th scope="col">Week</th>');
    expect(t).toContain('<th scope="col" class="is-r">Hired</th>');
    expect(t.match(/<tr>/g)).toHaveLength(4);
  });
});

/**
 * A ghost is built from its page's own classes. This reads each page's ghost and checks that every class it uses is
 * one the page's stylesheets define (or a shimmer class), so a ghost cannot drift from a renamed class unnoticed.
 */
describe("ghosts use classes the page defines", () => {
  const allCss = (() => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "node_modules" && f !== "__tests__") walk(p); } else if (/\.css$/.test(f)) out.push(readFileSync(p, "utf8"));
      }
    };
    walk(SRC);
    return out.join("\n");
  })();
  const defined = (c: string) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(allCss);
  /** The classes a stretch of source writes as `className="a b"`, with the ones made by a template left out. */
  const classesIn = (src: string) => [...src.matchAll(/className="([^"{}$]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)).filter(Boolean);
  const GHOSTS: [string, RegExp][] = [
    ["Home.tsx", /function HomeShimmer[\s\S]*$/],
    ["Clients.tsx", /function ClientsGhost[\s\S]*?\n}\n/],
    ["CampaignsPage.tsx", /function CampaignsGhost[\s\S]*?\n}\n/],
    ["CampaignWorkspace.tsx", /function OverviewGhost[\s\S]*?\n}\n/],
    ["CampaignWorkspace.tsx", /function BoardGhost[\s\S]*?\n}\n/],
    ["CampaignWorkspace.tsx", /function TableGhost[\s\S]*?\n}\n/],
    ["CampaignForms.tsx", /function FormsGhost[\s\S]*?\n}\n/],
    ["FormResponses.tsx", /function ResponsesGhost[\s\S]*?\n}\n/],
    ["RoleSpecPanel.tsx", /function SpecGhost[\s\S]*?\n}\n/],
    ["ComingUp.tsx", /function ComingGhost[\s\S]*?\n}\n/],
    ["TasksPanel.tsx", /function TasksGhost[\s\S]*?\n}\n/],
    ["DialerPage.tsx", /function Skeleton[\s\S]*?\n}\n/],
    ["NoCampaign.tsx", /function NoCampaignGhost[\s\S]*?\n}\n/],
    ["klGhosts.tsx", /[\s\S]*/],
    ["settingsGhosts.tsx", /[\s\S]*/],
    ["analyticsGhosts.tsx", /[\s\S]*/],
  ];
  it.each(GHOSTS)("%s (%#)", (file, part) => {
    const src = readFileSync(join(SRC, file), "utf8");
    const mine = part.exec(src)?.[0] ?? "";
    expect(mine.length, `${file} has no ghost where it was expected`).toBeGreaterThan(80);
    const stray = [...new Set(classesIn(mine))].filter((c) => !/^(shm|sr-only|is-)/.test(c) && !/^t-/.test(c) && !defined(c));
    expect(stray, `${file} uses classes no stylesheet defines: ${stray.join(", ")}`).toEqual([]);
  });

  it("puts the page's real words in the ghost: titles, column heads and labels are not tiles", () => {
    const read = (f: string) => readFileSync(join(SRC, f), "utf8");
    expect(read("Home.tsx")).toMatch(/<h2>My tasks<\/h2>[\s\S]*<h2>Insights<\/h2>[\s\S]*<h2>Your week<\/h2>[\s\S]*<h2>Active campaigns<\/h2>/);
    expect(read("Home.tsx")).toMatch(/<span>Task<\/span><span className="hm-tl-c-camp">Campaign<\/span>/);
    expect(read("Home.tsx")).toMatch(/<Shimmer ring=\{7\}/);
    expect(read("Clients.tsx")).toMatch(/<h1 className="cw-h1">Clients<\/h1>[\s\S]*Search by company, contact or city/);
    expect(read("Clients.tsx")).toMatch(/\["cli-c-name", "Client"\]/);
    expect(read("CampaignWorkspace.tsx")).toMatch(/<h3>Funnel<\/h3>[\s\S]*<h3>Sourced per day<\/h3>/);
    expect(read("CampaignWorkspace.tsx")).toMatch(/<span \{\.\.\.stageText\(s, columns\.indexOf\(s\)\)\}>\{s\.name\}<\/span>/);
  });

  it("keeps the old generic skeletons out of the pages", () => {
    const stray: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "__tests__" && f !== "node_modules") walk(p); continue; }
        if (!/\.tsx$/.test(f) || f === "Shimmer.tsx") continue;
        const hits = readFileSync(p, "utf8").split("\n").filter((l) => /<Shimmer(Rows|Cards|Page|Board|Table|Panel|Grid)\b/.test(l));
        if (hits.length) stray.push(`${relative(SRC, p)}: ${hits.map((h) => h.trim()).join(" | ")}`);
      }
    };
    walk(SRC);
    expect(stray, `A page's wait is a ghost of that page:\n${stray.join("\n")}`).toEqual([]);
  });
});
