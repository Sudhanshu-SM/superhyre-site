import type { Form, ItemType, Question, RoleDetails, TintKey } from "./campaign";
import { answerable } from "./campaign";
import { campaignRow } from "./campaignStore";
import { CAMPAIGN_ROWS } from "./campaignsData";
import type { CampaignStatus } from "./campaignsData";

/**
 * Forms, as data: tints, ids, question templates, the chat's drafting rules
 * and time estimates. Functions only, no components, so the chat (Package A) and the
 * builder (Package B) share one source.
 */

/* ── tints ── */

export const TINTS: Readonly<Record<TintKey, { label: string; fill: string; text: string; wash: string; bg: string; band: string; line: string }>> = {
  ember: { label: "Ember", fill: "#cc4d17", text: "#b24c20", wash: "#fdeae2", bg: "#fbf7f3", band: "#fce3d1", line: "#f2cbb6" },
  sand: { label: "Sand", fill: "#a85932", text: "#9f5b38", wash: "#f9ede7", bg: "#faf7f2", band: "#f3e6d8", line: "#ead0c3" },
  sage: { label: "Sage", fill: "#3b7a26", text: "#477c35", wash: "#ebf9e7", bg: "#f7f9f4", band: "#e3efdb", line: "#cceac3" },
  slate: { label: "Slate", fill: "#3a70b8", text: "#3d6dac", wash: "#e7eff9", bg: "#f6f8fa", band: "#dfe8f3", line: "#c3d4ea" },
  ink: { label: "Ink", fill: "#3d3a36", text: "#3d3a36", wash: "#efedea", bg: "#f8f7f5", band: "#e9e6e1", line: "#d9d4cd" },
};
export const TINT_KEYS = Object.keys(TINTS) as TintKey[];
/**
 * The page's colour is the brand orange, always: the cover colour choice is gone. A theme stored on an older form is
 * still read and sent back, and does nothing.
 */
export const tintKey = (_stored?: string | null): TintKey => "ember";
export const tintOf = (f: Pick<Form, "theme">) => TINTS[tintKey(f.theme)];

/* ── campaigns: the fixture rows plus any made from chat ──
   The stub list lives here (not in formsStore) so formKit never imports the
   store and there is no import cycle; formsStore re-exports the lookups. */

export type CampaignLite = { id: string; name: string; department: string; location: string; status: CampaignStatus };
export const STUBS: CampaignLite[] = [];

export function campaignById(id: string): CampaignLite | undefined {
  /* The live campaign list first: with the API it holds the workspace's campaigns. */
  const r = campaignRow(id) ?? CAMPAIGN_ROWS.find((c) => c.id === id);
  if (r) return { id: r.id, name: r.name, department: r.department, location: r.location, status: r.status };
  return STUBS.find((c) => c.id === id);
}

/* ── ids ── */

let n = 0;
export const newId = (p: string) => `${p}-${Date.now().toString(36)}${(++n).toString(36)}`;

/* ── questions ── */

export const NOTICE = ["Immediate", "15 days", "30 days", "60 days", "90 days"];
export const SCALE_DEFAULT = { low: "Not at all", high: "Very" };

export function newQuestion(type: ItemType): Question {
  return {
    id: newId("q"),
    type,
    /* Empty, even for a section: the field's placeholder says what goes
       there, and typing never appends to a default. */
    title: "",
    required: false,
    /* A dropdown has options like the other picks, or publishing it is refused ("add at least two options"). */
    ...(type === "choice" || type === "multi" || type === "dropdown" ? { options: ["Option 1", "Option 2"] } : {}),
    ...(type === "scale" ? { scale: { ...SCALE_DEFAULT } } : {}),
  };
}

export function duplicateQuestion(q: Question): Question {
  return JSON.parse(JSON.stringify({ ...q, id: newId("q") })) as Question;
}

const SECONDS: Readonly<Record<string, number>> = { short: 20, link: 15, number: 10, yesno: 8, choice: 12, multi: 15, scale: 8, long: 90 };
export const estSeconds = (form: Pick<Form, "questions">) => 30 + answerable(form).reduce((a, q) => a + (SECONDS[q.type] ?? 15), 0);
/** Rounded up: an estimate a candidate beats feels better than one they miss. */
export const estMinutes = (form: Pick<Form, "questions">) => Math.max(1, Math.ceil(estSeconds(form) / 60));
export const minutesLabel = (m: number) => `About ${m} minute${m === 1 ? "" : "s"}`;
export const minutesShort = (m: number) => `~${m} min`;

/** "Senior Backend Engineers screening" → "senior-backend-engineers-screening". */
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const formSlug = (form: Pick<Form, "id" | "name" | "title">) => slugify(form.name || form.title || "") || form.id.slice(-6);
/** The public address a candidate opens. */
export const formPublicLink = (form: Pick<Form, "id" | "name" | "title">) => `https://apply.superhyre.com/${formSlug(form)}`;
/** The link to copy and send. In development it points at this app's own
    candidate route (#/apply/…), so a copied link opens a real page. */
export const formLink = (form: Pick<Form, "id" | "name" | "title">) =>
  import.meta.env?.DEV && typeof window !== "undefined" && window.location?.origin?.startsWith("http")
    ? `${window.location.origin}${window.location.pathname}#/apply/${formSlug(form)}`
    : formPublicLink(form);

/** A few words for a question, for "Also asks about …" and export columns. */
export function shortTitle(q: Question): string {
  const t = q.title.toLowerCase();
  if (/notice/.test(t)) return "notice period";
  if (/authori[sz]/.test(t)) return "work authorisation";
  if (/work(ing)? from|remote|relocat|location|office/.test(t)) return "location";
  if (q.type === "link") return "a portfolio or GitHub";
  if (q.type === "long") return "a story about their work";
  if (q.type === "number") return "years of experience";
  if (q.type === "multi") return "the tools they use";
  if (q.type === "scale") return /match|want next|fit/.test(t) ? "role fit" : "how they rate it";
  const ran = /have you (?:run|used|worked with|sold|closed) (.+?)(?: deals)? in production( at scale)?\?*$/i.exec(q.title);
  if (ran) return `${ran[1]} in production${ran[2] ?? ""}`;
  if (/on-?call|pager/.test(t)) return "on-call";
  return clip(lower1(q.title.replace(/[?.]$/, "")), 32) || "untitled question";
}
/** Lowercase the first letter, unless it starts an acronym ("AWS"). */
const lower1 = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
/** Cut at a word boundary, no ellipsis: the result sits inside a sentence. */
const clip = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 12 ? cut.slice(0, at) : s.slice(0, max)).replace(/[,;:]$/, "");
};
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── role families ── */

export type Family = "engineering" | "sales" | "design" | "other";
export const FAMILIES: { id: Family; label: string; meta: string }[] = [
  { id: "engineering", label: "Engineering", meta: "I'll tailor it for technical hiring" },
  { id: "sales", label: "Sales / GTM", meta: "Quota, deal size and pipeline questions" },
  { id: "design", label: "Design / Creative", meta: "Portfolio first, process second" },
  { id: "other", label: "Something else", meta: "Tell me the role and I'll start from the basics" },
];
export const SUBTYPES: Record<Exclude<Family, "other">, { id: string; label: string; meta: string }[]> = {
  engineering: [
    { id: "backend", label: "Backend", meta: "APIs, data, distributed systems" },
    { id: "frontend", label: "Frontend", meta: "Web apps and interfaces" },
    { id: "fullstack", label: "Full-stack", meta: "A bit of everything, shipped end to end" },
    { id: "other", label: "Something else", meta: "Mobile, platform, data, embedded…" },
  ],
  sales: [
    { id: "ae", label: "Account executive", meta: "Owns deals through to close" },
    { id: "sdr", label: "SDR / BDR", meta: "Books the first meeting" },
    { id: "cs", label: "Customer success", meta: "Keeps and grows accounts" },
    { id: "other", label: "Something else", meta: "Partnerships, sales ops, solutions…" },
  ],
  design: [
    { id: "product", label: "Product design", meta: "Flows, systems, shipped UI" },
    { id: "brand", label: "Brand and visual", meta: "Identity, campaigns, illustration" },
    { id: "research", label: "UX research", meta: "Interviews, studies, insight" },
    { id: "other", label: "Something else", meta: "Content, motion, industrial…" },
  ],
};

/* ── what a campaign says about its kind of role ── */

/**
 * Departments that settle the kind of role on their own, whole words and any case. Sales is read first, so
 * "Sales Engineering" is sales; "Product" and "Operations" are not here, because people of every kind work in them.
 */
const DEPARTMENT_FAMILY: ReadonlyArray<readonly [RegExp, Family]> = [
  [/\b(sales|go[- ]to[- ]market|gtm|revenue|business development|partnerships?|customer success|account management|client success)\b/i, "sales"],
  [/\b(design|creative|ux)\b/i, "design"],
  [/\b(engineering|software|technology|tech|it|devops|sre|platform|infrastructure|cloud|security|infosec|cyber ?security|qa|quality( assurance)?|testing|mobile|ml|ai|machine learning|data|analytics|bi|business intelligence|insights|data science|r&d)\b/i, "engineering"],
];
/** Departments that hold no technical, sales or design role of their own: a title that says more wins over these. */
const OTHER_DEPARTMENT = /\b(marketing|growth|hr|human resources|people|talent|recruiting|recruitment|finance|accounts?|accounting|legal|compliance|operations|ops|admin\w*|support|customer (support|service|care|experience)|procurement|supply chain|logistics|strategy|facilities)\b/i;

export const familyForDepartment = (d: string): Family | null => {
  const dept = d.trim();
  if (!dept) return null;
  for (const [re, family] of DEPARTMENT_FAMILY) if (re.test(dept)) return family;
  return null;
};

const SALES_WORDS = /\b(sales|account (executive|manager|exec)|business development|sdr|bdr|customer success|client success|revenue|gtm|go[- ]to[- ]market|partnerships?|pre-?sales|inside sales|channel (manager|partner)|solutions? (engineer|consultant|architect)s?|relationship manager)\b/i;
const DESIGN_WORDS = /\b(designers?|design|ux|illustrators?|creative|art director)\b/i;
/** Jobs that are not technical, sales or design, whatever they are about: "Product Manager, Data Platform". */
const OTHER_ROLE_WORDS = /\b(customer (support|care|service|experience)|support (specialist|agent|executive|associate|representative|lead|manager|analyst|engineers?)|help ?desk|service desk|content (strategist|manager|marketer)|writers?|copywriters?|seo|social media|community manager|recruit\w*|talent (acquisition|partner|manager)|accountants?|controller|auditor|payroll|paralegal|counsel|receptionist|executive assistant|office manager|admin\w*|procurement|product (manager|owner|operations|lead|director|analyst)|program manager|project manager|chief of staff|data entry)\b/i;
/** Titles that are technical whatever else they say ("Cloud Operations Engineer", "Data Analyst"). */
const TECH_WORDS = /\b(software|developers?|programmers?|devops|dev ops|sre|site reliability|architects?|back[- ]?end|front[- ]?end|full[- ]?stack|android|ios|mobile|machine learning|mlops|ml|ai|data (scientists?|engineers?|analysts?|analytics|science|platform)|analytics|business intelligence|bi|qa|sdet|quality assurance|test automation|testers?|devsecops|cyber ?security|information security|security (engineers?|analysts?|architects?)|cloud|embedded|firmware|robotics|blockchain|web3|dba|database|sysadmin|system administrator|network engineers?)\b/i;
/** The business a role sits in, when no technical word has said otherwise: "Marketing Manager", "Finance Lead". */
const OTHER_DOMAIN_WORDS = /\b(marketing|growth|hr|human resources|people (partner|operations|ops|business partner|manager)|talent|finance|financial|accounting|legal|compliance|operations(?! engineers?)|ops manager|supply chain|logistics|warehouse|content)\b/i;
/** Technical, but only by a looser word: used when nothing above has said. */
const LOOSE_TECH_WORDS = /\b(engineers?|engineering|data|security|platform|infrastructure|technical|scientists?|technologist)\b/i;

/**
 * The kind of role a campaign is, from what it already says about itself: its department, else the words
 * of its title. "Software Engineer" is engineering whatever its department field holds, and a title in a
 * department that holds every kind of role ("Product", "Operations") is read on its own. A role that is
 * none of technical, sales or design is "other" (the generic form). Null only when nothing says anything.
 */
export function inferFamily(department: string | undefined, ...words: ReadonlyArray<string | undefined>): Family | null {
  const dept = (department ?? "").trim();
  const byDepartment = familyForDepartment(dept);
  if (byDepartment) return byDepartment;
  const text = words.filter(Boolean).join(" ");
  if (text.trim()) {
    if (SALES_WORDS.test(text)) return "sales";
    if (DESIGN_WORDS.test(text)) return "design";
    if (OTHER_ROLE_WORDS.test(text)) return "other";
    if (TECH_WORDS.test(text)) return "engineering";
    if (OTHER_DOMAIN_WORDS.test(text)) return "other";
    if (LOOSE_TECH_WORDS.test(text)) return "engineering";
  }
  return OTHER_DEPARTMENT.test(dept) ? "other" : null;
}

/* ── the stack a title names ── */

/** "Senior Software Engineer II" and "SDE 2" say no more than "software engineer" does. */
const LEVEL_WORD = /^(senior|sr|junior|jr|staff|principal|lead|associate|mid|entry|early|career|level|i|ii|iii|iv|v|[1-5])$/;
const isPlainSoftware = (text: string): boolean => {
  const rest = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t && !LEVEL_WORD.test(t)).join(" ");
  return /^(software (engineers?|developers?)|sde|swe)$/.test(rest);
};

/** What one title says about the stack: a stack it names, or only that it is a plain "software engineer". */
function subOf(family: Exclude<Family, "other">, text: string): { sub: string; plain: boolean } | null {
  const hit = (re: RegExp) => re.test(text);
  const named = (sub: string) => ({ sub, plain: false });
  if (family === "engineering") {
    if (hit(/\bfull[- ]?stack\b/i)) return named("fullstack");
    if (hit(/\bback[- ]?end\b|\bserver\b|\bapi\b|\bsre\b|\bplatform\b|\bdevops\b|\binfrastructure\b|\bcloud\b/i)) return named("backend");
    if (hit(/\bfront[- ]?end\b|\breact\b|\bweb ui\b/i)) return named("frontend");
    if (hit(/\bandroid\b|\bios\b|\bmobile\b|\bdata\b|\banalytics\b|\bmachine learning\b|\bembedded\b|\bfirmware\b|\brobotics\b|\bml\b|\bai\b|\bsecurity\b|\bqa\b|\bsdet\b|\bblockchain\b/i)) return named("other");
    return isPlainSoftware(text) ? { sub: "fullstack", plain: true } : null;
  }
  if (family === "sales") {
    if (hit(/\bsdr\b|\bbdr\b|business development|sales development|\boutbound\b/i)) return named("sdr");
    if (hit(/customer success|client success|account manager|\bcsm\b/i)) return named("cs");
    if (hit(/account executive|\bae\b|sales (executive|manager)|enterprise sales/i)) return named("ae");
    return null;
  }
  if (hit(/\bresearch/i)) return named("research");
  if (hit(/\bbrand\b|\bvisual\b|\bgraphic\b|illustrat|\bcreative\b/i)) return named("brand");
  if (hit(/\bproduct design|\bux\b|\bui\b|interaction/i)) return named("product");
  return null;
}

/**
 * Which of the family's shapes a title clearly names ("Senior Backend Engineer" is backend), or null when it
 * names none, which is when the recruiter is asked. Each title is read on its own: a plain "Software Engineer"
 * is the full-stack shape only when nothing else names a stack, and titles that name different stacks say
 * nothing. "Robotics Software Engineer" is not "software engineer".
 */
export function inferSub(family: Family, ...words: ReadonlyArray<string | undefined>): string | null {
  if (family === "other") return null;
  const hits = words.map((w) => (w ?? "").trim()).filter(Boolean).map((w) => subOf(family, w)).filter((h): h is { sub: string; plain: boolean } => !!h);
  const named = [...new Set(hits.filter((h) => !h.plain).map((h) => h.sub))];
  if (named.length) return named.length === 1 ? named[0]! : null;
  const plain = [...new Set(hits.map((h) => h.sub))];
  return plain.length === 1 ? plain[0]! : null;
}

export const SKILLS: Readonly<Record<Family, readonly string[]>> = {
  engineering: ["Go", "Java", "Kotlin", "Python", "Rust", "Node.js", "TypeScript", "React", "Next.js", "Postgres", "MySQL", "Kafka", "Redis", "Kubernetes", "AWS", "GCP", "gRPC", "GraphQL", "Terraform"],
  sales: ["SaaS", "Enterprise", "Mid-market", "Fintech", "Salesforce", "HubSpot", "Outbound"],
  design: ["Figma", "Design systems", "Prototyping", "Motion", "Illustration", "Typography", "User research"],
  other: [],
};

/* ── the ideal-hire line ── */

const WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const CITY: Readonly<Record<string, string>> = { bengaluru: "Bangalore", gurugram: "Gurgaon" };

export type Ideal = { years?: number; skills: string[]; city?: string; daysInOffice?: number; remote: boolean };

export function parseIdeal(line: string, family: Family = "engineering"): Ideal {
  const s = line ?? "";
  const y = /(\d+)\s*\+?\s*(?:years|yrs)/i.exec(s);
  const skills = SKILLS[family].filter((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.+]/g, "\\$&")}(?![a-z0-9])`, "i").test(s));
  const c = /(bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|noida|pune|hyderabad|chennai)/i.exec(s);
  const d = /(\d|one|two|three|four|five)\s+days?/i.exec(s);
  const city = c ? CITY[c[1]!.toLowerCase()] ?? cap(c[1]!.toLowerCase()) : undefined;
  const days = d ? (/\d/.test(d[1]!) ? Number(d[1]) : WORDS[d[1]!.toLowerCase()]) : undefined;
  return { years: y ? Number(y[1]) : undefined, skills, city, daysInOffice: days, remote: /remote/i.test(s) };
}

/**
 * Must-haves the ideal-hire line asks for: up to two named skills, and
 * on-call if it mentions a pager. `label` is how the chat names each one
 * back ("Postgres at scale", "on-call").
 */
export type LineMust = { title: string; label: string };
export function idealMustHaves(line: string, family: Family): LineMust[] {
  const s = line ?? "";
  if (!s.trim()) return [];
  const p = parseIdeal(s, family);
  const scale = /at scale|high (?:traffic|volume)|large scale/i.test(s);
  const out: LineMust[] = [];
  for (const k of p.skills.slice(0, 2)) {
    /* "at scale" belongs to the skill it follows, or to the only one. */
    const near = new RegExp(`${k.replace(/[.+]/g, "\\$&")}[^,.;]{0,24}(?:at scale|high (?:traffic|volume))`, "i").test(s);
    const big = scale && (near || p.skills.length === 1);
    if (family === "sales") out.push({ title: `Have you sold ${k} deals before?`, label: k });
    else if (family === "design") out.push({ title: `Have you worked hands-on with ${k}?`, label: k });
    else out.push({ title: `Have you run ${k} in production${big ? " at scale" : ""}?`, label: big ? `${k} at scale` : k });
  }
  if (/on-?call|pager|incident/i.test(s)) out.push({ title: "Have you been on an on-call rota for a production system?", label: "on-call" });
  return out;
}

/* ── domains the ideal-hire line can name, beyond tools ── */

const DOMAINS: readonly { re: RegExp; label: string; question: string }[] = [
  { re: /accessib|a11y|wcag|screen reader/i, label: "accessibility", question: "Tell us about a time you shipped an accessible interface. What did you change to get there?" },
  { re: /payment|money[- ]movement|ledger|upi|card(s)? processing/i, label: "payments or money movement", question: "Tell us about payments or money-movement systems you've owned." },
  { re: /fintech|lending|banking|neobank/i, label: "fintech", question: "What have you built or sold in fintech, and what was hard about it?" },
  { re: /e-?commerce|marketplace|checkout/i, label: "e-commerce or marketplaces", question: "Tell us about commerce or marketplace work you've owned." },
  { re: /\bml\b|machine learning|recommend|ranking|llm|nlp/i, label: "machine learning", question: "Tell us about a model you shipped. How did you know it worked?" },
  { re: /search\b/i, label: "search", question: "Tell us about a search system you worked on." },
  { re: /real[- ]time|streaming|low[- ]latency/i, label: "real-time systems", question: "Tell us about a real-time or low-latency system you owned." },
  { re: /health(care)?|clinical/i, label: "healthcare", question: "What have you worked on in healthcare?" },
  { re: /b2b saas|saas/i, label: "B2B SaaS", question: "What did you work on at a SaaS company, and who used it?" },
  { re: /polish|craft|pixel|attention to detail/i, label: "polished, crafted work", question: "Show us one piece of work where the details mattered. What did you sweat over?" },
  { re: /mentor|led a team|lead(?:ing)? a team|manag(?:ed|ing) (?:a )?team/i, label: "leading a team", question: "Tell us about someone you helped grow. What did you do differently for them?" },
];

/** The ideal-hire line as a requirement bullet: trimmed, capitalised, no
    full stop, and only when it is short enough to read as one line. */
export function lineRequirement(line: string): string | null {
  const s = (line ?? "").trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (s.length < 8 || s.length > 110) return null;
  return cap(s);
}

/** "Ships polished UIs and cares about accessibility" → "ships polished UIs, cares about accessibility",
    for "Built around: …" on the chat's card. */
export function builtAround(line: string): string | null {
  const s = (line ?? "").trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (!s) return null;
  const parts = s.split(/\s*(?:,|;|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
  const out = parts.length > 1 && parts.length <= 4 ? parts.join(", ") : s;
  return out.length > 96 ? `${out.slice(0, 95).replace(/\s+\S*$/, "")}…` : (/^[A-Z][a-z]/.test(out) ? out.charAt(0).toLowerCase() + out.slice(1) : out);
}
export type Domain = { label: string; question: string };
export function idealDomain(line: string): Domain | null {
  const s = line ?? "";
  const d = DOMAINS.find((x) => x.re.test(s));
  return d ? { label: d.label, question: d.question } : null;
}

/** "Senior Backend Engineers" → "Senior Backend Engineer"; "Design Lead" stays. */
export function roleTitle(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  if (/[^s]s$/i.test(last) && last.length > 3) words[words.length - 1] = last.slice(0, -1);
  return words.join(" ");
}

/** "a Backend Engineer", "an Applied Data Scientist". */
export const withArticle = (t: string) => `${/^[aeiou]/i.test(t.trim()) && !/^(uni|use|one|eu)/i.test(t.trim()) ? "an" : "a"} ${t}`;

const and = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/* ── role copy ── */

/** Role copy flavour: the family, narrowed by the campaign's department
    (a Data campaign in the engineering family reads as data work, not backend). */
export type Flavour = Family | "data";
const INTRO: Readonly<Record<Flavour, (t: string) => string>> = {
  engineering: (t) => `We're hiring ${withArticle(t)} to own real systems end to end, from design to production. You'll work in a small team that ships often and talks to the people who use what it builds.`,
  data: (t) => `We're hiring ${withArticle(t)} to turn messy data into decisions the team acts on. You'll own problems from the first question to a model or analysis that runs in production.`,
  sales: (t) => `We're hiring ${withArticle(t)} to grow how we sell, with real ownership of your accounts and a team that celebrates the close.`,
  design: (t) => `We're hiring ${withArticle(t)} who cares how things feel, not just how they look, and who wants their work to ship.`,
  other: (t) => `We're hiring ${withArticle(t)}. Here's what the role involves and what we're looking for.`,
};
const DOING: Readonly<Record<Flavour, string[]>> = {
  data: ["Frame business questions as problems data can answer", "Build, test and ship models and analyses people rely on", "Work with engineering to get your work into production"],
  engineering: ["Design, build and run services that handle real traffic", "Own what you ship, from review to production to the pager", "Help raise the bar on code review and design docs"],
  sales: ["Run deals from first call to signed contract", "Build and keep an honest forecast", "Feed what customers say back to product"],
  design: ["Take problems from a rough brief to shipped work", "Work closely with engineers through build and launch", "Help shape how the team critiques and shares work"],
  other: ["Own a clear area of the business from day one", "Work closely with the founders and the team leads", "Set up the processes the next people will rely on"],
};
const LOOKING: Readonly<Record<Flavour, string[]>> = {
  data: ["You're rigorous about what the data can and can't tell you", "You explain results plainly to people who don't do statistics"],
  engineering: ["You write clearly, in code and in docs", "You like owning outcomes, not just tickets"],
  sales: ["You're comfortable with a number and honest about it", "You prepare well and follow up without being chased"],
  design: ["A portfolio that shows your thinking, not just the final screens", "You're happy to explain your decisions and change them"],
  other: ["You've done this role before, or something very close to it", "You're organised and you communicate early"],
};

/** Departments and titles that make an engineering role data work: "Data", "Analytics", "BI", a "Data Analyst". */
const DATA_DEPARTMENT = /\b(data|analytics|bi|business intelligence|insights|data science)\b/i;
const DATA_TITLE = /\b(analysts?|analytics|data scien\w+|business intelligence|bi)\b/i;

export function flavourOf(family: Family, department?: string, sub?: string, title?: string): Flavour {
  if (family === "engineering" && (sub === "data" || DATA_DEPARTMENT.test(department ?? "") || DATA_TITLE.test(title ?? ""))) return "data";
  return family;
}

/** When the family picked in chat doesn't match the campaign's department,
    a short note to say so ("This campaign is Data; …"). Null when they agree. */
export function familyConflict(campaignId: string, family: Family): string | null {
  const c = campaignById(campaignId);
  const want = familyForDepartment(c?.department ?? "");
  if (!c || !want || want === family || family === "other") return null;
  const label = FAMILIES.find((f) => f.id === family)?.label ?? family;
  return `This campaign is in ${c.department}, so check the role details read right for ${label.toLowerCase()} hiring.`;
}

/** "About the role": where the job sits, in plain words. Separate from the
    intro, so the candidate page never says the same thing twice. */
export function teamAbout(c: Pick<CampaignLite, "department" | "location"> | undefined): string {
  const team = c?.department ? `the ${c.department} team` : "the team";
  const city = (c?.location ?? "").split(/[·,]/)[0]!.trim();
  const where = city && !/remote/i.test(city) ? ` in ${city}` : "";
  return `You'll join ${team}${where} and work closely with the hiring manager. The first few months are about learning how things fit together, then owning one clear area.`;
}

/** The intro paragraph a form starts with, from the campaign. */
export function defaultIntro(campaignId: string, family?: Family): string {
  const c = campaignById(campaignId);
  const fam = flavourOf(family ?? familyForDepartment(c?.department ?? "") ?? "other", c?.department, undefined, c?.name);
  return INTRO[fam](roleTitle(c?.name ?? "role"));
}

export function defaultRole(campaignId: string, family?: Family): RoleDetails {
  const c = campaignById(campaignId);
  const fam = flavourOf(family ?? familyForDepartment(c?.department ?? "") ?? "other", c?.department, undefined, c?.name);
  return {
    about: teamAbout(c),
    responsibilities: [...DOING[fam]],
    requirements: [...LOOKING[fam]],
    team: c?.department || undefined,
    location: c?.location || undefined,
    workType: "Full-time",
  };
}

/* ── question templates ── */

type Q = Omit<Question, "id">;
const num = (title: string, required = true): Q => ({ type: "number", title, required, unit: "years", placeholder: "0" });
const multi = (title: string, options: string[], required = true): Q => ({ type: "multi", title, required, options });
const choice = (title: string, options: string[], required = true): Q => ({ type: "choice", title, required, options });
const notice = (): Q => choice("What's your notice period?", [...NOTICE]);
const long = (title: string): Q => ({ type: "long", title, required: false });
const link = (title: string, required = false): Q => ({ type: "link", title, required, placeholder: "https://" });
const LOC = "@loc" as const;
type Slot = Q | typeof LOC;

function template(family: Family, sub: string | undefined, roleText: string, dept: string, skills: string[]): Slot[] {
  const tools = (base: string[]) => [...new Set([...skills, ...base])].slice(0, 7);
  if (family === "engineering") {
    if (sub === "backend") return [num("How many years have you spent building backend systems?"), multi("Which of these have you run in production?", tools(["Postgres", "Kafka", "Redis", "Kubernetes", "gRPC", "AWS"])), notice(), LOC, link("Your GitHub, or a project you're proud of"), long("Tell us about a system you scaled. What broke first?")];
    if (sub === "frontend") return [num("How many years have you spent building for the web?"), multi("What do you work in day to day?", tools(["React", "TypeScript", "Next.js", "CSS architecture", "Testing", "Accessibility"])), notice(), LOC, link("Portfolio, GitHub or something live you built"), long("Tell us about an interface you're proud of. What made it hard?")];
    if (sub === "other") return [num(`How many years have you been shipping software${roleText ? ` as ${withArticle(inSentence(roleText))}` : ""}?`), multi("Which tools do you use most?", skills.length ? tools([]) : ["React", "Node.js", "Python", "Go", "Postgres", "AWS"]), notice(), LOC, link("GitHub or a product you built"), long("Walk us through something you shipped end to end.")];
    return [num("How many years have you been shipping software?"), multi("Which of these have you used in production?", tools(["React", "Node.js", "Python", "Go", "Postgres", "AWS"])), notice(), LOC, link("GitHub or a product you built"), long("Walk us through something you shipped end to end.")];
  }
  if (family === "sales") {
    if (sub === "sdr") return [num("How many years in outbound?"), choice("Meetings booked in a typical month", ["Under 10", "10–20", "20–30", "30+"]), multi("Channels you're strongest on", ["Email", "LinkedIn", "Calls", "WhatsApp", "Events"]), notice(), LOC, long("Write the first line of a cold email to us.")];
    if (sub === "cs") return [num("How many years in customer success or account management?"), choice("Accounts you looked after at once", ["Under 20", "20–50", "50–100", "100+"]), notice(), LOC, long("Tell us about an account you saved.")];
    if (sub === "ae") return [num("How many years have you carried a quota?"), choice("Typical deal size you've closed", ["Under ₹10L", "₹10L–50L", "₹50L–1Cr", "Over ₹1Cr"]), choice("Last full year against quota", ["Below 80%", "80–99%", "100–120%", "Over 120%"]), multi("Who did you usually sell to?", ["Founders", "Engineering leaders", "Finance", "Operations", "Procurement"], false), notice(), LOC, long("Tell us about a deal you nearly lost, and how you won it back.")];
  }
  if (family === "design") {
    if (sub === "brand") return [link("Your portfolio", true), multi("What do you do most?", tools(["Brand identity", "Illustration", "Typography", "Motion", "Campaigns"]), false), notice(), LOC, long("Show us one piece and tell us what the brief was.")];
    if (sub === "research") return [num("How many years have you led user research?"), multi("Methods you've led", ["Interviews", "Usability tests", "Surveys", "Diary studies", "Card sorts"]), notice(), LOC, long("Tell us about a finding that changed a roadmap.")];
    if (sub === "product") return [link("Your portfolio", true), num("How many years have you designed shipped products?"), multi("Where are you strongest?", tools(["Interaction design", "Design systems", "Prototyping", "User research", "Visual design"]), false), notice(), LOC, long("Pick one project from your portfolio. What did you change your mind about?")];
  }
  const years = roleText
    ? `How many years have you worked as ${withArticle(inSentence(roleText))}?`
    : `How many years of ${(dept || "relevant").toLowerCase()} experience do you have?`;
  return [num(years), notice(), LOC, { type: "scale", title: "How well does this role match what you want next?", required: false, scale: { ...SCALE_DEFAULT } }, long("What would you want to own in your first six months?")];
}

/* ── the draft ── */

/* ── what the campaign's role spec says ──
   With the API a campaign has an approved role spec (its must-haves, years, place) and setup
   (notice period, days in office). A draft starts from those, so the form screens on what the
   recruiter already decided, not on a guess. */

/** The parts of a role spec a draft reads. Structural, so the API's `RoleSpec` fits as it is. */
export type SpecLike = {
  title?: string | null;
  yearsMin?: number | null;
  locations?: readonly string[];
  remoteOk?: boolean;
  requirements?: readonly { text: string; importance: "knockout" | "must" | "nice"; kind?: string }[];
};
/** The parts of a campaign's setup a draft reads. */
export type SetupLike = {
  mustHave?: readonly string[];
  niceToHave?: readonly string[];
  notice?: string | null;
  workMode?: string | null;
  officeDays?: number | null;
  locations?: readonly string[];
  expMin?: number | null;
};
/** What a draft takes from the role: each must-have as the recruiter wrote it, and the terms around it. */
export type RoleFacts = {
  title?: string;
  yearsMin?: number;
  musts: readonly { text: string; skill: boolean }[];
  nice: readonly string[];
  city?: string;
  remote?: boolean;
  daysInOffice?: number;
  /** The longest notice period the campaign accepts, in days (0 for immediate). */
  maxNoticeDays?: number;
};

const MAX_SPEC_MUSTS = 4;
const uniq = (xs: readonly string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

/** "Up to 60 days" → 60, "Immediate" → 0, "Any" or nothing → no limit. */
export function noticeDays(notice: string | null | undefined): number | undefined {
  const s = (notice ?? "").trim();
  if (!s || /^any/i.test(s)) return undefined;
  if (/^immediate/i.test(s)) return 0;
  const n = /(\d+)\s*days?/i.exec(s);
  return n ? Number(n[1]) : undefined;
}

/**
 * The spec first (its must-haves and knockouts, then its nice-to-haves), the campaign setup
 * where the spec is silent. Null when the role says nothing a form could screen on.
 */
export function roleFactsFrom(spec: SpecLike | null | undefined, setup?: SetupLike | null): RoleFacts | null {
  const specMust = (spec?.requirements ?? []).filter((r) => r.importance !== "nice").map((r) => ({ text: r.text.trim(), skill: !r.kind || r.kind === "skill" }));
  const musts = (specMust.length ? specMust : (setup?.mustHave ?? []).map((t) => ({ text: t.trim(), skill: true })))
    .filter((m) => m.text.length >= 2)
    .filter((m, i, all) => all.findIndex((x) => x.text.toLowerCase() === m.text.toLowerCase()) === i)
    .slice(0, MAX_SPEC_MUSTS);
  const specNice = (spec?.requirements ?? []).filter((r) => r.importance === "nice").map((r) => r.text.trim());
  const nice = uniq((specNice.length ? specNice : (setup?.niceToHave ?? []).map((t) => t.trim())).filter((t) => t.length >= 2)).slice(0, 8);
  const years = spec?.yearsMin ?? setup?.expMin ?? null;
  const place = [...(spec?.locations ?? []), ...(setup?.locations ?? [])].map((l) => l.split(/[·,]/)[0]!.trim()).find(Boolean);
  const remote = !!spec?.remoteOk || /remote/i.test(setup?.workMode ?? "");
  const days = /hybrid/i.test(setup?.workMode ?? "") && (setup?.officeDays ?? 0) > 0 ? setup!.officeDays! : undefined;
  const limit = noticeDays(setup?.notice);
  const title = spec?.title?.trim();
  const facts: RoleFacts = {
    ...(title ? { title } : {}),
    ...(years && years >= 1 ? { yearsMin: Math.round(years) } : {}),
    musts,
    nice,
    ...(place ? { city: place } : {}),
    ...(remote ? { remote: true } : {}),
    ...(days ? { daysInOffice: days } : {}),
    ...(limit !== undefined ? { maxNoticeDays: limit } : {}),
  };
  const said = musts.length || nice.length || facts.yearsMin || facts.maxNoticeDays !== undefined || facts.city || facts.daysInOffice || facts.remote;
  return said ? facts : null;
}

/** The notice-period options a campaign accepts: "Immediate", "15 days" … up to the limit. */
export function noticeAccepted(maxDays: number): string[] {
  return NOTICE.filter((o) => (/^immediate/i.test(o) ? 0 : Number(/(\d+)/.exec(o)?.[1] ?? Infinity)) <= maxDays);
}

/** A must-have asked as a yes or no, in the candidate's words. */
export function mustQuestion(m: { text: string; skill: boolean }): string {
  return m.skill ? `Have you worked hands-on with ${m.text}?` : `Does this describe you: ${m.text.replace(/[.!?]+$/, "")}?`;
}

export type DraftInput = { campaignId: string; family: Family; sub?: string; roleText?: string; ideal?: string; facts?: RoleFacts | null };

const AREA: Readonly<Record<string, string>> = { backend: "backend", frontend: "frontend", fullstack: "software", ae: "quota-carrying sales", sdr: "outbound sales", cs: "customer success", product: "product design", brand: "brand design", research: "user research" };

/** The sub-type's label ("Backend"), when one was picked and it isn't "Something else". */
export function subLabel(family: Family, sub?: string): string | null {
  if (family === "other" || !sub || sub === "other") return null;
  return SUBTYPES[family].find((o) => o.id === sub)?.label ?? null;
}

/** Names to try when "<Role> screening" is taken: the sub-type, but only
    when the campaign name doesn't already say it ("Platform SRE screening,
    Backend", never "Senior Backend Engineer screening, Backend"). The
    store falls back to "…, second draft". Never a date. */
export function draftNameAlts(name: string, family: Family, sub?: string, campaignName = ""): string[] {
  const s = subLabel(family, sub);
  if (!s) return [];
  const said = `${campaignName} ${name}`.toLowerCase();
  return said.includes(s.toLowerCase()) ? [] : [`${name}, ${s}`];
}

/** "customer support lead" → "Customer Support Lead"; short words stay low. */
export const titleCase = (s: string) =>
  s.trim().replace(/\s+/g, " ").split(" ").map((w, i) => (i > 0 && /^(of|and|the|for|in|at|to|a|an)$/i.test(w) ? w.toLowerCase() : /[A-Z]/.test(w.slice(1)) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

/** "Customer support lead" → "customer support lead", for inside a sentence
    (acronyms such as "SRE" keep their case). */
const inSentence = (s: string) => s.trim().split(/\s+/).map((w) => (/^[A-Z][a-z]/.test(w) ? w.toLowerCase() : w)).join(" ");

export function draftForm(i: DraftInput): Form {
  const c = campaignById(i.campaignId);
  const name = c?.name ?? "New role";
  const roleText = (i.roleText ?? "").trim();
  /* A role typed in chat ("Customer support lead") is the job the page is
     for, even inside a campaign named for something else. */
  const title = roleText ? titleCase(roleText) : roleTitle(name);
  const p = parseIdeal(i.ideal ?? "", i.family);
  /* With the API: what the role spec and campaign setup already say. */
  const f = i.facts ?? null;

  /* location: from the line first, then the role, then the campaign */
  const campLoc = c?.location ?? "";
  const campCity = campLoc.split(/[·,]/)[0]!.trim();
  const placeCity = p.city ?? f?.city;
  const days = p.daysInOffice ?? f?.daysInOffice;
  const remote = p.remote || (!placeCity && !!f?.remote) || (!placeCity && /remote/i.test(campLoc));
  const city = placeCity ?? (remote ? undefined : campCity || undefined);
  const locTitle = remote && !placeCity ? "Are you happy working remotely, mostly in IST hours?"
    : city && days ? `Can you work from ${city} ${days} days a week?`
    : city ? `Can you work from ${city}?`
    : "Are you happy working remotely, mostly in IST hours?";
  /* Must-haves come from the recruiter's own line first. Location and work
     authorisation stay must-haves only when the line says nothing to screen
     on, or (location) when the line names where the role sits. */
  const fromLine = idealMustHaves(i.ideal ?? "", i.family);
  /* The role's own must-haves come next, unless the line already asked the same. */
  const fromRole = (f?.musts ?? []).filter((m) => !fromLine.some((l) => l.label.toLowerCase().startsWith(m.text.toLowerCase())));
  const screening = fromLine.length + fromRole.length > 0;
  const lineNamesPlace = !!(p.city || p.daysInOffice || p.remote || f?.city || f?.daysInOffice || f?.remote);
  const locMust = !screening || lineNamesPlace;
  const authMust = !screening;
  const loc: Q = { type: "yesno", title: locTitle, required: true, ...(locMust ? { accept: ["Yes"] } : {}) };
  const auth: Q = { type: "yesno", title: "Are you authorised to work in India?", required: true, ...(authMust ? { accept: ["Yes"] } : {}) };
  const lineQs: Q[] = [
    ...fromRole.map((m): Q => ({ type: "yesno", title: mustQuestion(m), required: true, accept: ["Yes"] })),
    ...fromLine.map((m): Q => ({ type: "yesno", title: m.title, required: true, accept: ["Yes"] })),
  ];
  /* Tools the role names go first in "which of these have you used". */
  const named = f ? [...f.musts.filter((m) => m.skill).map((m) => m.text), ...f.nice].filter((t) => t.length <= 28) : [];
  const skills = [...new Set([...p.skills, ...named])];
  const flav = flavourOf(i.family, c?.department, i.sub, roleText || name);
  const domain = idealDomain(i.ideal ?? "");
  const slots = template(i.family, i.sub, roleText, c?.department ?? "", skills);
  /* The ideal-hire line names a domain ("payments at scale"): ask about it in
     the candidate's own words, just before the open question. */
  const domainQ: Q | null = domain ? { type: "long", title: domain.question, required: false } : null;
  const flat = slots.flatMap((s) => (s === LOC ? [...lineQs, loc, auth] : [s]));
  if (domainQ) { const at = flat.findIndex((q) => q.type === "long"); flat.splice(at < 0 ? flat.length : at, 0, domainQ); }
  /* The role's minimum years and longest notice period become must-haves on the questions that ask. */
  if (f?.yearsMin) { const y = flat.find((q) => q.type === "number"); if (y) y.atLeast = f.yearsMin; }
  if (f?.maxNoticeDays !== undefined) {
    const n = flat.find((q) => q.type === "choice" && q.options?.join() === NOTICE.join());
    if (n) n.accept = noticeAccepted(f.maxNoticeDays);
  }
  const questions: Question[] = flat.map((q) => ({ ...q, id: newId("q") }));

  const area = (i.sub && i.sub !== "other" ? AREA[i.sub] : undefined) ?? (roleText ? inSentence(roleText) : (c?.department ?? "relevant").toLowerCase());
  /* A line with no years or named tools still shapes the role: it becomes a
     requirement in the recruiter's own words, so they can see it was used. */
  const ownLine = !p.years && !p.skills.length ? lineRequirement(i.ideal ?? "") : null;
  const years = p.years ?? f?.yearsMin;
  const tools = [...new Set([...p.skills, ...(f ? f.musts.filter((m) => m.skill).map((m) => m.text) : [])])];
  const reqs = [
    ...(years ? [`${years}+ years of ${area} experience`] : []),
    ...(tools.length ? [`Hands-on with ${and(tools.slice(0, 3))}`] : []),
    ...(ownLine ? [ownLine] : domain ? [`Experience with ${domain.label}`] : []),
    ...LOOKING[flav],
  ];
  const description = INTRO[flav](title);
  const now = Date.now();
  return {
    id: newId(`${i.campaignId}-f`),
    campaign: i.campaignId,
    name: `${title} screening`,
    title,
    description,
    status: "draft",
    sent: 0,
    questions,
    accent: TINTS.ember.fill,
    theme: "ember",
    origin: "chat",
    role: {
      about: teamAbout(c),
      responsibilities: [...DOING[flav]],
      requirements: reqs,
      team: c?.department || undefined,
      location: placeCity ? (days ? `${placeCity} · ${days} days in office` : placeCity) : campLoc || undefined,
      workType: "Full-time",
    },
    createdAt: now,
    updatedAt: now,
  };
}

/* ── builder templates (the New-form dialog) ── */

export const TEMPLATES: readonly { id: string; name: string; hint: string; make: (role: string) => Question[] }[] = [
  {
    id: "screen", name: "Screening", hint: "Experience, notice period, location fit",
    make: (role) => [
      { id: newId("q"), type: "number", title: `How many years of ${role.toLowerCase()} experience do you have?`, required: true, unit: "years" },
      { id: newId("q"), type: "choice", title: "What's your notice period?", required: true, options: [...NOTICE] },
      { id: newId("q"), type: "yesno", title: "Are you comfortable with the role's location?", required: true, accept: ["Yes"] },
    ],
  },
  {
    id: "avail", name: "Availability", hint: "When they can talk, and how",
    make: () => [
      { id: newId("q"), type: "multi", title: "Which days work for a 30 minute call?", required: true, options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
      { id: newId("q"), type: "choice", title: "Preferred time", required: true, options: ["Morning", "Afternoon", "Evening"] },
    ],
  },
  { id: "blank", name: "Blank", hint: "Start from nothing", make: () => [newQuestion("short")] },
];
