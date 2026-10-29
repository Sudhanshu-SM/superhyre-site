import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Loader } from "../components/Loader";
import { PageLoader } from "../components/PageLoader";

/**
 * The one loader: the mark with a ring round it, in three sizes. These pin what a screen reader is told and that
 * the same markup is used everywhere, not how it moves (that is the stylesheet's, and `prefers-reduced-motion`).
 */

describe("the loader", () => {
  it("is the SuperHyre mark inside a ring, with the ring's arc and track", () => {
    const html = renderToStaticMarkup(<Loader size="md" />);
    expect(html).toContain("ldr-mark");
    expect(html).toContain("ldr-track");
    expect(html).toContain("ldr-arc");
    // The mark is the logo's own path, not a second drawing of it.
    expect(html).toContain("M16.047 0.496124");
  });

  it("says what it is waiting for when it has a label, as a status", () => {
    const html = renderToStaticMarkup(<Loader label="Loading candidates" />);
    expect(html).toMatch(/<span class="ldr is-md" role="status">/);
    expect(html).toContain("Loading candidates");
  });

  it("is decoration when it sits beside words that already say it", () => {
    const html = renderToStaticMarkup(<Loader size="sm" />);
    expect(html).not.toContain('role="status"');
    expect(html).toMatch(/<span class="ldr is-sm"[^>]*aria-hidden="true"/);
  });

  it.each(["sm", "md", "lg"] as const)("has a %s size", (size) => {
    expect(renderToStaticMarkup(<Loader size={size} />)).toContain(`is-${size}`);
  });

  it("can take the colour of the words around it, and centre itself in the room it is given", () => {
    expect(renderToStaticMarkup(<Loader size="sm" tone="inherit" />)).toContain("is-inherit");
    const block = renderToStaticMarkup(<Loader size="lg" label="Loading" block />);
    expect(block).toContain("ldr-block is-lg");
  });
});

describe("the loader for a whole page", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("is the one loader, with what it is waiting for said to a screen reader", () => {
    const html = renderToStaticMarkup(<PageLoader label="Reading the people found" />);
    expect(html).toMatch(/class="ldr-page( is-now)?"/);
    expect(html).toContain("ldr-mark");
    expect(html).toContain("Reading the people found");
    expect(html).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<PageLoader />)).toContain(">Loading<");
  });

  it("sits in the middle of the window, over the page's place, as the loader the app starts with does, and moves nowhere", () => {
    const css = src("components/loader.css");
    const rule = /\.ldr-page \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position: fixed/);
    expect(rule).toMatch(/inset: 0/);
    expect(rule).toMatch(/place-items: center/);
    expect(rule).toMatch(/pointer-events: none/);
    // The app's own start-up loader is centred the same way, so the two are one loader from the first frame.
    const boot = /\.boot \{([^}]*)\}/.exec(readFileSync(join(__dirname, "..", "access.css"), "utf8"))?.[1] ?? "";
    expect(boot).toMatch(/position: fixed/);
    expect(boot).toMatch(/place-items: center/);
  });

  it("stays out of sight for a beat, so a page that arrives at once never shows it flashing, and is in sight whenever animation is off", () => {
    const css = src("components/loader.css");
    // Hidden only by the keyframe's start (held by the delay); the base rule is visible, so nothing that strips animation can hide it.
    expect(css).toMatch(/\.ldr-page \{[^}]*animation: ldr-page-in \d+ms ease-out \d+ms both;/);
    expect(/\.ldr-page \{([^}]*)\}/.exec(css)?.[1]).not.toMatch(/opacity: 0/);
    expect(css).toMatch(/@keyframes ldr-page-in \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
  });

  it("has no beat when one loader is handed to another, or while the app is only just starting, so it never blinks", () => {
    expect(src("components/loader.css")).toMatch(/\.ldr-page\.is-now \{ animation: none; \}/);
    const page = src("components/PageLoader.tsx");
    expect(page).toContain("useState(() =>");
    expect(page).toContain("is-now");
    expect(page).toMatch(/HANDOVER_MS/);
  });

  it("is what the console shows while a page's file arrives and what the Sourced page shows while its people are read", () => {
    expect(src("consolePages.tsx")).toMatch(/export function PageFallback\(\): JSX\.Element \{\s*return <PageLoader \/>;/);
    const sourced = src("SourcedPage.tsx");
    expect(sourced).toMatch(/if \(LIVE && state === "loading" && !set\) return <PageLoader label="Reading the people found" \/>;/);
    // The early return comes after every hook, never between two of them.
    const before = sourced.slice(0, sourced.indexOf("return <PageLoader"));
    const after = sourced.slice(sourced.indexOf("return <PageLoader"));
    expect(after).not.toMatch(/\buse(State|Effect|Callback|Memo|Ref)\(/);
    expect(before).toMatch(/useEffect\(/);
  });
});
