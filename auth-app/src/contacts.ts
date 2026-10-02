import type { Hue } from "./orchestrator";
import { CAMPAIGNS } from "./workspaces";

/**
 * Contacts: people the team captured with the Chrome extension.
 *
 * A recruiter picks a campaign in the extension, opens a LinkedIn profile and
 * saves it; the person lands here, tagged with that campaign and with who
 * saved them. Enrichment then fills in what the page alone cannot give:
 * Crustdata for the full profile, SalesQL and Apollo for email and phone.
 * Each field remembers which provider it came from, because a recruiter
 * deciding whether to trust a number wants to know where it came from.
 *
 * Fixture data, generated from a fixed seed so every load is the same list.
 */

export type Provider = "Extension" | "Crustdata" | "SalesQL" | "Apollo";

export type Seniority = "Junior" | "Mid" | "Senior" | "Staff" | "Lead" | "Manager" | "Director";

export type ContactJob = { title: string; company: string; span: string };

export type Contact = {
  id: string;
  name: string;
  hue: Hue;
  title: string;
  company: string;
  location: string;
  seniority: Seniority;
  years: number;
  industry: string;
  skills: readonly string[];
  email?: { value: string; source: Provider; verified: boolean };
  phone?: { value: string; source: Provider };
  linkedin: string;
  /** The campaign selected in the extension when this person was saved. */
  campaign: string;
  capturedBy: string;
  /** Days ago. */
  capturedAgo: number;
  /** Crustdata has returned the full profile, or only the scraped page exists. */
  profile: "full" | "basic";
  openToWork: boolean;
  jobs: readonly ContactJob[];
  school?: { name: string; degree: string; years: string };
  about?: string;
};

export const MEMBERS = ["Arnab J", "Sudhanshu M", "Punith S", "Riya K"] as const;

/* ── generator ── */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav", "Ananya", "Rohan", "Priya", "Vikram", "Sneha", "Karthik", "Meera", "Arjun", "Diya", "Rahul", "Isha",
  "Siddharth", "Kavya", "Nikhil", "Pooja", "Aditya", "Neha", "Varun", "Shreya", "Harsh", "Tanvi", "Manish", "Ritika",
  "Abhishek", "Nandini", "Kunal", "Aishwarya", "Pranav", "Sanya", "Yash", "Divya", "Gaurav", "Lakshmi", "Omkar", "Zoya",
];
const LAST = [
  "Sharma", "Iyer", "Reddy", "Nair", "Menon", "Gupta", "Kulkarni", "Rao", "Mehta", "Patel", "Das", "Bose", "Joshi",
  "Pillai", "Chatterjee", "Agarwal", "Mishra", "Verma", "Kapoor", "Hegde", "Shetty", "Banerjee", "Singh", "Khan",
];
const HUES: readonly Hue[] = ["brand", "amber", "sage", "teal", "blue", "violet", "rose"];
const SCHOOLS = [
  "IIT Bombay", "IIT Madras", "BITS Pilani", "NIT Trichy", "IIIT Hyderabad", "VIT Vellore", "IIT Delhi",
  "Manipal Institute of Technology", "PES University", "Anna University", "IIM Ahmedabad", "NID Ahmedabad",
];

type Spec = {
  titles: readonly (readonly [Seniority, string])[];
  companies: readonly (readonly [string, string])[];
  skills: readonly string[];
  cities: readonly string[];
  degree: string;
  count: number;
};

const SPECS: Readonly<Record<string, Spec>> = {
  "backend-snr": {
    titles: [["Senior", "Senior Software Engineer"], ["Mid", "Software Engineer II"], ["Staff", "Staff Engineer"],
      ["Senior", "Senior Backend Engineer"], ["Lead", "Tech Lead, Payments"], ["Mid", "SDE 2"]],
    companies: [["Razorpay", "Fintech"], ["CRED", "Fintech"], ["Swiggy", "Food delivery"], ["Zerodha", "Fintech"],
      ["Flipkart", "E-commerce"], ["PhonePe", "Fintech"], ["Meesho", "E-commerce"], ["Postman", "SaaS"]],
    skills: ["Go", "Postgres", "Kafka", "Java", "Kubernetes", "Redis", "gRPC", "AWS", "Rust", "Python", "Distributed systems"],
    cities: ["Bangalore", "Bangalore", "Hyderabad", "Pune", "Chennai", "Remote, India"],
    degree: "B.Tech, Computer Science", count: 22,
  },
  "platform-sre": {
    titles: [["Senior", "Senior SRE"], ["Mid", "Site Reliability Engineer"], ["Staff", "Staff Platform Engineer"],
      ["Lead", "SRE Lead"], ["Senior", "Senior DevOps Engineer"]],
    companies: [["Freshworks", "SaaS"], ["Atlassian", "SaaS"], ["Zomato", "Food delivery"], ["Ola", "Mobility"],
      ["Nutanix", "Enterprise"], ["Juspay", "Fintech"]],
    skills: ["Kubernetes", "Terraform", "AWS", "GCP", "Prometheus", "Go", "Linux", "Helm", "Python", "Incident response"],
    cities: ["Bangalore", "Remote, India", "Hyderabad", "Gurgaon", "Pune"],
    degree: "B.E., Information Technology", count: 16,
  },
  "ios-mid": {
    titles: [["Mid", "iOS Engineer"], ["Senior", "Senior iOS Engineer"], ["Mid", "Mobile Engineer, iOS"], ["Junior", "Associate iOS Developer"]],
    companies: [["Dream11", "Gaming"], ["Groww", "Fintech"], ["Myntra", "E-commerce"], ["ShareChat", "Social media"], ["Cult.fit", "Healthtech"]],
    skills: ["Swift", "SwiftUI", "UIKit", "Combine", "Core Data", "Objective-C", "XCTest", "GraphQL"],
    cities: ["Bangalore", "Mumbai", "Bangalore", "Remote, India"],
    degree: "B.Tech, Electronics", count: 12,
  },
  "design-lead": {
    titles: [["Lead", "Lead Product Designer"], ["Senior", "Senior Product Designer"], ["Manager", "Design Manager"], ["Staff", "Principal Designer"]],
    companies: [["Swiggy", "Food delivery"], ["Razorpay", "Fintech"], ["Zeta", "Fintech"], ["Unacademy", "Edtech"], ["Urban Company", "Marketplace"]],
    skills: ["Figma", "Design systems", "User research", "Prototyping", "Interaction design", "Accessibility", "Motion"],
    cities: ["Bangalore", "Bangalore", "Mumbai", "Delhi NCR"],
    degree: "M.Des, Interaction Design", count: 10,
  },
  "gtm-ae": {
    titles: [["Senior", "Senior Account Executive"], ["Mid", "Account Executive, Enterprise"], ["Manager", "Sales Manager, West"], ["Director", "Director of Sales"]],
    companies: [["Salesforce", "SaaS"], ["Freshworks", "SaaS"], ["Zoho", "SaaS"], ["LeadSquared", "SaaS"], ["Chargebee", "SaaS"]],
    skills: ["Enterprise sales", "SaaS", "Salesforce CRM", "Negotiation", "MEDDICC", "Pipeline management", "BFSI accounts"],
    cities: ["Mumbai", "Mumbai", "Pune", "Delhi NCR", "Bangalore"],
    degree: "MBA, Marketing", count: 10,
  },
  "ds-applied": {
    titles: [["Senior", "Senior Data Scientist"], ["Mid", "Data Scientist"], ["Staff", "Applied Scientist II"], ["Lead", "ML Lead"]],
    companies: [["Flipkart", "E-commerce"], ["InMobi", "Adtech"], ["Sprinklr", "SaaS"], ["Ola", "Mobility"], ["Fractal", "Consulting"]],
    skills: ["Python", "PyTorch", "SQL", "Spark", "NLP", "LLMs", "Forecasting", "Experimentation", "scikit-learn"],
    cities: ["Bangalore", "Remote, India", "Hyderabad", "Gurgaon"],
    degree: "M.Tech, Data Science", count: 10,
  },
  "fin-controller": {
    titles: [["Manager", "Financial Controller"], ["Senior", "Senior Finance Manager"], ["Director", "Head of Finance"]],
    companies: [["Swiggy", "Food delivery"], ["Byju's", "Edtech"], ["Nykaa", "E-commerce"], ["Delhivery", "Logistics"]],
    skills: ["IFRS", "Ind AS", "Audit", "FP&A", "Tally", "SAP FICO", "Treasury"],
    cities: ["Bangalore", "Mumbai", "Gurgaon"],
    degree: "Chartered Accountant", count: 6,
  },
};

const YEARS_BY: Readonly<Record<Seniority, readonly [number, number]>> = {
  Junior: [1, 3], Mid: [3, 6], Senior: [5, 9], Staff: [8, 13], Lead: [7, 12], Manager: [8, 14], Director: [12, 18],
};

function build(): readonly Contact[] {
  const r = rng(20260928);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const used = new Set<string>();
  const out: Contact[] = [];
  let n = 0;
  for (const camp of CAMPAIGNS) {
    const spec = SPECS[camp.id];
    if (!spec) continue;
    for (let i = 0; i < spec.count; i++) {
      let name = "";
      do name = `${pick(FIRST)} ${pick(LAST)}`; while (used.has(name));
      used.add(name);
      const [seniority, title] = pick(spec.titles);
      const [company, industry] = pick(spec.companies);
      const [lo, hi] = YEARS_BY[seniority];
      const years = lo + Math.floor(r() * (hi - lo + 1));
      const skills = [...spec.skills].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3));
      const [first, last] = name.toLowerCase().split(" ") as [string, string];
      const domain = `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
      const hasEmail = r() > 0.12;
      const hasPhone = r() > 0.3;
      const emailSrc: Provider = pick(["Apollo", "Apollo", "SalesQL", "Crustdata"] as const);
      const phoneSrc: Provider = pick(["SalesQL", "SalesQL", "Apollo"] as const);
      const personal = r() > 0.6;
      const prev = pick(spec.companies)[0];
      const prevTitle = pick(spec.titles)[1];
      const start = 2026 - Math.min(years, 3 + Math.floor(r() * 3));
      const profile: Contact["profile"] = r() > 0.2 ? "full" : "basic";
      const schoolStart = 2026 - years - 4;
      out.push({
        id: `ct-${++n}`,
        name,
        hue: pick(HUES),
        title,
        company,
        location: pick(spec.cities),
        seniority,
        years,
        industry,
        skills,
        email: hasEmail
          ? { value: personal ? `${first}.${last}${Math.floor(r() * 90 + 10)}@gmail.com` : `${first}.${last}@${domain}`, source: emailSrc, verified: r() > 0.3 }
          : undefined,
        phone: hasPhone
          ? { value: `+91 ${pick(["98", "97", "99", "88", "70", "63"])}${String(Math.floor(r() * 1e3)).padStart(3, "0")} ${String(Math.floor(r() * 1e5)).padStart(5, "0")}`, source: phoneSrc }
          : undefined,
        linkedin: `linkedin.com/in/${first}-${last}-${Math.floor(r() * 9000 + 1000)}`,
        campaign: camp.id,
        capturedBy: pick(MEMBERS),
        capturedAgo: Math.floor(r() * r() * 45),
        profile,
        openToWork: r() > 0.78,
        jobs: profile === "full"
          ? [
              { title, company, span: `${start} – Present` },
              { title: prevTitle === title ? prevTitle.replace(/^Senior /, "") : prevTitle, company: prev === company ? pick(spec.companies)[0] : prev, span: `${start - 2 - Math.floor(r() * 3)} – ${start}` },
            ]
          : [{ title, company, span: "Present" }],
        school: profile === "full"
          ? { name: pick(SCHOOLS), degree: spec.degree, years: `${schoolStart} – ${schoolStart + 4}` }
          : undefined,
        about: profile === "full"
          ? `${years} years in ${industry.toLowerCase()}, most recently ${title.toLowerCase()} at ${company}. Works mostly with ${skills.slice(0, 2).join(" and ")}.`
          : undefined,
      });
    }
  }
  return out.sort((a, b) => a.capturedAgo - b.capturedAgo);
}

export const CONTACTS: readonly Contact[] = build();

/** Shortlists the fixture starts with, so the page is not empty on first view. */
export const SEED_SHORTLIST: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  CONTACTS.filter((_, i) => i % 7 === 2).map((c) => [c.id, [c.campaign]]),
);

/* ── filters ── */

export type Filters = {
  seniority: readonly Seniority[];
  experience: readonly ExpBand[];
  location: readonly string[];
  skills: readonly string[];
  contact: readonly ContactNeed[];
  profile: "any" | "full" | "basic";
  capturedBy: readonly string[];
  captured: "any" | "7" | "30";
  openToWork: boolean;
};

export type ExpBand = "0-3" | "3-6" | "6-10" | "10+";
export type ContactNeed = "email" | "phone" | "verified";

export const EXP_BANDS: readonly { id: ExpBand; label: string; test: (y: number) => boolean }[] = [
  { id: "0-3", label: "Under 3 yrs", test: (y) => y < 3 },
  { id: "3-6", label: "3 – 6 yrs", test: (y) => y >= 3 && y < 6 },
  { id: "6-10", label: "6 – 10 yrs", test: (y) => y >= 6 && y < 10 },
  { id: "10+", label: "10+ yrs", test: (y) => y >= 10 },
];

export const SENIORITIES: readonly Seniority[] = ["Junior", "Mid", "Senior", "Staff", "Lead", "Manager", "Director"];

export const EMPTY_FILTERS: Filters = {
  seniority: [], experience: [], location: [], skills: [], contact: [],
  profile: "any", capturedBy: [], captured: "any", openToWork: false,
};

export function activeFilterCount(f: Filters): number {
  return f.seniority.length + f.experience.length + f.location.length + f.skills.length + f.contact.length
    + f.capturedBy.length + (f.profile !== "any" ? 1 : 0) + (f.captured !== "any" ? 1 : 0) + (f.openToWork ? 1 : 0);
}

export function matches(c: Contact, f: Filters, q: string): boolean {
  if (f.seniority.length && !f.seniority.includes(c.seniority)) return false;
  if (f.experience.length && !EXP_BANDS.some((b) => f.experience.includes(b.id) && b.test(c.years))) return false;
  if (f.location.length && !f.location.includes(c.location)) return false;
  if (f.skills.length && !f.skills.every((s) => c.skills.includes(s))) return false;
  if (f.contact.includes("email") && !c.email) return false;
  if (f.contact.includes("phone") && !c.phone) return false;
  if (f.contact.includes("verified") && !c.email?.verified) return false;
  if (f.profile !== "any" && c.profile !== f.profile) return false;
  if (f.capturedBy.length && !f.capturedBy.includes(c.capturedBy)) return false;
  if (f.captured !== "any" && c.capturedAgo > Number(f.captured)) return false;
  if (f.openToWork && !c.openToWork) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [c.name, c.title, c.company, c.location, c.email?.value ?? "", c.phone?.value.replace(/\s/g, "") ?? "", ...c.skills]
    .join(" ").toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w.replace(/\s/g, "")));
}

/** The values worth offering as filter options for a set of contacts, most common first. */
export function optionsFor(list: readonly Contact[], key: "location" | "skills", limit = 12): readonly string[] {
  const counts = new Map<string, number>();
  for (const c of list) for (const v of key === "skills" ? c.skills : [c.location]) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([v]) => v);
}

export type SortKey = "recent" | "name" | "experience";

export function sortContacts(list: readonly Contact[], key: SortKey): readonly Contact[] {
  const xs = [...list];
  if (key === "name") xs.sort((a, b) => a.name.localeCompare(b.name));
  else if (key === "experience") xs.sort((a, b) => b.years - a.years);
  else xs.sort((a, b) => a.capturedAgo - b.capturedAgo);
  return xs;
}

export const capturedLabel = (days: number): string =>
  days === 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? `${days}d ago` : days < 30 ? `${Math.floor(days / 7)}w ago` : `${Math.floor(days / 30)}mo ago`;

/* ── what a recruiter scans a row for ── */

const NOW_YEAR = 2026;

/** How long they have been in the current role, from the profile's dates. */
export function tenureOf(c: Contact): { years: number | null; label: string } {
  const m = c.jobs[0]?.span.match(/(\d{4})\s*–\s*Present/);
  if (!m) return { years: null, label: "Tenure not on profile yet" };
  const y = NOW_YEAR - Number(m[1]);
  return { years: y, label: y < 1 ? "Joined this year" : `Since ${m[1]} · ${y} yr${y === 1 ? "" : "s"}` };
}

/** One or two lines on why this person might matter: experience, domain,
 *  where they were before, and what they are strongest in. */
export function summaryOf(c: Contact): string {
  const prev = c.jobs[1]?.company;
  const top = c.skills.slice(0, 3);
  const skills = top.length > 1 ? `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}` : top[0] ?? "";
  return `${c.years} yrs in ${c.industry.toLowerCase()}${prev ? `, previously ${prev}` : ""}. Strong in ${skills}.`;
}
