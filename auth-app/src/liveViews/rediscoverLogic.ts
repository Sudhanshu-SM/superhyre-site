import type { CandidateRow } from "../api/candidates";
import { stageLabel } from "../chatCards";
import { monthYear } from "../liveCandidate";

/**
 * Finding people the workspace already has: what to look for, who answers it, where each one
 * got to on an earlier search, and how that reads. Pure; the view fetches and draws.
 */

/** Words that ask for the search rather than say what to search for. */
const FILLER = new Set([
  "anyone", "anybody", "someone", "somebody", "who", "whom", "any", "from", "past", "previous", "earlier", "old", "searches", "search", "pipelines",
  "pipeline", "candidates", "candidate", "campaigns", "campaign", "people", "persons", "person", "profiles", "rediscover", "silver", "medalist",
  "medalists", "medallist", "medallists", "for", "in", "on", "of", "our", "my", "the", "a", "an", "we", "have", "has", "had", "did", "do", "does",
  "know", "knows", "knew", "with", "that", "ever", "seen", "before", "already", "ones", "is", "are", "was", "were", "there", "can", "you", "find",
  "show", "me", "us", "still", "good", "fit", "fits", "match", "matching", "looking", "look", "maybe", "please", "again", "reach", "back", "to", "out",
  "and", "or", "experience", "experienced", "skills", "skill", "background", "worked", "work", "using", "uses", "use", "knowledge", "expertise",
]);

/** The skill, title or place a request asks for: "Anyone from past searches for Kotlin?" gives "Kotlin". */
export function queryFromSaid(said: string, campaignName?: string | null): string | null {
  let s = said.replace(/[?!.,;]+/g, " ");
  if (campaignName) s = s.replace(new RegExp(campaignName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  /* Which campaign is not what to look for: "... for Go and Kafka for the Machine Learning Engineer campaign". */
  s = s.replace(/\b(?:for|on|in|to)\s+(?:the\s+)?(?:(?!for\b)[\w&.+#/-]+\s+){0,6}?(?:campaign|role|job|opening)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim().replace(/\s+(?:for|in|on|to)$/i, "");
  const after = s.match(/.*\b(?:for|with|who (?:know|knows|has|have|did|do|use|uses|work|worked))\s+(.+)$/i);
  const words = (after?.[1] ?? s).split(" ").filter((w) => w && !FILLER.has(w.toLowerCase()));
  return words.length ? words.slice(0, 4).join(" ") : null;
}

/** "Select all 5" for a list that has more than one person to pick; one person is picked with their own box. */
export const selectAllLabel = (open: number): string | null => (open > 1 ? `Select all ${open}` : null);

/** Where someone stands once they have been added here: not where they were before. */
export const standsOn = (campaignName: string): string => `On ${campaignName}`;

/** Where someone stood on a campaign. */
export type Past = { id: string; name: string; stage: string };

export type PastPerson = {
  /** The workspace candidate's id. */
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  city: string | null;
  years: number | null;
  linkedinUrl: string | null;
  /** The earlier campaigns, furthest first. */
  before: Past[];
  /** Where they are on the campaign being filled, if they are on it. */
  here: string | null;
};

/** How far a stage got, for ordering; being hired elsewhere means they are not free. */
const FURTHEST: Readonly<Record<string, number>> = { interviewing: 4, outreach: 3, shortlisted: 2, passed: 1, hired: 0 };
const reach = (p: Past) => FURTHEST[p.stage] ?? 1;

type Row = Pick<CandidateRow, "id" | "fullName" | "currentTitle" | "currentCompanyName" | "city" | "yearsOfExperience" | "linkedinUrl" | "campaigns">;

/**
 * The people found, split into those already on the campaign and those who are not, the second
 * list ordered by how far they got on an earlier search (people never on one last).
 */
export function splitPast(rows: readonly Row[], target: string | null): { fresh: PastPerson[]; here: PastPerson[] } {
  const seen = new Set<string>();
  const all: PastPerson[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    all.push({
      id: r.id,
      name: r.fullName,
      title: r.currentTitle,
      company: r.currentCompanyName,
      city: r.city,
      years: r.yearsOfExperience,
      linkedinUrl: r.linkedinUrl,
      before: r.campaigns.filter((c) => c.id !== target).map((c) => ({ id: c.id, name: c.name, stage: c.stage })).sort((a, b) => reach(b) - reach(a)),
      here: target ? (r.campaigns.find((c) => c.id === target)?.stage ?? null) : null,
    });
  }
  const order = all.map((p, i) => ({ p, i })).sort((a, b) => {
    const ra = a.p.before[0] ? reach(a.p.before[0]) : -1;
    const rb = b.p.before[0] ? reach(b.p.before[0]) : -1;
    return rb - ra || a.i - b.i;
  });
  const sorted = order.map((x) => x.p);
  return { fresh: sorted.filter((p) => !p.here), here: sorted.filter((p) => p.here) };
}

/** "Now Android Engineer · PhonePe", from what the candidate's row says today. */
export function nowLine(p: Pick<PastPerson, "title" | "company" | "city">): string {
  const role = [p.title, p.company].filter(Boolean).join(" · ");
  return role ? `Now ${role}` : p.city ? `Based in ${p.city}` : "";
}

/** What happened on that campaign, in a sentence; a pass says why when it was recorded. */
export function happenedLine(stage: string, reason?: string | null): string {
  switch (stage) {
    case "interviewing":
      return "Got as far as interviews.";
    case "outreach":
      return "Was in outreach.";
    case "shortlisted":
      return "Was shortlisted.";
    case "passed":
      return reason ? `Was rejected (${reason.toLowerCase()}).` : "Was rejected.";
    case "hired":
      return "Was hired for it.";
    default:
      return `${stageLabel(stage)}.`;
  }
}

/** What a profile adds: when each stage began, and why anyone was passed on. */
type DetailFacts = {
  campaigns: { id: string; stageEnteredAt?: string | null; addedAt?: string | null }[];
  activity?: { verb: string; campaignId: string | null; data: { to?: string; reason?: string | null } }[];
};

export type Facts = { when: Record<string, string>; reason: Record<string, string> };

export function factsOf(d: DetailFacts): Facts {
  const when: Record<string, string> = {};
  for (const c of d.campaigns) {
    const m = monthYear(c.stageEnteredAt ?? c.addedAt ?? null);
    if (m) when[c.id] = m;
  }
  const reason: Record<string, string> = {};
  for (const a of d.activity ?? []) {
    if (a.verb === "moved" && a.data.to === "passed" && a.campaignId && a.data.reason && !reason[a.campaignId]) reason[a.campaignId] = a.data.reason;
  }
  return { when, reason };
}
