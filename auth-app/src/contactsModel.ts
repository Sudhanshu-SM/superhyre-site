/**
 * Getting contact details for the people a campaign has shortlisted: what the server says, and what a person
 * reads about it. Nothing here touches the network or the screen, so every sentence can be tested.
 *
 * The rules the words follow:
 *   - an email is free, a phone number uses a credit only when one is found;
 *   - only people on the board (not passed) can be looked up, and only when they have a profile to look at;
 *   - a phone can take a few minutes to arrive ("looking"), and then shows up by itself;
 *   - the data providers' names never reach the screen.
 */

export type ContactMode = "email" | "phone" | "both";
/** `none`: nobody has asked yet. */
export type ContactSide = "found" | "looking" | "not_found" | "none";
export type ContactStage = "shortlisted" | "outreach" | "interviewing" | "hired";

export type ContactPerson = {
  campaignCandidateId: string;
  candidateId: string;
  personId: string;
  stage: ContactStage;
  email: ContactSide;
  phone: ContactSide;
  /** Has a LinkedIn profile to look up. */
  lookupable: boolean;
};

export type ContactsCounts = {
  people: number;
  emailFound: number;
  phoneFound: number;
  looking: number;
  missingEmail: number;
  missingPhone: number;
};

/** GET /v1/campaigns/:id/contacts/status */
export type ContactsStatus = {
  campaignId: string;
  closed: boolean;
  /** Phone lookups left: a credit goes only when a number is found. */
  creditsLeft: number;
  /** The most people one request asks about. */
  perRequest: number;
  /** False when no provider is set up for that side: its buttons are not drawn. */
  available: { email: boolean; phone: boolean };
  people: ContactPerson[];
  counts: ContactsCounts;
};

export type SideResult = "found" | "had" | "not_found" | "looking" | "skipped" | "no_credits" | "failed" | "none";

/** POST /v1/campaigns/:id/contacts */
export type ContactsResult = {
  campaignId: string;
  mode: ContactMode;
  people: Array<{
    campaignCandidateId: string;
    candidateId: string;
    personId: string;
    email: SideResult;
    phone: SideResult;
  }>;
  counts: {
    asked: number;
    emails: number;
    phones: number;
    notFound: number;
    looking: number;
    had: number;
    skipped: number;
    failed: number;
  };
  creditsUsed: number;
  creditsLeft: number;
  /** People still lacking details after the per-request cap. */
  remaining: number;
  /** A calm sentence when it stopped early. */
  notice: string | null;
  /** "Got 5 emails and 3 phone numbers, 2 not found" */
  summary: string;
};

/** POST /v1/contacts/fetch */
export type ContactsManyResult = {
  campaigns: Array<{ campaignId: string; name: string; counts: ContactsResult["counts"]; remaining: number }>;
  counts: ContactsResult["counts"];
  creditsUsed: number;
  creditsLeft: number;
  remaining: number;
  notice: string | null;
  summary: string;
};

/* ── words ────────────────────────────────────────────────────────────────── */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export const NO_PHONE_LOOKUPS = "No phone lookups left this month. Email lookups are free.";
export const STILL_LOOKING = "Still looking. It will show here when it arrives.";
const LOOKING_SLOW = "this can take a few minutes";

/** One side on its own, for a row that names it ("Email" and "Phone" in a person's sheet). */
export function sideLine(kind: "email" | "phone", side: ContactSide, stalled = false): string {
  const noun = kind === "email" ? "email" : "phone";
  switch (side) {
    case "found": return `${kind === "email" ? "Email" : "Phone"} found`;
    case "looking": return stalled ? STILL_LOOKING : kind === "phone" ? `Looking, ${LOOKING_SLOW}` : "Looking for an email";
    case "not_found": return `No ${noun} found`;
    case "none": return `No ${noun} yet`;
  }
}

/**
 * Where a person stands, in a few plain words, from both sides at once. `lookupable` false means there is no
 * profile to look at, which is worth saying when nothing has been found.
 */
export function contactWords(email: ContactSide, phone: ContactSide, opts: { lookupable?: boolean; stalled?: boolean } = {}): string {
  const lookupable = opts.lookupable ?? true;
  if (email === "looking" || phone === "looking") {
    if (opts.stalled) return STILL_LOOKING;
    const found = email === "found" ? "Email found. " : phone === "found" ? "Phone found. " : "";
    if (email === "looking" && phone === "looking") return `${found}Looking, ${LOOKING_SLOW}`;
    return `${found}${email === "looking" ? "Looking for an email" : `Looking for a phone, ${LOOKING_SLOW}`}`;
  }
  if (email === "found" && phone === "found") return "Email and phone found";
  if (email === "found") return phone === "not_found" ? "Email found, no phone" : "Email found";
  if (phone === "found") return email === "not_found" ? "Phone found, no email" : "Phone found";
  if (email === "not_found" && phone === "not_found") return "Not found";
  if (email === "not_found") return "No email found";
  if (phone === "not_found") return "No phone found";
  return lookupable ? "No contact details yet" : "No profile to look up";
}

/**
 * What an "Email" or "Phone" cell of the Shortlisted table says: the value when it is held, else where the lookup
 * stands. `get` is whether a "Get" action sits beside it (the caller decides who may spend a lookup).
 */
export type ValueCell =
  | { state: "value"; value: string }
  | { state: "looking"; words: "Looking" }
  | { state: "on_file"; words: "On file" | "Loading" }
  | { state: "not_found"; words: "Not found" }
  | { state: "not_fetched"; words: "Not fetched" | "No profile"; get: boolean }
  | { state: "blank" };

export function valueCell(input: {
  held: string | null;
  side: ContactSide;
  busy: boolean;
  /** The board has said who has what (so a cell can say "Not fetched" rather than stay blank). */
  known: boolean;
  /** The values have arrived (so "On file" is true rather than "Loading"). */
  valuesReady: boolean;
  lookupable: boolean;
  /** "Get" is offered for this side. */
  offered: boolean;
}): ValueCell {
  if (input.held) return { state: "value", value: input.held };
  if (input.busy || input.side === "looking") return { state: "looking", words: "Looking" };
  if (input.side === "found") return { state: "on_file", words: input.valuesReady ? "On file" : "Loading" };
  if (input.side === "not_found") return { state: "not_found", words: "Not found" };
  if (!input.known) return { state: "blank" };
  return { state: "not_fetched", words: input.lookupable ? "Not fetched" : "No profile", get: input.offered };
}

/* ── who can be asked ─────────────────────────────────────────────────────── */

export type Offer = {
  /** "Get email" is offered. */
  email: boolean;
  /** "Get phone" is offered (it may still be disabled: see `phoneBlocked`). */
  phone: boolean;
  /** The phone button is there but cannot be used, and why. */
  phoneBlocked: string | null;
};

/**
 * Which buttons a person's row offers. Only a side nobody has asked about, only for someone with a profile to
 * look at, only while the campaign is open and a provider is set up. At no credits the phone button stays, said
 * calmly, so the person knows why it is not working and that emails still are.
 */
export function offerFor(
  person: Pick<ContactPerson, "email" | "phone" | "lookupable"> | undefined,
  rules: { closed?: boolean; creditsLeft?: number | null; available?: { email: boolean; phone: boolean } | null },
): Offer {
  const none: Offer = { email: false, phone: false, phoneBlocked: null };
  if (!person || rules.closed || !person.lookupable) return none;
  const available = rules.available ?? { email: true, phone: true };
  const phone = available.phone && person.phone === "none";
  return {
    email: available.email && person.email === "none",
    phone,
    phoneBlocked: phone && rules.creditsLeft !== null && rules.creditsLeft !== undefined && rules.creditsLeft <= 0 ? NO_PHONE_LOOKUPS : null,
  };
}

export type Plan = {
  mode: ContactMode;
  /** The campaign candidates to send, at most `perRequest`. */
  ids: string[];
  /** Everyone who would be asked about before the cap. */
  wanted: number;
  /** Left for another go because of the cap. */
  trimmed: number;
  /** Of those sent, how many are asked for an email and for a phone. */
  emails: number;
  phones: number;
  /** A phone is wanted but there are no credits: those go as emails only, or not at all. */
  phoneBlocked: boolean;
};

/**
 * Who a request for `mode` would ask about, among `people`: those who lack that side, have a profile to look at,
 * and (for a phone) while credits last. More than `perRequest` is cut there, in the order given, and said.
 */
export function planFor(
  people: readonly Pick<ContactPerson, "campaignCandidateId" | "email" | "phone" | "lookupable">[],
  mode: ContactMode,
  rules: { creditsLeft?: number | null; perRequest?: number; available?: { email: boolean; phone: boolean } | null },
): Plan {
  const available = rules.available ?? { email: true, phone: true };
  const noCredits = rules.creditsLeft !== null && rules.creditsLeft !== undefined && rules.creditsLeft <= 0;
  const wantEmail = mode !== "phone" && available.email;
  const wantPhone = mode !== "email" && available.phone;
  const phoneBlocked = wantPhone && noCredits;
  const asked = people.flatMap((p) => {
    if (!p.lookupable) return [];
    const email = wantEmail && p.email === "none";
    const phone = wantPhone && !noCredits && p.phone === "none";
    return email || phone ? [{ id: p.campaignCandidateId, email, phone }] : [];
  });
  const cap = Math.max(1, rules.perRequest ?? 50);
  const sent = asked.slice(0, cap);
  return {
    mode,
    ids: sent.map((a) => a.id),
    wanted: asked.length,
    trimmed: asked.length - sent.length,
    emails: sent.filter((a) => a.email).length,
    phones: sent.filter((a) => a.phone).length,
    phoneBlocked,
  };
}

/** What a request will cost and leave over, after "12 people": a sentence or two, or "" when it says nothing more. */
function planTail(plan: Plan, creditsLeft: number | null): string {
  const left = creditsLeft === null ? "" : ` ${creditsLeft.toLocaleString("en-IN")} left.`;
  const cut = plan.trimmed > 0 ? ` ${plan.ids.length} at a time, ${plan.trimmed.toLocaleString("en-IN")} more can follow.` : "";
  if (plan.mode === "email") return `Free.${cut}`;
  if (plan.mode === "phone") return `Uses a credit for each number found.${left}${cut}`;
  if (plan.phoneBlocked) return `Emails only, they're free. ${NO_PHONE_LOOKUPS}${cut}`;
  return `Emails are free, a phone number uses a credit when found.${left}${cut}`;
}

const nothingLeft = (plan: Plan): string => {
  if (plan.phoneBlocked && plan.mode === "phone") return NO_PHONE_LOOKUPS;
  return plan.mode === "email" ? "Everyone has an email, or has no profile to look up."
    : plan.mode === "phone" ? "Everyone has a phone number, or has no profile to look up."
      : "Nobody needs a lookup.";
};

/** "12 people. Uses a credit for each number found. 38 left." for a menu row. */
export function planDetail(plan: Plan, creditsLeft: number | null): string {
  if (!plan.ids.length) return nothingLeft(plan);
  return `${plural(plan.ids.length, "person", "people")}. ${planTail(plan, creditsLeft)}`;
}

/** The whole sentence a button's tooltip and screen reader say: what pressing it will do. */
export function planLine(plan: Plan, creditsLeft: number | null): string {
  if (!plan.ids.length) return nothingLeft(plan);
  const what = plan.mode === "email" ? "emails" : plan.mode === "phone" ? "phone numbers" : "emails and phone numbers";
  return `Get ${what} for ${plural(plan.ids.length, "person", "people")}. ${planTail(plan, creditsLeft)}`;
}

/* ── what happened ────────────────────────────────────────────────────────── */

/**
 * The line a finished request leaves: what was found, what was not, what is still coming, what is left, and
 * a calm word when it stopped early. The server's own summary leads when it sent one.
 */
export function resultLine(r: Pick<ContactsResult, "counts" | "remaining" | "notice" | "summary">): string {
  const c = r.counts;
  const found = [
    c.emails > 0 ? plural(c.emails, "email") : "",
    c.phones > 0 ? plural(c.phones, "phone number") : "",
  ].filter(Boolean).join(" and ");
  let lead = r.summary.trim();
  if (!lead) {
    if (found) lead = `Got ${found}${c.notFound > 0 ? `, ${c.notFound.toLocaleString("en-IN")} not found` : ""}`;
    else if (c.notFound > 0) lead = `No details found for ${plural(c.notFound, "person", "people")}`;
    else if (c.had > 0 && c.had >= c.asked) lead = "They all have contact details already";
    else if (c.looking > 0) lead = "";
    else lead = "Nothing to look up";
  }
  // The server's own sentence may already say what is still on its way, or what did not go through: said once.
  const saysLooking = /still being looked up/i.test(lead);
  const saysFailed = /couldn't be looked up/i.test(lead);
  if (saysLooking) lead = lead.replace(/still being looked up/i, `still being looked up, this can take a few minutes`);
  const parts: string[] = [];
  if (lead) parts.push(lead.replace(/[.\s]+$/, ""));
  if (c.looking > 0 && !saysLooking) {
    parts.push(`${plural(c.looking, "phone")} still being looked up, this can take a few minutes`);
  }
  if (c.failed > 0 && !saysFailed) parts.push(`${plural(c.failed, "lookup")} didn't go through, try again in a minute`);
  if (r.remaining > 0) parts.push(`${r.remaining.toLocaleString("en-IN")} more ${r.remaining === 1 ? "is" : "are"} waiting. Run it again`);
  const body = parts.join(". ").replace(/\.\.+/g, ".");
  const notice = r.notice?.trim();
  return notice ? `${body ? `${body.replace(/[.\s]+$/, "")}. ` : ""}${notice}` : body;
}

/** A finished request did some good (something found or on its way). */
export const didSomeGood = (r: Pick<ContactsResult, "counts">): boolean =>
  r.counts.emails > 0 || r.counts.phones > 0 || r.counts.looking > 0;

/** A toast this short, and this clean, is a plain "done"; one with a caution or a longer sentence is held longer, calmly. */
const SHORT_TOAST = 48;
export function toastTone(r: Pick<ContactsResult, "counts" | "remaining" | "notice">, line: string): "done" | "error" {
  if (!didSomeGood(r) || r.remaining > 0 || r.notice || r.counts.failed > 0 || line.length > SHORT_TOAST) return "error";
  return "done";
}

/* ── keeping the status current ──────────────────────────────────────────── */

export function recount(people: readonly ContactPerson[]): ContactsCounts {
  return {
    people: people.length,
    emailFound: people.filter((p) => p.email === "found").length,
    phoneFound: people.filter((p) => p.phone === "found").length,
    looking: people.filter((p) => p.email === "looking" || p.phone === "looking").length,
    missingEmail: people.filter((p) => p.email === "none").length,
    missingPhone: people.filter((p) => p.phone === "none").length,
  };
}

const sideAfter = (now: ContactSide, result: SideResult): ContactSide => {
  switch (result) {
    case "found": case "had": return "found";
    case "not_found": return "not_found";
    case "looking": return "looking";
    // Skipped, out of credits, failed, or not asked about: it is as it was.
    default: return now;
  }
};

/** The status with a request's answer laid over it, so the table moves before the server is asked again. */
export function mergeResult(status: ContactsStatus, result: ContactsResult): ContactsStatus {
  const by = new Map(result.people.map((p) => [p.campaignCandidateId, p]));
  const people = status.people.map((p) => {
    const r = by.get(p.campaignCandidateId);
    return r ? { ...p, email: sideAfter(p.email, r.email), phone: sideAfter(p.phone, r.phone) } : p;
  });
  return { ...status, people, creditsLeft: result.creditsLeft, counts: recount(people) };
}

/** People who were not found yet and now are: the board and Candidates should be read again. */
export function flippedToFound(before: ContactsStatus | null, after: ContactsStatus): boolean {
  if (!before) return false;
  const was = new Map(before.people.map((p) => [p.campaignCandidateId, p]));
  return after.people.some((p) => {
    const b = was.get(p.campaignCandidateId);
    return !!b && ((b.email !== "found" && p.email === "found") || (b.phone !== "found" && p.phone === "found"));
  });
}

/** How often a campaign with phones still being looked up is asked again, and how long that goes on. */
export const POLL_MS = 6000;
export const STALL_AFTER_MS = 10 * 60_000;

/**
 * Whether to keep asking: while anyone is still being looked up, for ten minutes at most. After that the line says
 * it will show up when it arrives, and the page stops asking (a refresh, or any other write, asks once more).
 */
export function pollRule(looking: number, since: number | null, now: number): "poll" | "stop" | "stalled" {
  if (looking <= 0) return "stop";
  if (since !== null && now - since >= STALL_AFTER_MS) return "stalled";
  return "poll";
}
