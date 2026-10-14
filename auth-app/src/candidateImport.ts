import type { Contact, Provider, Seniority } from "./contacts";
import type { Hue } from "./orchestrator";
import { normalizePhone, parsePhone, phoneProblemText } from "./phone";

/**
 * Adding candidates by hand: pasted LinkedIn links, a one-person form, or a
 * CSV. Pure functions only (no React, no stores), so every rule here is
 * tested on its own.
 *
 * Candidates reach SuperHyre three ways: the Chrome extension, agent sourcing
 * through Crustdata, and this. In the backend all three go through one
 * upsert that dedupes on identifiers, kept unique per
 * (identifier_type, normalized_value) in mother_data.person_identifiers:
 * the LinkedIn URL, the email and the phone, each normalised first. The
 * prototype mirrors that exactly, so "already in SuperHyre" here means the
 * same thing it will mean against the real table.
 */

/* ── identifiers ── */

export type IdKind = "linkedin" | "email" | "phone";

export const ID_LABEL: Readonly<Record<IdKind, string>> = { linkedin: "LinkedIn", email: "email", phone: "phone" };

export type LinkedInResult = { ok: true; slug: string; url: string } | { ok: false; reason: string };

/** Paths on linkedin.com that are not a person. */
const NOT_A_PERSON = /^linkedin\.com\/(company|school|jobs|job|pub|posts|feed|sales|recruiter|groups|events|showcase|learning|pulse|talent)(\/|$)/;

/**
 * A LinkedIn profile link in its one canonical form, `linkedin.com/in/<slug>`.
 * Lowercased, protocol, `www.` or a country subdomain dropped, query string,
 * fragment and trailing slashes stripped. Only the /in/<slug> form counts:
 * company pages, posts and profile sub-pages are refused with a reason a
 * person can act on.
 */
export function normaliseLinkedIn(raw: string): LinkedInResult {
  let s = raw.trim().toLowerCase();
  if (!s) return { ok: false, reason: "Empty line" };
  s = s.replace(/^<|>$/g, "").split(/[?#]/)[0]!;
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^(www|m|[a-z]{2})\./, "").replace(/\/+$/, "");
  if (!/^linkedin\.com(\/|$)/.test(s)) return { ok: false, reason: "Not a LinkedIn link" };
  if (NOT_A_PERSON.test(s)) return { ok: false, reason: "Not a profile. Only linkedin.com/in/… links can be added" };
  if (!s.startsWith("linkedin.com/in/")) return { ok: false, reason: "Not a profile. Only linkedin.com/in/… links can be added" };
  const rest = s.slice("linkedin.com/in/".length);
  if (!rest) return { ok: false, reason: "The profile name after /in/ is missing" };
  if (rest.includes("/")) return { ok: false, reason: "Points inside a profile. Use the main profile link" };
  let slug = rest;
  try { slug = decodeURIComponent(rest); } catch { return { ok: false, reason: "The link is garbled" }; }
  if (!/^[\p{L}\p{N}_-]{3,100}$/u.test(slug)) return { ok: false, reason: "The profile name has characters LinkedIn does not use" };
  return { ok: true, slug, url: `linkedin.com/in/${slug}` };
}

/**
 * A readable name from a profile slug: `aarav-sharma-4821` is Aarav Sharma.
 * Parts with digits in them are LinkedIn's disambiguators, not the name.
 */
export function nameFromSlug(slug: string): string {
  const parts = slug.split(/[-_]+/).filter((p) => p && !/\d/.test(p));
  if (!parts.length) return slug;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;

/** Trimmed and lowercased, or null when it is not an email address. */
export function normaliseEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^mailto:/, "");
  return EMAIL.test(s) ? s : null;
}

/**
 * A phone number as one canonical string (E.164), or null when it can't be one: the same
 * rules on this page, the server and the database (phone.ts). `+91 98450 12345`,
 * `098450 12345`, `9845012345` and `0091 98450 12345` all become `+919845012345`.
 */
export const normalisePhone = normalizePhone;

/** The minimum of a candidate the dedupe needs. A Contact satisfies it. */
export type Known = { id: string; name: string; linkedin?: string; email?: { value: string }; phone?: { value: string } };

export type IdentityIndex = ReadonlyMap<string, Known>;

const keyOf = (kind: IdKind, value: string) => `${kind}:${value}`;

/** Every identifier of every known candidate, normalised, to the candidate. */
export function buildIndex(people: readonly Known[]): IdentityIndex {
  const m = new Map<string, Known>();
  for (const p of people) {
    for (const [kind, value] of identifiersOf({ linkedin: p.linkedin ?? "", email: p.email?.value ?? "", phone: p.phone?.value ?? "" })) {
      if (!m.has(keyOf(kind, value))) m.set(keyOf(kind, value), p);
    }
  }
  return m;
}

/** The normalised identifiers a set of raw values carries, strongest first. */
export function identifiersOf(v: { linkedin?: string; email?: string; phone?: string }): [IdKind, string][] {
  const out: [IdKind, string][] = [];
  const li = v.linkedin ? normaliseLinkedIn(v.linkedin) : null;
  if (li?.ok) out.push(["linkedin", li.slug]);
  const em = v.email ? normaliseEmail(v.email) : null;
  if (em) out.push(["email", em]);
  const ph = v.phone ? normalisePhone(v.phone) : null;
  if (ph) out.push(["phone", ph]);
  return out;
}

export type Match = { person: Known; by: IdKind; value: string };

/** The candidate these values already belong to, if any, and on which key. */
export function findExisting(index: IdentityIndex, v: { linkedin?: string; email?: string; phone?: string }): Match | null {
  for (const [kind, value] of identifiersOf(v)) {
    const hit = index.get(keyOf(kind, value));
    if (hit) return { person: hit, by: kind, value };
  }
  return null;
}

/* ── pasted links ── */

export const MAX_LINKS = 50;

export type LinkVerdict =
  | { n: number; raw: string; kind: "new"; slug: string; url: string; name: string }
  | { n: number; raw: string; kind: "existing"; slug: string; match: Known }
  | { n: number; raw: string; kind: "repeat"; slug: string; first: number }
  | { n: number; raw: string; kind: "over"; slug: string }
  | { n: number; raw: string; kind: "invalid"; reason: string };

/**
 * One verdict per pasted link, in the order pasted. Links are one per line,
 * though a comma or a space between two on one line also works, since a
 * link has neither. Past MAX_LINKS valid new links, the rest are marked "over".
 */
export function classifyLinks(text: string, index: IdentityIndex, limit = MAX_LINKS): LinkVerdict[] {
  /* A line holding two links is split on the space or comma between them;
     any other line is one entry, so "not a link" is one mistake, not three. */
  const items = text.split(/\r?\n/).flatMap((line) => ((line.match(/linkedin\./gi) ?? []).length > 1 ? line.split(/[\s,;]+/) : [line]))
    .map((x) => x.trim()).filter(Boolean);
  const seen = new Map<string, number>();
  let fresh = 0;
  return items.map((raw, i): LinkVerdict => {
    const n = i + 1;
    const r = normaliseLinkedIn(raw);
    if (!r.ok) return { n, raw, kind: "invalid", reason: r.reason };
    const first = seen.get(r.slug);
    if (first) return { n, raw, kind: "repeat", slug: r.slug, first };
    seen.set(r.slug, n);
    const hit = index.get(keyOf("linkedin", r.slug));
    if (hit) return { n, raw, kind: "existing", slug: r.slug, match: hit };
    if (fresh >= limit) return { n, raw, kind: "over", slug: r.slug };
    fresh += 1;
    return { n, raw, kind: "new", slug: r.slug, url: r.url, name: nameFromSlug(r.slug) };
  });
}

/* ── one candidate ── */

export type CandidateDraft = {
  name: string;
  linkedin: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  /** As typed; a number of years. */
  years: string;
  skills: readonly string[];
  notes: string;
};

export const EMPTY_CANDIDATE: CandidateDraft = {
  name: "", linkedin: "", email: "", phone: "", title: "", company: "", location: "", years: "", skills: [], notes: "",
};

/** Years of experience from what was typed: "6", "6.5", "6 yrs", "6+". One decimal is kept, as the server keeps it. */
export function parseYears(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}(?:\.\d+)?)\s*\+?\s*(y|yr|yrs|year|years)?\.?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 60 ? Math.round(n * 10) / 10 : null;
}

/** What is wrong with a draft, by field. Empty means it can be added. */
export function candidateProblems(d: CandidateDraft): Partial<Record<keyof CandidateDraft, string>> {
  const out: Partial<Record<keyof CandidateDraft, string>> = {};
  if (d.name.trim().length < 2) out.name = d.name.trim() ? "A name needs at least two letters." : "Add their name.";
  if (d.linkedin.trim()) {
    const r = normaliseLinkedIn(d.linkedin);
    if (!r.ok) out.linkedin = `${r.reason}.`;
  }
  if (d.email.trim() && !normaliseEmail(d.email)) out.email = "That doesn't look like an email yet.";
  if (d.phone.trim() && !normalisePhone(d.phone)) {
    const r = parsePhone(d.phone);
    out.phone = r.ok ? "Check the number." : phoneProblemText(r.problem);
  }
  if (d.years.trim() && parseYears(d.years) === null) out.years = "A number of years, like 6.";
  return out;
}

/** Splits a skills cell or a typed list: commas, semicolons, pipes, new lines. */
export function splitSkills(raw: string): string[] {
  const out: string[] = [];
  for (const s of raw.split(/[,;|\n]+/)) {
    const t = s.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

const SENIORITY_WORDS: readonly [RegExp, Seniority][] = [
  [/\b(director|head|vp|vice president|chief|cto|cfo|ceo)\b/i, "Director"],
  [/\bmanager\b/i, "Manager"],
  [/\b(lead|principal)\b/i, "Lead"],
  [/\bstaff\b/i, "Staff"],
  [/\b(senior|sr\.?)\b/i, "Senior"],
  [/\b(junior|jr\.?|associate|intern|trainee|graduate)\b/i, "Junior"],
];

/**
 * A seniority from the title when it says, otherwise from the years. With neither there is no level:
 * an unknown number of years is not zero, and zero years is not "Mid".
 */
export function seniorityFrom(title: string, years: number | null): Seniority | null {
  for (const [re, s] of SENIORITY_WORDS) if (re.test(title)) return s;
  if (!years) return null;
  return years < 3 ? "Junior" : years < 6 ? "Mid" : years < 9 ? "Senior" : "Staff";
}

const HUES: readonly Hue[] = ["brand", "amber", "sage", "teal", "blue", "violet", "rose"];

/** The same avatar colour for the same name, every time. */
export function hueFor(name: string): Hue {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export type Origin = NonNullable<Contact["origin"]>;
export type Channel = NonNullable<Contact["channel"]>;

/** A draft as a new candidate. Basic profile: nothing has been fetched. */
export function contactFromDraft(d: CandidateDraft, o: {
  id: string; by: string; origin: Origin; owner?: string; campaign?: string; channel?: Channel;
}): Contact {
  const name = d.name.trim().replace(/\s+/g, " ");
  const title = d.title.trim();
  const company = d.company.trim();
  const years = parseYears(d.years) ?? 0;
  const li = d.linkedin.trim() ? normaliseLinkedIn(d.linkedin) : null;
  const email = normaliseEmail(d.email);
  const phone = d.phone.trim() && normalisePhone(d.phone) ? d.phone.trim() : "";
  const notes = d.notes.trim();
  return {
    id: o.id,
    name,
    hue: hueFor(name),
    title,
    company,
    location: d.location.trim(),
    seniority: seniorityFrom(title, years),
    years,
    industry: "",
    skills: [...d.skills],
    email: email ? { value: email, source: "Manual", verified: false } : undefined,
    phone: phone ? { value: phone, source: "Manual" } : undefined,
    linkedin: li?.ok ? li.url : "",
    campaign: o.campaign ?? "",
    capturedBy: o.by,
    capturedAgo: 0,
    profile: "basic",
    openToWork: false,
    jobs: title || company ? [{ title, company, span: "Present" }] : [],
    origin: o.origin,
    channel: o.channel,
    owner: o.owner ?? o.by,
    notes: notes || undefined,
  };
}

/** What a merge would write, and the plain names of what changes. */
export type Merge = { patch: Partial<Contact>; changed: string[] };

/**
 * New details onto an existing candidate. Every non-empty field in the draft
 * is written; an empty one never erases anything. Skills are added to, notes
 * are appended. A field that already says the same thing is not a change.
 */
export function mergeDraft(c: Contact, d: CandidateDraft, source: Provider = "Manual"): Merge {
  const patch: Partial<Contact> = {};
  const changed: string[] = [];
  const text = (k: "title" | "company" | "location", label: string) => {
    const v = d[k].trim();
    if (v && v !== c[k]) { patch[k] = v; changed.push(label); }
  };
  const li = d.linkedin.trim() ? normaliseLinkedIn(d.linkedin) : null;
  if (li?.ok) {
    const cur = normaliseLinkedIn(c.linkedin);
    if (!cur.ok || cur.slug !== li.slug) { patch.linkedin = li.url; changed.push("LinkedIn"); }
  }
  const em = normaliseEmail(d.email);
  if (em && em !== (c.email ? normaliseEmail(c.email.value) : null)) { patch.email = { value: em, source, verified: false }; changed.push("email"); }
  const ph = normalisePhone(d.phone);
  if (ph && ph !== (c.phone ? normalisePhone(c.phone.value) : null)) { patch.phone = { value: d.phone.trim(), source }; changed.push("phone"); }
  text("title", "title");
  text("company", "company");
  text("location", "location");
  const y = parseYears(d.years);
  if (y !== null && y !== c.years) { patch.years = y; changed.push("experience"); }
  const extra = d.skills.filter((s) => !c.skills.some((x) => x.toLowerCase() === s.toLowerCase()));
  if (extra.length) { patch.skills = [...c.skills, ...extra]; changed.push("skills"); }
  const note = d.notes.trim();
  if (note && !(c.notes ?? "").includes(note)) { patch.notes = c.notes ? `${c.notes}\n\n${note}` : note; changed.push("notes"); }
  if ((patch.title !== undefined || patch.company !== undefined) && c.jobs.length <= 1) {
    patch.jobs = [{ title: patch.title ?? c.title, company: patch.company ?? c.company, span: c.jobs[0]?.span ?? "Present" }];
  }
  return { patch, changed };
}

/** "email, phone and title" */
export function listWords(xs: readonly string[]): string {
  return xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/* ── CSV ── */

/** Comma, unless the header line plainly uses semicolons or tabs instead. */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const outside = first.replace(/"[^"]*"/g, "");
  const count = (c: string) => outside.split(c).length - 1;
  const [comma, semi, tab] = [count(","), count(";"), count("\t")];
  if (tab > comma && tab >= semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

/**
 * RFC 4180 CSV: quoted fields may hold the delimiter, line breaks and
 * doubled quotes. A leading byte-order mark (Excel writes one) is dropped,
 * CRLF and LF both end a row, and rows with nothing in them are skipped.
 */
export function parseCsv(input: string, delimiter: string = detectDelimiter(input)): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  const endField = () => { row.push(field); field = ""; fieldStarted = false; };
  const endRow = () => { endField(); if (row.some((c) => c.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !fieldStarted && !field.trim()) { field = ""; quoted = true; fieldStarted = true; continue; }
    if (c === delimiter) { endField(); continue; }
    if (c === "\r") { if (text[i + 1] === "\n") i++; endRow(); continue; }
    if (c === "\n") { endRow(); continue; }
    field += c;
    if (c.trim()) fieldStarted = true;
  }
  if (field || row.length) endRow();
  return rows.map((r) => r.map((c) => c.trim()));
}

export type FieldKey = "name" | "email" | "phone" | "linkedin" | "title" | "company" | "location" | "years" | "skills";

export const FIELDS: readonly { key: FieldKey; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "location", label: "Location" },
  { key: "years", label: "Experience" },
  { key: "skills", label: "Skills" },
];

/** Exact header names, after lowercasing and squashing punctuation. */
const SYNONYMS: Readonly<Record<FieldKey, readonly string[]>> = {
  name: ["name", "full name", "fullname", "candidate", "candidate name", "person", "contact name", "full names"],
  email: ["email", "e mail", "email address", "email id", "mail", "work email", "personal email", "emails"],
  phone: ["phone", "mobile", "phone number", "mobile number", "mobile no", "phone no", "contact number", "contact no", "cell", "whatsapp", "number"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile", "linkedin link", "profile url", "profile link", "li url"],
  title: ["title", "designation", "job title", "current title", "current designation", "role", "position", "current role"],
  company: ["company", "organisation", "organization", "current company", "current organisation", "current organization", "employer", "org"],
  location: ["location", "city", "current location", "current city", "based in", "place"],
  years: ["experience", "years", "years of experience", "yoe", "exp", "total experience", "experience years", "experience in years", "work experience"],
  skills: ["skills", "key skills", "skill set", "skillset", "tech stack", "technologies", "primary skills"],
};

/** Looser hints, tried only when no header matched a field exactly. */
const HINTS: readonly [FieldKey, RegExp][] = [
  ["linkedin", /linked\s*in/],
  ["email", /\be ?mail\b/],
  ["phone", /\b(phone|mobile|cell|whatsapp)\b/],
  ["years", /\b(experience|exp|yoe|years|yrs)\b/],
  ["skills", /\bskill/],
  ["company", /\b(company|organi[sz]ation|employer)\b/],
  ["title", /\b(title|designation|role|position)\b/],
  ["location", /\b(location|city)\b/],
  ["name", /\bname\b/],
];

const squash = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which field each column holds, by its header; null for columns to leave out. */
export function autoMap(headers: readonly string[]): (FieldKey | null)[] {
  const out: (FieldKey | null)[] = headers.map(() => null);
  const taken = new Set<FieldKey>();
  const keys = headers.map(squash);
  keys.forEach((k, i) => {
    const f = (Object.keys(SYNONYMS) as FieldKey[]).find((f) => !taken.has(f) && SYNONYMS[f].includes(k));
    if (f) { out[i] = f; taken.add(f); }
  });
  keys.forEach((k, i) => {
    if (out[i]) return;
    /* "First name" and "Last name" are not a full name on their own. */
    const partName = /\b(first|last|middle|sur|given|family|company|file|user)\s?name\b/.test(k);
    const hit = HINTS.find(([f, re]) => !taken.has(f) && re.test(k) && !(f === "name" && partName));
    if (hit) { out[i] = hit[0]; taken.add(hit[0]); }
  });
  return out;
}

/** One data row as a draft, through the column mapping. */
export function rowToDraft(row: readonly string[], map: readonly (FieldKey | null)[]): CandidateDraft {
  const d = { ...EMPTY_CANDIDATE, skills: [] as string[] };
  map.forEach((f, i) => {
    const v = (row[i] ?? "").trim();
    if (!f || !v) return;
    if (f === "skills") d.skills = splitSkills(v);
    else d[f] = v;
  });
  return d;
}

export type RowVerdict =
  | { row: number; draft: CandidateDraft; kind: "new" }
  | { row: number; draft: CandidateDraft; kind: "duplicate"; match: Known; by: IdKind; value: string }
  | { row: number; draft: CandidateDraft; kind: "repeat"; first: number; by: IdKind; value: string }
  | { row: number; draft: CandidateDraft; kind: "error"; reasons: string[] };

/**
 * Sorts every data row into new, already in SuperHyre (and on which key),
 * a repeat of an earlier row in the same file, or one that needs fixing.
 * `row` is the spreadsheet's own row number, so the header is row 1 and the
 * first person is row 2: the number someone sees when they open the file.
 */
export function classifyRows(drafts: readonly CandidateDraft[], index: IdentityIndex): RowVerdict[] {
  const inFile = new Map<string, number>();
  return drafts.map((draft, i): RowVerdict => {
    const row = i + 2;
    const reasons = rowProblems(draft);
    if (reasons.length) return { row, draft, kind: "error", reasons };
    const hit = findExisting(index, draft);
    const ids = identifiersOf(draft);
    const again = ids.map(([k, v]) => [k, v, inFile.get(keyOf(k, v))] as const).find(([, , r]) => r !== undefined);
    for (const [k, v] of ids) if (!inFile.has(keyOf(k, v))) inFile.set(keyOf(k, v), row);
    if (hit) return { row, draft, kind: "duplicate", match: hit.person, by: hit.by, value: hit.value };
    if (again) return { row, draft, kind: "repeat", first: again[2]!, by: again[0], value: again[1] };
    return { row, draft, kind: "new" };
  });
}

/** Why a row cannot be imported, in words that point at the cell. */
export function rowProblems(d: CandidateDraft): string[] {
  const p = candidateProblems(d);
  const out: string[] = [];
  if (p.name) out.push(d.name.trim() ? "Name is too short" : "No name");
  if (p.linkedin) out.push(`LinkedIn: ${p.linkedin.replace(/\.$/, "").replace(/^./, (x) => x.toLowerCase())}`);
  if (p.email) out.push("Email doesn't look right");
  if (p.phone) out.push("Phone needs 8 to 15 digits");
  if (p.years) out.push("Experience isn't a number of years");
  // The server's rule too: with no way to tell them apart later, a row is left out, so it is counted as needing a fix here.
  if (!out.length && identifiersOf(d).length === 0) out.push("No LinkedIn, email or phone");
  return out;
}

export type Tally = { fresh: number; duplicates: number; errors: number };

export function tally(vs: readonly RowVerdict[]): Tally {
  let fresh = 0, duplicates = 0, errors = 0;
  for (const v of vs) {
    if (v.kind === "new") fresh++;
    else if (v.kind === "error") errors++;
    else duplicates++;
  }
  return { fresh, duplicates, errors };
}

/** A small CSV someone can fill in, with the headers auto-mapping knows. */
export const TEMPLATE_CSV = [
  "Full name,Email,Phone,LinkedIn,Title,Company,Location,Experience,Skills",
  "\"Asha Verma\",asha.verma@example.in,+91 98450 12345,https://www.linkedin.com/in/asha-verma,Senior Backend Engineer,Acme Fintech,Bangalore,7,\"Go, Postgres, Kafka\"",
].join("\r\n");

/** A spreadsheet or image renamed to .csv: NUL bytes, or many characters that failed to decode. */
export function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (!sample) return false;
  let odd = 0;
  for (const ch of sample) {
    const c = ch.charCodeAt(0);
    if (c === 0) return true;
    if (ch === "\uFFFD" || (c < 32 && c !== 9 && c !== 10 && c !== 13)) odd++;
  }
  return odd / sample.length > 0.02;
}
