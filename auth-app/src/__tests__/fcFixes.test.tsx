import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { contactFromRow } from "../api/candidates";
import { importMessage } from "../api/candidates";
import { arrowsStepRows, candidateHref } from "../callsView";
import { classifyRows, rowProblems, rowToDraft, seniorityFrom, tally, autoMap, buildIndex } from "../candidateImport";
import { experienceLabel, matches, mostYears, EMPTY_FILTERS } from "../contacts";
import type { Contact } from "../contacts";
import { parseColor } from "../theme/darkColors";
import { pageTitle } from "../pageTitle";
import { campaignTag, ideasFromCampaigns, chipLabel } from "../recs";
import type { CampaignRow } from "../campaignsData";
import { SupportPage, SUPPORT_EMAIL } from "../SupportPage";
import { closeOnBack } from "../ui";
import { ART_ROOM, HireList } from "../OverviewPanel";

/**
 * The console-side fixes of the 12 Oct end-to-end round (R4 and R2). Each block pins what the tester saw: the
 * cause where it is a behaviour, the words where it is copy, and the stylesheet's own numbers where it is contrast
 * or layout (a stylesheet is read, not copied here, so these fail when the rule goes).
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const root = (f: string) => readFileSync(resolve(__dirname, "../..", f), "utf8");

/* ───────────── a browser's history, small enough to reason about ───────────── */

/**
 * A stack, a cursor and popstate. `back()` is asynchronous like a browser's (it is queued and runs after the
 * navigation already in progress), and a fragment navigation fires popstate too, as Chromium does.
 */
function browser(start = "#/calls") {
  const entries: { url: string; state: unknown }[] = [{ url: start, state: null }];
  let at = 0;
  const listeners = new Set<() => void>();
  const queued: Array<() => void> = [];
  const fire = () => { for (const l of [...listeners]) l(); };
  const host = {
    location: {
      get href() { return `http://app/${entries[at]!.url}`; },
      assign(href: string) { entries.splice(at + 1); entries.push({ url: href, state: null }); at++; fire(); },
      replace(href: string) { entries[at] = { url: href, state: null }; fire(); },
    },
    history: {
      get state() { return entries[at]!.state; },
      pushState(state: unknown, _t: string, url: string) { entries.splice(at + 1); entries.push({ url: url.replace("http://app/", ""), state }); at++; },
      back() { queued.push(() => { if (at > 0) { at--; fire(); } }); },
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  return {
    /** What the dialog is given. */
    host: host as never,
    /** The same, to be driven directly. */
    raw: host,
    url: () => entries[at]!.url,
    depth: () => at,
    settle: () => { while (queued.length) queued.shift()!(); },
    press: () => { host.history.back(); while (queued.length) queued.shift()!(); },
  };
}

describe("R4 D11: Open candidate from a call opens the candidate", () => {
  it("shows the cause: closing the sheet before the link navigates asks the browser to go Back after the link", () => {
    const b = browser();
    const dispose = closeOnBack(b.host, () => {});
    // The click closes the sheet (React commits before the anchor's own navigation), so its entry is still on top.
    dispose();
    b.raw.location.assign("#/contacts?open=11111111-1111-1111-1111-111111111111");
    b.settle();
    expect(b.url()).toBe("#/calls");
  });

  it("goes on to the candidate, and Back from there is the calls page", () => {
    const b = browser();
    let closedByBack = 0;
    const guard = closeOnBack(b.host, () => { closedByBack++; });
    expect(b.depth()).toBe(1);
    const href = candidateHref("11111111-1111-1111-1111-111111111111");
    guard.leaveTo(href);
    guard(); // the sheet unmounts as the page changes
    b.settle();
    expect(b.url()).toBe(href);
    // The sheet's entry was swapped for the candidate's, not left under it.
    expect(b.depth()).toBe(1);
    // It was a link, not a Back.
    expect(closedByBack).toBe(0);
    b.press();
    expect(b.url()).toBe("#/calls");
  });

  it("only swaps the entry when the sheet's entry is the one the page is on, else it just navigates", () => {
    const b = browser();
    const guard = closeOnBack(b.host, () => {});
    // Something else pushed on top of the sheet's entry.
    b.raw.history.pushState({ other: true }, "", "http://app/#/calls");
    guard.leaveTo("#/contacts?open=x");
    expect(b.url()).toBe("#/contacts?open=x");
    expect(b.depth()).toBe(3);
  });

  it("keeps Back closing the sheet as before", () => {
    const b = browser();
    let closed = 0;
    const guard = closeOnBack(b.host, () => { closed++; });
    b.press();
    expect(closed).toBe(1);
    guard();
    expect(b.url()).toBe("#/calls");
    expect(b.depth()).toBe(0);
  });

  it("is the sheet's link that goes through the sheet's own entry, for a plain click only", () => {
    const sheet = src("CallSheet.tsx");
    expect(sheet).toContain("const leaveTo = useBackCloses(true, () => { onClose(); });");
    expect(sheet).toContain("leaveTo(candidateHref(hint.candidate!.id));");
    // A new tab, a window or a copied link keeps the browser's behaviour.
    expect(sheet).toMatch(/e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/);
    // Not the old one: closing first and letting the anchor navigate afterwards.
    expect(sheet).not.toContain("onClick={() => onClose()}");
  });

  it("links to Candidates with the person's profile open", () => {
    expect(candidateHref("a b")).toBe("#/contacts?open=a%20b");
    expect(/[?&]open=([0-9a-f-]{36})(?:&|$)/i.exec(candidateHref("11111111-1111-1111-1111-111111111111"))?.[1]).toHaveLength(36);
  });
});

/* ───────────── D15 ───────────── */

const person = (over: Partial<Contact>): Contact => ({
  id: "p", name: "A B", hue: "brand", title: "", company: "", location: "", seniority: null, years: 0, industry: "",
  skills: [], linkedin: "", campaign: "", capturedBy: "", capturedAgo: 0, profile: "full", openToWork: false, jobs: [],
  ...over,
});

describe("R4 D15: Compare says 'Not on the profile' for unknown experience", () => {
  it("never reads an unknown number of years as '0 yrs', and never works a level out of it", () => {
    expect(experienceLabel(person({ years: 0, seniority: null }))).toBeNull();
    expect(experienceLabel(person({ years: 0, seniority: "Lead" }))).toBeNull();
    expect(experienceLabel(person({ years: 7, seniority: "Senior" }))).toBe("7 yrs · Senior");
    expect(experienceLabel(person({ years: 7, seniority: null }))).toBe("7 yrs");
    expect(seniorityFrom("", 0)).toBeNull();
    expect(seniorityFrom("Engineer", null)).toBeNull();
    expect(seniorityFrom("Engineer", 4)).toBe("Mid");
  });

  it("comes through from a row whose years are NULL in the database", () => {
    const c = contactFromRow({
      id: "c1", fullName: "R4 Imp Alpha", currentTitle: "Engineer", headline: null, currentCompanyName: "", city: null, country: null,
      yearsOfExperience: null, email: null, phone: null, linkedinUrl: null, campaigns: [], createdAt: "2026-10-01T00:00:00Z",
      completeness: "full", source: "import", hasEmail: false, hasPhone: false,
    } as never);
    expect(c.years).toBe(0);
    expect(c.seniority).toBeNull();
    expect(experienceLabel(c)).toBeNull();
  });

  it("marks the most experienced only when at least two people have years on the profile", () => {
    expect(mostYears([{ years: 0 }, { years: 0 }])).toBe(-1);
    expect(mostYears([{ years: 0 }, { years: 6 }])).toBe(-1);
    expect(mostYears([{ years: 3 }, { years: 6 }, { years: 0 }])).toBe(6);
    expect(mostYears([{ years: 6 }, { years: 6 }])).toBe(-1);
  });

  it("is not matched by a level filter, which it has none of", () => {
    expect(matches(person({ seniority: null }), { ...EMPTY_FILTERS, seniority: ["Mid"] }, "")).toBe(false);
    expect(matches(person({ seniority: "Mid" }), { ...EMPTY_FILTERS, seniority: ["Mid"] }, "")).toBe(true);
  });

  it("is what the Compare dialog draws for the row, in both of its dialogs", () => {
    const contacts = src("Contacts.tsx");
    expect(contacts).toContain("experienceLabel(p)");
    expect(contacts).not.toContain("{p.years} yrs · {p.seniority}");
    expect(contacts).toContain('LIVE ? "Not on the profile"');
    expect(src("CompareDialog.tsx")).toContain("Not on the profile");
  });
});

/* ───────────── D1, D3: copy ───────────── */

/** The words in a source file: string literals and JSX text, comments stripped. */
function said(file: string): string[] {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  const text = strip(src(file))
    .split("\n")
    .filter((l) => !/^\s*(import|export)\b.*\bfrom\b/.test(l) && !/^\s*import\s+["']/.test(l))
    .join("\n");
  return [
    ...[...text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => (m[2] ?? "").replace(/\$\{[^}]*\}/g, "")),
    ...[...text.matchAll(/>([^<>{}=;]{3,})</g)].map((m) => m[1] ?? ""),
  ].filter((l) => !/^[/.\w-]*$/.test(l));
}

describe("R4 D1 and D3: copy", () => {
  it("says nothing of the extension or the dialer where calls are empty", () => {
    const page = said("CallsPage.tsx").join("\n");
    expect(page).toContain("Calls you place from SuperHyre show up here.");
    expect(page).not.toMatch(/extension|dialer/i);
    expect(said("nav.ts").join("\n")).not.toMatch(/extension|dialer/i);
  });

  it("does not call Personal or an organisation a workspace where a person reads it", () => {
    for (const f of ["Palette.tsx", "Nav.tsx", "AddCandidates.tsx", "Contacts.tsx", "agentCards/ExportCard.tsx", "nav.ts", "NewCampaign.tsx", "DialerPage.tsx", "workspaces.ts"]) {
      for (const line of said(f)) expect(line, `${f}: ${line}`).not.toMatch(/\bworkspaces?\b/i);
    }
  });

  it("names the palette's last group, and the switcher's search, in the product's own words", () => {
    const palette = src("Palette.tsx");
    expect(palette).toContain('group: "Account"');
    expect(src("Nav.tsx")).toContain('placeholder="Search organisations"');
  });

  it("keeps the Chrome extension link in Add candidates as it was (the owner decides)", () => {
    expect(src("AddCandidates.tsx")).toContain("Add the Chrome extension");
  });
});

/* ───────────── D4, D5: the loader ───────────── */

describe("R4 D4 and D5: busy is the shared loader, never a plain ring", () => {
  it("is the loader inside the public form's submit button", () => {
    const form = src("ApplyForm.tsx");
    expect(form).toContain('import { Loader } from "./components/Loader";');
    expect(form).toContain('<Loader size="sm" tone="inherit" />Sending');
    expect(form).not.toContain("ap-spin");
    expect(src("apply.css")).not.toMatch(/\.ap-spin|@keyframes ap-spin/);
  });

  it("is the loader on the set-up's working row, at the size of the tick beside it", () => {
    const list = src("setup/lean/SetupProgress.tsx");
    expect(list).toContain('import { Loader } from "../../components/Loader";');
    expect(list).toContain('<Loader size="sm" tone="inherit" />');
    expect(list).not.toContain("ls-spin");
    expect(src("setup/lean/parts.css")).not.toMatch(/\.ls-spin\b|ls-turn/);
    expect(src("setup/lean/parts.css")).toMatch(/\.ls-sp-ldr \.ldr\.is-sm \{\s*width: 22px;/);
  });
});

/* ───────────── D12 ───────────── */

/** An element that matches the selectors it is given, and says so through `closest`. */
const el = (...matches: string[]) => ({
  closest: (selector: string) => (selector.split(",").map((s) => s.trim()).some((s) => matches.includes(s)) ? {} : null),
});

describe("R4 D12: Up and Down move through the calls from inside the open sheet", () => {
  it("steps from the sheet itself, its buttons and its link, but not while typing or picking", () => {
    expect(arrowsStepRows(el(".kl-sheet"))).toBe(true);
    expect(arrowsStepRows(el(".kl-sheet", "button"))).toBe(true);
    expect(arrowsStepRows(el())).toBe(true);
    expect(arrowsStepRows(null)).toBe(true);
    // The note field and the pickers are inside the sheet, and keep their arrow keys.
    expect(arrowsStepRows(el(".kl-sheet", "textarea"))).toBe(false);
    expect(arrowsStepRows(el(".kl-sheet", "input"))).toBe(false);
    expect(arrowsStepRows(el(".kl-sheet", "select"))).toBe(false);
    expect(arrowsStepRows(el(".kl-sheet", "[contenteditable]"))).toBe(false);
    expect(arrowsStepRows(el(".kl-sheet", "[role=slider]"))).toBe(false);
  });

  it("is the rule the page uses, and keeps the sheet's focus when the key came from there", () => {
    const page = src("CallsPage.tsx");
    expect(page).toContain("if (!arrowsStepRows(t)) return;");
    // The sheet is no longer one of the places that keep the arrows.
    expect(page).not.toMatch(/closest\("input, textarea, select, \[contenteditable\], \.kl-sheet/);
    expect(page).toContain('if (t?.closest(".kl-sheet"))');
  });
});

/* ───────────── D9, D14, D23, D25: layout ───────────── */

describe("R4 D9: the call sheet fits a phone", () => {
  const css = src("calls.css");

  it("gives the player one column no wider than its card, and bars that can shrink", () => {
    expect(css).toMatch(/\.kl-player-main \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.kl-wave i \{[^}]*min-width: 0;/);
    // 96 bars and 95 gaps of 2px were 286px: the minimum that overran a 266px card at 390.
    expect(css).toMatch(/@media \(max-width: 640px\) \{[\s\S]*?\.kl-wave \{ gap: 1px; \}/);
  });

  it("keeps the filter row on one line beside an open sheet", () => {
    expect(css).toMatch(/html\.kl-sheet-open \.kl-bar:not\(:has\(\.kl-dates\)\) \{ flex-wrap: nowrap; \}/);
    expect(css).toMatch(/html\.kl-sheet-open \.kl-bar \.kl-pick \{ flex: 1 1 0; min-width: 112px; max-width: 148px; \}/);
  });
});

describe("R4 D14: the agent's composer is docked on a narrow screen, short chat or long", () => {
  it("makes a live stream at least a window tall, and lets the log take the slack", () => {
    const css = src("access.css");
    const stacked = css.slice(css.indexOf("@media (max-width: 1100px) {\n  /* ── THE STACK"));
    expect(stacked).toMatch(/\.orc-stream\.is-live \.orc-log \{ flex: 1 0 auto; min-height: 0; \}/);
    // The window less the phone's 62px bar (exactly the window: a taller stream has the follower scroll the composer
    // off its dock), and the whole window where the bar is not drawn.
    expect(stacked).toMatch(/\.orc-stream\.is-live \{ min-height: calc\(100dvh - 62px\); \}\s*@media \(min-width: 900px\) \{[^}]*\.orc-stream\.is-live \{ min-height: 100dvh; \}/);
    // The composer still sticks to the foot of the window.
    expect(stacked).toMatch(/\.orc-stream\.is-live \.orc-composer \{\s*position: sticky;\s*bottom: 0;/);
  });
});

describe("R4 D23: the Hires card's picture is not cut", () => {
  it("stacks 'No hires yet.' under its picture, centred in the card (open or closed), with no fade below it", () => {
    const panel = src("OverviewPanel.tsx");
    expect(panel).toContain('<div className="hp-first is-none" ref={nobody}>');
    expect(panel).not.toContain('<div className="hp-art">');
    const css = src("workspace.css");
    expect(css).toMatch(/\.hp-first \{ display: grid; grid-template-columns: 96px minmax\(0, 1fr\);/);
    // Centred both ways, picture above the sentence; the first hire's own layout (beside the person) is untouched.
    expect(css).toMatch(/\.hp-first\.is-none \{\s*display: flex; flex-direction: column; align-items: center; justify-content: center;/);
    expect(css).toMatch(/\.hp-body:has\(\.hp-first\.is-none\) \{\s*display: flex; flex-direction: column;\s*padding-bottom: 12px;\s*-webkit-mask-image: none; mask-image: none;/);
    expect(css).toMatch(/\.hp-body:has\(\.hp-first\.is-none\) > \.hp-hires:only-child \{ flex: 1 1 auto;/);
  });

  it("leaves the picture out where the card is a hand's breadth tall (a 768px window), and keeps the words", () => {
    const panel = src("OverviewPanel.tsx");
    expect(ART_ROOM).toBe(164);
    expect(panel).toContain("setRoom(body.clientHeight >= ART_ROOM)");
    expect(panel).toMatch(/\) : \(\s*<div className="hp-first is-none is-bare" ref=\{nobody\}>\s*<p className="hp-none t-body">No hires yet\.<\/p>/);
    // Not measurable (no layout) is room, so the picture is there by default.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {}); // useLayoutEffect on the server
    expect(renderToStaticMarkup(<HireList m={{ hired: [], target: 2, phase: "active" } as never} onPerson={() => {}} onStage={() => {}} />)).toContain("<img");
    warn.mockRestore();
  });
});

describe("R4 D25: the first paint is the surface the console lands on", () => {
  it("is white in the light theme for a browser that has signed in before, and still sand for one that has not", () => {
    const html = root("index.html");
    expect(html).toContain("html { background: #f6ece1; }");
    expect(html).toContain('html[data-surface="app"] { background: #ffffff; }');
    // The same test the app's own boot uses (consoleChunk.ts hasStoredSession).
    expect(html).toContain("/^sb-.+-auth-token$/");
    expect(src("consoleChunk.ts")).toContain("/^sb-.+-auth-token$/");
    // The dark theme comes after, so it still wins.
    expect(html.indexOf('html[data-surface="app"]')).toBeLessThan(html.indexOf('html[data-theme="dark"] { background: #171717'));
    // And it is the console's own page colour.
    const css = src("access.css");
    expect(css).toMatch(/--page: #ffffff;\s*\/\*[\s\S]{0,40}|--page: #ffffff;/);
    expect(css).toContain('html[data-surface="app"]:not([data-theme="dark"]) .boot { background: #ffffff; }');
  });
});

/* ───────────── D6, D7 ───────────── */

const lum = (hex: string): number => {
  const c = parseColor(hex);
  if (!c) throw new Error(`not a colour: ${hex}`);
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const hexes = (css: string) => [...css.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0]);

describe("R4 D6: zero counts, closed rows and disabled words stay readable", () => {
  it("does not lay opacity over the closed row's figures: the colour is what recedes", () => {
    const css = src("campaigns-page.css");
    expect(css).not.toMatch(/\.cg-row\.is-closed \.cg-stats \{ opacity/);
    expect(css).toContain(".cg-row.is-closed .cg-stat dd { color: var(--ink-2); }");
    expect(css).toContain(".cg-row.is-closed .cg-stat.is-zero dd { color: var(--ink-3); }");
  });

  it("keeps the tertiary and secondary inks over 4.5:1 on the figures' panel in the light theme", () => {
    const tokens = src("access.css");
    const ink3 = /--ink-3:\s*(#[0-9a-f]{6})/i.exec(tokens)![1]!;
    const ink2 = /--ink-2:\s*(#[0-9a-f]{6})/i.exec(tokens)![1]!;
    expect(ratio(ink3, "#faf8f6")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ink2, "#faf8f6")).toBeGreaterThanOrEqual(4.5);
  });

  it("says a disabled or busy button's words in a token, at full strength, not in half-opacity ink", () => {
    const ui = src("ui.css");
    expect(ui).toMatch(/\.cg-btn\):disabled:not\([^)]*\.is-primary[^)]*\):not\(:has\(> svg:only-child\)\) \{\s*opacity: 1 !important;\s*color: var\(--ink-3\) !important;/);
    expect(ui).toContain('.kl-btn.is-primary:disabled:not(:has(> .ldr)):not([aria-busy="true"])');
    // The same token, on the dark card.
    const dark = src("theme/theme.css");
    const ink3 = /--ink-3:\s*(#[0-9a-f]{6})/i.exec(dark)![1]!;
    const card = /--card:\s*(#[0-9a-f]{6})/i.exec(dark)![1]!;
    expect(ratio(ink3, card)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("R4 D7: bars and arrows in the dark theme", () => {
  const dark = src("theme/theme.css");
  const card = /--card:\s*(#[0-9a-f]{6})/i.exec(dark)![1]!;

  it("draws the funnel's bars and the pipeline's stage strip in mid-tones, each over 3:1 on the card", () => {
    const bars = dark.slice(dark.indexOf("── bars that carry a number"));
    const found = hexes(bars.split("\n").filter((l) => /^(:root|\s)/.test(l) && /background/.test(l)).join("\n"));
    // Four funnel kinds with two ends each, four stage segments.
    expect(found.length).toBeGreaterThanOrEqual(12);
    for (const h of found) expect(ratio(h, card), h).toBeGreaterThanOrEqual(3);
    expect(bars).toContain(':root[data-theme="dark"] .pl-jseg.is-shortlisted');
    expect(bars).toContain(':root[data-theme="dark"] .ov2-bar.is-hired .ov2-bar-col i');
  });

  it("makes the shortlist pager's disabled arrows a dimmed token, not the light taupe literal that stayed light", () => {
    const css = src("workspace.css");
    expect(css).not.toContain("color: #c9c0b8");
    expect(css).toMatch(/\.sl-pager button:disabled \{ color: var\(--ink-3\); opacity: 0\.45;/);
  });
});

/* ───────────── D10 ───────────── */

describe("R4 D10: a picture that cannot arrive is not drawn", () => {
  it("falls back to nothing when the image fails, so the calm text stands alone", () => {
    const art = src("EmptyArt.tsx");
    expect(art).toContain("onError={() => setFailed(src)}");
    expect(art).toContain("if (failed === src) return null;");
  });

  it("still draws the picture when it loads", async () => {
    const { EmptyArt } = await import("../EmptyArt");
    expect(renderToStaticMarkup(<EmptyArt name="err-network" size={160} />)).toMatch(/<img[^>]+width="160"/);
  });
});

/* ───────────── D18 ───────────── */

describe("R4 D18: the CSV preview counts a row with no way to tell the person apart as needing a fix", () => {
  const map = autoMap(["Name", "Email", "Phone", "LinkedIn"]);
  const rows = [
    ["Asha Verma", "asha@acme.in", "", ""],
    ["Priya Nair", "", "", ""],
    ["", "", "", ""],
    ["Kiran", "kiran@", "", ""],
  ];
  const v = classifyRows(rows.map((r) => rowToDraft(r, map)), buildIndex([]));

  it("gives the same reason the server does, and only when nothing else is wrong with the row", () => {
    expect(v.map((x) => x.kind)).toEqual(["new", "error", "error", "error"]);
    expect(v[1]).toMatchObject({ row: 3, reasons: ["No LinkedIn, email or phone"] });
    expect(v[2]).toMatchObject({ reasons: ["No name"] });
    expect(v[3]).toMatchObject({ reasons: ["Email doesn't look right"] });
    expect(rowProblems(rowToDraft(["Asha Verma", "", "", ""], map))).toEqual(["No LinkedIn, email or phone"]);
  });

  it("counts them in 'rows need fixing'", () => {
    expect(tally(v)).toEqual({ fresh: 1, duplicates: 0, errors: 3 });
  });

  it("says in the result which row and why, with the name from the file", () => {
    const names = new Map([[3, "Priya Nair"], [9, "Dev Patel"]]);
    expect(importMessage({ created: 1, updated: 0, skipped: 0, errors: [{ row: 3, reasons: ["No LinkedIn, email or phone"] }], touched: [] }, (r) => names.get(r)))
      .toBe("1 candidate added. 1 row left out (row 3, Priya Nair: No LinkedIn, email or phone)");
    expect(importMessage({
      created: 5, updated: 0, skipped: 0, touched: [],
      errors: [
        { row: 3, reasons: ["No name"] }, { row: 5, reasons: ["Email doesn't look right", "Phone needs 8 to 15 digits"] },
        { row: 9, reasons: ["No LinkedIn, email or phone"] }, { row: 12, reasons: ["No name"] },
      ],
    }, (r) => names.get(r))).toBe(
      "5 candidates added. 4 rows left out (row 3, Priya Nair: No name; row 5: Email doesn't look right, Phone needs 8 to 15 digits; row 9, Dev Patel: No LinkedIn, email or phone; and 1 more)",
    );
  });

  it("is the CSV tab that gives the sheet's own names to the result", () => {
    expect(src("AddCandidates.tsx")).toContain("cands.importMessage(r, nameOf)");
  });
});

/* ───────────── D21, D22, D24, D20 ───────────── */

describe("R4 D21: what the Memory header says is true of the rows beneath it", () => {
  it("no longer says the agent names no candidate, which What happened's rows contradict", () => {
    const page = src("SettingsMemory.tsx");
    expect(page).not.toMatch(/names no\s+candidate/);
    expect(page).toMatch(/A candidate is\s+named only to people who can see them/);
  });
});

describe("R4 D22: a chip made from a long campaign name keeps the part that tells it apart", () => {
  it("drops the words campaigns share, and cuts the rest at a word", () => {
    expect(campaignTag("fn3 QA Product Designer", ["fn3 QA Backend Engineer"])).toBe("Product Designer");
    expect(campaignTag("fn3 QA Backend Engineer", ["fn3 QA Product Designer", "fn3 QA Data"])).toBe("Backend Engineer");
    expect(campaignTag("Designer", ["Designer"])).toBe("Designer");
    expect(campaignTag("Senior Machine Learning Platform Engineer, Payments", [])).toMatch(/^Senior Machine…$|^Senior Machine Learning…$/);
    expect(campaignTag("Senior Machine Learning Platform Engineer, Payments", []).length).toBeLessThanOrEqual(22);
  });

  it("gives the two chips of two similar campaigns different words, each leading with the campaign", () => {
    const row = (id: string, name: string): CampaignRow => ({
      id, name, department: "", location: "", status: "active", owner: "A", team: [],
      funnel: { sourced: 30, shortlisted: 6, contacted: 0, replied: 0, interviews: 0, hired: 0 },
      trend: Array.from({ length: 14 }, () => 1), target: 1, agents: [], updatedAgo: "", createdAgo: "",
    });
    const ideas = ideasFromCampaigns([row("a", "fn3 QA Product Designer"), row("b", "fn3 QA Backend Engineer")]);
    const labels = ideas.map(chipLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Product Designer: find more people");
    expect(labels).toContain("Backend Engineer: find more people");
    // What the chip sends still names the whole campaign.
    expect(ideas.find((i) => i.id === "more-a")?.prompt).toBe("Find more people for fn3 QA Product Designer");
  });
});

describe("R4 D24: a tab names the client and the form", () => {
  it("leads a client page with the client, and a form with the form, then where it lives", () => {
    expect(pageTitle({ route: "clients", detail: "Acme Hire" })).toBe("Acme Hire · Clients · SuperHyre");
    expect(pageTitle({ route: "clients" })).toBe("Clients · SuperHyre");
    expect(pageTitle({ route: "campaign-forms", detail: "Screening", campaign: "Product Designer" }))
      .toBe("Screening · Forms & responses · Product Designer · SuperHyre");
    expect(pageTitle({ route: "campaign-forms", campaign: "Product Designer" })).toBe("Forms & responses · Product Designer · SuperHyre");
  });

  it("is said by the client's page and the form's builder, and put back when they close", () => {
    expect(src("Clients.tsx")).toContain('<DetailTitle title={pageTitle({ route: "clients", detail: c.name })} fallback={pageTitle({ route: "clients" })} />');
    expect(src("CampaignForms.tsx")).toContain("<DetailTitle");
    // Closing puts the page's own title back, unless a new page has already said its own (see restoreTitle).
    expect(src("components/DocTitle.tsx")).toMatch(/return \(\) => restoreTitle\(document, title, fallback\);/);
    expect(src("components/DocTitle.tsx")).toMatch(/if \(doc\.title === own\) doc\.title = fallback;/);
  });
});

describe("R4 D20: no placeholder pages or tiles", () => {
  it("gives Support the public contact in one line, with no apology", () => {
    const html = renderToStaticMarkup(<SupportPage />);
    expect(SUPPORT_EMAIL).toBe("punith@superhyre.com");
    expect(html).toContain('href="mailto:punith@superhyre.com"');
    expect(html).toContain("Support");
    expect(html).not.toMatch(/built|on its way|sorry|soon/i);
    expect(src("Console.tsx")).toContain('route === "support" ? (\n            <SupportPage />');
  });

  it("has no 'Market news is on its way' tile in the live Home, and lays it out as three", () => {
    expect(src("HomeCards.tsx")).not.toContain("Market news is on its way");
    expect(src("HomeCards.tsx")).toContain("return LIVE ? null : <FixtureInsights onAsk={onAsk} />;");
    expect(src("Home.tsx")).toContain('className={`hm-bento${LIVE ? " is-three" : ""}`}');
    expect(src("home.css")).toContain(".hm-bento.is-three .hm-week { grid-column: 1 / -1; grid-row: 2; }");
  });
});
