import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Form } from "../campaign";

/**
 * What the owner asked of the public form on 13 Oct: no talent-network tick, a brand-orange heading band with the
 * clipboard at its right, formal field density, no cover colour; and the form's link as a card when pasted.
 */

vi.mock("../api/client", () => ({
  LIVE: true, API_URL: "http://api.test", api: async () => undefined,
  messageOf: (e: unknown) => (e instanceof Error ? e.message : "Something went wrong."),
}));

const { ApplyForm, Done } = await import("../ApplyForm");
const { formLinks } = await import("../FormLinkChip");
const { TINTS, tintKey } = await import("../formKit");

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const form: Form = {
  id: "f1", campaign: "c1", name: "Data Analyst form", status: "live", sent: 0, accent: "#cc4d17", theme: "sage",
  title: "Data Analyst", description: "", questions: [{ id: "q1", type: "short", title: "Tell us about yourself", required: true }],
};

describe("the public form", () => {
  const html = renderToStaticMarkup(<ApplyForm form={form} mode="preview" />);

  it("sends at once: no emailed code, no line about one, no code step", () => {
    expect(html).toContain("Send application");
    expect(html).not.toMatch(/6-digit|confirm it's you|Check your email|emailed code/i);
    const src = read("ApplyForm.tsx");
    expect(src).not.toContain("CodeStep");
    expect(src).not.toMatch(/one-time-code|resendAt|Send a new code/);
    expect(read("apply.css")).not.toContain(".ap-code");
  });

  it("has no talent-network tick, and says nothing about a network", () => {
    expect(html).not.toMatch(/talent network/i);
    expect(html).not.toContain("ap-consent");
    expect(html).toContain("go only to the");
  });

  it("puts the heading in a band, with the clipboard, ahead of the role and the questions", () => {
    const band = html.indexOf('class="ap-band"');
    expect(band).toBeGreaterThan(-1);
    expect(html.indexOf("ap-band-art")).toBeGreaterThan(band);
    expect(html.indexOf("<h1")).toBeGreaterThan(band);
    expect(html.indexOf("Your application")).toBeGreaterThan(html.indexOf("ap-band-art"));
  });

  it("is the brand orange whatever cover colour an older form stored", () => {
    expect(tintKey("sage")).toBe("ember");
    expect(tintKey("lilac")).toBe("ember");
    expect(tintKey(null)).toBe("ember");
    expect(html).toContain(`--fm-fill:${TINTS.ember.fill}`);
  });
});

describe("the page's look, from its stylesheet", () => {
  const css = read("apply.css");
  const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

  it("makes fields 36px lines with their text on the line, and the button 40px", () => {
    const input = rule(".ap-input");
    expect(input).toMatch(/height:\s*36px/);
    expect(input).toMatch(/padding:\s*6px 0 8px/);
    expect(rule(".ap-submit")).toMatch(/height:\s*40px/);
    expect(rule(".ap-submit")).toMatch(/border-radius:\s*6px/);
  });

  it("keeps one column of blocks, 640px of field inside 24px of padding, a block gap apart", () => {
    expect(rule(".ap-sheet")).toMatch(/max-width:\s*688px/);
    expect(rule(".ap-sheet")).toMatch(/gap:\s*var\(--ap-block-gap\)/);
    expect(rule(".ap-block")).toMatch(/padding:\s*20px var\(--ap-pad\) 22px/);
    expect(css).toMatch(/--ap-pad:\s*24px/);
    expect(rule(".ap-fields")).toMatch(/gap:\s*var\(--ap-block-gap\)/);
    expect(rule(".ap-who")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
  });

  it("hides the picture on a narrow page, and draws the band in white text on the orange", () => {
    expect(css).toMatch(/@media \(max-width: 559px\)\s*\{\s*\.ap-band-art \{ display: none; \}/);
    expect(rule(".ap-band")).toMatch(/background:\s*var\(--ap-band\)/);
    expect(css).toMatch(/--ap-band:\s*#cc4d17/);
    expect(rule(".ap-band .ap-h1")).toMatch(/color:\s*#fff/);
  });
});

describe("the thank-you screen", () => {
  const who = { name: "Arnab Jay", email: "arnab@acme.com", phone: "", linkedin: "" };
  const done = (over: Partial<Parameters<typeof Done>[0]> = {}) =>
    renderToStaticMarkup(<Done refEl={{ current: null }} who={who} already={null} message={null} company="Acme" preview={false} onReset={() => {}} {...over} />);

  it("is a small check mark in a circle, the heading and one line, with no picture", () => {
    const html = done();
    expect(html).toContain('class="ap-done-mark"');
    expect(html).toContain("ap-done-ring");
    expect(html).toContain("ap-done-tick");
    expect(html).not.toContain("<img");
    expect(html).toContain("Thanks, Arnab. Your application is in.");
    expect(html).toContain("Acme&#x27;s hiring team will read it and get back to you at arnab@acme.com.");
    expect((html.match(/<p[ >]/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<button");
  });

  it("says a preview was a preview, and offers to start over, only in the preview", () => {
    expect(done({ preview: true })).toContain("This was a preview, so nothing was sent.");
    expect(done()).not.toContain("a preview");
  });

  it("keeps the owner's own words when the form has some", () => {
    expect(done({ message: "We reply on Fridays." })).toContain("We reply on Fridays.");
  });

  it("sits centred in a card with the form's normal edge: focus on its heading never draws the orange ring", () => {
    const css = read("apply.css");
    expect(css).toMatch(/\.ap-done \{[^}]*justify-items: center[^}]*text-align: center/);
    expect(css).toMatch(/\.ap-block\.is-note:focus-within \{[^}]*border-color: var\(--ap-block-line\)/);
    expect(read("ApplyForm.tsx")).not.toContain("form-thanks");
  });
});

describe("the builder", () => {
  const src = read("CampaignForms.tsx");

  it("has no cover colour choice", () => {
    expect(src).not.toContain("CoverPicker");
    expect(src).not.toContain("Cover colour");
  });

  it("shows the link, with Copy link and Open, on the page header once published", () => {
    expect(src).toContain('className="fm-linkbar"');
    expect(src).toMatch(/href=\{link\} target="_blank"/);
    expect(src).toMatch(/\{link && <CopyLink link=\{link\} \/>\}/);
  });
});

describe("a pasted form link", () => {
  const key = "09QebQtp8vPlGA2rFD94Dj6h";

  it("is found once, on the API's share address", () => {
    const found = formLinks(`here you go http://api.test/share/${key}. and again http://api.test/share/${key}`);
    expect(found).toEqual([{ url: `http://api.test/share/${key}`, key, host: "api.test" }]);
  });

  it("leaves other hosts, short keys and ordinary links alone", () => {
    expect(formLinks(`https://elsewhere.example/share/${key}`)).toEqual([]);
    expect(formLinks("http://api.test/share/abc")).toEqual([]);
    expect(formLinks("see https://superhyre.com/pricing")).toEqual([]);
  });
});
