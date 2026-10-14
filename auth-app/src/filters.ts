import type { Icon } from "@phosphor-icons/react";
import {
  Briefcase, Buildings, ChartLineUp, CurrencyInr, GraduationCap, Lightning, MapPin, Prohibit,
  Sparkle, Timer, Translate, UserCircle,
} from "@phosphor-icons/react";
import { read } from "./brief";

/**
 * The sourcing filter catalogue.
 *
 * Twelve categories, ordered the way a recruiter narrows a search: who the
 * role is, where, how experienced, with what skills, from which companies,
 * then background, money, availability, signals, languages, inclusion and
 * exclusions. Every filter is one of five controls, so the dialog can render
 * any of them without special cases:
 *
 *   chips    pick any number of fixed options
 *   tags     free text with suggestions (titles, cities, companies, skills)
 *   range    two-handled numeric range
 *   segment  pick one
 *   toggle   on or off
 *
 * Options follow Crustdata's people search vocabulary where it has one
 * (seniority, function, company size, ownership), so every choice here maps
 * to a real query. The mapping lives in search/crustdata.ts and the table in
 * docs/agent-architecture.md, section 7.7.
 *
 * Deliberately absent: filters on gender, age, religion, caste or any other
 * protected characteristic. Sourcing on those is discriminatory and in many
 * places unlawful. "Career returners" is the inclusive version of the need.
 */

export type Control =
  | { kind: "chips"; options: readonly string[] }
  | { kind: "tags"; suggestions: readonly string[]; placeholder: string }
  | { kind: "range"; min: number; max: number; step: number; unit: string; plus?: boolean }
  | { kind: "segment"; options: readonly string[] }
  | { kind: "toggle"; hint: string };

export type FilterDef = { id: string; label: string; hint?: string; control: Control };
export type Category = { id: string; label: string; Icon: Icon; filters: readonly FilterDef[] };

export type Value = readonly string[] | readonly [number, number] | string | boolean;
export type Values = Readonly<Record<string, Value>>;

const CITIES = ["Bengaluru", "Hyderabad", "Pune", "Chennai", "Mumbai", "Delhi NCR", "Gurugram", "Noida", "Kolkata", "Ahmedabad", "Kochi", "Jaipur", "Indore", "Chandigarh"];
const SKILLS = ["PostgreSQL", "Go", "Rust", "Java", "Kotlin", "Python", "TypeScript", "Node.js", "Kafka", "Redis", "Kubernetes", "Docker", "AWS", "GCP", "Terraform", "gRPC", "GraphQL", "Microservices", "Distributed systems", "System design", "Elasticsearch", "ClickHouse", "Spark", "Airflow"];
const COMPANIES = ["Razorpay", "Swiggy", "Zomato", "CRED", "Flipkart", "PhonePe", "Paytm", "Zerodha", "Groww", "Meesho", "Freshworks", "Postman", "Atlassian", "Google", "Microsoft", "Amazon", "Uber", "Chargebee", "Dunzo", "Ola"];
const COUNTRIES = ["India", "United States", "United Kingdom", "Singapore", "United Arab Emirates", "Germany", "Canada", "Australia", "Netherlands"];
const SCHOOLS = ["IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IISc Bangalore", "BITS Pilani", "IIIT Hyderabad", "NIT Trichy", "NIT Surathkal", "Delhi Technological University"];
const CODE_LANGUAGES = ["Go", "Rust", "Python", "TypeScript", "JavaScript", "Java", "Kotlin", "C++", "Scala", "Elixir"];
const TITLES = ["Backend Engineer", "Software Engineer", "Senior Software Engineer", "Staff Engineer", "Principal Engineer", "Platform Engineer", "Site Reliability Engineer", "Database Engineer", "Data Engineer", "Engineering Manager", "Tech Lead"];

export const CATEGORIES: readonly Category[] = [
  {
    id: "role", label: "Role", Icon: Briefcase,
    filters: [
      { id: "titles", label: "Job titles", hint: "Current title, or any past one if you allow it below", control: { kind: "tags", suggestions: TITLES, placeholder: "Add a title" } },
      { id: "pastTitles", label: "Match past titles too", control: { kind: "toggle", hint: "Include people who held the title before their current role" } },
      { id: "seniority", label: "Seniority", hint: "Staff and principal count as Senior. Add the title to be exact", control: { kind: "chips", options: ["Intern", "Entry level", "Senior", "Manager", "Director", "VP", "C-level", "Founder or partner"] } },
      { id: "function", label: "Function", hint: "Data, DevOps, QA and security sit under Engineering", control: { kind: "chips", options: ["Engineering", "Product", "Design", "Research", "Sales", "Marketing", "Customer success", "Operations", "Finance", "HR", "Legal", "Consulting"] } },
      { id: "keywords", label: "Profile mentions", hint: "Words in their headline or summary, such as payments or fintech", control: { kind: "tags", suggestions: ["payments", "fintech", "high scale", "open source", "low latency", "B2B SaaS"], placeholder: "Add a word or phrase" } },
    ],
  },
  {
    id: "location", label: "Location", Icon: MapPin,
    filters: [
      { id: "cities", label: "Cities", control: { kind: "tags", suggestions: CITIES, placeholder: "Add a city" } },
      { id: "countries", label: "Countries", control: { kind: "tags", suggestions: COUNTRIES, placeholder: "Add a country" } },
      { id: "radius", label: "Within", control: { kind: "segment", options: ["City only", "25 km", "50 km", "100 km"] } },
      { id: "workMode", label: "Work mode", control: { kind: "chips", options: ["Onsite", "Hybrid", "Remote"] } },
      { id: "relocate", label: "Open to relocating", control: { kind: "toggle", hint: "Include people elsewhere who say they would move" } },
      { id: "timezones", label: "Time zones", control: { kind: "chips", options: ["IST", "GST", "SGT", "CET", "GMT", "EST", "PST"] } },
    ],
  },
  {
    id: "experience", label: "Experience", Icon: Timer,
    filters: [
      { id: "years", label: "Total experience", control: { kind: "range", min: 0, max: 25, step: 1, unit: "yrs", plus: true } },
      { id: "currentRole", label: "Time at current company", control: { kind: "range", min: 0, max: 10, step: 1, unit: "yrs", plus: true } },
      { id: "tenure", label: "Average tenure", hint: "Filters out frequent job-hoppers", control: { kind: "segment", options: ["Any", "1+ yr", "2+ yrs", "3+ yrs"] } },
      { id: "recentMove", label: "Changed jobs recently", control: { kind: "segment", options: ["Either", "Exclude <6 months", "Only <6 months"] } },
    ],
  },
  {
    id: "skills", label: "Skills", Icon: Lightning,
    filters: [
      { id: "must", label: "Must have", control: { kind: "tags", suggestions: SKILLS, placeholder: "Add a skill" } },
      { id: "nice", label: "Nice to have", hint: "Ranks higher, never filters out", control: { kind: "tags", suggestions: SKILLS, placeholder: "Add a skill" } },
      { id: "exclude", label: "Exclude", control: { kind: "tags", suggestions: ["PHP", "Cobol", ".NET", "Salesforce"], placeholder: "Add a skill" } },
      { id: "skillMatch", label: "Must-haves match", control: { kind: "segment", options: ["All of them", "Any of them"] } },
      { id: "inRole", label: "Used in a role, not just listed", control: { kind: "toggle", hint: "The skill appears in a job's description, not only the skills section" } },
    ],
  },
  {
    id: "company", label: "Company", Icon: Buildings,
    filters: [
      { id: "current", label: "Current company", control: { kind: "tags", suggestions: COMPANIES, placeholder: "Add a company" } },
      { id: "past", label: "Past companies", control: { kind: "tags", suggestions: COMPANIES, placeholder: "Add a company" } },
      { id: "excludeCo", label: "Exclude companies", control: { kind: "tags", suggestions: ["Acme (your company)", "Infosys", "TCS", "Wipro"], placeholder: "Add a company" } },
      { id: "size", label: "Company size", hint: "Employees today", control: { kind: "chips", options: ["1–10", "11–50", "51–200", "201–500", "501–1k", "1k–5k", "5k–10k", "10k+"] } },
      { id: "stage", label: "Funding stage", control: { kind: "chips", options: ["Bootstrapped", "Seed", "Series A", "Series B", "Series C+", "Public"] } },
      { id: "industry", label: "Industry", control: { kind: "chips", options: ["Fintech", "Software", "E-commerce", "Internet", "Healthcare", "Education", "Logistics", "Gaming", "Telecom", "Manufacturing"] } },
      { id: "model", label: "Product or services", control: { kind: "segment", options: ["Either", "Product", "Services"] } },
      { id: "type", label: "Ownership", control: { kind: "chips", options: ["Private", "Public", "Nonprofit", "Government", "Education"] } },
    ],
  },
  {
    id: "education", label: "Education", Icon: GraduationCap,
    filters: [
      { id: "degree", label: "Degree", control: { kind: "chips", options: ["Diploma", "Bachelor's", "Master's", "MBA", "PhD"] } },
      { id: "field", label: "Field of study", control: { kind: "chips", options: ["Computer Science", "IT", "Electronics", "Electrical", "Mechanical", "Mathematics", "Statistics", "Physics", "Business"] } },
      { id: "tier", label: "Institution group", hint: "Any campus in the group", control: { kind: "chips", options: ["IIT", "IIIT", "NIT", "BITS", "IISc", "Global top 100"] } },
      { id: "schools", label: "Schools", control: { kind: "tags", suggestions: SCHOOLS, placeholder: "Add a school" } },
      { id: "gradYear", label: "Graduated", control: { kind: "range", min: 2000, max: 2025, step: 1, unit: "" } },
    ],
  },
  {
    id: "comp", label: "Compensation", Icon: CurrencyInr,
    filters: [
      { id: "ctc", label: "Current CTC", control: { kind: "range", min: 0, max: 150, step: 5, unit: "LPA", plus: true } },
      { id: "expected", label: "Expected CTC", control: { kind: "range", min: 0, max: 150, step: 5, unit: "LPA", plus: true } },
      { id: "notice", label: "Notice period", control: { kind: "segment", options: ["Any", "Immediate", "≤ 30 days", "≤ 60 days", "≤ 90 days"] } },
    ],
  },
  {
    id: "intent", label: "Availability", Icon: ChartLineUp,
    filters: [
      { id: "openToWork", label: "Open to work", control: { kind: "toggle", hint: "Says so on LinkedIn, or marked hireable on GitHub" } },
      { id: "likelihood", label: "Likely to move", hint: "From tenure, recent profile edits and company changes", control: { kind: "segment", options: ["Any", "Medium+", "High"] } },
      { id: "active", label: "Profile updated", control: { kind: "segment", options: ["Any time", "7 days", "30 days", "90 days"] } },
    ],
  },
  {
    id: "signals", label: "Signals", Icon: Sparkle,
    filters: [
      { id: "github", label: "Has public code", control: { kind: "toggle", hint: "A GitHub account with public repositories" } },
      { id: "ghActive", label: "Pushed code in the last 90 days", control: { kind: "toggle", hint: "Active on GitHub recently" } },
      { id: "ghLanguages", label: "Writes code in", hint: "Languages across their GitHub repositories", control: { kind: "tags", suggestions: CODE_LANGUAGES, placeholder: "Add a language" } },
      { id: "ghStars", label: "Stars on their repositories", control: { kind: "segment", options: ["Any", "10+", "100+", "1,000+"] } },
      { id: "oss", label: "Open-source contributor", control: { kind: "toggle", hint: "Merged work in projects they don't own" } },
      { id: "promoted", label: "Promoted in current company", control: { kind: "toggle", hint: "More than one title at the same employer" } },
      { id: "talks", label: "Wrote or spoke publicly", control: { kind: "toggle", hint: "Blog posts, conference talks, papers" } },
      { id: "certs", label: "Certifications", control: { kind: "chips", options: ["AWS", "Google Cloud", "Azure", "CKA", "CKAD", "Terraform", "PMP"] } },
    ],
  },
  {
    id: "languages", label: "Languages", Icon: Translate,
    filters: [
      { id: "spoken", label: "Speaks", control: { kind: "chips", options: ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "Malayalam", "German", "Japanese", "French", "Arabic"] } },
    ],
  },
  {
    id: "inclusion", label: "Inclusion", Icon: UserCircle,
    filters: [
      { id: "returners", label: "Include career returners", control: { kind: "toggle", hint: "Don't penalise a break in employment" } },
      { id: "nonTraditional", label: "Include non-traditional backgrounds", control: { kind: "toggle", hint: "Bootcamps and self-taught engineers with the same experience" } },
    ],
  },
  {
    id: "exclusions", label: "Exclusions", Icon: Prohibit,
    filters: [
      { id: "contacted", label: "Already contacted", control: { kind: "segment", options: ["Include", "Exclude last 90 days", "Exclude ever"] } },
      { id: "otherCampaigns", label: "In another campaign of yours", control: { kind: "toggle", hint: "Leave out people another campaign is already working" } },
      { id: "rejected", label: "Rejected before", control: { kind: "segment", options: ["Include", "Exclude last 6 months", "Exclude ever"] } },
      { id: "contact", label: "Only with contact details", control: { kind: "chips", options: ["Email", "Phone", "Either"] } },
    ],
  },
];

export const ALL_FILTERS: ReadonlyMap<string, FilterDef> = new Map(
  CATEGORIES.flatMap((c) => c.filters.map((f) => [f.id, f] as const)),
);

/**
 * The basics: what nearly every search says, in the order a person says it: where, which job, how many years,
 * which skills, which industry. The filters dialog opens on these alone; the rest of the catalogue is one
 * "View more filters" away.
 */
export const BASIC_ORDER = ["cities", "titles", "years", "must", "industry"] as const;
const BASIC = new Set<string>(BASIC_ORDER);
export const isBasic = (id: string): boolean => BASIC.has(id);

/** The basics as groups (Location, Role, Experience, Skills, Company), each holding only its basic filter, in order. */
export function basicCategories(): Category[] {
  return BASIC_ORDER.flatMap((id) => {
    const cat = CATEGORIES.find((c) => c.filters.some((f) => f.id === id));
    const def = cat?.filters.find((f) => f.id === id);
    return cat && def ? [{ ...cat, filters: [def] }] : [];
  });
}

/** Whether a filter beyond the basics has a value. */
const advancedActive = (f: FilterDef, values: Values) => !BASIC.has(f.id) && isActive(f, values[f.id]);

/**
 * The groups beyond the basics that hold something set (or pre-filled from the brief), whole, so what is set
 * is never behind the "more" button. Each carries its non-basic filters only: its basic one is shown above.
 */
export function openAdvanced(values: Values): Category[] {
  return CATEGORIES.flatMap((c) => {
    const rest = c.filters.filter((f) => !BASIC.has(f.id));
    return rest.some((f) => advancedActive(f, values)) ? [{ ...c, filters: rest }] : [];
  });
}

/** How many filters beyond the basics are set: the number on "View more filters (2 set)". */
export const advancedSetCount = (values: Values): number =>
  CATEGORIES.reduce((n, c) => n + c.filters.filter((f) => advancedActive(f, values)).length, 0);


/** Whether a value narrows the search. Defaults and empties do not. */
export function isActive(def: FilterDef, v: Value | undefined): boolean {
  if (v === undefined) return false;
  const c = def.control;
  if (c.kind === "toggle") return v === true;
  if (c.kind === "segment") return typeof v === "string" && v !== c.options[0];
  if (c.kind === "range") {
    const [a, b] = v as readonly [number, number];
    return a > c.min || b < c.max;
  }
  return Array.isArray(v) && v.length > 0;
}

export function activeCount(values: Values, ids?: readonly string[]): number {
  return [...ALL_FILTERS.values()]
    .filter((f) => !ids || ids.includes(f.id))
    .filter((f) => isActive(f, values[f.id])).length;
}

/**
 * Estimated matches for a set of filters. A fixture model — every active
 * filter narrows the pool by a fixed share, larger selections narrow less —
 * so the number moves the way a real count would while the recruiter works,
 * and always lands on the same figure for the same filters.
 */
const BASE = 184_000;
const CUT: Record<string, number> = {
  titles: 0.18, seniority: 0.35, function: 0.5, pastTitles: 1.4, keywords: 0.3,
  cities: 0.3, countries: 0.5, radius: 0.85, workMode: 0.8, relocate: 1.15, timezones: 0.9,
  years: 0.45, currentRole: 0.7, tenure: 0.8, recentMove: 0.85,
  must: 0.12, nice: 1, exclude: 0.93, skillMatch: 1.6, inRole: 0.6,
  current: 0.08, past: 0.2, excludeCo: 0.95, size: 0.55, stage: 0.5, industry: 0.45, model: 0.6, type: 0.7,
  degree: 0.8, field: 0.7, tier: 0.25, schools: 0.15, gradYear: 0.7,
  ctc: 0.5, expected: 0.6, notice: 0.55,
  openToWork: 0.12, likelihood: 0.4, active: 0.6,
  github: 0.35, ghActive: 0.4, ghLanguages: 0.5, ghStars: 0.4, oss: 0.12, promoted: 0.3, talks: 0.1, certs: 0.3,
  spoken: 0.85, returners: 1.05, nonTraditional: 1.1,
  contacted: 0.9, otherCampaigns: 0.95, rejected: 0.97, contact: 0.7,
};

export function estimate(values: Values): number {
  let n = BASE;
  for (const f of ALL_FILTERS.values()) {
    const v = values[f.id];
    if (!isActive(f, v)) continue;
    let k = CUT[f.id] ?? 0.8;
    if (Array.isArray(v) && f.control.kind !== "range") k = Math.min(1, k * (1 + (v.length - 1) * 0.55));
    if (f.control.kind === "range") {
      const c = f.control;
      const [a, b] = v as readonly [number, number];
      k = Math.max(0.05, Math.min(1, (b - a) / (c.max - c.min) + 0.08));
    }
    n *= k;
  }
  return Math.max(0, Math.round(n));
}

/* ── pre-fill from the brief ──────────────────────────────────────────────── */

const CITY_ALIASES: Record<string, string> = { bangalore: "Bengaluru", bengaluru: "Bengaluru", hyderabad: "Hyderabad", pune: "Pune", chennai: "Chennai", mumbai: "Mumbai", delhi: "Delhi NCR", gurgaon: "Gurugram", gurugram: "Gurugram", noida: "Noida" };
const SKILL_NAMES: Record<string, string> = { PostgreSQL: "PostgreSQL", Go: "Go", Rust: "Rust", Python: "Python", TypeScript: "TypeScript", "Apache Kafka": "Kafka", Kubernetes: "Kubernetes", Terraform: "Terraform", "Amazon Web Services": "AWS" };

/**
 * Filters the brief already implies, so the dialog opens on what was typed
 * rather than blank. Uses the same parser that underlines the composer.
 */
export function fromBrief(text: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  const lower = text.toLowerCase();
  const push = (id: string, v: string) => {
    const cur = (out[id] as string[] | undefined) ?? [];
    if (!cur.includes(v)) out[id] = [...cur, v];
  };
  for (const m of read(text)) {
    if (m.facet === "skill" && SKILL_NAMES[m.means]) push("must", SKILL_NAMES[m.means]!);
    if (m.facet === "seniority") {
      // Crustdata's levels have no Staff, Principal or Lead: they all sit
      // under Senior, and the title itself narrows further.
      const s = ["Staff", "Principal", "Senior", "Lead", "Manager", "Junior"].find((x) => m.means.includes(x) || m.text.toLowerCase().includes(x.toLowerCase()));
      if (s) push("seniority", s === "Junior" ? "Entry level" : s === "Manager" ? "Manager" : "Senior");
    }
  }
  for (const [k, v] of Object.entries(CITY_ALIASES)) if (lower.includes(k)) push("cities", v);
  if (/remote/.test(lower)) push("workMode", "Remote");
  const yrs = lower.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/);
  if (yrs) out.years = [Number(yrs[1]), 25];
  if (/series b/.test(lower)) push("stage", "Series B");
  if (/series a/.test(lower)) push("stage", "Series A");
  if (/backend|back-end/.test(lower)) push("titles", "Backend Engineer");
  return out;
}
