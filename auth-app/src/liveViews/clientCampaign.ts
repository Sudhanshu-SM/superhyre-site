import type { Option } from "../clarify";
import { FEE_OPTIONS, newCampaignAnswers } from "../clarify";
import { SENIORITIES, canonicalCity, compLabel, draftProblems, num } from "../campaignDraft";
import type { CampaignDraft } from "../campaignDraft";
import { WORK_MODE_LABEL } from "../campaignDraft";
import { DEPARTMENTS } from "../campaignsData";
import type { CampaignRow } from "../campaignsData";
import { draftFromAnswers } from "../ClientMoments";
import type { Client, ClientDraft } from "../clients";
import { INDUSTRIES, clientProblems, domainOf } from "../clients";

/**
 * The connected chat's add-client and new-campaign flows, as plain functions: what the real
 * options are, how the answers become what the API is sent, what stops a record from being made,
 * and what to say when the server turns one down. No React and no store, so every rule is tested
 * on its own (src/__tests__/liveClientCampaign.test.ts).
 */

/* ── real options ────────────────────────────────────────────────────────── */

const key = (s: string) => s.trim().toLowerCase();

/** Distinct values, most used first (ties keep the order first seen). Blank ones are dropped. */
export function rankedValues(values: readonly (string | null | undefined)[]): { value: string; n: number }[] {
  const seen = new Map<string, { value: string; n: number }>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const hit = seen.get(key(value));
    if (hit) hit.n += 1;
    else seen.set(key(value), { value, n: 1 });
  }
  return [...seen.values()].sort((a, b) => b.n - a.n);
}

const campaigns = (n: number) => `${n} ${n === 1 ? "campaign" : "campaigns"}`;

type PlaceRow = Pick<CampaignRow, "department" | "location">;

/**
 * Teams to pick from: the ones this workspace's campaigns already use, then the console's usual
 * ones to fill the list. `limit` tiles in all.
 */
export function departmentOptions(rows: readonly PlaceRow[], limit = 5, usual: readonly string[] = DEPARTMENTS): Option[] {
  const used = rankedValues(rows.map((r) => r.department));
  const out: Option[] = used.slice(0, limit).map((u) => ({ id: u.value, label: u.value, meta: campaigns(u.n) }));
  for (const d of usual) {
    if (out.length >= limit) break;
    if (!out.some((o) => key(o.id) === key(d))) out.push({ id: d, label: d });
  }
  return out;
}

/** "Remote, Pune" → "Pune"; plain "Remote" says no city. */
export const cityOf = (location: string | null | undefined): string => (location ?? "").trim().replace(/^remote\b[\s,.:-]*/i, "").trim();

/**
 * Cities to pick from: where the chosen client is, then where this workspace's campaigns are
 * based. Empty when none is known, and the question is then asked in words.
 */
export function cityOptions(rows: readonly PlaceRow[], client: Pick<Client, "name" | "location"> | undefined, limit = 4): Option[] {
  const out: Option[] = [];
  /* One name for a city however it was written: "Bangalore" in a campaign and "Bengaluru" for the client are one tile. */
  const home = canonicalCity(client?.location);
  if (home) out.push({ id: home, label: home, meta: `Where ${client?.name ?? "the client"} is` });
  for (const u of rankedValues(rows.map((r) => canonicalCity(cityOf(r.location))))) {
    if (out.length >= limit) break;
    if (!out.some((o) => key(o.id) === key(u.value))) out.push({ id: u.value, label: u.value, meta: campaigns(u.n) });
  }
  return out;
}

/** Industries: the ones the workspace's clients are in, then the usual ones, then "Something else". */
export function industryOptions(clients: readonly Pick<Client, "industry">[], limit = 6, usual: readonly string[] = INDUSTRIES): Option[] {
  const out: Option[] = rankedValues(clients.map((c) => c.industry)).filter((u) => u.value !== "Other").slice(0, 4).map((u) => ({ id: u.value, label: u.value }));
  for (const i of usual) {
    if (out.length >= limit) break;
    if (i !== "Other" && !out.some((o) => key(o.id) === key(i))) out.push({ id: i, label: i });
  }
  return [...out, { id: "Other", label: "Something else" }];
}

/** Fee terms other clients are on come first, then the usual ones. `last` is whatever follows them (Not agreed yet). */
export function feeOptions(clients: readonly Pick<Client, "fee">[], limit = 4, usual: readonly string[] = FEE_OPTIONS): Option[] {
  const out: Option[] = rankedValues(clients.map((c) => c.fee).filter((f) => f && key(f) !== "to be agreed"))
    .slice(0, 3)
    .map((u) => ({ id: u.value, label: u.value, meta: u.n === 1 ? "On one client" : `On ${u.n} clients` }));
  for (const f of usual) {
    if (out.length >= limit) break;
    if (!out.some((o) => key(o.id) === key(f))) out.push({ id: f, label: f });
  }
  return out;
}

/* ── the answers ─────────────────────────────────────────────────────────── */

/** The clients a campaign can be for: all but the ones marked inactive. */
export const openClients = <T extends Pick<Client, "status">>(clients: readonly T[]): T[] => clients.filter((c) => c.status !== "inactive");

/**
 * The new-campaign answers, with the role and client the message named. With no client to choose
 * from, "no client" is the answer, so nothing is asked that has only one possible reply, unless the
 * message named a company that is not in Clients yet (`newClient`): that one is offered, by name.
 */
export function liveCampaignAnswers(said: string, answers: Readonly<Record<string, string>> = {}, clients: readonly Pick<Client, "status">[] = []): Record<string, string> {
  const a = newCampaignAnswers(said, answers);
  /* Nobody to choose from is "no client", unless the message named a company: that one is offered as a new client. */
  if (!a.client && !a.newClient && openClients(clients).length === 0) a.client = "none";
  return a;
}

/** "Senior Backend Engineer" → "Senior"; "" when the role doesn't say. */
export function inferSeniority(role: string): string {
  const s = role.toLowerCase();
  if (/\b(intern|trainee)\b/.test(s)) return "Intern";
  if (/\b(junior|jr\.?|graduate|entry)\b/.test(s)) return "Junior";
  if (/\b(principal)\b/.test(s)) return "Principal";
  if (/\b(staff)\b/.test(s)) return "Staff";
  if (/\b(director|head of|vp|vice president)\b/.test(s)) return "Director";
  if (/\b(lead|manager)\b/.test(s)) return "Lead";
  if (/\b(senior|sr\.?)\b/.test(s)) return "Senior";
  if (/\b(mid|mid-level|intermediate)\b/.test(s)) return "Mid";
  return "";
}

/**
 * The chat's answers as a New campaign draft, for the API. Only what was said is sent: no level
 * unless the role names one, no notice period, and the screening form is left for the next step
 * (the chat doesn't make it). Nothing is started by agents here: with real data the search begins
 * once the role spec is approved.
 */
export function campaignDraftFor(a: Readonly<Record<string, string>>, owner: string, clients: readonly Client[]): CampaignDraft {
  const d = draftFromAnswers(a, owner, [...clients]);
  const level = inferSeniority(d.name);
  return { ...d, seniority: SENIORITIES.find((s) => s === level) ?? "", notice: "", screening: "none", agents: [] };
}

/** "5 to 8 years", "5+ years", or "" when none was given. */
export function experienceLabel(d: Pick<CampaignDraft, "expMin" | "expMax">): string {
  const lo = num(d.expMin), hi = num(d.expMax);
  if (lo === null && hi === null) return "";
  if (lo !== null && hi !== null) return lo === hi ? `${lo} ${lo === 1 ? "year" : "years"}` : `${lo} to ${hi} years`;
  return lo !== null ? `${lo}+ years` : `Up to ${hi} years`;
}

/** The rows of the draft card, in the order the console's own card lists them. */
export function campaignFacts(d: CampaignDraft): [string, string][] {
  const comp = compLabel(d.compMin || d.compMax ? { currency: d.currency, min: num(d.compMin) ?? undefined, max: num(d.compMax) ?? undefined, shown: false } : undefined);
  const near = d.locations[0];
  const where = d.workMode === "remote" ? (near ? `Remote, near ${near}` : "Remote") : `${WORK_MODE_LABEL[d.workMode]}, ${near ?? "no city yet"}`;
  const exp = experienceLabel(d);
  const words = d.jd.trim().split(/\s+/).filter(Boolean).length;
  return [
    ["Department", d.department],
    ["Where", where],
    ["Openings", `${d.openings} ${d.openings === 1 ? "hire" : "hires"}`],
    ["Experience", exp || "Not set"],
    ["CTC", comp || "Not set"],
    ["Must-haves", d.mustHave.join(", ") || "None yet"],
    ...(words ? [["Job description", `${words.toLocaleString("en-IN")} words, the role spec is drafted from it`] as [string, string]] : []),
    ...(d.seniority ? [["Level", d.seniority] as [string, string]] : []),
    ["Fee", d.fee || "Not set"],
  ];
}

/**
 * What the done card says once a campaign made with a job description exists: the role spec is drafted from it,
 * so the card says where that stands. On its way, there to read, or not made (and how to ask again). `why` is
 * the server's own sentence for a draft it could not make.
 */
export function draftingLine(name: string, draft: "drafting" | "drafted" | "failed" = "drafting", why = ""): string {
  if (draft === "drafted") return `${name} created. The role spec is drafted from your job description. Read it, approve it and the search starts.`;
  if (draft === "failed") {
    const reason = why.replace(/[.\s]+$/, "");
    return `${name} created, but its role spec isn't drafted yet${reason ? `: ${reason}` : ""}. Ask me to draft it from your job description.`;
  }
  return `${name} created. I'm drafting its role spec from your job description.`;
}

/* ── what stops a record, before the server has to ───────────────────────── */

const firstOf = (p: Record<string, string | undefined>): string | null => Object.values(p).find(Boolean) ?? null;

/** What stops a campaign being created: the server would refuse it. */
export function campaignChecks(d: CampaignDraft): { blocking: string | null } {
  return { blocking: firstOf(draftProblems(d, undefined, { agents: false })) };
}

/** The client a name already belongs to, however it is capitalised or spaced. */
export function findClient<T extends Pick<Client, "name">>(name: string, clients: readonly T[]): T | undefined {
  const k = key(name);
  return k ? clients.find((c) => key(c.name) === k) : undefined;
}

/**
 * What stops a client from being added. A name already taken is its own case (`duplicate`: the
 * card says so and offers the existing client); a name too short blocks. A website that can't be
 * read is left out with a note rather than refused, because the answer can't be retyped in place.
 */
export function clientChecks(draft: ClientDraft, clients: readonly Pick<Client, "id" | "name">[]): {
  duplicate: Pick<Client, "id" | "name"> | undefined;
  blocking: string | null;
  notes: string[];
} {
  const duplicate = findClient(draft.name, clients);
  const problems = clientProblems(draft, duplicate ? [] : clients);
  const notes: string[] = [];
  if (draft.website.trim() && !domainOf(draft.website)) notes.push(`I couldn't read "${draft.website.trim()}" as a website, so I've left it out.`);
  return { duplicate, blocking: problems.name ?? null, notes };
}

/* ── when the server says no ─────────────────────────────────────────────── */

/**
 * The reason the console's stores gave for a record that wasn't made ("Acme wasn't added. Acme is
 * already a client."), without the first half; null when the line is about something else.
 */
export function reasonFrom(line: string | null | undefined, name: string, verb: "added" | "created"): string | null {
  const head = `${name} wasn't ${verb}.`;
  if (!line?.startsWith(head)) return null;
  return line.slice(head.length).trim() || null;
}
