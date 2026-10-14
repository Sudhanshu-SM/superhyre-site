import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Loader } from "../components/Loader";

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
