import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleAsk } from "../setup/lean/LeanSetup";

/**
 * The first-role beat: the suggestions, "Something else…", and a quiet "Skip for now" in the same plain style as
 * "I'll add it later" on the description beat. Skipping carries on with no role; nothing is made for one.
 */
const markup = () =>
  renderToStaticMarkup(<RoleAsk previous={null} delay={0} reduce onDraft={() => {}} onPick={() => {}} onSkip={() => {}} />);

describe("the first role", () => {
  it("offers the suggestions, a way to type one, and Skip for now", () => {
    const html = markup();
    expect(html).toContain("Software Engineer");
    expect(html).toContain("Something else…");
    expect(html).toContain("Skip for now");
  });

  it("makes Skip for now a plain text action, not a button of its own kind", () => {
    const html = markup();
    expect(html).toMatch(/<button type="button" class="nx-act">Skip for now<\/button>/);
    // It comes after the list, so the list is read first.
    expect(html.indexOf("Skip for now")).toBeGreaterThan(html.indexOf("Something else…"));
  });
});
