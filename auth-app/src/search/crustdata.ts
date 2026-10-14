import { z } from "zod";
import type { Values } from "../filters";

/**
 * Filters dialog values → a Crustdata people search request.
 *
 * Pure and framework-free: no React, no icons, no network. The backend's
 * `sourcing` skill imports this as is (docs/agent-architecture.md, 7.7).
 *
 * Every frontend filter lands in exactly one of four places:
 *
 *   body          maps to a Crustdata field and operator (a hard filter there)
 *   postFilters   derived from the returned profile, or from our own data,
 *                 applied after the call (tenure, CTC, already contacted …)
 *   rankHints     never removes anyone, only moves people up or down
 *   unsupported   nothing can answer it yet; kept so it is never silently lost
 *
 * Request shape, operators and limits are from
 * https://docs.crustdata.com/person-docs/search/introduction and
 * https://docs.crustdata.com/person-docs/search/reference (API version
 * 2025-11-01). Value vocabularies that the docs do not list (industries,
 * company types, degree wording) are best guesses, marked ASSUMPTION, to be
 * checked against /person/search/autocomplete before launch.
 */

/* ── schemas ─────────────────────────────────────────────────────────────── */

export const Operator = z.enum([
  "=", "!=", "<", "=<", ">", "=>", "in", "not_in", "is_null", "is_not_null",
  "has_all", "(.)", "[.]", "(!)", "geo_distance", "geo_exclude",
]);
export type Operator = z.infer<typeof Operator>;

export const GeoValue = z.object({
  location: z.string().optional(),
  lat_lng: z.tuple([z.number(), z.number()]).optional(),
  distance: z.number().positive(),
  /** Crustdata defaults to km when left out. */
  unit: z.enum(["km", "mi", "miles", "m", "meters", "ft", "feet"]).optional(),
});

export const Condition = z.object({
  field: z.string(),
  type: Operator,
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()])), GeoValue]),
});
export type Condition = z.infer<typeof Condition>;

export type Group = { op: "and" | "or"; conditions: Filter[] };
export type Filter = Condition | Group;
export const Filter: z.ZodType<Filter> = z.lazy(() =>
  z.union([Condition, z.object({ op: z.enum(["and", "or"]), conditions: z.array(Filter).min(1) })]),
);

export const CrustdataRequest = z.object({
  filters: Filter.optional(),
  search: z.object({ query: z.string().min(1), mode: z.enum(["hybrid", "lexical", "semantic"]) }).optional(),
  /** "exact" keeps our filters hard while the search query only ranks. */
  mode: z.enum(["managed", "exact"]).optional(),
  fields: z.array(z.string()).optional(),
  sorts: z.array(z.object({ field: z.string(), order: z.enum(["asc", "desc"]) })).optional(),
  limit: z.number().int().min(1).max(1000),
  cursor: z.string().optional(),
  post_processing: z.object({ exclude_profiles: z.array(z.string()).optional(), exclude_names: z.array(z.string()).optional() }).optional(),
});
export type CrustdataRequest = z.infer<typeof CrustdataRequest>;

/** Where a post-filter's data comes from. */
export const Source = z.enum(["profile", "our_db", "screening", "enrichment", "company_api"]);

export const PostFilter = z.object({
  filter: z.string(),
  source: Source,
  rule: z.enum([
    "avg_tenure_min_years", "graduated_between", "timezone_in", "skills_used_in_role", "promoted_at_current",
    "oss_contributor", "work_mode_in", "include_relocators", "ctc_between", "expected_ctc_between",
    "notice_max_days", "exclude_contacted", "exclude_in_other_campaigns", "exclude_rejected", "has_contact",
    "funding_stage_in",
  ]),
  params: z.record(z.unknown()),
});
export type PostFilter = z.infer<typeof PostFilter>;

export const RankHint = z.object({
  filter: z.string(),
  signal: z.enum([
    "nice_to_have_skills", "move_likelihood", "public_writing_or_talks", "no_gap_penalty",
    "education_preferred", "verified_work_email", "skills_used_in_role",
  ]),
  params: z.record(z.unknown()),
});
export type RankHint = z.infer<typeof RankHint>;

export const CrustdataQuery = z.object({
  body: CrustdataRequest,
  postFilters: z.array(PostFilter),
  rankHints: z.array(RankHint),
  unsupported: z.array(z.object({ filter: z.string(), reason: z.string() })),
});
export type CrustdataQuery = z.infer<typeof CrustdataQuery>;

export type QueryOptions = {
  /** Clock for relative dates ("updated in the last 30 days"). Defaults to now. */
  now?: Date;
  /** Page size, capped at MAX_LIMIT. Every profile returned costs credits. */
  limit?: number;
  cursor?: string;
  /** The brief, sent as a hybrid search that ranks inside the hard filters. */
  query?: string;
  fields?: string[];
  /** Profile URLs to skip: everyone already in our pool for this search, and
      everyone this campaign has already been shown. Not returned, not paid for. */
  excludeProfileUrls?: string[];
  /** Leave out profiles Crustdata judges fabricated. On unless turned off. */
  excludeFabricated?: boolean;
};

/** At most 20 new people per run (decided 3 Oct 2026): we rank among these
    plus our own pool, and "Find more" fetches the next 20 new ones. */
export const MAX_LIMIT = 20;

/** One key per LinkedIn profile, whatever form the URL arrives in. */
export function profileKey(url: string): string | null {
  const m = String(url ?? "").toLowerCase().match(/linkedin\.com\/in\/([^/?#\s]+)/);
  const slug = m?.[1];
  if (!slug) return null;
  try { return decodeURIComponent(slug); } catch { return slug; }
}

/**
 * Drops anyone already seen, and repeats inside the response itself. The
 * exclude list should already have kept them out; this is the guarantee, so a
 * person is never ingested, judged or shown twice.
 */
export function freshOnly<T>(items: readonly T[], urlOf: (t: T) => string | null | undefined, seen: Iterable<string>): T[] {
  const keys = new Set<string>();
  for (const u of seen) { const k = profileKey(u); if (k) keys.add(k); }
  const out: T[] = [];
  for (const it of items) {
    const k = profileKey(urlOf(it) ?? "");
    if (!k || keys.has(k)) continue;
    keys.add(k);
    out.push(it);
  }
  return out;
}

/* ── vocabularies: our labels → Crustdata values ─────────────────────────── */

const P = "experience.employment_details";

/** From the reference's closed set for seniority_level. */
export const SENIORITY: Record<string, readonly string[]> = {
  "Intern": ["In Training"],
  "Entry level": ["Entry Level"],
  "Senior": ["Senior"],
  "Manager": ["Entry Level Manager", "Experienced Manager"],
  "Director": ["Director"],
  "VP": ["Vice President"],
  "C-level": ["CXO"],
  "Founder or partner": ["Owner / Partner"],
};

/** From the reference's closed set for function_category. */
export const FUNCTION: Record<string, string> = {
  "Engineering": "Engineering", "Product": "Product Management", "Design": "Arts and Design",
  "Research": "Research", "Sales": "Sales", "Marketing": "Marketing",
  "Customer success": "Customer Success and Support", "Operations": "Operations", "Finance": "Finance",
  "HR": "Human Resources", "Legal": "Legal", "Consulting": "Consulting",
};

/** From the reference's closed set for company_headcount_range. */
export const HEADCOUNT: Record<string, readonly string[]> = {
  "1–10": ["myself only", "2-10"], "11–50": ["11-50"], "51–200": ["51-200"], "201–500": ["201-500"],
  "501–1k": ["501-1000"], "1k–5k": ["1001-5000"], "5k–10k": ["5001-10000"], "10k+": ["10001+"],
};

/** ASSUMPTION: LinkedIn company types, which Crustdata appears to carry as is. */
export const COMPANY_TYPE: Record<string, string> = {
  "Private": "Privately Held", "Public": "Public Company", "Nonprofit": "Nonprofit",
  "Government": "Government Agency", "Education": "Educational",
};

/** ASSUMPTION: LinkedIn (2022) industry names in company_industries. */
export const INDUSTRY: Record<string, readonly string[]> = {
  "Fintech": ["Financial Services", "Banking", "Insurance", "Investment Management"],
  "Software": ["Software Development", "IT System Custom Software Development"],
  "E-commerce": ["Retail", "Online and Mail Order Retail", "Internet Marketplace Platforms"],
  "Internet": ["Technology, Information and Internet", "Internet Publishing", "Consumer Services"],
  "Healthcare": ["Hospitals and Health Care", "Medical Equipment Manufacturing", "Wellness and Fitness Services"],
  "Education": ["E-Learning Providers", "Education Administration Programs", "Higher Education"],
  "Logistics": ["Transportation, Logistics, Supply Chain and Storage", "Freight and Package Transportation"],
  "Gaming": ["Computer Games", "Mobile Gaming Apps"],
  "Telecom": ["Telecommunications", "Wireless Services"],
  "Manufacturing": ["Manufacturing", "Industrial Machinery Manufacturing", "Motor Vehicle Manufacturing"],
};

/** ASSUMPTION: the industries that mean "services" rather than "product". */
export const SERVICES_INDUSTRIES = ["IT Services and IT Consulting", "Outsourcing and Offshoring Consulting", "Business Consulting and Services"] as const;

/** Degree text is free form, so each choice is a set of phrases, any of which matches. */
export const DEGREE: Record<string, readonly string[]> = {
  "Diploma": ["Diploma"],
  "Bachelor's": ["Bachelor", "BTech", "B.Tech", "BE", "B.E.", "BSc", "B.Sc", "BS", "BCA"],
  "Master's": ["Master", "MTech", "M.Tech", "MS", "MSc", "M.Sc", "MCA"],
  "MBA": ["MBA", "Master of Business Administration", "PGDM"],
  "PhD": ["PhD", "Ph.D", "Doctor of Philosophy"],
};

export const FIELD: Record<string, readonly string[]> = {
  "Computer Science": ["Computer Science"], "IT": ["Information Technology"],
  "Electronics": ["Electronics"], "Electrical": ["Electrical"], "Mechanical": ["Mechanical"],
  "Mathematics": ["Mathematics"], "Statistics": ["Statistics"], "Physics": ["Physics"], "Business": ["Business"],
};

/** Institution groups as school-name phrases. "[.]" keeps IIT from matching IIIT. */
export const SCHOOL_TIERS: Record<string, readonly string[]> = {
  "IIT": ["Indian Institute of Technology", "IIT"],
  "IIIT": ["International Institute of Information Technology", "Indian Institute of Information Technology", "IIIT"],
  "NIT": ["National Institute of Technology", "NIT"],
  "BITS": ["Birla Institute of Technology and Science", "BITS Pilani"],
  "IISc": ["Indian Institute of Science", "IISc"],
  // ASSUMPTION: a seed list. Swap for the current QS top 100 when we have it.
  "Global top 100": [
    "Massachusetts Institute of Technology", "Stanford University", "Harvard University", "University of Cambridge",
    "University of Oxford", "California Institute of Technology", "Carnegie Mellon University", "University of California, Berkeley",
    "ETH Zurich", "Imperial College London", "National University of Singapore", "Nanyang Technological University",
    "Princeton University", "Cornell University", "University of Toronto", "University of Waterloo",
    "Georgia Institute of Technology", "University of Illinois Urbana-Champaign", "Tsinghua University", "Peking University",
    "EPFL", "Technical University of Munich", "University College London", "University of Michigan",
    "Columbia University", "University of Washington", "University of Texas at Austin", "Yale University",
  ],
};

/** Short forms recruiters type, expanded to how schools name themselves. */
const SCHOOL_PREFIX: readonly (readonly [RegExp, string])[] = [
  [/^IIIT\s+/i, "International Institute of Information Technology "],
  [/^IIT\s+/i, "Indian Institute of Technology "],
  [/^NIT\s+/i, "National Institute of Technology "],
  [/^IISc\s+/i, "Indian Institute of Science "],
  [/^BITS\s+/i, "Birla Institute of Technology and Science "],
];

/** Cities whose spelling varies in profiles. Anything else matches as typed. */
export const CITY_ALIASES: Record<string, readonly string[]> = {
  "Bengaluru": ["Bengaluru", "Bangalore"],
  "Delhi NCR": ["Delhi", "New Delhi"],
  "Gurugram": ["Gurugram", "Gurgaon"],
  "Mumbai": ["Mumbai", "Bombay"],
  "Chennai": ["Chennai", "Madras"],
  "Kolkata": ["Kolkata", "Calcutta"],
  "Kochi": ["Kochi", "Cochin"],
};

/** Time zones narrow to countries at Crustdata; the exact zone is checked after. */
export const TIMEZONE_COUNTRIES: Record<string, readonly string[]> = {
  "IST": ["India", "Sri Lanka"],
  "GST": ["United Arab Emirates", "Oman"],
  "SGT": ["Singapore", "Malaysia", "Philippines"],
  "CET": ["Germany", "France", "Netherlands", "Spain", "Italy", "Poland", "Sweden", "Switzerland", "Belgium", "Austria"],
  "GMT": ["United Kingdom", "Ireland", "Portugal"],
  "EST": ["United States", "Canada"],
  "PST": ["United States", "Canada"],
};

/** Certifications are matched by name, or by issuer where the name varies. */
export const CERTS: Record<string, Condition> = {
  "AWS": { field: "certifications.issuing_organization", type: "(.)", value: "Amazon Web Services" },
  "Google Cloud": { field: "certifications.issuing_organization", type: "(.)", value: "Google Cloud" },
  "Azure": { field: "certifications.name", type: "(.)", value: "Azure" },
  "CKA": { field: "certifications.name", type: "[.]", value: "Certified Kubernetes Administrator" },
  "CKAD": { field: "certifications.name", type: "[.]", value: "Certified Kubernetes Application Developer" },
  "Terraform": { field: "certifications.name", type: "(.)", value: "Terraform" },
  "PMP": { field: "certifications.name", type: "[.]", value: "Project Management Professional" },
};

const RADIUS_KM: Record<string, number> = { "25 km": 25, "50 km": 50, "100 km": 100 };
const STARS: Record<string, number> = { "10+": 10, "100+": 100, "1,000+": 1000 };
const UPDATED_DAYS: Record<string, number> = { "7 days": 7, "30 days": 30, "90 days": 90 };
const TENURE_YEARS: Record<string, number> = { "1+ yr": 1, "2+ yrs": 2, "3+ yrs": 3 };
const NOTICE_DAYS: Record<string, number> = { "Immediate": 0, "≤ 30 days": 30, "≤ 60 days": 60, "≤ 90 days": 90 };

/* Range bounds the dialog uses, so "at the top with a plus" means no ceiling. */
const RANGE_TOP: Record<string, number> = { years: 25, currentRole: 10, ctc: 150, expected: 150 };
const RANGE_BOTTOM: Record<string, number> = { years: 0, currentRole: 0, ctc: 0, expected: 0, gradYear: 2000 };
const GRAD_TOP = 2025;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const list = (v: unknown): string[] =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const range = (v: unknown): readonly [number, number] | undefined =>
  Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : undefined;
const uniq = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBefore = (now: Date, days: number) => isoDay(new Date(now.getTime() - days * 86_400_000));

const any = (conds: Filter[]): Filter | undefined =>
  conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : { op: "or", conditions: conds };
const all = (conds: Filter[]): Filter | undefined =>
  conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : { op: "and", conditions: conds };

/** A numeric range as "=>" and "=<", leaving off a side that is fully open. */
function between(field: string, r: readonly [number, number], bottom: number, top: number | undefined): Condition[] {
  const out: Condition[] = [];
  if (r[0] > bottom) out.push({ field, type: "=>", value: r[0] });
  if (top === undefined || r[1] < top) out.push({ field, type: "=<", value: r[1] });
  return out;
}

export function expandSchool(name: string): string[] {
  for (const [re, full] of SCHOOL_PREFIX) if (re.test(name)) return uniq([name, name.replace(re, full)]);
  return [name];
}

/* ── the mapping ─────────────────────────────────────────────────────────── */

export function toCrustdataQuery(values: Values, opts: QueryOptions = {}): CrustdataQuery {
  const now = opts.now ?? new Date();
  const v = values as Record<string, unknown>;
  const and: Filter[] = [];
  const postFilters: PostFilter[] = [];
  const rankHints: RankHint[] = [];
  const unsupported: { filter: string; reason: string }[] = [];
  const push = (f: Filter | undefined) => { if (f) and.push(f); };

  /* Role */
  const titles = list(v.titles);
  const titleField = v.pastTitles === true ? `${P}.title` : `${P}.current.title`;
  push(any(titles.map((t) => ({ field: titleField, type: "(.)", value: t }))));

  const seniority = uniq(list(v.seniority).flatMap((s) => SENIORITY[s] ?? []));
  if (seniority.length) push({ field: `${P}.current.seniority_level`, type: "in", value: seniority });

  const fns = uniq(list(v.function).map((f) => FUNCTION[f]).filter((x): x is string => !!x));
  if (fns.length) push({ field: `${P}.current.function_category`, type: "in", value: fns });

  // Each phrase must appear, in the headline or the summary.
  push(all(list(v.keywords).map((k) => any([
    { field: "basic_profile.headline", type: "(.)", value: k },
    { field: "basic_profile.summary", type: "(.)", value: k },
  ])!)));

  /* Location */
  const cities = list(v.cities);
  const radius = RADIUS_KM[str(v.radius) ?? ""];
  push(any(cities.flatMap((c): Condition[] => radius
    ? [{ field: "professional_network.location.raw", type: "geo_distance", value: { location: c === "Delhi NCR" ? "New Delhi" : c, distance: radius, unit: "km" } }]
    : (CITY_ALIASES[c] ?? [c]).map((name) => ({ field: "basic_profile.location.full_location", type: "(.)", value: name })))));

  const countries = list(v.countries);
  if (countries.length) push({ field: "basic_profile.location.country", type: "in", value: countries });

  const zones = list(v.timezones).filter((z) => TIMEZONE_COUNTRIES[z]);
  if (zones.length) {
    // Only narrow by country when the recruiter hasn't already said where.
    if (!cities.length && !countries.length) {
      push({ field: "basic_profile.location.country", type: "in", value: uniq(zones.flatMap((z) => TIMEZONE_COUNTRIES[z]!)) });
    }
    postFilters.push({ filter: "timezones", source: "profile", rule: "timezone_in", params: { zones } });
  }

  const modes = list(v.workMode);
  if (modes.length) postFilters.push({ filter: "workMode", source: "screening", rule: "work_mode_in", params: { modes } });
  if (v.relocate === true) postFilters.push({ filter: "relocate", source: "our_db", rule: "include_relocators", params: { cities } });

  /* Experience */
  const years = range(v.years);
  if (years) and.push(...between("years_of_experience_raw", years, RANGE_BOTTOM.years!, RANGE_TOP.years));
  const atCompany = range(v.currentRole);
  if (atCompany) and.push(...between(`${P}.current.years_at_company_raw`, atCompany, RANGE_BOTTOM.currentRole!, RANGE_TOP.currentRole));

  const tenure = TENURE_YEARS[str(v.tenure) ?? ""];
  if (tenure) postFilters.push({ filter: "tenure", source: "profile", rule: "avg_tenure_min_years", params: { years: tenure } });

  const recent = str(v.recentMove);
  const sixMonths = daysBefore(now, 182);
  if (recent === "Exclude <6 months") push({ field: `${P}.current.start_date`, type: "=<", value: sixMonths });
  if (recent === "Only <6 months") push({ field: `${P}.current.start_date`, type: "=>", value: sixMonths });

  /* Skills */
  const must = list(v.must);
  if (must.length) {
    const op = str(v.skillMatch) === "Any of them" ? "in" : "has_all";
    push({ field: "skills.professional_network_skills", type: op, value: must });
  }
  const nice = list(v.nice);
  if (nice.length) rankHints.push({ filter: "nice", signal: "nice_to_have_skills", params: { skills: nice } });
  const exclude = list(v.exclude);
  if (exclude.length) push({ field: "skills.professional_network_skills", type: "not_in", value: exclude });
  if (v.inRole === true && must.length) {
    postFilters.push({ filter: "inRole", source: "profile", rule: "skills_used_in_role", params: { skills: must } });
  }

  /* Company */
  const current = list(v.current);
  if (current.length) push({ field: `${P}.current.company_name`, type: "in", value: current });
  const past = list(v.past);
  if (past.length) push({ field: `${P}.past.company_name`, type: "in", value: past });
  const excludeCo = list(v.excludeCo);
  if (excludeCo.length) push({ field: `${P}.current.company_name`, type: "not_in", value: excludeCo });

  const size = uniq(list(v.size).flatMap((s) => HEADCOUNT[s] ?? []));
  if (size.length) push({ field: `${P}.current.company_headcount_range`, type: "in", value: size });

  const stages = list(v.stage);
  if (stages.length) postFilters.push({ filter: "stage", source: "company_api", rule: "funding_stage_in", params: { stages } });

  const industries = uniq(list(v.industry).flatMap((i) => INDUSTRY[i] ?? []));
  if (industries.length) push({ field: `${P}.current.company_industries`, type: "in", value: industries });

  const model = str(v.model);
  if (model === "Services") push({ field: `${P}.current.company_industries`, type: "in", value: [...SERVICES_INDUSTRIES] });
  if (model === "Product") push({ field: `${P}.current.company_industries`, type: "not_in", value: [...SERVICES_INDUSTRIES] });

  const types = uniq(list(v.type).map((t) => COMPANY_TYPE[t]).filter((x): x is string => !!x));
  if (types.length) push({ field: `${P}.current.company_type`, type: "in", value: types });

  /* Education. With non-traditional backgrounds on, it ranks instead of filtering. */
  const edu: Filter[] = [];
  const degrees = list(v.degree);
  const deg = any(degrees.flatMap((d) => (DEGREE[d] ?? []).map((p): Condition => ({ field: "education.schools.degree", type: "[.]", value: p }))));
  if (deg) edu.push(deg);
  const fieldsOfStudy = list(v.field);
  const fos = any(fieldsOfStudy.flatMap((f) => (FIELD[f] ?? [f]).map((p): Condition => ({ field: "education.schools.field_of_study", type: "(.)", value: p }))));
  if (fos) edu.push(fos);
  const tiers = list(v.tier);
  const schools = list(v.schools);
  const sch = any([
    ...tiers.flatMap((t) => (SCHOOL_TIERS[t] ?? []).map((p): Condition => ({ field: "education.schools.school", type: "[.]", value: p }))),
    ...schools.flatMap((s) => expandSchool(s).map((p): Condition => ({ field: "education.schools.school", type: "(.)", value: p }))),
  ]);
  if (sch) edu.push(sch);
  if (v.nonTraditional === true) {
    if (edu.length) rankHints.push({ filter: "nonTraditional", signal: "education_preferred", params: { degrees, fields: fieldsOfStudy, tiers, schools } });
  } else {
    and.push(...edu);
  }
  const grad = range(v.gradYear);
  if (grad && (grad[0] > RANGE_BOTTOM.gradYear! || grad[1] < GRAD_TOP)) {
    postFilters.push({ filter: "gradYear", source: "profile", rule: "graduated_between", params: { from: grad[0], to: grad[1] } });
  }

  /* Compensation: ours only */
  const ctc = range(v.ctc);
  if (ctc && (ctc[0] > 0 || ctc[1] < RANGE_TOP.ctc!)) postFilters.push({ filter: "ctc", source: "screening", rule: "ctc_between", params: { minLpa: ctc[0], maxLpa: ctc[1] < RANGE_TOP.ctc! ? ctc[1] : null } });
  const exp = range(v.expected);
  if (exp && (exp[0] > 0 || exp[1] < RANGE_TOP.expected!)) postFilters.push({ filter: "expected", source: "screening", rule: "expected_ctc_between", params: { minLpa: exp[0], maxLpa: exp[1] < RANGE_TOP.expected! ? exp[1] : null } });
  const notice = NOTICE_DAYS[str(v.notice) ?? ""];
  if (notice !== undefined) postFilters.push({ filter: "notice", source: "screening", rule: "notice_max_days", params: { days: notice } });

  /* Availability */
  if (v.openToWork === true) push({ op: "or", conditions: [
    { field: "professional_network.open_to_cards", type: "in", value: ["CAREER_INTEREST"] },
    { field: "dev_platform_profiles.is_hireable", type: "=", value: true },
  ] });
  const likely = str(v.likelihood);
  if (likely === "Medium+" || likely === "High") rankHints.push({ filter: "likelihood", signal: "move_likelihood", params: { min: likely === "High" ? "high" : "medium" } });
  const updated = UPDATED_DAYS[str(v.active) ?? ""];
  if (updated) push({ field: "basic_profile.last_updated", type: "=>", value: daysBefore(now, updated) });

  /* Signals */
  if (v.github === true) push({ field: "dev_platform_profiles.public_repo_count", type: "=>", value: 1 });
  if (v.ghActive === true) push({ field: "dev_platform_profiles.repos.github_pushed_at", type: "=>", value: daysBefore(now, 90) });
  const langs = list(v.ghLanguages);
  if (langs.length) push({ field: "dev_platform_profiles.all_languages", type: "in", value: langs });
  const stars = STARS[str(v.ghStars) ?? ""];
  if (stars) push({ field: "dev_platform_profiles.total_stars", type: "=>", value: stars });
  if (v.oss === true) postFilters.push({ filter: "oss", source: "enrichment", rule: "oss_contributor", params: {} });
  if (v.promoted === true) postFilters.push({ filter: "promoted", source: "profile", rule: "promoted_at_current", params: {} });
  if (v.talks === true) {
    rankHints.push({ filter: "talks", signal: "public_writing_or_talks", params: {} });
    unsupported.push({ filter: "talks", reason: "No talks or writing field to filter on; ranked from headline, summary and honors instead" });
  }
  push(any(list(v.certs).map((c) => CERTS[c]).filter((x): x is Condition => !!x)));

  /* Languages */
  const spoken = list(v.spoken);
  if (spoken.length) push({ field: "basic_profile.languages", type: "in", value: spoken });

  /* Inclusion */
  if (v.returners === true) rankHints.push({ filter: "returners", signal: "no_gap_penalty", params: {} });

  /* Exclusions: ours only */
  const contacted = str(v.contacted);
  if (contacted && contacted !== "Include") postFilters.push({ filter: "contacted", source: "our_db", rule: "exclude_contacted", params: { withinDays: contacted === "Exclude last 90 days" ? 90 : null } });
  if (v.otherCampaigns === true) postFilters.push({ filter: "otherCampaigns", source: "our_db", rule: "exclude_in_other_campaigns", params: {} });
  const rejected = str(v.rejected);
  if (rejected && rejected !== "Include") postFilters.push({ filter: "rejected", source: "our_db", rule: "exclude_rejected", params: { withinDays: rejected === "Exclude last 6 months" ? 182 : null } });
  const contact = list(v.contact);
  if (contact.length) {
    postFilters.push({ filter: "contact", source: "enrichment", rule: "has_contact", params: { kinds: contact } });
    if (contact.includes("Email") || contact.includes("Either")) rankHints.push({ filter: "contact", signal: "verified_work_email", params: {} });
  }

  /* Always: leave out profiles Crustdata itself thinks are made up. */
  if (opts.excludeFabricated !== false) {
    push({ field: "assessment.authenticity.verdict", type: "not_in", value: ["probably_fabricated", "clearly_fabricated"] });
  }

  const body: CrustdataRequest = {
    limit: Math.max(1, Math.min(MAX_LIMIT, Math.floor(opts.limit ?? MAX_LIMIT))),
  };
  const filters = all(and);
  if (filters) body.filters = filters;
  if (opts.query?.trim()) {
    body.search = { query: opts.query.trim(), mode: "hybrid" };
    body.mode = "exact";
  }
  if (opts.fields?.length) body.fields = opts.fields;
  if (opts.cursor) body.cursor = opts.cursor;
  if (opts.excludeProfileUrls?.length) {
    /* One entry per profile, in the canonical form; junk dropped. */
    const byKey = new Map<string, string>();
    for (const u of opts.excludeProfileUrls) { const k = profileKey(u); if (k && !byKey.has(k)) byKey.set(k, `https://www.linkedin.com/in/${k}`); }
    if (byKey.size) body.post_processing = { exclude_profiles: [...byKey.values()] };
  }

  return { body, postFilters, rankHints, unsupported };
}

/* ── the classification, for docs, tests and the "why" panel ─────────────── */

export type Kind = "direct" | "derived" | "own" | "unsupported";

/** Every frontend filter id, and where it is answered. */
export const FILTER_KIND: Record<string, Kind> = {
  titles: "direct", pastTitles: "direct", seniority: "direct", function: "direct", keywords: "direct",
  cities: "direct", countries: "direct", radius: "direct", workMode: "own", relocate: "own", timezones: "derived",
  years: "direct", currentRole: "direct", tenure: "derived", recentMove: "direct",
  must: "direct", nice: "derived", exclude: "direct", skillMatch: "direct", inRole: "derived",
  current: "direct", past: "direct", excludeCo: "direct", size: "direct", stage: "derived", industry: "direct", model: "direct", type: "direct",
  degree: "direct", field: "direct", tier: "direct", schools: "direct", gradYear: "derived",
  ctc: "own", expected: "own", notice: "own",
  openToWork: "direct", likelihood: "derived", active: "direct",
  github: "direct", ghActive: "direct", ghLanguages: "direct", ghStars: "direct", oss: "derived", promoted: "derived", talks: "unsupported", certs: "direct",
  spoken: "direct",
  returners: "derived", nonTraditional: "derived",
  contacted: "own", otherCampaigns: "own", rejected: "own", contact: "own",
};
