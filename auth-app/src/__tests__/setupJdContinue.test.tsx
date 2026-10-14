import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkJd, jdTryable } from "../setup/lean/steps";
import { AreaInput } from "../setup/lean/Voice";

/**
 * The job description beat: Continue is a button you can press as soon as there is something typed. When it
 * is not enough yet it says what is needed, in one calm line, and the cursor goes back into the field. It was
 * invisible and unclickable for a short text, so pressing where it would be did nothing and said nothing.
 */

const markup = (value: string, ok: boolean, tryable: boolean, problem: string | null = null) =>
  renderToStaticMarkup(
    <AreaInput
      id="nx-jd"
      label="Job description"
      value={value}
      onChange={() => {}}
      onSubmit={() => {}}
      placeholder="Paste it here"
      ok={ok}
      tryable={tryable}
      delay={0}
      reduce
      problem={problem}
    />,
  );

describe("Continue on the job description beat", () => {
  it("is there to press for a text that is too short to send, and gone for nothing at all", () => {
    expect(jdTryable("")).toBe(false);
    expect(jdTryable("   \n ")).toBe(false);
    expect(jdTryable("short text")).toBe(true);
    // Too short: not sendable, but pressable (it says why).
    expect(checkJd("short text").ok).toBe(false);
    expect(markup("short text", false, jdTryable("short text"))).toMatch(/class="nx-go is-on"/);
    expect(markup("short text", false, jdTryable("short text"))).not.toMatch(/aria-disabled="true"/);
    // Nothing typed: it stays out of the way.
    expect(markup("", false, jdTryable(""))).toMatch(/class="nx-go"/);
    expect(markup("", false, jdTryable(""))).toMatch(/aria-disabled="true"/);
  });

  it("says what is needed, in plain words and no scolding", () => {
    const short = checkJd("short text");
    expect(short).toEqual({ ok: false, problem: "Paste the whole job description, or add it later." });
    // The line is the field's own alert, read by a screen reader as it appears.
    const html = markup("short text", false, true, short.ok ? null : short.problem);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Paste the whole job description, or add it later.");
  });

  it("sends a real job description as it always did", () => {
    const jd = "Senior Backend Engineer. You will own the payments ledger, build services in Go and mentor two engineers.";
    expect(checkJd(jd)).toEqual({ ok: true, text: jd });
    expect(markup(jd, true, true)).toMatch(/class="nx-go is-on"/);
  });
});
