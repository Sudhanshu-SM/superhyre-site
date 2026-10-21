import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CallDetail } from "../api/calls";
import type { ActivityRow } from "../api/outreachActivity";
import { LoggedByHand } from "../CallSheet";
import { LogCallFields } from "../LogCallDialog";
import {
  bodyOf, emptyForm, fitsFilters, LOG_OUTCOMES, loggedLine, minutesOf, NO_CALLS_LINE, pendingRow, whenInput, whenOf, whyNot,
} from "../logCallView";
import type { LogCallForm, PersonPick } from "../logCallView";
import { OutreachToolbar } from "../OutreachPage";
import type { ActivityData } from "../useOutreachActivity";
import { withCall, withoutCall } from "../useOutreachActivity";

const NOW = Date.parse("2026-10-22T09:40:00.000Z");
const PRIYA: PersonPick = {
  id: "p1", name: "Priya Menon", title: "Backend Engineer", company: "Initech",
  campaigns: [{ id: "k1", name: "Senior Backend" }, { id: "k2", name: "Data Analyst" }],
};
const form = (over: Partial<LogCallForm> = {}): LogCallForm => ({ ...emptyForm(PRIYA, NOW), outcome: "voicemail", ...over });
const html = (person: PersonPick | null = null, fixed: { id: string; name: string } | null = null) =>
  renderToStaticMarkup(<LogCallFields person={person} fixed={fixed} onClose={() => undefined} onSave={() => undefined} />);

describe("the Log a call form", () => {
  it("offers the outcomes a person can say, in the words the list uses", () => {
    expect(LOG_OUTCOMES.map((o) => o.label)).toEqual(["Connected", "Voicemail", "No answer", "Call back", "Not interested"]);
    expect(LOG_OUTCOMES.map((o) => o.value)).toEqual(["connected", "voicemail", "no_answer", "call_back", "not_interested"]);
    const markup = html(PRIYA);
    for (const o of LOG_OUTCOMES) expect(markup).toContain(`>${o.label}<`);
    expect(markup).toContain('role="radiogroup"');
    // Nothing is chosen yet, and Save waits for it.
    expect(markup).not.toContain('aria-checked="true"');
    expect(markup).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Save<\/button>/);
  });

  it("starts from now, and says what is missing one thing at a time", () => {
    expect(emptyForm(null, NOW).when).toBe(whenInput(NOW));
    expect(whyNot(emptyForm(null, NOW), NOW)).toBe("Choose who the call was with.");
    expect(whyNot(emptyForm(PRIYA, NOW), NOW)).toBe("Choose how it went.");
    expect(whyNot(form(), NOW)).toBeNull();
    expect(whyNot(form({ minutes: "4.5" }), NOW)).toBe("Length is in whole minutes.");
    expect(whyNot(form({ when: whenInput(NOW + 3_600_000) }), NOW)).toBe("That time hasn't happened yet.");
  });

  it("asks who the call was with, searching the campaign's people on a campaign's page and showing a known person as chosen", () => {
    expect(html(null)).toContain('placeholder="Search your people by name"');
    expect(html(null, { id: "k1", name: "Senior Backend" })).toContain("Search this campaign&#x27;s people");
    expect(html(null, { id: "k1", name: "Senior Backend" })).toContain("A call you made, for Senior Backend.");
    const known = html(PRIYA);
    expect(known).toContain("Priya Menon");
    expect(known).toContain("Backend Engineer at Initech");
    expect(known).not.toContain('type="search"');
    // On the Outreach page a person on more than one campaign can say which; on a campaign's page there is nothing to ask.
    expect(known).toContain("Their latest campaign");
    expect(html(PRIYA, { id: "k1", name: "Senior Backend" })).not.toContain("Their latest campaign");
  });

  it("keeps the length to minutes and the note to a thousand characters", () => {
    const markup = html(PRIYA);
    expect(markup).toContain('maxLength="1000"');
    expect(minutesOf("4")).toBe(4);
    expect(minutesOf("")).toBeNull();
    expect(minutesOf("0")).toBeNull();
    expect(minutesOf("601")).toBeNull();
    expect(minutesOf("4.5")).toBeNull();
  });

  it("turns a form into one request: its own key, the person, the time, and only what was given", () => {
    const body = bodyOf(form({ minutes: "4", notes: "  Left a message  " }), "key-1", NOW);
    expect(body).toEqual({
      key: "key-1", candidateId: "p1", outcome: "voicemail", startedAt: new Date(NOW).toISOString(), durationMinutes: 4, notes: "Left a message",
    });
    const bare = bodyOf(form({ campaignId: "k2" }), "key-2", NOW);
    expect(bare).not.toHaveProperty("durationMinutes");
    expect(bare).not.toHaveProperty("notes");
    expect(bare.campaignId).toBe("k2");
    expect(bodyOf(form(), "key-3", NOW)).not.toHaveProperty("campaignId");
  });
});

const rowOf = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: "c1", channel: "call", at: "2026-10-21T08:00:00.000Z", campaignId: "k1", campaignName: "Senior Backend", clientName: null, candidateId: "p9",
  candidateName: "Asha Rao", candidateTitle: null, candidateCompany: null, direction: "out", by: null, status: "connected", subject: null,
  preview: null, phone: null, durationSeconds: null, ...over,
});
const data = (over: Partial<ActivityData> = {}): ActivityData => ({
  phase: "ready", key: "k",
  groups: [{ campaign: { id: "k1", name: "Senior Backend", client: null }, count: 1, lastAt: "2026-10-21T08:00:00.000Z" }],
  channels: { all: 3, email: 2, whatsapp: 0, call: 1, callsConnected: 1 },
  people: [], canSeeEveryone: false, whatsappConnected: false, total: 3,
  rows: { k1: { items: [rowOf()], total: 1, offset: 0, phase: "ready" } }, ...over,
});

describe("a call on the list at once", () => {
  const me = { id: "u1", name: "Ana Rao" };

  it("is the line it will be: a call, by the person, with the outcome and the length", () => {
    const row = pendingRow(form({ minutes: "4", notes: "Left a message about Pune" }), "key-1", me, null, NOW);
    expect(row).toMatchObject({
      id: "key-1", channel: "call", status: "voicemail", candidateName: "Priya Menon", campaignId: "k1", campaignName: "Senior Backend",
      durationSeconds: 240, preview: "Left a message about Pune", by: { id: "u1", name: "Ana Rao", mine: true }, direction: "out",
    });
    // On a campaign's page the call is on that campaign; a person's second campaign is theirs to choose.
    expect(pendingRow(form(), "k", me, { id: "k9", name: "Fixed" }, NOW).campaignId).toBe("k9");
    expect(pendingRow(form({ campaignId: "k2" }), "k", me, null, NOW).campaignName).toBe("Data Analyst");
  });

  it("counts on its campaign and the Calls tab, and sits at the top of the lines on screen", () => {
    const row = pendingRow(form(), "key-1", me, null, NOW);
    const next = withCall(data(), row, null, { pageSize: 10 });
    expect(next.groups[0]).toMatchObject({ count: 2, lastAt: row.at });
    expect(next.rows.k1?.items.map((r) => r.id)).toEqual(["key-1", "c1"]);
    expect(next.rows.k1?.total).toBe(2);
    expect(next.channels).toMatchObject({ all: 4, call: 2, callsConnected: 1 });
    expect(next.total).toBe(4);
    // Asked twice (a double click, a re-render) it is still one line.
    expect(withCall(next, row, null, { pageSize: 10 }).rows.k1?.items).toHaveLength(2);
  });

  it("starts a campaign's group when it is the first call, and keeps another campaign's page out", () => {
    const row = pendingRow(form(), "key-1", me, { id: "k5", name: "New role" }, NOW);
    const fresh = withCall(data({ groups: [], rows: {}, total: 0, channels: { all: 0, email: 0, whatsapp: 0, call: 0, callsConnected: 0 } }), row, { name: "New role", client: null }, { pageSize: 10 });
    expect(fresh.groups).toHaveLength(1);
    expect(fresh.groups[0]?.campaign).toMatchObject({ id: "k5", name: "New role" });
    expect(fresh.channels.call).toBe(1);
    expect(withCall(data(), row, null, { campaignId: "k1", pageSize: 10 })).toEqual(data());
  });

  it("goes again, with the counts, when the server refuses it", () => {
    const row = pendingRow(form(), "key-1", me, null, NOW);
    const shown = withCall(data(), row, null, { pageSize: 10 });
    const back = withoutCall(shown, "key-1");
    expect(back.rows.k1?.items.map((r) => r.id)).toEqual(["c1"]);
    expect(back.groups[0]?.count).toBe(1);
    expect(back.channels).toMatchObject({ all: 3, call: 1, callsConnected: 1 });
    expect(withoutCall(back, "nothing")).toBe(back);
  });

  it("is drawn only where the filters would hold it", () => {
    const row = pendingRow(form(), "key-1", me, null, NOW);
    expect(fitsFilters(row, {})).toBe(true);
    expect(fitsFilters(row, { channel: "call", status: "voicemail" })).toBe(true);
    expect(fitsFilters(row, { channel: "email" })).toBe(false);
    expect(fitsFilters(row, { status: "connected" })).toBe(false);
    expect(fitsFilters(row, { q: "asha" })).toBe(false);
    expect(fitsFilters(row, { person: "u2" })).toBe(false);
    expect(fitsFilters(row, { from: "2026-10-23" })).toBe(false);
  });

  it("is said calmly once it is saved", () => {
    expect(loggedLine(form(), NOW)).toMatch(/^Logged\. Voicemail with Priya, /);
    expect(loggedLine(form({ outcome: "no_answer" }), NOW)).toMatch(/^Logged\. No answer with Priya, /);
    expect(whenOf(whenInput(NOW + 3_600_000), NOW)).toBeNull();
  });
});

describe("the Calls tab", () => {
  it("says what to do when there are no calls, and puts Log a call beside the filters on the tab", () => {
    expect(NO_CALLS_LINE).toBe("Log a call, or calls you place with the extension show up here.");
    const noop = () => undefined;
    const bar = renderToStaticMarkup(
      <OutreachToolbar
        q="" onQ={noop} status="" onStatus={noop} preset="any" onPreset={noop} custom={{ from: "", to: "" }} onCustom={noop}
        person="" onPerson={noop} people={[]} showPerson={false} tab="call"
        action={<button type="button" className="kl-btn lc-open">Log a call</button>}
      />,
    );
    expect(bar).toContain(">Log a call<");
    expect(bar.indexOf("Log a call")).toBeGreaterThan(bar.indexOf("All outcomes"));
  });
});

describe("a call logged by hand, opened", () => {
  const call = (over: Partial<CallDetail> = {}): CallDetail => ({
    id: "c1", at: "2026-10-21T08:00:00.000Z", durationSeconds: 240, direction: "outbound", outcome: "voicemail", outcomeText: null, phone: "",
    candidate: { id: "p1", name: "Priya Menon", title: null, company: null }, caller: { id: "u1", name: "Ana Rao", mine: true },
    campaign: null, summary: null, preview: null, summaryState: "none", hasRecording: false, hasTranscript: false, notes: null,
    summaryDetail: null, segments: [], transcript: null, recording: { available: false, mime: null, seconds: null }, canEdit: true, byHand: true, ...over,
  });

  it("says once, calmly, that nothing was recorded, in place of an empty player and an empty transcript", () => {
    const html = renderToStaticMarkup(<LoggedByHand call={call()} editable onDone={() => undefined} />);
    expect(html).toContain("Logged by hand");
    expect(html).toContain("You logged this call, so there is no recording or transcript.");
    expect(html).not.toContain("No recording for this call");
    expect(html).not.toContain("No transcript for this call yet");
    // Its caller can still add either, or take the log back.
    expect(html).toContain("Add a recording");
    expect(html).toContain("Add a transcript");
    expect(html).toContain("Take this call back");
  });

  it("names a teammate who logged it, and offers a reader nothing to change", () => {
    const html = renderToStaticMarkup(
      <LoggedByHand call={call({ caller: { id: "u2", name: "Ravi Iyer", mine: false }, canEdit: false })} editable={false} onDone={() => undefined} />,
    );
    expect(html).toContain("Ravi logged this call, so there is no recording or transcript.");
    expect(html).not.toContain("Add a recording");
    expect(html).not.toContain("Take this call back");
  });
});
