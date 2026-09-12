// JD (+ recruiter comments) -> ContactOut People Search filters, via Claude.
// Ported from sourcing/lib/extract.js — logic unchanged, only the imports
// moved to this function's local modules.

import { chat, parseJsonBlock } from "./gateway.ts";
import {
  SENIORITY, JOB_FUNCTION, COMPANY_SIZE, YEARS_OF_EXPERIENCE,
  canonical,
} from "./enums.ts";

const SYSTEM = `You are a technical sourcer. You turn a job description into ContactOut People Search filters.

ContactOut searches LinkedIn profiles. Filters are ANDed together, so every extra
constraint shrinks the pool. Your job is a query that returns real, relevant people
— not a restatement of the JD.

Rules:
- job_title: 3-8 titles candidates ACTUALLY have on LinkedIn, not the company's
  internal title. "Founding Engineer" -> also "Software Engineer", "Senior Software
  Engineer", "Full Stack Engineer". Include adjacent seniorities.
- skills: at most 8, hard skills only (languages, frameworks, tools, domains). Never
  soft skills. Never a skill the JD only lists as "nice to have".
- Boolean equations are allowed in job_title, skills and education. Operators must be
  capitalised and grouped with brackets: "(ReactJS OR Vue) AND TypeScript". Use them
  to widen, not to narrow.
- location: how LinkedIn writes it — "San Francisco Bay Area", "Bengaluru", "India",
  "Remote" is NOT a location, leave it out and note it in unmapped.
- education: filters match as SUBSTRINGS, so always give both the acronym and the
  full name — "(IIT OR \\"Indian Institute of Technology\\" OR NIT OR \\"National
  Institute of Technology\\")". Bare acronyms alone drag in coaching centres.
- industry: only when the JD genuinely requires domain experience.
- Leave a field out entirely rather than guessing. An empty filter beats a wrong one.
- Constraints you cannot express as a filter (visa status, salary band, remote-only,
  culture fit, portfolio requirements) go in "unmapped" as short strings.
- If the recruiter's extra notes conflict with the JD, the notes win.

Output ONLY this JSON object. No prose, no code fence. Omit any filter you have
no value for.

{
  "role_summary": "one sentence naming the person you are hunting",
  "must_haves": ["short non-negotiables from the JD"],
  "unmapped": ["requirements no filter can express"],
  "locked": ["filter names the recruiter stated as hard — must / only / required"],
  "filters": {
    "job_title": [], "past_job_title": [], "skills": [], "location": [],
    "industry": [], "company": [], "past_company": [], "education": [],
    "exclude_job_titles": [], "keyword": "",
    "include_related_job_titles": true,
    "seniority": [${SENIORITY.map((v) => `"${v}"`).join(", ")}],
    "job_function": [${JOB_FUNCTION.map((v) => `"${v}"`).join(", ")}],
    "company_size": [${COMPANY_SIZE.map((v) => `"${v}"`).join(", ")}],
    "years_of_experience": [${YEARS_OF_EXPERIENCE.map((v) => `"${v}"`).join(", ")}]
  }
}

The last four filters are closed vocabularies — pick only from the values listed
on their line, or omit the field. "10" in years_of_experience means over 10 years.

"locked" names filters that must never be relaxed to find more people. Put a
filter there when the JD or the notes phrase it as non-negotiable ("must be
Ahmedabad", "only NITs", "required: 1-3 years"). A thin, correct shortlist beats
a padded one.`;

const ENUM_FIELDS: Record<string, readonly string[]> = {
  seniority: SENIORITY,
  job_function: JOB_FUNCTION,
  company_size: COMPANY_SIZE,
  years_of_experience: YEARS_OF_EXPERIENCE,
};

const FREE_TEXT_ARRAYS = [
  "job_title", "past_job_title", "skills", "location", "industry",
  "company", "past_company", "education", "exclude_job_titles",
];

export type Filters = Record<string, string[] | string | boolean | undefined>;

function cleanArray(value: unknown, cap = 50): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const v = item.trim();
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

// Whitelist every field and drop anything ContactOut would reject, so a creative
// model response can never turn into a 422 (or an unintended credit spend).
export function sanitizeFilters(raw: unknown): { filters: Filters; dropped: string[] } {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Filters = {};
  const dropped: string[] = [];

  for (const field of FREE_TEXT_ARRAYS) {
    const cleaned = cleanArray(src[field], field === "skills" ? 8 : 50);
    if (cleaned.length) out[field] = cleaned;
  }

  for (const [field, list] of Object.entries(ENUM_FIELDS)) {
    const cleaned: string[] = [];
    for (const item of cleanArray(src[field])) {
      const hit = canonical(list, item);
      if (hit) cleaned.push(hit);
      else dropped.push(`${field}: "${item}"`);
    }
    if (cleaned.length) out[field] = [...new Set(cleaned)];
  }

  if (typeof src.keyword === "string" && src.keyword.trim()) {
    out.keyword = src.keyword.trim().slice(0, 500);
  }
  if (typeof src.include_related_job_titles === "boolean") {
    out.include_related_job_titles = src.include_related_job_titles;
  }

  return { filters: out, dropped };
}

export type Plan = {
  roleSummary: string;
  mustHaves: string[];
  unmapped: string[];
  filters: Filters;
  locked: string[];
  dropped: string[];
};

export async function extractFilters({ jd, comments, model }: {
  jd: string; comments?: string; model?: string;
}): Promise<Plan> {
  const user = [
    "## Job description", jd.trim(),
    comments?.trim() ? `\n## Recruiter notes (these override the JD)\n${comments.trim()}` : "",
  ].filter(Boolean).join("\n");

  const raw = await chat({ system: SYSTEM, user, model });
  const parsed = parseJsonBlock(raw) as Record<string, unknown>;
  const { filters, dropped } = sanitizeFilters(parsed.filters);

  if (!(filters.job_title as string[] | undefined)?.length
      && !(filters.skills as string[] | undefined)?.length
      && !filters.keyword) {
    throw new Error("Model produced no usable filters — check the JD text.");
  }

  // Location is locked unless the caller says otherwise: "must be in X" is the
  // most common hard constraint in sourcing, and quietly dropping it to hit a
  // result count produces a list that looks full and is wrong.
  const locked = [...new Set([...cleanArray(parsed.locked, 12), "location"])]
    .filter((field) => field in filters);

  return {
    roleSummary: typeof parsed.role_summary === "string" ? parsed.role_summary : "",
    mustHaves: cleanArray(parsed.must_haves, 12),
    unmapped: cleanArray(parsed.unmapped, 12),
    filters,
    locked,
    dropped,
  };
}

export type Relaxation = { filters: Filters; removed: string[] };

// Progressively broader variants, tried in order when a search comes up short.
// Each step removes the constraint most likely to be over-narrowing — never one
// the recruiter stated as non-negotiable.
export function relaxations(filters: Filters, locked: string[] = []): Relaxation[] {
  const steps: Relaxation[] = [];
  const drop = (from: Filters, ...fields: string[]): Relaxation | null => {
    const next = { ...from };
    const removed = fields.filter((f) => f in next && !locked.includes(f));
    removed.forEach((f) => delete next[f]);
    return removed.length ? { filters: next, removed } : null;
  };

  let current = filters;
  for (const fields of [["years_of_experience"], ["industry", "company_size"], ["skills"]]) {
    const step = drop(current, ...fields);
    if (!step) continue;
    steps.push(step);
    current = step.filters;
  }
  return steps;
}
