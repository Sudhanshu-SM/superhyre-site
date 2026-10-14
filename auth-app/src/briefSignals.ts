/**
 * What a brief says so far, under the composer while it is written: a location, a job title, years of
 * experience, an industry, skills. Each is either found in the text (and says what it found) or not yet.
 * It is read from plain word lists, never a model, so it moves as fast as the typing and claims only what is on
 * the page: a job title needs a role word, a place has to be a known one, years have to be written as years.
 */

export type SignalId = "location" | "title" | "years" | "industry" | "skills";

export type Signal = {
  id: SignalId;
  label: string;
  /** What was found, in the person's words or the filter's; null while it is not in the text. */
  found: string | null;
  /** The filters dialog's category that holds it. */
  category: "location" | "role" | "experience" | "company" | "skills";
};

const PLACES = [
  "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Chennai", "Mumbai", "Delhi", "New Delhi", "NCR", "Gurgaon", "Gurugram",
  "Noida", "Kolkata", "Ahmedabad", "Kochi", "Jaipur", "Indore", "Chandigarh", "Coimbatore", "Remote", "Hybrid", "Onsite",
  "London", "Singapore", "Dubai", "Berlin", "Amsterdam", "Toronto", "New York", "San Francisco", "Austin", "Sydney",
  "India", "USA", "US", "United States", "UK", "United Kingdom", "UAE", "Germany", "Canada", "Australia", "Netherlands",
  "France", "Ireland", "Remote work", "Work from home", "WFH", "Anywhere",
];
const PLACE = new RegExp(`\\b(${PLACES.join("|").replace(/ /g, "\\s+")})\\b`, "i");

const ROLE_WORDS =
  "engineer|developer|programmer|analyst|scientist|architect|designer|manager|director|recruiter|consultant|"
  + "administrator|accountant|specialist|lead|officer|sre|devops|tester|qa|writer|marketer|strategist|"
  + "associate|intern|founder|vp|cto|coordinator|researcher|salesperson|executive|technician";
/** A job title is there only when a role word is: "backend" or "Pune" alone is not one. */
const TITLE = new RegExp(`\\b(${ROLE_WORDS})s?\\b`, "i");

const INDUSTRIES = [
  "fintech", "saas", "b2b", "b2c", "e-?commerce", "healthcare", "health ?tech", "edtech", "logistics", "gaming", "telecom",
  "manufacturing", "banking", "insurance", "retail", "adtech", "cybersecurity", "ai", "machine learning", "biotech",
  "pharma", "automotive", "media", "travel", "real estate", "proptech", "climate", "energy", "consulting", "payments",
  "marketplace", "startup", "enterprise", "e-learning", "food delivery", "mobility",
];
const INDUSTRY = new RegExp(`\\b(${INDUSTRIES.join("|")})\\b`, "i");

const SKILL_WORDS = [
  "golang", "rust", "python", "java", "kotlin", "swift", "typescript", "javascript", "node\\.?js", "react", "vue",
  "angular", "next\\.?js", "django", "flask", "spring", "postgres(?:ql)?", "mysql", "mongodb", "redis", "kafka",
  "rabbitmq", "elasticsearch", "kubernetes", "k8s", "docker", "terraform", "aws", "gcp", "azure", "graphql", "grpc",
  "sql", "spark", "airflow", "dbt", "snowflake", "tableau", "power ?bi", "excel", "looker", "c\\+\\+", "c#", "\\.net",
  "scala", "ruby", "rails", "php", "laravel", "figma", "sketch", "salesforce", "hubspot", "sap", "pytorch",
  "tensorflow", "llm", "ci/cd", "microservices", "system design", "distributed systems", "ios", "android", "flutter",
];
const SKILL = new RegExp(`(?<![\\w])(${SKILL_WORDS.join("|")})(?![\\w+#])`, "gi");

const YEARS = /(\d{1,2})\s*(?:(\+)|(?:-|–|to)\s*(\d{1,2}))?\s*(?:years?|yrs?)\b/i;

const unique = (xs: readonly string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
};

/** Reads the five signals from a brief. Empty text finds nothing. */
export function detectBrief(text: string): Signal[] {
  const t = text.slice(0, 20_000);
  const place = PLACE.exec(t)?.[1] ?? null;
  const title = TITLE.exec(t)?.[1] ?? null;

  const y = YEARS.exec(t);
  const years = y ? (y[3] ? `${y[1]} to ${y[3]} years` : y[2] ? `${y[1]}+ years` : `${y[1]} years`) : null;

  const industry = INDUSTRY.exec(t)?.[1] ?? null;

  // "Go" is a skill when it is written as a name in the middle of a brief ("Senior Go engineer"), not as a verb.
  const go = /(?<=\S\s)Go\b(?!\s+(?:ahead|find|get|and\s+(?:find|get)))/.test(t) ? ["Go"] : [];
  const skills = unique([...go, ...[...t.matchAll(SKILL)].map((m) => m[1] ?? "")]);

  return [
    { id: "location", label: "Location", found: place, category: "location" },
    { id: "title", label: "Job Title", found: title, category: "role" },
    { id: "years", label: "Years of Experience", found: years, category: "experience" },
    { id: "industry", label: "Industry", found: industry, category: "company" },
    { id: "skills", label: "Skills", found: skills.length ? skills.slice(0, 4).join(", ") : null, category: "skills" },
  ];
}
