import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activityRowOf, candidateOutreachOf, groupsOf } from "../api/outreachActivity";
import type { ActivityRow, ChannelCounts, TimelineItem } from "../api/outreachActivity";
import { ChannelMark } from "../ChannelMark";
import { ChannelSwitch, OutreachHead, OutreachLine } from "../OutreachPage";
import { OutreachThread } from "../OutreachSheet";
import {
  bandOfActivity, byLine, CHANNEL_TABS, callHead, callRowFromActivity, countWord, emailHead, emailStatus, excerpt, failureReason, followUpPrompt, itemsOf, lastWord,
  lengthOf, lineOf, personChoices, personOf, readRemembered, SHEET_TABS, STATUS_FILTERS, STATUS_LABEL, STATUS_TONE, statusFilterOf,
  summaryLine, tabCount, WHATSAPP_REASON, WHATSAPP_WAITING, whenOf, writeRemembered,
} from "../outreachActivityView";
import { campaignInitials } from "../callsView";
import { fixtureActivity, fixtureCandidate, fixtureGroups } from "../outreachFixtures";
import { OUTREACH_LABEL, ROUTES, routeFromHash, redirectedHash, hashForStanding, NAV, CAMPAIGN_NAV } from "../nav";
import { pageTitle } from "../pageTitle";
import { buildEntries } from "../Palette";
import { effectsOfWrite } from "../invalidate";

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

/** A Monday, 12 Oct 2026, 16:40 India time. */
const NOW = Date.parse("2026-10-12T11:10:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: "m1", channel: "email", at: iso(30), campaignId: "k1", campaignName: "Staff Platform Engineer", clientName: "Kestrel Capital",
  candidateId: "c1", candidateName: "Asha Menon", candidateTitle: "Engineer", candidateCompany: "Razorpay",
  direction: "out", by: { id: "u1", name: "Meera Pillai", mine: false }, status: "waiting", subject: "A role at Kestrel",
  preview: "A role at Kestrel", phone: null, durationSeconds: null, ...over,
});

describe("the line under the title", () => {
  const c = (over: Partial<ChannelCounts>): ChannelCounts => ({ all: 0, email: 0, whatsapp: 0, call: 0, callsConnected: 0, ...over });

  it("says the counts and the share of calls that were answered, in the owner's words", () => {
    expect(summaryLine(c({ email: 412, whatsapp: 31, call: 96, callsConnected: 36 }))).toBe("412 emails, 31 WhatsApp chats, 96 calls, 38% of calls answered");
  });

  it("leaves out what there is none of, and says one in the singular", () => {
    expect(summaryLine(c({ email: 1 }))).toBe("1 email");
    expect(summaryLine(c({ email: 5, call: 1, callsConnected: 0 }))).toBe("5 emails, 1 call, 0% of calls answered");
    expect(summaryLine(c({}))).toBe("");
    // No calls, no answered rate beside the emails.
    expect(summaryLine(c({ email: 13, call: 0, callsConnected: 0 }))).toBe("13 emails");
  });

  it("counts a group in the words of the channel being looked at", () => {
    expect(countWord(1, "")).toBe("1 item");
    expect(countWord(12, "")).toBe("12 items");
    expect(countWord(12, "email")).toBe("12 emails");
    expect(countWord(1, "whatsapp")).toBe("1 chat");
    expect(countWord(3, "call")).toBe("3 calls");
  });

  it("is the page's title and one muted line, with a calm sentence until there are figures", () => {
    const empty = renderToStaticMarkup(<OutreachHead />);
    expect(empty).toContain(">Outreach</h1>");
    expect(empty).toContain("Emails, WhatsApp chats and calls, by campaign.");
    const full = renderToStaticMarkup(<OutreachHead counts={c({ email: 4, call: 2, callsConnected: 1 })} />);
    expect(full).toContain("4 emails, 2 calls, 50% of calls answered");
    expect((full.match(/<p /g) ?? []).length).toBe(1);
  });
});

describe("the channel switch", () => {
  it("is All, Email, WhatsApp, Calls, each with the number the filters leave", () => {
    expect(CHANNEL_TABS.map((t) => t.label)).toEqual(["All", "Email", "WhatsApp", "Calls"]);
    const counts: ChannelCounts = { all: 12, email: 7, whatsapp: 2, call: 3, callsConnected: 1 };
    expect(CHANNEL_TABS.map((t) => tabCount(t.value, counts))).toEqual([12, 7, 2, 3]);
    const html = renderToStaticMarkup(<ChannelSwitch value="" onChange={() => undefined} counts={counts} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)?.length).toBe(4);
    expect(html).toMatch(/aria-checked="true"[^>]*class="is-on"[^>]*>.*?All/);
  });

  it("draws the three marks inline, WhatsApp's in its own green and the other two in the text's ink", () => {
    const email = renderToStaticMarkup(<ChannelMark channel="email" />);
    const call = renderToStaticMarkup(<ChannelMark channel="call" />);
    const wa = renderToStaticMarkup(<ChannelMark channel="whatsapp" />);
    expect(email).toContain('stroke="currentColor"');
    expect(call).toContain('stroke="currentColor"');
    expect(wa).toContain("#25D366");
    expect(email + call).not.toContain("#25D366");
    for (const h of [email, call, wa]) {
      expect(h).toContain('width="16"');
      expect(h).not.toMatch(/<img|href=|https?:/);
    }
  });
});

describe("status", () => {
  it("offers the email words, then the call outcomes, in order, and reads anything else as no filter", () => {
    expect(STATUS_FILTERS.map((s) => s.label)).toEqual([
      "Replied", "Waiting for a reply", "Bounced", "Didn't send", "Scheduled", "Draft", "Connected", "Voicemail", "No answer", "Call back", "Not interested",
    ]);
    expect(statusFilterOf("waiting")).toBe("waiting");
    expect(statusFilterOf("voicemail")).toBe("voicemail");
    expect(statusFilterOf("in_progress")).toBe("");
    expect(statusFilterOf("<script>")).toBe("");
  });

  it("is plain text in two tones of ink and nothing else", () => {
    expect(new Set(Object.values(STATUS_TONE))).toEqual(new Set(["ink", "muted"]));
    for (const label of Object.values(STATUS_LABEL)) expect(label).toMatch(/^[A-Z][A-Za-z' ]+$/);
    expect(src("OutreachPage.tsx")).not.toMatch(/pill|badge|dot/i);
  });
});

describe("a line", () => {
  const html = (r: ActivityRow, showBy = true) =>
    renderToStaticMarkup(<OutreachLine r={r} on={false} showBy={showBy} hit="" onOpen={() => undefined} />);

  it("is the channel mark, the person, whose it was, what was said, how it stands and when", () => {
    const h = html(row());
    expect(h).toContain('aria-label="Email"');
    expect(h).toContain("Asha Menon");
    expect(h).toContain(">AM<");
    expect(h).toContain("by Meera");
    expect(h).toContain("A role at Kestrel");
    expect(h).toContain("Waiting for a reply");
    expect(h).toContain('data-st="muted"');
    expect(h).toMatch(/class="kl-when">[^<]+</);
  });

  it("keeps whose it was off a recruiter's own lines, and says who an incoming one is from", () => {
    expect(html(row(), false)).not.toContain("by Meera");
    const incoming = row({ channel: "whatsapp", direction: "in", by: null, status: "replied", preview: "Can we talk on Friday?" });
    expect(html(incoming, false)).toContain("from Asha");
    expect(html(incoming)).toContain("Can we talk on Friday?");
  });

  it("draws a WhatsApp conversation (when a provider has one) with its mark, line and status", () => {
    const h = html(row({ id: "w1", channel: "whatsapp", direction: "in", by: null, status: "replied", preview: "Thanks, sounds good" }));
    expect(h).toContain('aria-label="WhatsApp"');
    expect(h).toContain("#25D366");
    expect(h).toContain("Thanks, sounds good");
    expect(h).toContain("Replied");
  });

  it("names a call to a number that is not a candidate by the number", () => {
    const r = row({ channel: "call", candidateId: null, candidateName: null, phone: "+91 98100 12345", status: "no_answer", preview: null, subject: null, durationSeconds: 0 });
    expect(personOf(r)).toBe("+91 98100 12345");
    expect(html(r)).toContain("+91 98100 12345");
    expect(lineOf(r)).toBe("");
    expect(lengthOf(r)).toBe("");
  });

  it("gives a call's length, and no length for an email", () => {
    expect(lengthOf(row({ channel: "call", durationSeconds: 262 }))).toBe("4 min");
    expect(lengthOf(row({ channel: "call", durationSeconds: 45 }))).toBe("45 s");
    expect(lengthOf(row({ durationSeconds: 262 }))).toBe("");
  });

  it("says by whom in the first name, and nothing when it is not known", () => {
    expect(byLine(row())).toBe("by Meera");
    expect(byLine(row({ by: { id: null, name: null, mine: false } }))).toBe("by a former teammate");
    expect(byLine(row({ by: null }))).toBe("");
    expect(byLine(row({ direction: "in", candidateName: "Asha Menon" }))).toBe("from Asha");
  });
});

describe("a person's whole outreach", () => {
  const mail = (id: string, minutes: number, over: Partial<Extract<TimelineItem, { kind: "email" }>> = {}): TimelineItem => ({
    kind: "email", id, at: iso(minutes), direction: "out", status: "waiting", subject: "Hello", body: "Hi Asha", scheduledFor: null,
    sentAt: iso(minutes), by: { id: "u1", name: "Meera Pillai", mine: true }, campaignId: "k1", campaignName: "Staff Platform Engineer",
    canApprove: false, canCancel: false, error: null, canRetry: false, ...over,
  });
  const call = (id: string, minutes: number): TimelineItem => ({
    kind: "call", id, at: iso(minutes),
    call: callRowFromActivity(row({ id, channel: "call", at: iso(minutes), status: "connected", preview: "Interested", durationSeconds: 120 })),
  });
  const chat = (id: string, minutes: number, direction: "in" | "out" = "in"): TimelineItem => ({
    kind: "whatsapp", id, at: iso(minutes), direction, text: "Can we talk Friday?", by: null,
  });
  const items = [mail("e1", 600), call("c1", 60), chat("w1", 300), mail("e2", 10, { status: "scheduled", canCancel: true, scheduledFor: new Date(Date.now() + 3_600_000).toISOString() })];

  it("merges everything newest first in the timeline, and a channel's tab lists its own", () => {
    expect(itemsOf(items, "timeline").map((i) => i.id)).toEqual(["e2", "c1", "w1", "e1"]);
    expect(itemsOf(items, "email").map((i) => i.id)).toEqual(["e2", "e1"]);
    expect(itemsOf(items, "whatsapp").map((i) => i.id)).toEqual(["w1"]);
    expect(itemsOf(items, "call").map((i) => i.id)).toEqual(["c1"]);
    expect(SHEET_TABS.map((t) => t.label)).toEqual(["Timeline", "Email", "WhatsApp", "Calls"]);
  });

  it("draws each as its own card: an email with its subject and the cancel state, a bubble, a call with its opener", () => {
    const h = renderToStaticMarkup(
      <OutreachThread items={itemsOf(items, "timeline")} busy={null} openCall={null} focusNote={0} onApprove={() => undefined} onCancel={() => undefined} onToggleCall={() => undefined} />,
    );
    expect(h).toContain("Going out from you");
    expect(h).toContain("Scheduled");
    expect(h).toContain("Cancel the send");
    expect(h).not.toContain("Approve and schedule");
    expect(h).toContain("Hello");
    expect(h).toContain("Can we talk Friday?");
    expect(h).toContain("Their message");
    expect(h).toContain("#25D366");
    expect(h).toContain("Called by Meera");
    expect(h).toContain("Interested");
    expect(h).toContain("Open the call");
    // The whole call card opens and closes it, not only its link.
    expect(h).toMatch(/class="ko-card is-call is-toggle"/);
    // Newest first, in the page's order.
    expect(h.indexOf("Cancel the send")).toBeLessThan(h.indexOf("Called by Meera"));
    expect(h.indexOf("Called by Meera")).toBeLessThan(h.indexOf("Can we talk Friday?"));
  });

  it("offers approval for a draft, and says nothing about a status twice", () => {
    const draft = mail("d1", 5, { status: "draft", canApprove: true, sentAt: null });
    const h = renderToStaticMarkup(
      <OutreachThread items={[draft]} busy={null} openCall={null} focusNote={0} onApprove={() => undefined} onCancel={() => undefined} onToggleCall={() => undefined} />,
    );
    expect(h).toContain("Approve and schedule");
    expect(h).toContain(">Draft<");
    expect(emailStatus(draft as Extract<TimelineItem, { kind: "email" }>)).toBe("");
  });

  it("says why an email did not go, with a plain default, and offers Try again when it can be sent again", () => {
    const thread = (item: TimelineItem, onRetry?: (id: string) => void) =>
      renderToStaticMarkup(
        <OutreachThread items={[item]} busy={null} openCall={null} focusNote={0} onApprove={() => undefined} onCancel={() => undefined} onToggleCall={() => undefined} {...(onRetry ? { onRetry } : {})} />,
      );
    // A reason that was kept is said as it is, with where to fix it when it is elsewhere.
    const real = thread(
      mail("f1", 5, { status: "failed", error: "Gmail isn't switched on for the Google project this app signs in with. Someone with access to that Google Cloud project has to enable the Gmail API.", canRetry: true }),
      () => undefined,
    );
    expect(real).toContain("Didn&#x27;t send");
    expect(real).toContain("has to enable the Gmail API");
    expect(real).toContain("Open Google Cloud");
    expect(real).toContain(">Try again<");
    // No reason kept (older and seeded rows): still "Didn't send", the plain default, and Try again.
    const none = thread(mail("f2", 5, { status: "failed", error: null, canRetry: true }), () => undefined);
    expect(none).toContain("Didn&#x27;t send");
    expect(none).toContain("It didn&#x27;t go out.");
    expect(none).toContain(">Try again<");
    // Not allowed to send it again (another person's, or Gmail already took it): the reason, and no button.
    const theirs = thread(mail("f3", 5, { status: "failed", error: null, canRetry: false }), () => undefined);
    expect(theirs).toContain("It didn&#x27;t go out.");
    expect(theirs).not.toContain("Try again");
    // An email that went, or is lined up, has no reason to give.
    expect(thread(mail("f4", 5, { status: "waiting" }), () => undefined)).not.toContain("It didn&#x27;t go out.");
    expect(failureReason({ direction: "out", status: "scheduled", error: "x" })).toBeNull();
    expect(failureReason({ direction: "out", status: "failed", error: "  " })).toBe("It didn't go out.");
  });

  it("reads the reason and whether it can be sent again from the server, and a failed one is sendable when the server is silent", () => {
    const read = (over: object) => candidateOutreachOf({
      candidate: { id: "c1", name: "Asha" },
      items: [{ kind: "email", id: "e", at: "2026-10-12T10:00:00Z", direction: "out", status: "failed", subject: "Hi", body: "Hi", ...over }],
    })?.items[0] as Extract<TimelineItem, { kind: "email" }>;
    expect(read({ error: "Gmail needs to be reconnected, so this email didn't go out.", canRetry: false })).toMatchObject({
      error: "Gmail needs to be reconnected, so this email didn't go out.", canRetry: false,
    });
    expect(read({})).toMatchObject({ error: null, canRetry: true });
  });

  it("says whose an email is, and what became of it", () => {
    const e = (over: object) => ({ direction: "out" as const, status: "waiting" as const, by: { id: "u", name: "Meera Pillai", mine: false }, ...over });
    expect(emailHead(e({}))).toBe("Sent by Meera");
    expect(emailHead(e({ by: { id: "u", name: "Meera Pillai", mine: true } }))).toBe("Sent by you");
    // An email that never left is not "Sent by" anyone: it is theirs, and the status word says it did not send.
    expect(emailHead(e({ status: "failed", by: { id: "u", name: "Meera Pillai", mine: true } }))).toBe("From you");
    expect(emailHead(e({ status: "failed" }))).toBe("From Meera");
    expect(emailHead(e({ status: "scheduled" }))).toBe("Going out from Meera");
    expect(emailHead(e({ direction: "in" }))).toBe("Reply");
    expect(emailStatus(e({ status: "bounced" }))).toBe("Bounced");
    expect(callHead({ direction: "outbound", caller: { id: "u", name: "Meera Pillai", mine: false } })).toBe("Called by Meera");
  });

  it("cuts a long email at a word, and keeps a short one whole", () => {
    expect(excerpt("Short note.")).toEqual({ text: "Short note.", cut: false });
    const long = "word ".repeat(200);
    const cut = excerpt(long, 100);
    expect(cut.cut).toBe(true);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(101);
  });

  it("writes what the agent is asked for a follow-up, naming the person, the campaign and the last subject", () => {
    const p = followUpPrompt({ name: "Asha Menon", campaign: "Staff Platform Engineer", lastSubject: "A role at Kestrel", replied: false });
    expect(p).toContain("Draft a follow-up email to Asha Menon for Staff Platform Engineer.");
    expect(p).toContain('"A role at Kestrel"');
    expect(p).toContain("show me the draft before anything is sent");
    expect(followUpPrompt({ name: "Asha", campaign: null, lastSubject: null, replied: true })).toBe(
      "Draft a reply to Asha. Keep it short and warm, and show me the draft before anything is sent.",
    );
  });

  it("gives the WhatsApp tab the owner's sentence and a short reason, with no action in it", () => {
    expect(WHATSAPP_WAITING).toBe("WhatsApp conversations will appear here once WhatsApp is connected through Magnifi");
    expect(WHATSAPP_REASON.length).toBeLessThan(60);
    const sheet = src("OutreachSheet.tsx");
    expect(sheet).toContain('<GhostChart kind="table" compact title="WhatsApp" line={WHATSAPP_WAITING} />');
    expect(sheet).toMatch(/<button type="button" className="kl-btn" disabled aria-describedby="ko-wa-why">/);
  });
});

describe("what arrives", () => {
  it("reads a row and drops what has no id, time or channel", () => {
    const ok = activityRowOf({ id: "a", channel: "call", at: "2026-10-12T10:00:00Z", status: "connected", direction: "out", durationSeconds: 61, phone: "+91 1" });
    expect(ok?.status).toBe("connected");
    expect(ok?.by).toBeNull();
    expect(activityRowOf({ id: "a", channel: "fax", at: "2026-10-12T10:00:00Z" })).toBeNull();
    expect(activityRowOf({ channel: "email", at: "2026-10-12T10:00:00Z" })).toBeNull();
    expect(activityRowOf({ id: "a", channel: "email", at: "yesterday" })).toBeNull();
    expect(activityRowOf({ id: "a", channel: "email", at: "2026-10-12T10:00:00Z", status: "weird" })?.status).toBe("waiting");
  });

  it("reads the groups, the channel counts and whether WhatsApp is connected", () => {
    const g = groupsOf({
      groups: [{ campaign: { id: "k1", name: "SPE", client: "Kestrel" }, count: 3, lastAt: "2026-10-12T10:00:00Z" }, { campaign: null, count: 1, lastAt: "2026-10-11T10:00:00Z" }, { count: "x" }],
      total: 4, channels: { all: 4, email: 3, whatsapp: 0, call: 1, callsConnected: 1 }, canSeeEveryone: true,
      people: [{ id: "u1", name: "Meera", count: 4, mine: false }], whatsapp: { connected: false },
    });
    expect(g.groups).toHaveLength(2);
    expect(g.groups[1]?.campaign).toBeNull();
    expect(g.channels).toEqual({ all: 4, email: 3, whatsapp: 0, call: 1, callsConnected: 1 });
    expect(g.canSeeEveryone).toBe(true);
    expect(g.whatsapp.connected).toBe(false);
    expect(groupsOf(null).groups).toEqual([]);
  });

  it("reads a timeline newest first and keeps only the cards it understands", () => {
    const out = candidateOutreachOf({
      candidate: { id: "c1", name: "Asha", title: "Engineer", company: "Razorpay" },
      campaigns: [{ id: "k1", name: "SPE", client: null }],
      items: [
        { kind: "email", id: "e1", at: "2026-10-10T10:00:00Z", direction: "out", status: "sent", subject: "Hi", body: "Hello" },
        { kind: "whatsapp", id: "w1", at: "2026-10-12T10:00:00Z", direction: "in", text: "Hey" },
        { kind: "email", id: "bad" },
        { kind: "carrier-pigeon", id: "p", at: "2026-10-12T10:00:00Z" },
      ],
      whatsapp: { connected: true },
    });
    expect(out?.items.map((i) => i.id)).toEqual(["w1", "e1"]);
    expect(out?.whatsapp.connected).toBe(true);
    expect(candidateOutreachOf({})).toBeNull();
  });
});

describe("time", () => {
  it("says Tomorrow for what is lined up for the next day, and the Calls page's words for the rest", () => {
    expect(whenOf(new Date(NOW + 17 * 3_600_000).toISOString(), NOW)).toBe("Tomorrow, 9:40 am");
    expect(whenOf(iso(30), NOW)).toBe("Today, 4:10 pm");
    expect(whenOf("nope", NOW)).toBe("");
  });

  it("puts what is still to go out in today's band, and says Next send over a future time", () => {
    expect(bandOfActivity(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe("today");
    expect(bandOfActivity(iso(60 * 24 * 3), NOW)).toBe("week");
    expect(bandOfActivity(iso(60 * 24 * 20), NOW)).toBe("earlier");
    expect(lastWord(new Date(NOW + 3_600_000).toISOString(), NOW).word).toBe("Next send");
    expect(lastWord(iso(10), NOW).word).toBe("Last activity");
  });
});

describe("remembered open campaigns, per person", () => {
  const mem = () => {
    const s = new Map<string, string>();
    return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v) };
  };

  it("keeps each person's own, never another's, and reads nothing odd", () => {
    const store = mem();
    writeRemembered(store, "u1", { k1: true, k2: false });
    expect(readRemembered(store, "u1")).toEqual({ k1: true, k2: false });
    expect(readRemembered(store, "u2")).toEqual({});
    store.setItem("superhyre.outreach.groups.u3", "[1,2]");
    expect(readRemembered(store, "u3")).toEqual({});
    expect(readRemembered(null, "u1")).toEqual({});
    expect(src("outreachActivityView.ts")).toContain('"superhyre.outreach.groups."');
  });

  it("puts everyone, then me, then the others in the person filter", () => {
    expect(personChoices([{ id: "me", name: "Me M", mine: true }, { id: "u2", name: "Ana", mine: false }, { id: "u3", name: null, mine: false }], "me")).toEqual([
      { value: "", label: "Everyone" }, { value: "me", label: "Me" }, { value: "u2", label: "Ana" }, { value: "u3", label: "A former teammate" },
    ]);
    expect(campaignInitials("Staff Platform Engineer")).toBe("SP");
  });
});

describe("a console with no backend", () => {
  it("draws the same page from fixtures: calls and emails by campaign, a person's thread, and no WhatsApp", () => {
    const groups = fixtureGroups({});
    expect(groups.total).toBeGreaterThan(0);
    expect(groups.channels.email).toBeGreaterThan(0);
    expect(groups.channels.call).toBeGreaterThan(0);
    expect(groups.channels.whatsapp).toBe(0);
    expect(groups.whatsapp.connected).toBe(false);
    const rows = fixtureActivity({ channel: "email" }).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.channel === "email")).toBe(true);
    const first = rows.find((r) => r.candidateId);
    expect(fixtureCandidate(first?.candidateId ?? "")?.items.length).toBeGreaterThan(0);
  });
});

describe("where it lives", () => {
  it("is Outreach in the sidebar, the campaign's tree, quick find and the tab, at #/outreach", () => {
    expect(OUTREACH_LABEL).toBe("Outreach");
    expect(ROUTES.calls.path).toBe("/outreach");
    expect(ROUTES["campaign-calls"].path).toBe("/campaign/outreach");
    const main = NAV[0]?.items.map((i) => i.label) ?? [];
    expect(main).toContain("Outreach");
    expect(main).not.toContain("Calls");
    expect(CAMPAIGN_NAV.find((n) => n.id === "campaign-calls")?.label).toBe("Outreach");
    expect(CAMPAIGN_NAV.map((n) => n.label)).not.toContain("Calls");
    expect(pageTitle({ route: "calls" })).toBe("Outreach · SuperHyre");
    expect(pageTitle({ route: "campaign-calls", campaign: "Data Analyst" })).toBe("Outreach · Data Analyst · SuperHyre");
    expect(routeFromHash("#/outreach")).toBe("calls");
    expect(routeFromHash("#/campaign/outreach?campaign=k1")).toBe("campaign-calls");
  });

  it("keeps every old link to Calls working, with whatever it carried", () => {
    expect(redirectedHash("#/calls")).toBe("#/outreach");
    expect(redirectedHash("#/calls?call=abc")).toBe("#/outreach?call=abc");
    expect(redirectedHash("#/campaign/calls?campaign=k1")).toBe("#/campaign/outreach?campaign=k1");
    expect(routeFromHash("#/calls")).toBe("calls");
    expect(routeFromHash("#/campaign/calls?campaign=k1")).toBe("campaign-calls");
    expect(hashForStanding("#/outreach", "recruiter", "k9")).toBe("#/campaign/outreach?campaign=k9");
    expect(hashForStanding("#/outreach", "owner", "k9")).toBeNull();
  });

  it("does not collide with the Analytics page of the same name", () => {
    const analytics = NAV[0]?.items.find((i) => i.kind === "group");
    expect(analytics?.kind === "group" && analytics.children.map((c) => c.label)).toContain("Outreach results");
    const labels = buildEntries("Data Analyst", "owner").filter((e) => e.label === "Outreach").map((e) => e.id);
    expect(labels).toEqual(["calls", "campaign-calls"]);
    expect(ROUTES["analytics-outreach"].path).toBe("/analytics/outreach");
  });

  it("reads again when an email or a call changes, and lists WhatsApp (via Magnifi) as coming soon, greyed out", () => {
    expect(src("useOutreachActivity.ts")).toMatch(/MOVES = \["calls", "pipeline", "campaign", "candidates"\]/);
    expect(effectsOfWrite("PATCH", "/v1/calls/abc")?.effects).toContain("calls");
    const settings = src("SettingsConnections.tsx");
    expect(settings).toContain("WhatsApp (via Magnifi)");
    expect(settings).toContain('<ComingSoonConnection id="whatsapp" name="WhatsApp (via Magnifi)" />');
    expect(settings).toContain("Coming soon");
    // Greyed out, and no button that does nothing.
    expect(settings.slice(settings.indexOf("function ComingSoonConnection"))).not.toContain("<button");
  });
});

describe("a call opened from the sheet", () => {
  it("is the call sheet's own body: the player, the summary with its next step, the transcript and the note", () => {
    const sheet = src("CallSheet.tsx");
    expect(sheet).toContain("export function CallBody(");
    expect(sheet).toContain("export function SheetFrame(");
    expect(sheet).toContain("<CallBody id={id} hint={hint} campaigns={campaigns} />");
    const outreach = src("OutreachSheet.tsx");
    expect(outreach).toContain("<CallBody id={call.id} hint={call} campaigns={[]} bare focusNote={focusNote} />");
    expect(outreach).toContain("<SheetFrame");
    // Same keys as the call sheet: Escape closes, Tab stays inside, Back closes.
    expect(sheet).toContain('if (e.key === "Escape")');
    expect(sheet).toContain("useBackCloses(true");
  });
});

describe("the quiet of it", () => {
  it("keeps the page's styles neutral: no side bars, no fills in the brand colour, the orange as thin lines and labels", () => {
    const css = src("outreachActivity.css");
    expect(css).not.toMatch(/border-left|border-inline-start/);
    expect(css).not.toMatch(/background:\s*var\(--accent-fill\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
