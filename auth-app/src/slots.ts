/**
 * The five things a sourcing brief should say, and where it says them.
 *
 * The composer paints every span that covers one of the five (role,
 * experience, skills, location, industry) as the recruiter types. Detection
 * is lexical and runs on every keystroke, so it is built once from word
 * lists into a handful of regexes, plus a small typo pass: a misspelt
 * "Exoerience" or "Banglore" still counts, because the recruiter meant it.
 */

export type SlotId = "role" | "experience" | "skills" | "location" | "industry";

export const SLOTS: readonly { id: SlotId; label: string }[] = [
  { id: "role", label: "Role" },
  { id: "experience", label: "Experience" },
  { id: "skills", label: "Skills" },
  { id: "location", label: "Location" },
  { id: "industry", label: "Industry" },
];

/* ── vocabulary ──
   Lower case, matched case-insensitively. Multi-word phrases are fine; the
   longest phrase wins, so "software developer" is one span, not two. */

const ROLE_WORDS = [
  "software engineer", "software developer", "software development engineer", "software engineering",
  "sde", "sde 1", "sde 2", "sde 3", "sde-1", "sde-2", "sde-3", "sde i", "sde ii", "sde iii", "sde1", "sde2", "sde3",
  "swe", "swe 1", "swe 2", "swe 3", "swe-1", "swe-2", "swe-3", "swe i", "swe ii", "swe iii", "sdet", "mts", "member of technical staff",
  "full stack engineer", "full stack developer", "full-stack engineer", "full-stack developer", "fullstack engineer", "fullstack developer",
  "backend engineer", "backend developer", "back-end engineer", "back-end developer",
  "frontend engineer", "frontend developer", "front-end engineer", "front-end developer",
  "web developer", "mobile developer", "mobile engineer", "ios developer", "ios engineer", "android developer", "android engineer",
  "data scientist", "data engineer", "data analyst", "analytics engineer", "ml engineer", "machine learning engineer",
  "ai engineer", "research scientist", "research engineer", "applied scientist", "mlops engineer",
  "devops engineer", "devops", "sre", "site reliability engineer", "platform engineer", "infrastructure engineer",
  "cloud engineer", "security engineer", "network engineer", "systems engineer", "embedded engineer", "firmware engineer",
  "qa engineer", "qa", "test engineer", "automation engineer", "tester", "quality engineer",
  "ui designer", "ux designer", "ui/ux designer", "product designer", "designer", "graphic designer",
  "product manager", "program manager", "project manager", "engineering manager", "technical program manager", "tpm",
  "product owner", "scrum master", "architect", "solutions architect", "software architect", "tech lead", "team lead",
  "technical lead", "engineering lead", "cto", "vp engineering", "vp of engineering", "head of engineering",
  "director of engineering", "founding engineer", "consultant", "analyst", "business analyst", "recruiter",
  "intern", "trainee", "developer", "dev", "engineer", "programmer", "coder", "scientist", "specialist",
  "administrator", "dba", "database administrator", "sysadmin", "support engineer", "sales engineer",
];

const EXPERIENCE_WORDS = [
  "experience", "experienced", "exp", "yoe", "years of experience", "years experience", "work experience",
  "junior", "jr", "mid level", "mid-level", "midlevel", "mid senior", "mid-senior", "senior", "sr", "staff", "principal",
  "distinguished", "entry level", "entry-level", "fresher", "freshers", "fresh graduate", "graduate", "new grad",
  "seasoned", "veteran", "early career", "l3", "l4", "l5", "l6", "l7", "l8",
];

const SKILL_WORDS = [
  "java", "javascript", "js", "typescript", "ts", "python", "golang", "rust", "c++", "c#", ".net", "dotnet", "asp.net",
  "ruby", "ruby on rails", "php", "laravel", "kotlin", "objective-c", "scala", "elixir", "erlang",
  "haskell", "clojure", "flutter", "perl", "bash", "shell scripting",
  "react native", "reactjs", "react.js", "next.js", "nextjs", "vue", "vue.js", "vuejs", "angular", "svelte",
  "node.js", "nodejs", "nestjs", "django", "fastapi", "spring boot", "hibernate",
  "graphql", "rest api", "rest apis", "grpc", "microservices", "distributed systems", "system design",
  "sql", "nosql", "mysql", "postgres", "postgresql", "mongodb", "mongo", "redis", "cassandra", "dynamodb", "elasticsearch",
  "kafka", "rabbitmq", "hadoop", "airflow", "snowflake", "databricks", "dbt", "bigquery", "etl",
  "aws", "gcp", "azure", "google cloud", "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins", "ci/cd",
  "linux", "git", "html", "css", "tailwind", "redux", "webpack",
  "pytorch", "tensorflow", "keras", "scikit-learn", "pandas", "numpy", "nlp", "computer vision", "llm", "llms",
  "genai", "gen ai", "generative ai", "machine learning", "deep learning", "data science", "ml", "ai", "mlops", "rag",
  "backend", "back-end", "back end", "frontend", "front-end", "front end", "full stack", "full-stack", "fullstack",
  "mobile", "ios", "android", "embedded", "firmware", "blockchain", "solidity",
  "figma", "selenium", "cypress", "playwright", "jest", "tableau", "power bi", "salesforce", 
  "unreal", "cuda", "site reliability", "cybersecurity", "networking", "payments infrastructure",
];

const LOCATION_WORDS = [
  // Indian states and territories
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana",
  "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya",
  "mizoram", "nagaland", "odisha", "orissa", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura",
  "uttar pradesh", "uttarakhand", "west bengal", "delhi", "new delhi", "jammu", "kashmir", "ladakh", "puducherry",
  "pondicherry", "chandigarh",
  // Indian cities
  "bangalore", "bengaluru", "hyderabad", "secunderabad", "pune", "chennai", "mumbai", "bombay", "navi mumbai", "thane",
  "kolkata", "calcutta", "ahmedabad", "gandhinagar", "surat", "vadodara", "jaipur", "lucknow", "kanpur", "noida",
  "greater noida", "gurgaon", "gurugram", "faridabad", "ghaziabad", "ncr", "delhi ncr", "kochi", "cochin", "trivandrum",
  "thiruvananthapuram", "coimbatore", "madurai", "mysore", "mysuru", "mangalore", "mangaluru", "hubli", "bhubaneswar",
  "cuttack", "visakhapatnam", "vizag", "vijayawada", "indore", "bhopal", "nagpur", "nashik", "patna", "ranchi",
  "raipur", "guwahati", "dehradun", "mohali", "ludhiana", "amritsar", "srinagar", "varanasi", "agra", "udaipur", "jodhpur",
  // Beyond India
  "india", "usa", "united states", "united kingdom", "canada", "toronto", "vancouver", "london", "berlin", "munich",
  "amsterdam", "paris", "dublin", "zurich", "singapore", "dubai", "abu dhabi", "uae", "saudi arabia", "riyadh",
  "tokyo", "sydney", "melbourne", "new york", "nyc", "san francisco", "bay area", "seattle", "austin", "boston",
  "europe", "emea", "apac", "asia", "middle east", "latam", "north america", "southeast asia",
  // Where, rather than which place
  "remote", "hybrid", "onsite", "on-site", "on site", "wfh", "work from home", "in office", "in-office", "relocate", "relocation",
];

const INDUSTRY_WORDS = [
  "fintech", "finance", "financial services", "banking", "bank", "banks", "nbfc", "lending", "payments", "insurance",
  "insurtech", "wealthtech", "crypto", "web3", "defi", "saas", "b2b", "b2c", "d2c", "e-commerce", "ecommerce",
  "quick commerce", "marketplace", "marketplaces", "retail", "healthtech", "healthcare", "health care", "medtech",
  "pharma", "biotech", "edtech", "education", "logistics", "supply chain", "mobility", "automotive", "ev",
  "gaming", "media", "entertainment", "adtech", "martech", "social media", "travel", "hospitality", "foodtech",
  "food delivery", "agritech", "proptech", "real estate", "cleantech", "climate tech", "energy", "telecom",
  "manufacturing", "semiconductor", "semiconductors", "hardware", "govtech", "legaltech", "hrtech", "deeptech",
  "enterprise", "consumer", "startup", "startups", "unicorn", "unicorns", "mnc", "mncs", "product company",
  "product companies", "product-based", "product based", "service-based", "service based", "it services",
  "consulting", "big tech", "faang", "maang", "series a", "series b", "series c", "series d", "series e",
  "seed stage", "early stage", "early-stage", "late stage", "growth stage", "fortune 500", "public company",
];

/* Short words that are also everyday English only count in their written
   case: "Go" the language, not "go"; "US", not "us". */
const CASED: readonly [SlotId, string][] = [
  ["skills", "Go"], ["skills", "React"], ["skills", "Node"], ["skills", "Express"], ["skills", "Spring"],
  ["skills", "Spark"], ["skills", "Swift"], ["skills", "Rails"], ["skills", "Dart"], ["skills", "Flask"],
  ["skills", "Unity"], ["skills", "Excel"], ["skills", "SAP"], ["skills", "REST"],
  ["location", "US"], ["location", "UK"],
  ["role", "PM"], ["role", "EM"], ["role", "BA"],
];

/* Patterns a word list cannot cover. */
const NUM = String.raw`\d{1,2}(?:\.\d)?`;
const YEARS_RE = new RegExp(
  String.raw`\b${NUM}\s*\+?\s*(?:(?:-|–|to)\s*${NUM}\s*\+?\s*)?(?:years?|yrs?|yoe|y)\b` +
  String.raw`(?:\s+(?:of\s+)?(?:[a-z.+#-]+\s+)?(?:experience|exp)\b)?` +
  String.raw`|\b${NUM}\s*\+?\s*(?:months?|mos?)\b` +
  String.raw`|\b(?:minimum|min|at least|over|more than)\s+${NUM}\s*\+?\s*(?:years?|yrs?)\b`,
  "gi",
);

/* ── compiled matchers ── */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ -]/g, "[\\s-]?");

function compile(words: readonly string[], flags: string): RegExp {
  const alts = [...new Set(words)].sort((a, b) => b.length - a.length).map(escape).join("|");
  /* Word edges that treat + # . as part of a term, so "c++" and "node.js"
     hold together and "go" never matches inside "Django". A trailing plural
     is tolerated: "SDEs", "engineers". */
  return new RegExp(String.raw`(?<![\w+#.])(?:${alts})(?:e?s)?(?![\w+#])`, flags);
}

const LISTS: readonly [SlotId, RegExp][] = [
  ["role", compile(ROLE_WORDS, "gi")],
  ["experience", compile(EXPERIENCE_WORDS, "gi")],
  ["skills", compile(SKILL_WORDS, "gi")],
  ["location", compile(LOCATION_WORDS, "gi")],
  ["industry", compile(INDUSTRY_WORDS, "gi")],
];
const CASED_RE: readonly [SlotId, RegExp][] = CASED.map(([id, w]) => [id, compile([w], "g")]);

/* ── typo tolerance ──
   Only for the long words (seven letters or more) people actually misspell in a brief, matched within
   one edit (two for long words) and on the same first letter. A curated list
   rather than every word above, because loose matching finds real words:
   "remove" is one letter from "remote", "leading" one from "lending". */
const FUZZY: readonly { w: string; id: SlotId }[] = ([
  ["role", ["developer", "engineer", "architect", "scientist", "recruiter", "consultant", "designer"]],
  ["experience", ["experience", "experienced"]],
  ["skills", ["kubernetes", "javascript", "typescript", "postgres", "postgresql", "elasticsearch", "microservices", "terraform", "tensorflow"]],
  ["location", ["bangalore", "bengaluru", "hyderabad", "chennai", "mumbai", "kolkata", "ahmedabad", "gurgaon", "gurugram", "bhubaneswar", "thiruvananthapuram", "visakhapatnam", "maharashtra", "karnataka", "telangana", "coimbatore", "chandigarh", "lucknow", "singapore"]],
  ["industry", ["fintech", "healthcare", "ecommerce", "logistics", "insurance", "enterprise", "startup", "startups"]],
] as const).flatMap(([id, words]) => words.map((w) => ({ w, id: id as SlotId })));

function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  // Damerau-Levenshtein (optimal string alignment), small inputs only.
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return false;
  }
  return d[a.length]![b.length]! <= max;
}

function fuzzy(word: string): SlotId | null {
  const w = word.toLowerCase();
  if (w.length < 7) return null;
  for (const v of FUZZY) {
    if (v.w[0] !== w[0]) continue;
    if (/(?:ed|ing)$/.test(w) && !/(?:ed|ing)$/.test(v.w)) continue;
    if (within(w, v.w, w.length >= 9 ? 2 : 1)) return v.id;
  }
  return null;
}

/* ── scanning ── */

export type Span = { start: number; end: number; id: SlotId };

/** Every span of `text` that covers one of the five, in order, not overlapping. */
export function scan(text: string): readonly Span[] {
  if (!text.trim()) return [];
  const found: Span[] = [];
  const push = (re: RegExp, id: SlotId) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      found.push({ start: m.index, end: m.index + m[0].length, id });
    }
  };
  push(YEARS_RE, "experience");
  for (const [id, re] of LISTS) push(re, id);
  for (const [id, re] of CASED_RE) push(re, id);

  /* Longest span wins where two claim the same letters. */
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = new Uint8Array(text.length);
  const kept: Span[] = [];
  for (const s of found) {
    let free = true;
    for (let i = s.start; i < s.end; i++) if (taken[i]) { free = false; break; }
    if (!free) continue;
    taken.fill(1, s.start, s.end);
    kept.push(s);
  }

  /* Typos, in the words nothing else claimed. */
  const word = /[A-Za-z]{6,}/g;
  let m: RegExpExecArray | null;
  while ((m = word.exec(text))) {
    const start = m.index, end = start + m[0].length;
    if (taken[start]) continue;
    const id = fuzzy(m[0]);
    if (id) { kept.push({ start, end, id }); taken.fill(1, start, end); }
  }
  return kept.sort((a, b) => a.start - b.start);
}

export type SlotHit = { on: boolean; what: string[] };

/** For each slot, whether the text covers it and with which words. */
export function slotsIn(text: string): Record<SlotId, SlotHit> {
  const out = Object.fromEntries(SLOTS.map((s) => [s.id, { on: false, what: [] as string[] }])) as Record<SlotId, SlotHit>;
  for (const s of scan(text)) {
    const w = text.slice(s.start, s.end);
    out[s.id].on = true;
    if (!out[s.id].what.includes(w)) out[s.id].what.push(w);
  }
  return out;
}

/* ── in-text highlight ──
   Runs the composer can paint. Neighbouring spans join across a space, a
   slash or "of", so "Senior Software Developer" and "5 years of experience"
   read as one phrase rather than a row of separate words. */
export type Run = { text: string; hit: boolean };

const JOIN = /^(?:\s+|\s*[/&+-]\s*|\s+of\s+)$/i;

export function highlightRuns(text: string): readonly Run[] {
  const merged: [number, number][] = [];
  for (const s of scan(text)) {
    const last = merged[merged.length - 1];
    if (last && (s.start <= last[1] || JOIN.test(text.slice(last[1], s.start)))) last[1] = Math.max(last[1], s.end);
    else merged.push([s.start, s.end]);
  }
  const runs: Run[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) runs.push({ text: text.slice(at, a), hit: false });
    runs.push({ text: text.slice(a, b), hit: true });
    at = b;
  }
  if (at < text.length) runs.push({ text: text.slice(at), hit: false });
  return runs;
}
