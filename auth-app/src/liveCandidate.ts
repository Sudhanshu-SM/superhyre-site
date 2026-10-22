import type { Match, MatchProfile, RoleSpec } from "./api/agent";
import { hueFor } from "./candidateImport";
import { schoolsOf } from "./chatCards";
import { reasonLine, resultOf, resultOfProfile } from "./matchResult";
import type { Candidate, Job } from "./sourcing";

/**
 * A live match or profile as the console's candidate surfaces know a person (`Candidate`), so
 * the ranked list, the profile sheet, the comparison and the sourcing results draw real people
 * with the components that were built for them. Nothing here is invented: a field a profile
 * doesn't have is empty, and the surfaces leave it out.
 */

/** What a campaign ranks on: its role spec's strongest requirements, three at most. */
export type Criterion = { id: string; text: string; short: string };

const MAX_CRITERIA = 3;

/** The heaviest requirements first (knockouts, then musts, then nice-to-haves), by weight. */
export function criteriaOf(spec: RoleSpec | null | undefined): Criterion[] {
  if (!spec) return [];
  const rank = { knockout: 0, must: 1, nice: 2 } as const;
  return [...spec.requirements]
    .sort((a, b) => rank[a.importance] - rank[b.importance] || b.weight - a.weight)
    .slice(0, MAX_CRITERIA)
    .map((r) => ({ id: r.id, text: r.text, short: shortOf(r.skill ?? r.text) }));
}

/** A column head: the skill or the first few words, trimmed to fit. */
export function shortOf(text: string): string {
  // "Go or Java" is one head ("Go/Java"), never "Go or"; a head does not end on "at" or "of".
  const alternatives = text.replace(/[()]/g, "").trim().replace(/\s+(?:or|and|&)\s+/gi, "/");
  const kept = alternatives.split(/\s+/).slice(0, 2);
  while (kept.length > 1 && /^(?:at|of|in|on|to|for|with|the|a|an)$/i.test(kept[kept.length - 1] ?? "")) kept.pop();
  const words = kept.join(" ");
  return words.length > 14 ? `${words.slice(0, 13).trimEnd()}…` : words;
}

/** What a campaign's list is ranked on and who is in it, for the surfaces that show a whole list. */
export type CandidateSet = {
  /** Where the set is kept: a campaign's matches use its id; a board or a name search use their own. */
  key: string;
  /** The campaign the people belong to, for acting on them (shortlist, pass). */
  campaignId: string | null;
  candidates: Candidate[];
  criteria: Criterion[];
  /** The one sentence on why each person ranks where they do. */
  reasons: Record<string, string>;
  /** Everyone ranked, decided people included: what the list says it holds. */
  total: number;
  /** What the server says was decided about people in the list, so the list counts them after a reload. */
  decisions?: Record<string, "shortlisted" | "rejected">;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-03-01" as "Mar 2021"; null for a date that isn't one. */
export function monthYear(iso: string | null): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  return month >= 0 && month < 12 ? `${MONTHS[month]} ${m[1]}` : m[1] ?? null;
}

const monthIndex = (iso: string | null, now: Date): number | null => {
  if (iso === "present") return now.getFullYear() * 12 + now.getMonth();
  const m = iso?.match(/^(\d{4})-(\d{2})/);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
};

/** "3 yrs 7 mos", "8 mos", "2 yrs". */
export function spanLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : "", m ? `${m} mo${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ") || "Under a month";
}

/** The work history grouped by employer, newest first, in the shape the profile prints. */
export function jobsFrom(experiences: MatchProfile["profile"]["experiences"], now = new Date()): Job[] {
  const jobs: Job[] = [];
  for (const e of experiences) {
    const company = (e.company ?? "").trim();
    const title = (e.title ?? "").trim();
    if (!company && !title) continue;
    const name = company || title;
    const start = monthYear(e.startDate);
    const end = e.isCurrent ? "Present" : monthYear(e.endDate);
    const a = monthIndex(e.startDate, now);
    const b = monthIndex(e.isCurrent ? "present" : e.endDate, now);
    const role = {
      title: title || company,
      start: start ?? "",
      end: end ?? "",
      span: a !== null && b !== null && b >= a ? spanLabel(Math.max(1, b - a)) : "",
      ...(e.description?.trim() ? { body: e.description.trim() } : {}),
    };
    const last = jobs[jobs.length - 1];
    if (last && last.org.name === name) {
      jobs[jobs.length - 1] = { ...last, roles: [...last.roles, role] };
    } else {
      jobs.push({ org: { name, hue: hueFor(name) }, span: "", roles: [role] });
    }
  }
  // An employer's span runs from its oldest role's start to its newest role's end.
  return jobs.map((j) => {
    const first = j.roles[j.roles.length - 1];
    const last = j.roles[0];
    const a = monthIndex(isoOf(first?.start), now);
    const b = last?.end === "Present" ? monthIndex("present", now) : monthIndex(isoOf(last?.end), now);
    return { ...j, span: a !== null && b !== null && b >= a ? spanLabel(Math.max(1, b - a)) : "" };
  });
}

/** "Mar 2021" back to "2021-03" for the arithmetic above. */
function isoOf(label: string | undefined): string | null {
  const m = label?.match(/^([A-Z][a-z]{2}) (\d{4})$/);
  const i = m ? MONTHS.indexOf(m[1] ?? "") : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, "0")}-01` : null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * One person for the console's candidate surfaces. A match alone (a search result) gives the
 * header, the fit and the reason; the profile, once loaded, adds the history, schooling and skills.
 */
export function candidateFromMatch(
  m: Match,
  opts: { criteria?: readonly Criterion[]; profile?: MatchProfile | null; now?: Date; campaignId?: string } = {},
): Candidate {
  const { criteria = [], profile = null, now = new Date() } = opts;
  // What the server says about the fit: the profile's, which is the freshest, else the list's. Absent from an older server.
  const result = (profile ? resultOfProfile(profile) : null) ?? resultOf(m);
  const pr = profile?.profile;
  const verdicts = new Map((profile?.judgement ?? m.judgement)?.verdicts.map((v) => [v.requirementId, v.verdict]));
  const strengths = (profile?.judgement ?? m.judgement)?.strengths ?? [];
  const checkOf = (id: string) => result?.requirements.find((r) => r.id === id)?.verdict ?? verdicts.get(id) ?? "unknown";
  const title = pr?.currentTitle ?? m.currentTitle;
  const company = pr?.currentCompanyName ?? m.currentCompanyName;
  const jobs = pr ? jobsFrom(pr.experiences, now) : [];
  const currentJob = jobs[0] ?? (company ? { org: { name: company, hue: hueFor(company) }, span: "", roles: [] } : null);
  const schools = pr ? schoolsOf(profile?.education ?? []) : [];
  const years = pr?.yearsOfExperience ?? m.yearsOfExperience ?? 0;
  const place = pr?.locationText ?? [pr?.city ?? m.city, pr?.country].filter(Boolean).join(", ");
  const read = strengths.slice(0, 2).join(". ");
  return {
    id: m.personId,
    name: m.fullName,
    headline: pr?.headline ?? m.headline ?? [title, company].filter(Boolean).join(" at "),
    location: place ?? "",
    hue: hueFor(m.fullName),
    current: currentJob?.org ?? { name: company ?? "", hue: hueFor(m.fullName) },
    school: schools[0] ? { name: schools[0].name, hue: hueFor(schools[0].name) } : { name: "", hue: hueFor(m.fullName) },
    summary: read ? `${firstName(m.fullName)}: ${read}.` : "",
    highlights: strengths.slice(0, 2),
    meets: criteria.map((c) => checkOf(c.id) === "met"),
    // The marks are the judge's verdicts: a person ranked on features alone (a score, no judgement yet) has none,
    // and "does not meet" would say a judgement nobody made. Only a judged person has marks to read.
    scored: result ? result.status === "scored" || result.status === "insufficient_evidence" : (profile?.judgement ?? m.judgement) !== null,
    ...(result ? { checks: criteria.map((c) => checkOf(c.id)), result } : {}),
    ...(opts.campaignId ? { resultCampaignId: opts.campaignId } : {}),
    ...(m.openToWork ? { openToWork: true } : {}),
    totalYears: Math.round(years),
    avgTenure: jobs.length && years ? Math.round(years / jobs.length) : 0,
    about: pr?.summary ?? "",
    jobs,
    schools: schools.map((s) => ({ org: { name: s.name, hue: hueFor(s.name) }, degree: s.degree, years: s.years })),
    skills: pr?.skills.length ? { Skills: pr.skills } : {},
    ...((pr?.linkedinUrl ?? m.linkedinUrl) ? { linkedinUrl: (pr?.linkedinUrl ?? m.linkedinUrl) as string } : {}),
  };
}

/** The sentence on why a person ranks where they do: the judge's strongest point, else their role. */
export function reasonOf(m: Match): string {
  const role = [m.currentTitle, m.currentCompanyName].filter(Boolean).join(" at ");
  return reasonLine(resultOf(m), m.judgement?.strengths[0] ?? role);
}

/**
 * A campaign's matches as a set the list, the sheet and the comparison share. `decided` are the
 * people already shortlisted or rejected: they stay in the list, marked with what was decided, so
 * the list's counts do not shrink as a person makes calls.
 */
export function setFromMatches(
  campaignId: string,
  matches: readonly Match[],
  spec: RoleSpec | null | undefined,
  now = new Date(),
  decided: readonly Match[] = [],
): CandidateSet {
  const criteria = criteriaOf(spec);
  const waiting = matches.filter((m) => !m.knockedOut);
  const all = [...waiting, ...decided.filter((d) => !waiting.some((m) => m.personId === d.personId))];
  const decisions = Object.fromEntries(
    decided.flatMap((m) =>
      m.decision ? [[m.personId, m.decision === "shortlisted" ? ("shortlisted" as const) : ("rejected" as const)] as const] : [],
    ),
  );
  return {
    key: campaignId,
    campaignId,
    candidates: all.map((m) => candidateFromMatch(m, { criteria, now, campaignId })),
    criteria,
    reasons: Object.fromEntries(all.map((m) => [m.personId, reasonOf(m)])),
    total: all.length,
    ...(Object.keys(decisions).length ? { decisions } : {}),
  };
}

/** A workspace candidate (the candidate row and its profile) for the same surfaces. Contacts stay out of it. */
export function candidateFromDetail(
  d: {
    candidate: { id: string; fullName: string; headline: string | null; currentTitle: string | null; currentCompanyName: string | null; linkedinUrl: string | null; city: string | null; country: string | null; yearsOfExperience: number | null; about: string | null };
    profile: { summary: string | null; locationText: string | null; experiences: Array<{ company: string | null; title: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean | null }>; skills: string[]; education: unknown[] };
  },
  now = new Date(),
): Candidate {
  const c = d.candidate;
  const jobs = jobsFrom(
    d.profile.experiences.map((e) => ({ title: e.title, company: e.company, description: null, startDate: e.startDate, endDate: e.endDate, isCurrent: Boolean(e.isCurrent) })),
    now,
  );
  const schools = schoolsOf(d.profile.education);
  const company = c.currentCompanyName ?? "";
  const years = c.yearsOfExperience ?? 0;
  return {
    id: c.id,
    name: c.fullName,
    headline: c.headline ?? [c.currentTitle, c.currentCompanyName].filter(Boolean).join(" at "),
    location: d.profile.locationText ?? [c.city, c.country].filter(Boolean).join(", "),
    hue: hueFor(c.fullName),
    current: jobs[0]?.org ?? { name: company, hue: hueFor(company || c.fullName) },
    school: schools[0] ? { name: schools[0].name, hue: hueFor(schools[0].name) } : { name: "", hue: hueFor(c.fullName) },
    summary: "",
    highlights: [],
    meets: [],
    totalYears: Math.round(years),
    avgTenure: jobs.length && years ? Math.round(years / jobs.length) : 0,
    about: d.profile.summary ?? c.about ?? "",
    jobs,
    schools: schools.map((s) => ({ org: { name: s.name, hue: hueFor(s.name) }, degree: s.degree, years: s.years })),
    skills: d.profile.skills.length ? { Skills: d.profile.skills } : {},
    ...(c.linkedinUrl ? { linkedinUrl: c.linkedinUrl } : {}),
    inWorkspace: true,
  };
}

/** The people a card lists, as candidates the surfaces can open before any profile has loaded. */
export function candidateFromCardPerson(p: { personId: string | null; candidateId: string | null; name: string; title: string | null; company: string | null; city: string | null; years: number | null; strengths: string[]; linkedinUrl: string | null }): Candidate | null {
  const id = p.personId ?? p.candidateId;
  if (!id) return null;
  const company = p.company ?? "";
  return {
    id,
    name: p.name,
    headline: [p.title, p.company].filter(Boolean).join(" at "),
    location: p.city ?? "",
    hue: hueFor(p.name),
    current: { name: company, hue: hueFor(company || p.name) },
    school: { name: "", hue: hueFor(p.name) },
    summary: p.strengths.length ? `${firstName(p.name)}: ${p.strengths.slice(0, 2).join(". ")}.` : "",
    highlights: p.strengths.slice(0, 2),
    meets: [],
    totalYears: Math.round(p.years ?? 0),
    avgTenure: 0,
    about: "",
    jobs: [],
    schools: [],
    skills: {},
    ...(p.linkedinUrl ? { linkedinUrl: p.linkedinUrl } : {}),
    ...(p.candidateId && !p.personId ? { inWorkspace: true } : {}),
  };
}
