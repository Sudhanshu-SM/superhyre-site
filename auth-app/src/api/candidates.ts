import type { CandidateDraft } from "../candidateImport";
import { hueFor, seniorityFrom } from "../candidateImport";
import type { Contact, ContactJob } from "../contacts";
import { ApiError, api } from "./client";

/**
 * The workspace's candidates over the API, and the adapters that turn its
 * rows into the console's Contact. Contacts (email, phone) only ever come
 * from the workspace's own candidate row, never from the shared pool.
 */

type Source = "agent" | "extension" | "manual" | "form" | "referral" | "import";

export type CandidateRow = {
  id: string;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompanyName: string | null;
  city: string | null;
  country: string | null;
  yearsOfExperience: number | null;
  linkedinUrl: string | null;
  source: Source | null;
  ownerId: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  /** The workspace's own contact values, never the shared pool's. */
  email: string | null;
  phone: string | null;
  completeness: "basic" | "scraped" | "enriched";
  /** `step`: where within the stage; "replied" at outreach is Replied. Absent from older servers. */
  campaigns: { id: string; name: string; stage: string; step?: string | null; stageName?: string | null }[];
  createdAt: string;
};

export type ListQuery = {
  q?: string;
  campaignId?: string;
  location?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  skills?: readonly string[];
  sort: "recent" | "name";
  cursor?: string | null;
  limit: number;
  /** Rows to skip, for a numbered page (the API answers with the whole `total`). */
  offset?: number;
};

export function listPath(q: ListQuery): string {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set("q", q.q.trim());
  if (q.campaignId) p.set("campaignId", q.campaignId);
  if (q.location) p.set("location", q.location);
  if (q.hasEmail) p.set("hasEmail", "true");
  if (q.hasPhone) p.set("hasPhone", "true");
  if (q.skills?.length) p.set("skills", q.skills.join(","));
  p.set("sort", q.sort);
  if (q.cursor) p.set("cursor", q.cursor);
  p.set("limit", String(q.limit));
  if (q.offset) p.set("offset", String(q.offset));
  return `/v1/candidates?${p.toString()}`;
}

const DAY = 864e5;
const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
const bare = (url: string | null) => (url ? url.replace(/^https?:\/\//, "").replace(/^www\./, "") : "");
const place = (city: string | null, country: string | null) => [city, country].filter(Boolean).join(", ");

const ORIGIN: Readonly<Record<Source, NonNullable<Contact["origin"]>>> = {
  agent: "Agent", extension: "Extension", manual: "Manual", referral: "Manual", import: "Upload", form: "Form",
};

/** A list row as a Contact, with this workspace's email and phone when it holds them. */
export function contactFromRow(r: CandidateRow, now = Date.now()): Contact {
  const title = r.currentTitle ?? r.headline ?? "";
  const company = r.currentCompanyName ?? "";
  const years = r.yearsOfExperience ?? 0;
  return {
    id: r.id,
    name: r.fullName,
    hue: hueFor(r.fullName),
    title,
    company,
    location: place(r.city, r.country),
    seniority: seniorityFrom(title, years),
    years,
    industry: "",
    skills: [],
    email: r.email ? { value: r.email, source: "Manual", verified: false } : undefined,
    phone: r.phone ? { value: r.phone, source: "Manual" } : undefined,
    linkedin: bare(r.linkedinUrl),
    campaign: r.campaigns[0]?.id ?? "",
    capturedBy: "",
    capturedAgo: daysSince(r.createdAt, now),
    profile: r.completeness === "basic" ? "basic" : "full",
    openToWork: false,
    jobs: title || company ? [{ title, company, span: "Present" }] : [],
    origin: r.source ? ORIGIN[r.source] : undefined,
    channel: r.source === "referral" ? "Referral" : undefined,
    onFile: { email: r.hasEmail, phone: r.hasPhone },
  };
}

export async function listCandidates(q: ListQuery): Promise<{ rows: CandidateRow[]; nextCursor: string | null; total: number | null }> {
  const res = await api<{ candidates: CandidateRow[]; nextCursor: string | null; total?: unknown }>("GET", listPath(q));
  const total = typeof res.total === "number" && Number.isFinite(res.total) ? Math.max(0, res.total) : null;
  return { rows: res.candidates, nextCursor: res.nextCursor, total };
}

/* ── one candidate ── */

export type Note = { id: string; body: string; authorName: string | null; createdAt: string };

export type DetailCampaign = { id: string; name: string; campaignCandidateId: string; stage: string; step?: string | null; stageName?: string | null };

type Experience = {
  company: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean | null;
};

export type CandidateDetail = {
  candidate: {
    id: string;
    /** The shared person this candidate is, which the campaign's matches are keyed by. */
    personId?: string | null;
    fullName: string;
    headline: string | null;
    currentTitle: string | null;
    currentCompanyName: string | null;
    linkedinUrl: string | null;
    city: string | null;
    country: string | null;
    yearsOfExperience: number | null;
    source: Source | null;
    about: string | null;
    primaryEmail: string | null;
    email2: string | null;
    email3: string | null;
    workEmail: string | null;
    primaryPhone: string | null;
    phone2: string | null;
    phone3: string | null;
    createdAt: string;
  };
  profile: {
    summary: string | null;
    locationText: string | null;
    experiences: Experience[];
    skills: string[];
    education: unknown[];
    completeness: "basic" | "scraped" | "enriched";
  };
  campaigns: DetailCampaign[];
  /** Whether the viewer may change this person's details (the server's answer; absent from older servers: then yes). */
  canEdit?: boolean;
  notes: Note[];
};

const year = (iso: string | null) => (iso ? iso.slice(0, 4) : "");

function jobOf(e: Experience): ContactJob {
  const from = year(e.startDate);
  const to = e.isCurrent ? "Present" : year(e.endDate);
  return { title: e.title ?? "", company: e.company ?? "", span: from && to ? `${from} – ${to}` : from || to };
}

/** Education rows come from the shared profile in a few shapes; take what reads as a school. */
function schoolOf(raw: unknown): Contact["school"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const text = (...keys: string[]) => {
    for (const k of keys) { const v = o[k]; if (typeof v === "string" && v.trim()) return v.trim(); if (typeof v === "number") return String(v); }
    return "";
  };
  const name = text("school", "institute", "institution", "name");
  if (!name) return undefined;
  const span = [text("startYear", "start_year", "start"), text("endYear", "end_year", "end")].filter(Boolean).map((y) => y.slice(0, 4));
  return { name, degree: [text("degree"), text("field", "fieldOfStudy", "field_of_study")].filter(Boolean).join(", "), years: span.join(" – ") };
}

/** The profile as a Contact, with the values of whatever contacts this workspace holds. */
export function contactFromDetail(d: CandidateDetail, now = Date.now()): Contact {
  const c = d.candidate;
  const title = c.currentTitle ?? c.headline ?? "";
  const company = c.currentCompanyName ?? "";
  const years = c.yearsOfExperience ?? 0;
  const email = c.primaryEmail ?? c.workEmail ?? c.email2 ?? c.email3;
  const phone = c.primaryPhone ?? c.phone2 ?? c.phone3;
  const jobs = d.profile.experiences.map(jobOf).filter((j) => j.title || j.company);
  return {
    id: c.id,
    name: c.fullName,
    hue: hueFor(c.fullName),
    title,
    company,
    location: place(c.city, c.country) || (d.profile.locationText ?? ""),
    seniority: seniorityFrom(title, years),
    years,
    industry: "",
    skills: d.profile.skills,
    email: email ? { value: email, source: "Manual", verified: false } : undefined,
    phone: phone ? { value: phone, source: "Manual" } : undefined,
    linkedin: bare(c.linkedinUrl),
    campaign: d.campaigns[0]?.id ?? "",
    capturedBy: "",
    capturedAgo: daysSince(c.createdAt, now),
    profile: d.profile.completeness === "basic" ? "basic" : "full",
    openToWork: false,
    jobs: jobs.length ? jobs : title || company ? [{ title, company, span: "Present" }] : [],
    school: schoolOf(d.profile.education[0]),
    about: d.profile.summary ?? c.about ?? undefined,
    origin: c.source ? ORIGIN[c.source] : undefined,
    channel: c.source === "referral" ? "Referral" : undefined,
    onFile: { email: Boolean(email), phone: Boolean(phone) },
  };
}

export const getCandidate = (id: string) => api<CandidateDetail>("GET", `/v1/candidates/${id}`);

/* ── adding ── */

/** What the add form, "Add details" and a CSV row send: only the cells that have something in them. */
export type Fields = {
  fullName?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  location?: string;
  yearsOfExperience?: string;
  skills?: string[];
  notes?: string;
};

export function fieldsFromDraft(d: CandidateDraft): Fields {
  const out: Fields = {};
  const put = (k: Exclude<keyof Fields, "skills">, v: string) => { if (v.trim()) out[k] = v.trim(); };
  put("fullName", d.name);
  put("linkedinUrl", d.linkedin);
  put("email", d.email);
  put("phone", d.phone);
  put("title", d.title);
  put("company", d.company);
  put("location", d.location);
  put("yearsOfExperience", d.years);
  put("notes", d.notes);
  if (d.skills.length) out.skills = [...d.skills];
  return out;
}

export type AddOutcome =
  | { kind: "added"; id: string }
  | { kind: "exists"; id: string; by: string; message: string };

/** How a person typed in came to us, as the API stores it. */
export type AddSource = "manual" | "referral";

/** One person. "Already here" is an answer, not a failure: the 409 names who. */
export async function addCandidate(
  fields: Fields, campaignId: string | null, opts: { source?: AddSource; ownerId?: string } = {},
): Promise<AddOutcome> {
  try {
    const r = await api<{ id: string }>("POST", "/v1/candidates", {
      ...fields, ...(campaignId ? { campaignId } : {}), ...(opts.source ? { source: opts.source } : {}), ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
    });
    return { kind: "added", id: r.id };
  } catch (err) {
    const existing = err instanceof ApiError && err.status === 409 ? err.details.existingCandidateId : undefined;
    if (err instanceof ApiError && typeof existing === "string") {
      return { kind: "exists", id: existing, by: String(err.details.matchedBy ?? ""), message: err.message };
    }
    throw err;
  }
}

/** Fills blanks on someone already here; never overwrites. */
export const addDetails = (id: string, fields: Fields) =>
  api<{ id: string; changed: string[] }>("POST", `/v1/candidates/${id}/details`, fields);

/** Pasted links, sent as rows: the import dedupes them in one request. */
export const linkRows = (links: readonly { url: string; name: string }[]): Fields[] =>
  links.map((l) => ({ fullName: l.name, linkedinUrl: l.url }));

/* ── CSV import ── */

export const IMPORT_CHUNK = 500;

type ImportRow = { row: number; kind: "new" | "duplicate" | "repeat" | "error"; candidateId?: string; changed?: string[] };
export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reasons: string[] }[];
  rows: ImportRow[];
};
export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reasons: string[] }[];
  /** People added or changed, to light up in the list. */
  touched: string[];
};

/**
 * Results of the chunks one file was sent in, as one. Each chunk numbers its
 * rows from 2, like a sheet; shifted back so a row number points at the file.
 */
export function mergeImport(parts: readonly ImportResult[], chunk = IMPORT_CHUNK): ImportSummary {
  const out: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [], touched: [] };
  parts.forEach((p, i) => {
    const shift = i * chunk;
    out.created += p.created;
    out.updated += p.updated;
    out.skipped += p.skipped;
    for (const e of p.errors) out.errors.push({ row: e.row + shift, reasons: e.reasons });
    for (const r of p.rows) {
      const touched = r.kind === "new" || (r.kind === "duplicate" && (r.changed?.length ?? 0) > 0);
      if (touched && r.candidateId && !out.touched.includes(r.candidateId)) out.touched.push(r.candidateId);
    }
  });
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The most rows a result names; the rest are counted. */
const LEFT_OUT_SHOWN = 3;

/**
 * "2 rows left out (row 4, Asha Verma: No LinkedIn, email or phone; row 7: No name)": how many, and for the first few
 * which row and why. `nameOf` gives the person's name from the file's row number, when the caller still has the file.
 */
function leftOut(errors: ImportSummary["errors"], nameOf?: (row: number) => string | undefined): string {
  const head = `${plural(errors.length, "row")} left out`;
  const named = errors.filter((e) => e.reasons.length > 0);
  if (named.length === 0) return head;
  const shown = named.slice(0, LEFT_OUT_SHOWN).map((e) => {
    const who = nameOf?.(e.row)?.trim();
    return `row ${e.row}${who ? `, ${who}` : ""}: ${e.reasons.join(", ")}`;
  });
  const more = errors.length - shown.length;
  return `${head} (${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""})`;
}

/** One line for the toast, from what the server did. */
export function importMessage(s: ImportSummary, nameOf?: (row: number) => string | undefined): string {
  const parts = [`${plural(s.created, "candidate")} added${s.updated ? ` and ${s.updated} updated` : ""}`];
  if (s.skipped) parts.push(`${s.skipped} already here, left as ${s.skipped === 1 ? "it was" : "they were"}`);
  if (s.errors.length) parts.push(leftOut(s.errors, nameOf));
  return parts.join(". ");
}

/** `ownerId` owns everyone the file adds; without it, whoever imports. */
export async function importCandidates(rows: readonly Fields[], mode: "skip" | "update", campaignId: string | null, ownerId?: string): Promise<ImportSummary> {
  const parts: ImportResult[] = [];
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    parts.push(await api<ImportResult>("POST", "/v1/candidates/import", {
      rows: rows.slice(i, i + IMPORT_CHUNK), mode, ...(campaignId ? { campaignId } : {}), ...(ownerId ? { ownerId } : {}),
    }));
  }
  return mergeImport(parts);
}

/* ── edits, notes, removal ── */

export type CandidatePatch = {
  fullName?: string;
  currentTitle?: string | null;
  currentCompanyName?: string | null;
  city?: string | null;
  country?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
};

/** What changed in the profile's edit form, as the PATCH body. Unchanged fields are left out. */
export function patchFromEdit(before: Contact, after: Partial<Contact>): CandidatePatch {
  const out: CandidatePatch = {};
  const blank = (s: string | undefined) => (s?.trim() ? s.trim() : null);
  if (after.name !== undefined && after.name.trim() && after.name.trim() !== before.name) out.fullName = after.name.trim();
  if (after.title !== undefined && after.title.trim() !== before.title) out.currentTitle = blank(after.title);
  if (after.company !== undefined && after.company.trim() !== before.company) out.currentCompanyName = blank(after.company);
  if (after.location !== undefined && after.location.trim() !== before.location) {
    const parts = after.location.split(",").map((p) => p.trim()).filter(Boolean);
    out.city = parts[0] ?? null;
    out.country = parts.length > 1 ? parts[parts.length - 1] ?? null : null;
  }
  if ("email" in after && (after.email?.value ?? "") !== (before.email?.value ?? "")) out.primaryEmail = blank(after.email?.value);
  if ("phone" in after && (after.phone?.value ?? "") !== (before.phone?.value ?? "")) out.primaryPhone = blank(after.phone?.value);
  return out;
}

export const updateCandidate = (id: string, patch: CandidatePatch) =>
  api<{ id: string; changed: string[] }>("PATCH", `/v1/candidates/${id}`, patch);

export const deleteCandidate = (id: string) => api<void>("DELETE", `/v1/candidates/${id}`);

export const addNote = (id: string, body: string) =>
  api<{ id: string; body: string; authorName: string | null; createdAt: string }>("POST", `/v1/candidates/${id}/notes`, { body });

/* ── shortlists: being on a campaign ── */

export type AddResult =
  | { candidateId: string; added: boolean; campaignCandidateId: string }
  | { candidateId: string; added: false; error: "not_found" };

/** Some of the people asked for couldn't be added (deleted since the list loaded). */
export class NotAddedError extends Error {
  constructor(readonly failedIds: readonly string[], total: number) {
    super(
      failedIds.length === total
        ? `${total === 1 ? "That person is" : "Those people are"} no longer in your candidates, so nobody was added.`
        : `${failedIds.length} of ${total} ${failedIds.length === 1 ? "is" : "are"} no longer in your candidates, so ${failedIds.length === 1 ? "wasn't" : "weren't"} added.`,
    );
  }
}

/** Puts people on a campaign; rejects with NotAddedError naming any that couldn't be added. */
export async function addToCampaign(campaignId: string, candidateIds: readonly string[]): Promise<{ results: AddResult[] }> {
  const res = await api<{ results: AddResult[] }>(
    "POST", `/v1/campaigns/${campaignId}/candidates`, { candidateIds, source: "manual" },
  );
  const failed = res.results.filter((r) => "error" in r).map((r) => r.candidateId);
  if (failed.length) throw new NotAddedError(failed, candidateIds.length);
  return res;
}

/** Someone who was passed on a campaign, back on its shortlist (adding them again would leave them passed). */
export async function reshortlist(candidateId: string, campaignId: string): Promise<void> {
  const d = await getCandidate(candidateId);
  const cc = d.campaigns.find((c) => c.id === campaignId);
  if (!cc) {
    await addToCampaign(campaignId, [candidateId]);
    return;
  }
  if (cc.stage === "passed") await api<unknown>("PATCH", `/v1/campaigns/${campaignId}/candidates/${cc.campaignCandidateId}`, { stage: "shortlisted" });
}

/** Off a campaign. The board keys people by their campaign row, so it is looked up first. */
export async function removeFromCampaign(candidateId: string, campaignId: string): Promise<void> {
  const d = await getCandidate(candidateId);
  const cc = d.campaigns.find((c) => c.id === campaignId);
  if (cc) await api<void>("DELETE", `/v1/campaigns/${campaignId}/candidates/${cc.campaignCandidateId}`);
}
