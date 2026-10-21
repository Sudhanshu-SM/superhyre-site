/**
 * Reading a request to start a campaign: what the person already said is an answer, and is never asked again.
 * Pure, with nothing from the stores in it, so every phrasing can be listed in a table and tested on its own
 * (src/__tests__/campaignAsk.test.ts). `clarify.ts` puts these together with the workspace's clients and cities.
 */

/* ── companies ── */

/** Words at the end of a company's name that say what kind of company it is, not which: "Pvt Ltd", "Technologies". */
const KIND_WORDS = new Set(
  (
    "ltd limited pvt private inc incorporated llc llp lp corp corporation co company plc gmbh sa ag bv pte " +
    "technologies technology tech solutions services systems software labs group holdings india global"
  ).split(" "),
);

/** A company's name without capitals, punctuation or its kind ("Zlice Technology PVT Limited" is "zlice"). */
export function companyKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && KIND_WORDS.has(words[words.length - 1] ?? "")) words.pop();
  return words.join(" ");
}

/** Whether two names are one company, whatever the capitals, the spacing and the "Pvt Ltd" after it. */
export const sameCompany = (a: string, b: string): boolean => {
  const k = companyKey(a);
  return k !== "" && k === companyKey(b);
};

/** The company among `named` that `text` is the name of. */
export function companyIn<T extends { name: string }>(text: string, named: readonly T[]): T | undefined {
  return named.find((c) => sameCompany(c.name, text));
}

/** Words that are too common to say which company a name is ("Tech", "First", "Global"). */
const COMMON = new Set("tech first global new next one the my our your".split(" "));

/** The company among `named` that the words say by name, somewhere in them ("for Cobalt Payments" is "Cobalt Payments Pvt Ltd"). */
export function companySaid<T extends { name: string }>(said: string, named: readonly T[]): T | undefined {
  const hay = ` ${said.toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ")} `;
  return [...named]
    .sort((a, b) => companyKey(b.name).length - companyKey(a.name).length)
    .find((c) => {
      const k = companyKey(c.name);
      if (k.length < 3 || (!k.includes(" ") && (COMMON.has(k) || k.length < 4))) return false;
      return hay.includes(` ${k} `);
    });
}

/* ── labelled fields: "client: Cobalt Payments, role: Backend Engineer, city: Pune" ── */

type Field = "client" | "role" | "city" | "exp" | "comp" | "openings" | "skills" | "mode";
const LABELS: ReadonlyArray<[RegExp, Field]> = [
  [/^(?:client|company|customer)$/i, "client"],
  [/^(?:role|position|title|job)$/i, "role"],
  [/^(?:city|location|place|based\s+in)$/i, "city"],
  [/^(?:exp|experience|yoe)$/i, "exp"],
  [/^(?:ctc|salary|budget|comp|compensation|pay)$/i, "comp"],
  [/^(?:openings?|hires|headcount|vacancies)$/i, "openings"],
  [/^(?:skills|must[- ]?haves?|stack|requirements?)$/i, "skills"],
  [/^(?:work\s*mode|mode)$/i, "mode"],
];
const LABEL_AT = /\b(client|company|customer|role|position|title|job|city|location|place|based\s+in|exp|experience|yoe|ctc|salary|budget|comp|compensation|pay|openings?|hires|headcount|vacancies|skills|must[- ]?haves?|stack|requirements?|work\s*mode|mode)\s*[:=]/gi;

/** The `label: value` pairs in the words, and the words with them taken out. */
export function takeLabelled(text: string): { rest: string; fields: Partial<Record<Field, string>> } {
  const marks = [...text.matchAll(LABEL_AT)];
  if (!marks.length) return { rest: text, fields: {} };
  const fields: Partial<Record<Field, string>> = {};
  let rest = text.slice(0, marks[0]?.index ?? 0);
  marks.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = marks[i + 1]?.index ?? text.length;
    const field = LABELS.find(([re]) => re.test(m[1]?.trim() ?? ""))?.[1];
    // A value runs to the end of its clause: the next label, or a full stop that ends a sentence.
    const raw = text.slice(from, to);
    const stop = /[.;\n|]\s+(?=[A-Z])|[;\n|]/.exec(raw);
    const value = (stop ? raw.slice(0, stop.index) : raw).trim().replace(/[\s,;.|]+$/, "");
    if (field && value && fields[field] === undefined) fields[field] = value;
    if (stop) rest += ` ${raw.slice(stop.index + stop[0].length)}`;
  });
  return { rest: rest.replace(/\s+/g, " ").trim(), fields };
}

/* ── figures ── */

/** "5-8 years", "5 to 8 yrs of experience", "5+ years": as the range the draft reads ("5 to 8", "5"), with the words taken out. */
export function takeExperience(text: string): { rest: string; exp: string | null } {
  const range = /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\b(?:\s+(?:of\s+)?(?:experience|exp)\b)?/i.exec(text);
  const single = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?|yoe)\b(?:\s+(?:of\s+)?(?:experience|exp)\b)?/i.exec(text);
  const hit = range ?? single;
  if (!hit) return { rest: text, exp: null };
  const exp = range ? `${hit[1]} to ${hit[2]}` : `${hit[1]}`;
  return { rest: tidyGaps(text.replace(hit[0], " ")), exp };
}

/**
 * "30-45 LPA", "₹30L to 45L", "ctc 30 to 45 lakhs", "40 LPA": as the range the draft reads ("30 to 45", "40"), with the
 * words taken out. "up to 60 LPA" is the top of the range alone (`top`).
 */
export function takeCtc(text: string): { rest: string; comp: string | null; top: string | null } {
  const unit = String.raw`(?:lpa|lakhs?|lacs?|l\b|lac\b)`;
  const lead = String.raw`(?:(?:ctc|salary|budget|comp(?:ensation)?|pay)\s*(?:of|is|:|=|-)?\s*)?(?:₹|rs\.?|inr)?\s*`;
  const start = String.raw`(?<![\p{L}\p{N}.])`;
  const range = new RegExp(String.raw`${start}${lead}(\d+(?:\.\d+)?)\s*${unit}?\s*(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*${unit}`, "iu").exec(text);
  const single = new RegExp(String.raw`${start}${lead}(\d+(?:\.\d+)?)\s*${unit}`, "iu").exec(text);
  const upTo = new RegExp(String.raw`${start}(?:up\s*to|upto|max(?:imum)?|below|under|not\s+more\s+than)\s*${lead}(\d+(?:\.\d+)?)\s*${unit}`, "iu").exec(text);
  if (upTo) return { rest: tidyGaps(text.replace(upTo[0], " ")), comp: null, top: upTo[1] ?? null };
  const hit = range ?? single;
  if (!hit) return { rest: text, comp: null, top: null };
  const comp = range ? `${hit[1]} to ${hit[2]}` : `${hit[1]}`;
  return { rest: tidyGaps(text.replace(hit[0], " ")), comp, top: null };
}

/** "must have Go, Kafka and Postgres", "must know SQL", "must-haves Go, Kafka", "skills: Go": the must-haves as typed, with the words taken out. */
export function takeSkills(text: string): { rest: string; skills: string | null } {
  const m = /[\s,;.–—-]*\b(?:must[- ]?haves?|musts|skills|(?:must|should)\s+(?:know|have)|needs?\s+to\s+know|knowing|skilled\s+in|proficient\s+in)\b\s*(?::|=|-|–|—|are|is|include|includes)?\s*(.+)$/i.exec(text);
  const skills = m?.[1]?.trim().replace(/[\s,;.|]+$/, "") ?? "";
  if (!m || !skills) return { rest: text, skills: null };
  return { rest: tidyGaps(text.slice(0, m.index)), skills };
}

/** A clause that only says how they work ("hybrid", "fully remote", "on-site"). */
export const MODE_CLAUSE = /^(?:fully\s+|completely\s+)?(?:remote(?:ly)?|hybrid|on[\s-]?site|in[\s-]office|wfh|work(?:ing)?\s+from\s+(?:home|office|anywhere)|wfo)$/i;

/** A clause that only says how many ("2 openings", "hiring 3", "need two", "4 positions"). */
export const COUNT_CLAUSE = /^(?:(?:to\s+)?(?:hire|hiring|need|needs|openings?|headcount|vacancies|positions?)\s*(?::|=|of)?\s*)?(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:openings?|hires?|positions?|vacancies|seats?|slots?|people)?$/i;

/** The words with the gaps a taken-out phrase leaves closed up: no doubled commas, no dangling ones at the ends. */
export function tidyGaps(text: string): string {
  return text
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(?:\s*,){2,}/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/^[\s,;–—-]+|[\s,;–—-]+$/g, "")
    .trim();
}

/* ── on behalf of, and the company's own role ── */

/** "on behalf of Cobalt Payments": the company, and the words with it taken out. */
export function takeBehalf(text: string): { rest: string; client: string | null } {
  const m = /\bon\s+behalf\s+of\s+(.+?)(?=\s+(?:for|to\s+(?:hire|recruit|find)|hiring|as)\b|[,;]|$)/i.exec(text);
  if (!m?.[1]) return { rest: text, client: null };
  return { rest: tidyGaps(text.replace(m[0], " ")), client: m[1].trim() };
}

/** "Cobalt Payments' Senior Backend Engineer", "Razorpay's SRE": the company and the role. */
export function splitPossessive(text: string): { client: string; role: string } | null {
  const m = /^((?:[A-Z0-9][\p{L}0-9&.-]*)(?:\s+[A-Z0-9][\p{L}0-9&.-]*){0,3})['’]s?\s+(\S.*)$/u.exec(text.trim());
  return m?.[1] && m[2] ? { client: m[1].trim(), role: m[2].trim() } : null;
}

/* ── the team a role is in ── */

/** The department a role's own words say, or "" when they don't. */
export function departmentFor(role: string): string {
  const s = role.toLowerCase();
  if (/\b(data|analytics|analyst|scientist|ml|machine learning|bi)\b/.test(s)) return "Data";
  if (/\b(designer|design|ux|ui|illustrator|creative)\b/.test(s)) return "Design";
  if (/\bproduct\s+(?:manager|owner|lead|analyst|designer)\b|\bpm\b|\bproduct\b/.test(s)) return "Product";
  if (/\b(sales|marketing|growth|account\s+executive|sdr|bdr|business\s+development|customer\s+success|partnerships?)\b/.test(s)) return "Go to market";
  if (/\b(finance|accountant|accounts|controller|auditor|fp&a|treasury)\b/.test(s)) return "Finance";
  if (/\b(operations|ops|supply\s+chain|logistics|admin|hr|people)\b/.test(s) && !/\b(devops|mlops|secops|sre)\b/.test(s)) return "Operations";
  if (/\b(engineer|engineers|developer|devops|sre|architect|backend|frontend|front-end|back-end|full[- ]?stack|qa|sdet|android|ios|mobile|platform|security|swe|programmer|tester)\b/.test(s)) return "Engineering";
  return "";
}

/* ── the client a job description names ── */

/** Words that make a "company" something else: a role, a team, a way of working. */
const NOT_A_COMPANY_WORD = new Set(
  (
    "engineer engineers engineering developer manager analyst designer scientist architect intern lead team role position " +
    "opening openings hire hiring candidate experience remote hybrid onsite senior junior principal staff immediate urgent " +
    "confidential undisclosed stealth anonymous tbd client customer company our your the a an this that " +
    "tester executive associate consultant specialist officer director head recruiter administrator accountant writer " +
    "coordinator representative technician programmer sre qa devops fullstack job description vacancy requirement " +
    "requirements responsibilities location overview summary jd about us you what who why how we " +
    "backend frontend mobile ios android quality assurance support sales marketing finance hr operations"
  ).split(" "),
);
/** Cities a role is "for" or "at", never a company. */
const PLACE_WORD = new Set(
  (
    "bengaluru bangalore mumbai delhi gurgaon gurugram noida pune hyderabad chennai kolkata ahmedabad jaipur kochi " +
    "ncr india singapore dubai london berlin sydney toronto usa uk uae"
  ).split(" "),
);

/** A full stop that ends a sentence ("Zetalabs. Mumbai, hybrid"), not one that ends "Pvt." or "Inc.". */
const SENTENCE_END = /(?<!\b(?:Inc|Pvt|Ltd|Co|Corp|Llc|Llp|Pty|St|Mr|Ms|Dr))\.\s+(?=[\p{Lu}0-9])/iu;

/** A company name taken from a line: cut where the name ends (a bracket, a bar, a comma), and nothing that is not a name. */
function companyFrom(raw: string | undefined, own: readonly string[], strict = false): string | null {
  const cut = (raw ?? "").replace(/[*_`]+/g, "").split(/\s*(?:[|(\[;,•·]|\s[–—-]\s)/)[0]?.trim() ?? "";
  const name = (cut.split(SENTENCE_END)[0] ?? "").replace(/^(?:our\s+client|the\s+client|client)\s+/i, "").replace(/[\s.:]+$/, "");
  const words = name.split(/\s+/).filter(Boolean);
  if (name.length < 2 || name.length > 60 || words.length > 6 || /^(?:https?:|www\.)/i.test(name)) return null;
  const lower = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  if (lower.every((w) => NOT_A_COMPANY_WORD.has(w) || PLACE_WORD.has(w))) return null;
  if (lower.some((w) => NOT_A_COMPANY_WORD.has(w) && !KIND_WORDS.has(w)) && (strict || words.length <= 2)) return null;
  // "Software", "Technologies": what kind of company, with no name.
  if (lower.every((w) => KIND_WORDS.has(w))) return null;
  if (PLACE_WORD.has(lower[0] ?? "")) return null;
  if (own.some((o) => o.trim() && sameCompany(o, name))) return null;
  return name;
}

/** A company's name as capitalised words ("Tessellate Analytics", "Cobalt & Co"), up to four of them. */
const CAPITALISED = String.raw`((?:[A-Z0-9][\p{L}0-9&.'-]*)(?:\s+(?:&\s+)?[A-Z0-9][\p{L}0-9&.'-]*){0,3})`;
const STRONG_LABEL = /^[\s>*#•\-–—]*(?:\*\*)?(?:end\s+client|client(?:\s+name)?|customer|hiring\s+for|on\s+behalf\s+of)(?:\*\*)?(?:\s*[:=]|\s+[–—-])\s*(.+)$/i;
const WEAK_LABEL = /^[\s>*#•\-–—]*(?:\*\*)?(?:hiring\s+company|company(?:\s+name)?|employer|organi[sz]ation)(?:\*\*)?\s*[:=]\s*(.+)$/i;
const INLINE_CLIENT = /\b(?:end\s+)?client(?:\s+name)?\s*[:=]\s*([^\n|;,(•]+)/i;
const BEHALF = /\bon\s+behalf\s+of\s+(.+?)(?=\s+(?:for|to\s+(?:hire|recruit|find))\b|[,;.(]|$)/i;
const FOR_AT = new RegExp(String.raw`\b(?:for|at)\s+(?:our\s+client\s+|the\s+client\s+)?${CAPITALISED}`, "u");
const IS_HIRING = new RegExp(String.raw`^${CAPITALISED}\s+(?:is|are)\s+(?:hiring|looking|seeking)\b`, "u");
/** "About Quillpad Software": the company's own paragraph. Not "About us", "About the role". */
const ABOUT = new RegExp(String.raw`^(?:[#*\s]*)About\s+(?!(?:us|the|you|this|our|your|me|role|team|job)\b)${CAPITALISED}[\s:.*]*$`, "u");
/** A first line that is only a name: capitalised words, then perhaps "Inc", "Pvt Ltd", "Software". */
const NAME_LINE = new RegExp(String.raw`^${CAPITALISED}$`, "u");

/**
 * The client a job description names, for the set-up to confirm rather than ask blank: a "Client:" line, "on behalf of",
 * or a company in the heading ("Senior Data Engineer for Tessellate Analytics", "Tessellate Analytics is hiring").
 * `own` are the names that are the person's own company (their organisation), which are never the client. Null when the
 * description names no one; a guess is only a question for the person to answer, so only a plain statement counts.
 */
export function clientInJd(jd: string | null | undefined, own: readonly string[] = []): string | null {
  const lines = (jd ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
  if (!lines.length) return null;
  const head = lines.slice(0, 3);
  for (const label of [STRONG_LABEL, WEAK_LABEL]) {
    for (const line of lines) {
      const found = companyFrom(label.exec(line)?.[1], own);
      if (found) return found;
    }
  }
  for (const line of lines.slice(0, 15)) {
    const found = companyFrom(INLINE_CLIENT.exec(line)?.[1], own);
    if (found) return found;
  }
  for (const line of lines.slice(0, 15)) {
    const found = companyFrom(BEHALF.exec(line)?.[1], own);
    if (found) return found;
  }
  for (const line of head) {
    const heading = line.replace(/^[#*\s]+|[*\s]+$/g, "");
    const found = companyFrom(FOR_AT.exec(heading)?.[1], own) ?? companyFrom(IS_HIRING.exec(heading)?.[1], own);
    if (found) return found;
  }
  // "About Quillpad Software", and "Quillpad Software is hiring ..." further down.
  for (const line of lines.slice(0, 15)) {
    const found = companyFrom(ABOUT.exec(line)?.[1], own, true) ?? companyFrom(IS_HIRING.exec(line)?.[1], own);
    if (found) return found;
  }
  // The first line, when it is only a name and not a job title ("Quillpad Software", "Cobalt Payments Pvt. Ltd.").
  const first = (lines[0] ?? "").replace(/^[#*\s]+|[*\s.]+$/g, "");
  if (first.length <= 50 && !/[:|(@]/.test(first)) return companyFrom(NAME_LINE.exec(first)?.[1], own, true);
  return null;
}
