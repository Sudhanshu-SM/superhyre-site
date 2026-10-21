import { describe, expect, it } from "vitest";
import type { ContactPerson, ContactSide, ContactsResult, ContactsStatus } from "../contactsModel";
import {
  allowanceLine, contactWords, flippedToFound, mergeResult, NO_PHONE_LOOKUPS, offerFor, planDetail, planFor, planLine, pollRule, POLL_MS,
  recount, resultLine, sideLine, STALL_AFTER_MS, STILL_LOOKING, toastTone,
} from "../contactsModel";

/**
 * Getting contact details: the words a person reads, who a request would ask about, what a finished request says,
 * and when to stop looking. No network and no screen: every sentence here is the one the console shows.
 */

const person = (n: number, over: Partial<ContactPerson> = {}): ContactPerson => ({
  campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, stage: "shortlisted",
  email: "none", phone: "none", lookupable: true, ...over,
});

describe("where a person stands, in words", () => {
  const SIDES: ContactSide[] = ["found", "looking", "not_found", "none"];

  it("says it for every combination of the two sides", () => {
    const said: Record<string, string> = {};
    for (const e of SIDES) for (const p of SIDES) said[`${e}/${p}`] = contactWords(e, p);
    expect(said).toEqual({
      "found/found": "Email and phone found",
      "found/looking": "Email found. Looking for a phone, this can take a few minutes",
      "found/not_found": "Email found, no phone",
      "found/none": "Email found",
      "looking/found": "Phone found. Looking for an email",
      "looking/looking": "Looking, this can take a few minutes",
      "looking/not_found": "Looking for an email",
      "looking/none": "Looking for an email",
      "not_found/found": "Phone found, no email",
      "not_found/looking": "Looking for a phone, this can take a few minutes",
      "not_found/not_found": "Not found",
      "not_found/none": "No email found",
      "none/found": "Phone found",
      "none/looking": "Looking for a phone, this can take a few minutes",
      "none/not_found": "No phone found",
      "none/none": "No contact details yet",
    });
  });

  it("says there is no profile to look up when that is why nothing was asked", () => {
    expect(contactWords("none", "none", { lookupable: false })).toBe("No profile to look up");
    // What was found is still said.
    expect(contactWords("found", "none", { lookupable: false })).toBe("Email found");
  });

  it("keeps the promise about a phone that never came: still looking, and it will show when it arrives", () => {
    expect(contactWords("none", "looking", { stalled: true })).toBe(STILL_LOOKING);
    expect(sideLine("phone", "looking", true)).toBe(STILL_LOOKING);
  });

  it("names a single side for a person's sheet", () => {
    expect(sideLine("email", "found")).toBe("Email found");
    expect(sideLine("phone", "found")).toBe("Phone found");
    expect(sideLine("email", "none")).toBe("No email yet");
    expect(sideLine("phone", "not_found")).toBe("No phone found");
    expect(sideLine("phone", "looking")).toBe("Looking, this can take a few minutes");
  });

  it("never names a data provider", () => {
    const all = [
      ...SIDES.flatMap((e) => SIDES.map((p) => contactWords(e, p))),
      NO_PHONE_LOOKUPS, STILL_LOOKING,
    ].join(" ");
    expect(all).not.toMatch(/salesql|apollo|contactout|crustdata|prospeo/i);
  });
});

describe("what Settings says about contact lookups", () => {
  const a = (over: Partial<Parameters<typeof allowanceLine>[0]>) => ({ email: true, phone: true, credits: 38, apolloCredits: 5, ...over });

  it("says on with what is left, and what it is when nothing is set up on this server", () => {
    expect(allowanceLine(a({}))).toBe("On. 38 phone lookups left");
    expect(allowanceLine(a({ credits: 1 }))).toBe("On. 1 phone lookup left");
    expect(allowanceLine(a({ credits: 0 }))).toBe("On. No phone lookups left this month");
    expect(allowanceLine(a({ phone: false, credits: null }))).toBe("On for emails");
    expect(allowanceLine(a({ email: false, phone: false, credits: null, apolloCredits: null }))).toBe("Not connected on this server");
  });

  it("never names a data provider", () => {
    for (const line of [allowanceLine(a({})), allowanceLine(a({ credits: 0 })), allowanceLine(a({ email: false, phone: false, credits: null }))]) {
      expect(line).not.toMatch(/salesql|apollo|crustdata|prospeo/i);
    }
  });
});

describe("which buttons a row offers", () => {
  const open = { closed: false, creditsLeft: 38, available: { email: true, phone: true } };

  it("offers only the side nobody has asked about", () => {
    expect(offerFor(person(1), open)).toEqual({ email: true, phone: true, phoneBlocked: null });
    expect(offerFor(person(1, { email: "found" }), open)).toMatchObject({ email: false, phone: true });
    expect(offerFor(person(1, { phone: "looking" }), open)).toMatchObject({ email: true, phone: false });
    expect(offerFor(person(1, { email: "not_found", phone: "not_found" }), open)).toMatchObject({ email: false, phone: false });
  });

  it("offers nothing without a profile to look at, on a closed campaign, or for someone the status does not list", () => {
    expect(offerFor(person(1, { lookupable: false }), open)).toMatchObject({ email: false, phone: false });
    expect(offerFor(person(1), { ...open, closed: true })).toMatchObject({ email: false, phone: false });
    expect(offerFor(undefined, open)).toMatchObject({ email: false, phone: false });
  });

  it("leaves the phone button but says why when no credits are left, and the email button stays", () => {
    expect(offerFor(person(1), { ...open, creditsLeft: 0 })).toEqual({ email: true, phone: true, phoneBlocked: NO_PHONE_LOOKUPS });
    expect(NO_PHONE_LOOKUPS).toBe("No phone lookups left this month. Email lookups are free.");
  });

  it("hides the side no provider is set up for", () => {
    expect(offerFor(person(1), { ...open, available: { email: true, phone: false } })).toEqual({ email: true, phone: false, phoneBlocked: null });
    expect(offerFor(person(1), { ...open, available: { email: false, phone: true } })).toMatchObject({ email: false, phone: true });
  });
});

describe("who a request asks about, and what it says before it is pressed", () => {
  const rules = { creditsLeft: 38, perRequest: 50, available: { email: true, phone: true } };
  const twelve = Array.from({ length: 12 }, (_, i) => person(i));

  it("asks about everyone who lacks the side, and says what it will use and how many credits are left", () => {
    const plan = planFor(twelve, "phone", rules);
    expect(plan.ids).toHaveLength(12);
    expect(planLine(plan, 38)).toBe("Get phone numbers for 12 people. Uses a credit for each number found. 38 left.");
    expect(planDetail(plan, 38)).toBe("12 people. Uses a credit for each number found. 38 left.");
    expect(planLine(planFor(twelve, "email", rules), 38)).toBe("Get emails for 12 people. Free.");
    expect(planLine(planFor(twelve, "both", rules), 38)).toBe(
      "Get emails and phone numbers for 12 people. Emails are free, a phone number uses a credit when found. 38 left.",
    );
  });

  it("says a single person as a person", () => {
    expect(planLine(planFor([person(1)], "email", rules), 38)).toBe("Get emails for 1 person. Free.");
  });

  it("skips people who have the side, are being looked up, or have no profile", () => {
    const mixed = [
      person(1), person(2, { email: "found" }), person(3, { phone: "looking" }), person(4, { lookupable: false }),
      person(5, { email: "not_found", phone: "found" }),
    ];
    expect(planFor(mixed, "email", rules).ids).toEqual(["cc-1", "cc-3"]);
    expect(planFor(mixed, "phone", rules).ids).toEqual(["cc-1", "cc-2"]);
    // Both: anyone who lacks either side.
    expect(planFor(mixed, "both", rules).ids).toEqual(["cc-1", "cc-2", "cc-3"]);
    expect(planFor(mixed, "both", rules)).toMatchObject({ emails: 2, phones: 2 });
  });

  it("cuts at the per-request cap, in order, and says how many can follow", () => {
    const many = Array.from({ length: 70 }, (_, i) => person(i));
    const plan = planFor(many, "email", rules);
    expect(plan.ids).toHaveLength(50);
    expect(plan.ids[0]).toBe("cc-0");
    expect(plan).toMatchObject({ wanted: 70, trimmed: 20 });
    expect(planLine(plan, 38)).toBe("Get emails for 50 people. Free. 50 at a time, 20 more can follow.");
  });

  it("with no credits asks for no phones, and says emails are still free", () => {
    const none = { ...rules, creditsLeft: 0 };
    const phone = planFor(twelve, "phone", none);
    expect(phone.ids).toEqual([]);
    expect(planDetail(phone, 0)).toBe(NO_PHONE_LOOKUPS);
    const both = planFor(twelve, "both", none);
    expect(both).toMatchObject({ phones: 0, emails: 12, phoneBlocked: true });
    expect(planLine(both, 0)).toContain("Emails only, they're free. No phone lookups left this month.");
  });

  it("says when nobody needs a lookup", () => {
    const done = [person(1, { email: "found", phone: "found" })];
    expect(planLine(planFor(done, "email", rules), 38)).toBe("Everyone has an email, or has no profile to look up.");
    expect(planLine(planFor(done, "both", rules), 38)).toBe("Nobody needs a lookup.");
  });
});

describe("what a finished request says", () => {
  const counts = { asked: 10, emails: 5, phones: 3, notFound: 2, looking: 0, had: 0, skipped: 0, failed: 0 };
  const base = { counts, remaining: 0, notice: null, summary: "" };

  it("leads with what was found and what was not", () => {
    expect(resultLine(base)).toBe("Got 5 emails and 3 phone numbers, 2 not found");
    expect(resultLine({ ...base, counts: { ...counts, emails: 1, phones: 0, notFound: 0 } })).toBe("Got 1 email");
    expect(resultLine({ ...base, counts: { ...counts, emails: 0, phones: 1, notFound: 0 } })).toBe("Got 1 phone number");
  });

  it("uses the server's own sentence when it sends one", () => {
    expect(resultLine({ ...base, summary: "Got 4 emails and 1 phone number, 3 not found." })).toBe(
      "Got 4 emails and 1 phone number, 3 not found",
    );
  });

  it("says nothing was found without making it sound like a failure", () => {
    expect(resultLine({ ...base, counts: { ...counts, emails: 0, phones: 0, notFound: 3 } })).toBe("No details found for 3 people");
  });

  it("says when everyone already had details", () => {
    expect(resultLine({ ...base, counts: { ...counts, asked: 4, emails: 0, phones: 0, notFound: 0, had: 4 } })).toBe(
      "They all have contact details already",
    );
  });

  it("adds the phones still on their way, what was not asked for the cap, and what did not go through", () => {
    expect(resultLine({ ...base, counts: { ...counts, looking: 2 } })).toBe(
      "Got 5 emails and 3 phone numbers, 2 not found. 2 phones still being looked up, this can take a few minutes",
    );
    expect(resultLine({ ...base, remaining: 30 })).toBe(
      "Got 5 emails and 3 phone numbers, 2 not found. 30 more are waiting. Run it again",
    );
    expect(resultLine({ ...base, remaining: 1 })).toContain("1 more is waiting");
    expect(resultLine({ ...base, counts: { ...counts, failed: 2 } })).toContain("2 lookups didn't go through, try again in a minute");
  });

  it("says what is on its way once when the server's sentence already says it", () => {
    expect(
      resultLine({ ...base, counts: { ...counts, looking: 1 }, summary: "Got 3 emails, 1 still being looked up" }),
    ).toBe("Got 3 emails, 1 still being looked up, this can take a few minutes");
    expect(
      resultLine({ ...base, counts: { ...counts, failed: 2 }, summary: "Got 3 emails, 2 couldn't be looked up" }),
    ).toBe("Got 3 emails, 2 couldn't be looked up");
  });

  it("when only phones are on their way, leads with that", () => {
    const r = resultLine({ counts: { ...counts, emails: 0, phones: 0, notFound: 0, looking: 3 }, remaining: 0, notice: null, summary: "" });
    expect(r).toBe("3 phones still being looked up, this can take a few minutes");
  });

  it("shows a notice as the server wrote it, after the rest", () => {
    expect(resultLine({ ...base, counts: { ...counts, emails: 5, phones: 0, notFound: 0 }, notice: NO_PHONE_LOOKUPS })).toBe(
      `Got 5 emails. ${NO_PHONE_LOOKUPS}`,
    );
    expect(resultLine({ counts: { ...counts, emails: 0, phones: 0, notFound: 0, had: 0, asked: 0 }, remaining: 0, notice: "A calm word.", summary: "" })).toContain("A calm word.");
  });

  it("holds a longer or cautionary line longer, calmly, and keeps a clean short one as a plain done", () => {
    const short = resultLine({ ...base, counts: { ...counts, emails: 2, phones: 0, notFound: 0 } });
    expect(toastTone({ counts: { ...counts, emails: 2, phones: 0, notFound: 0 }, remaining: 0, notice: null }, short)).toBe("done");
    expect(toastTone({ counts: { ...counts, emails: 2, phones: 0, notFound: 0 }, remaining: 4, notice: null }, short)).toBe("error");
    expect(toastTone({ counts: { ...counts, emails: 2, phones: 0, notFound: 0 }, remaining: 0, notice: "x" }, short)).toBe("error");
    expect(toastTone({ counts: { ...counts, emails: 0, phones: 0, notFound: 2 }, remaining: 0, notice: null }, "No details found for 2 people")).toBe("error");
    expect(toastTone({ counts: { ...counts, emails: 5, phones: 3, notFound: 2 }, remaining: 0, notice: null }, resultLine(base))).toBe("done");
  });
});

describe("keeping the status in step", () => {
  const status = (people: ContactPerson[], over: Partial<ContactsStatus> = {}): ContactsStatus => ({
    campaignId: "c1", closed: false, creditsLeft: 38, perRequest: 50, available: { email: true, phone: true },
    people, counts: recount(people), ...over,
  });
  const result = (people: ContactsResult["people"], over: Partial<ContactsResult> = {}): ContactsResult => ({
    campaignId: "c1", mode: "both", people,
    counts: { asked: people.length, emails: 0, phones: 0, notFound: 0, looking: 0, had: 0, skipped: 0, failed: 0 },
    creditsUsed: 0, creditsLeft: 35, remaining: 0, notice: null, summary: "", ...over,
  });
  const row = (n: number, email: ContactsResult["people"][number]["email"], phone: ContactsResult["people"][number]["phone"]) =>
    ({ campaignCandidateId: `cc-${n}`, candidateId: `cand-${n}`, personId: `p-${n}`, email, phone });

  it("counts from the people", () => {
    expect(recount([person(1, { email: "found" }), person(2, { phone: "looking" }), person(3, { phone: "found", email: "found" }), person(4)])).toEqual({
      people: 4, emailFound: 2, phoneFound: 1, looking: 1, missingEmail: 2, missingPhone: 2,
    });
  });

  it("lays a request's answer over the status, so the table moves before the server is asked again", () => {
    const before = status([person(1), person(2), person(3), person(4)]);
    const after = mergeResult(before, result([
      row(1, "found", "found"), row(2, "found", "looking"), row(3, "not_found", "no_credits"), row(4, "had", "skipped"),
    ], { creditsLeft: 35 }));
    expect(after.people.map((p) => [p.email, p.phone])).toEqual([
      ["found", "found"], ["found", "looking"], ["not_found", "none"], ["found", "none"],
    ]);
    expect(after.creditsLeft).toBe(35);
    expect(after.counts).toEqual(recount(after.people));
    // People the answer does not name are as they were.
    expect(mergeResult(before, result([row(9, "found", "found")])).people).toEqual(before.people);
    // The answer never makes a side worse than it was.
    const had = status([person(1, { email: "found" })]);
    expect(mergeResult(had, result([row(1, "failed", "none")])).people[0]?.email).toBe("found");
  });

  it("notices when something was not found and now is, which is when the board is read again", () => {
    const before = status([person(1, { phone: "looking" }), person(2)]);
    expect(flippedToFound(before, status([person(1, { phone: "found" }), person(2)]))).toBe(true);
    expect(flippedToFound(before, status([person(1, { phone: "not_found" }), person(2)]))).toBe(false);
    expect(flippedToFound(before, status([person(1, { phone: "looking" }), person(2)]))).toBe(false);
    expect(flippedToFound(null, status([person(1, { phone: "found" })]))).toBe(false);
  });
});

describe("how long it keeps looking", () => {
  const t0 = 1_000_000;
  it("asks again every few seconds while anyone is being looked up, and stops when nobody is", () => {
    expect(POLL_MS).toBe(6000);
    expect(pollRule(2, t0, t0 + 6000)).toBe("poll");
    expect(pollRule(0, t0, t0 + 6000)).toBe("stop");
    expect(pollRule(0, null, t0)).toBe("stop");
  });

  it("stops after ten minutes and leaves the line saying it will show up when it arrives", () => {
    expect(STALL_AFTER_MS).toBe(600_000);
    expect(pollRule(1, t0, t0 + STALL_AFTER_MS - 1)).toBe("poll");
    expect(pollRule(1, t0, t0 + STALL_AFTER_MS)).toBe("stalled");
    expect(pollRule(1, null, t0 + STALL_AFTER_MS)).toBe("poll");
  });
});
