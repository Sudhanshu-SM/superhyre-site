import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActivityRow } from "../api/outreachActivity";
import { redirectedHash } from "../nav";
import { OutreachLine, OutreachToolbar, readListRemembered } from "../OutreachPage";
import { statusFilterOf, statusFiltersFor, statusWords } from "../outreachActivityView";
import { forgetSection, loadSection, saveSection, settledOffset } from "../sectionState";

const src = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: "r1", channel: "email", at: "2026-10-18T10:00:00.000Z", campaignId: "c1", campaignName: "Platform", clientName: null, candidateId: "p1",
  candidateName: "Asha Rao", candidateTitle: null, candidateCompany: null, direction: "out", by: null, status: "waiting", subject: "Hello",
  preview: null, phone: null, durationSeconds: null, ...over,
});
const line = (r: ActivityRow) => renderToStaticMarkup(<OutreachLine r={r} on={false} showBy={false} hit="" onOpen={() => undefined} />);

describe("a remembered page survives coming back", () => {
  /** One visit: read the tab's memory, lay out with the size it was left at, and save as the page does. */
  const visit = (store: Storage, section: string, total: number, measured: number) => {
    const start = loadSection(section, readListRemembered, readListRemembered({}), store);
    let wanted = start.offset;
    // First render: the total is not known yet, and the size is the one the page was left at.
    const first = settledOffset(wanted, null, start.size);
    expect(first.fix).toBeNull();
    // The list arrives; the window gives the same size.
    const later = settledOffset(wanted, total, measured);
    if (later.fix !== null) wanted = later.fix;
    saveSection(section, { ...start, offset: later.offset, size: measured }, store);
    return later.offset;
  };
  const fake = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
  };

  it("keeps page 2 and page 3 across a mount, an unmount and a return", () => {
    const s = fake();
    saveSection("outreach", { offset: 10, size: 10 }, s);
    expect(visit(s, "outreach", 54, 10)).toBe(10);
    expect(visit(s, "outreach", 54, 10)).toBe(10);
    saveSection("outreach:c1", { offset: 20, size: 10 }, s);
    expect(visit(s, "outreach:c1", 54, 10)).toBe(20);
    expect(visit(s, "outreach:c1", 54, 10)).toBe(20);
  });

  it("does not round a remembered page against an unmeasured size or an unknown total", () => {
    expect(settledOffset(20, null, 15)).toEqual({ offset: 15, fix: null });
    expect(settledOffset(10, null, 15).fix).toBeNull();
  });

  it("still brings it back inside the list when the list is shorter, or the size changed", () => {
    expect(settledOffset(40, 23, 10)).toEqual({ offset: 20, fix: 20 });
    expect(settledOffset(30, 100, 20)).toEqual({ offset: 20, fix: 20 });
    expect(settledOffset(10, 54, 10)).toEqual({ offset: 10, fix: null });
  });

  it("is forgotten with the section", () => {
    const s = fake();
    saveSection("outreach", { offset: 10 }, s);
    forgetSection("outreach", s);
    expect(loadSection("outreach", readListRemembered, readListRemembered({}), s).offset).toBe(0);
  });

  it("saves the size with the page and wires the fix only once the total is known", () => {
    for (const f of ["OutreachPage.tsx", "CallsPage.tsx"]) {
      const code = src(f);
      expect(code, f).toContain("settledOffset(wanted, listTotal, size)");
      expect(code, f).toContain("fallback: start.size");
      expect(code, f).toMatch(/useSectionSave\(section, \{[^}]*offset, size \}/);
    }
  });
});

describe("outreach statuses", () => {
  it("offers Draft, Scheduled and Didn't send for email, and call outcomes for calls", () => {
    const email = statusFiltersFor("email").map((o) => o.label);
    expect(email).toEqual(expect.arrayContaining(["Draft", "Scheduled", "Didn't send"]));
    const calls = statusFiltersFor("call").map((o) => o.label);
    expect(calls).toEqual(["Connected", "Voicemail", "No answer", "Call back", "Not interested", "Didn't connect"]);
    expect(statusFiltersFor("").map((o) => o.value)).toEqual(expect.arrayContaining(["draft", "voicemail", "call_back", "not_interested", "failed"]));
    expect(statusFiltersFor("whatsapp").map((o) => o.value)).toEqual(["replied", "waiting"]);
  });

  it("drops a status the channel does not have", () => {
    expect(statusFilterOf("draft", "email")).toBe("draft");
    expect(statusFilterOf("draft", "call")).toBe("");
    expect(statusFilterOf("voicemail", "email")).toBe("");
    expect(readListRemembered({ tab: "email", status: "voicemail" }).status).toBe("");
    expect(readListRemembered({ tab: "call", status: "voicemail" }).status).toBe("voicemail");
  });

  it("calls the filter Outcome for calls, with the outcomes from the data", () => {
    const props = { q: "", onQ: () => undefined, status: "", onStatus: () => undefined, preset: "any" as const, onPreset: () => undefined, custom: { from: "", to: "" }, onCustom: () => undefined, person: "", onPerson: () => undefined, people: [], showPerson: false };
    const calls = renderToStaticMarkup(<OutreachToolbar {...props} tab="call" />);
    expect(calls).toContain('aria-label="Outcome"');
    expect(calls).toContain("All outcomes");
    expect(calls).toContain("Voicemail");
    expect(calls).toContain("Not interested");
    const email = renderToStaticMarkup(<OutreachToolbar {...props} tab="email" />);
    expect(email).toContain('aria-label="Status"');
    expect(email).toContain(">Draft<");
    expect(email).not.toContain("Voicemail");
  });

  it("reads a sent email as Sent with the wait under it, a draft as Draft with Review, and a failed call as Didn't connect", () => {
    expect(statusWords(row({}))).toEqual({ label: "Sent", sub: "Waiting for a reply", action: false });
    expect(statusWords(row({ status: "draft" }))).toEqual({ label: "Draft", sub: "Review", action: true });
    expect(statusWords(row({ status: "failed" })).label).toBe("Didn't send");
    expect(statusWords(row({ channel: "call", status: "failed" })).label).toBe("Didn't connect");
    expect(statusWords(row({ channel: "whatsapp", status: "waiting" })).label).toBe("Waiting for a reply");
    const sent = line(row({}));
    expect(sent).toContain("Sent");
    expect(sent).toMatch(/kl-how-sub[^>]*>Waiting for a reply</);
    const draft = line(row({ status: "draft" }));
    expect(draft).toContain("Draft");
    expect(draft).toMatch(/kl-how-sub is-act[^>]*>Review</);
    expect(line(row({ channel: "call", status: "failed" }))).toContain("Didn&#x27;t connect");
  });
});

describe("the toolbar and its ghost", () => {
  const calls = src("calls.css");

  it("is opaque on the page's ground, with a hairline only once it is stuck", () => {
    expect(calls).toMatch(/\.kl > \.kl-bar \{[^}]*background: var\(--page\); box-shadow: 0 -10px 0 var\(--page\); \}/);
    expect(calls).toMatch(/\.kl > \.kl-bar\.is-stuck \{ box-shadow: 0 -10px 0 var\(--page\), 0 1px 0 var\(--hairline\); \}/);
    expect(src("useStuckBar.ts")).toContain('classList.toggle("is-stuck"');
    expect(src("OutreachPage.tsx")).toContain("useStuckBar");
    expect(src("CallsPage.tsx")).toContain("useStuckBar");
  });

  it("wraps instead of clipping with the sheet open, the search shrinking, the words cut and the pager whole", () => {
    const open = calls.slice(calls.indexOf("html.kl-sheet-open .con-main"), calls.indexOf("narrower than that the sheet"));
    expect(open).not.toContain("nowrap");
    expect(open).toContain(".kl-search { flex: 1 1 140px; min-width: 96px; }");
    expect(calls).toContain(".kl-pick select { text-overflow: ellipsis; }");
    expect(calls).toContain(".kl-bar .pager { flex: none; }");
  });

  it("loads as the toolbar will be: a slot for the pager and as many ghost groups as the page holds", () => {
    for (const f of ["OutreachPage.tsx", "CallsPage.tsx"]) {
      const code = src(f);
      expect(code, f).toMatch(/<KlGroupsGhost kind="\w+" n=\{size\}/);
      expect(code, f).toContain("<PagerSlot />");
    }
    expect(src("klGhosts.tsx")).toContain('className="pager pager-slot"');
  });
});

describe("there is no dialer page", () => {
  it("sends an old link to one to Outreach", () => {
    for (const h of ["#/dialer", "#/dialer/calls", "#/dialer/queue", "#/dialer/calls/"]) expect(redirectedHash(h)).toBe("#/outreach");
    expect(redirectedHash("#/dialer-notes")).toBeNull();
  });

  it("is named nowhere the console can be seen", () => {
    for (const f of ["Console.tsx", "Palette.tsx", "Nav.tsx", "emptyStates.ts", "OutreachPage.tsx", "CallsPage.tsx", "Home.tsx"]) {
      const code = src(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
      expect(code, f).not.toMatch(/dialer/i);
    }
  });
});
