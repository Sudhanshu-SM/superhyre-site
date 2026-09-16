import type { Hue } from "./orchestrator";

/**
 * brief — reading the structure out of a recruiter's prose.
 *
 * ── THE IDEA ────────────────────────────────────────────────────────────────
 * A sourcing brief is a structured query wearing prose clothing. "Staff
 * engineers who have scaled Postgres past 10TB, remote India" carries a
 * seniority, a skill, a threshold and a location — and every product makes you
 * choose between typing it as prose (fast to write, invisible to verify) or
 * filling a form (verifiable, miserable to write).
 *
 * The research says the prose side is worse than it looks: conversational
 * input measures 30-60s per message in usability tests, mostly spent
 * re-reading and re-typing because you cannot tell what was understood.
 *
 * So this reads the text and returns the spans it RECOGNISES. The composer
 * underlines them in their facet's colour, which means:
 *
 *   - you write naturally, no form
 *   - you can see you were understood without re-reading your own sentence
 *   - what is NOT underlined is visibly unrecognised, which is actionable
 *   - a recognised span can be corrected without retyping the sentence
 *
 * ── WHY THIS IS HONEST WHERE THE OLD HIGHLIGHT WAS NOT ──────────────────────
 * The prompt used to wash its "leading clause", taken by a string split. That
 * dressed a `split` up as comprehension and, on a short prompt, washed the
 * whole message. It was deleted.
 *
 * This is the opposite: it highlights ONLY what it can match against a fixed
 * vocabulary of real recruiting terms, and it highlights nothing else. The
 * claim it makes — "these words are in my vocabulary" — is exactly the claim
 * it can support. No model is consulted, nothing is inferred, and the facets
 * are the ones a sourcing query genuinely has.
 *
 * When a real parser exists it replaces `read` and the UI does not change,
 * because the UI already only trusts the spans it is handed.
 */

export type Facet =
  /** Staff, Senior, Principal — the level, not the title. */
  | "seniority"
  /** A technology, language or system. */
  | "skill"
  /** Where, including remote arrangements. */
  | "location"
  /** A magnitude the role has to have met — 10TB, 40 engineers, Series B. */
  | "scale"
  /** A named company or a shape of company. */
  | "company"
  /** How long they have been doing it. */
  | "tenure";

/** Facet colours come from the measured seven. Each facet is one state. */
export const FACET_HUE: Record<Facet, Hue> = {
  seniority: "violet",
  skill: "blue",
  location: "teal",
  scale: "amber",
  company: "brand",
  tenure: "sage",
};

/**
 * The order a brief is read in, and the order the gauge shows.
 *
 * Not alphabetical and not the order they appear in a sentence: this is the
 * order a recruiter actually specifies a role — who, doing what, at what
 * scale, where, from what kind of company, for how long. The gauge is a
 * checklist of a brief's parts, so it has to read like one.
 */
export const FACET_ORDER: readonly Facet[] = [
  "seniority", "skill", "scale", "location", "company", "tenure",
];

/**
 * What to ask for when a facet is empty.
 *
 * Phrased as the thing missing, not as an instruction — "Seniority" over
 * "Add a seniority". The gauge is a reading of the brief, and a reading does
 * not give orders.
 */
export const FACET_PROMPT: Record<Facet, string> = {
  seniority: "Level",
  skill: "Skills",
  scale: "Scale",
  location: "Location",
  company: "Background",
  tenure: "Experience",
};

export const FACET_LABEL: Record<Facet, string> = {
  seniority: "Seniority",
  skill: "Skill",
  location: "Location",
  scale: "Scale",
  company: "Company",
  tenure: "Tenure",
};

export type Match = {
  /** Index into the source text. */
  start: number;
  end: number;
  facet: Facet;
  /** The matched text, as the user typed it. */
  text: string;
  /**
   * What this narrows, in the product's own words — shown when the span is
   * inspected. Never a restatement of `text`, which the user can already see.
   */
  means: string;
};

/**
 * The vocabulary.
 *
 * Deliberately a fixed list rather than a regex soup. A list can be audited,
 * extended by a recruiter, and — the point — it is the honest boundary of what
 * the highlight is allowed to claim. Order does not matter; the matcher sorts
 * by length so "Staff engineer" wins over "engineer".
 */
type Term = { match: readonly string[]; facet: Facet; means: string };

const TERMS: readonly Term[] = [
  // ── seniority ──
  { match: ["staff", "staff engineer", "staff-level"], facet: "seniority",
    means: "Staff level — above senior, usually 8+ years" },
  { match: ["principal"], facet: "seniority", means: "Principal level" },
  { match: ["senior"], facet: "seniority", means: "Senior level" },
  { match: ["lead", "tech lead", "team lead"], facet: "seniority",
    means: "Leads a team, not necessarily a manager" },
  { match: ["manager", "engineering manager", "em"], facet: "seniority",
    means: "People management" },
  { match: ["junior", "grad", "graduate"], facet: "seniority", means: "Early career" },

  // ── skill ──
  { match: ["postgres", "postgresql"], facet: "skill", means: "PostgreSQL" },
  { match: ["kafka"], facet: "skill", means: "Apache Kafka" },
  { match: ["go", "golang"], facet: "skill", means: "Go" },
  { match: ["rust"], facet: "skill", means: "Rust" },
  { match: ["python"], facet: "skill", means: "Python" },
  { match: ["typescript", "ts"], facet: "skill", means: "TypeScript" },
  { match: ["kubernetes", "k8s"], facet: "skill", means: "Kubernetes" },
  { match: ["terraform"], facet: "skill", means: "Terraform" },
  { match: ["aws"], facet: "skill", means: "Amazon Web Services" },
  { match: ["sre", "site reliability"], facet: "skill", means: "Site reliability engineering" },
  { match: ["backend", "back-end"], facet: "skill", means: "Backend engineering" },
  { match: ["frontend", "front-end"], facet: "skill", means: "Frontend engineering" },
  { match: ["ios", "swift"], facet: "skill", means: "iOS" },
  { match: ["android", "kotlin"], facet: "skill", means: "Android" },
  { match: ["distributed systems"], facet: "skill", means: "Distributed systems" },

  // ── location ──
  { match: ["remote"], facet: "location", means: "Remote — anywhere unless narrowed" },
  { match: ["bangalore", "bengaluru"], facet: "location", means: "Bangalore, India" },
  { match: ["india"], facet: "location", means: "India" },
  { match: ["hyderabad"], facet: "location", means: "Hyderabad, India" },
  { match: ["pune"], facet: "location", means: "Pune, India" },
  { match: ["london"], facet: "location", means: "London, UK" },
  { match: ["berlin"], facet: "location", means: "Berlin, Germany" },
  { match: ["new york", "nyc"], facet: "location", means: "New York, US" },
  { match: ["hybrid"], facet: "location", means: "Hybrid — some days on site" },
  { match: ["onsite", "on-site"], facet: "location", means: "On site" },

  // ── company ──
  { match: ["series a"], facet: "company", means: "Series A — roughly 20-70 people" },
  { match: ["series b"], facet: "company", means: "Series B — roughly 70-200 people" },
  { match: ["series c"], facet: "company", means: "Series C or later" },
  { match: ["faang", "big tech"], facet: "company", means: "Large technology companies" },
  { match: ["startup"], facet: "company", means: "Startup" },
  { match: ["fintech"], facet: "company", means: "Financial technology" },
  { match: ["payments"], facet: "company", means: "Payments" },

  // ── tenure ──
  { match: ["years"], facet: "tenure", means: "Time in role or with a technology" },
];

/**
 * Patterns, for the facets a word list cannot cover.
 *
 * Only two, and both are genuinely lexical rather than semantic: a magnitude
 * with a unit, and a span of years. Anything needing real understanding is
 * deliberately absent — an unrecognised phrase is a truthful outcome.
 */
const PATTERNS: readonly { re: RegExp; facet: Facet; means: string }[] = [
  { re: /\b\d+(?:\.\d+)?\s?(?:tb|gb|pb|k|m|b|bn|million|billion)\b/gi,
    facet: "scale", means: "A magnitude the candidate has worked at" },
  { re: /\b\d+\+?\s?(?:yrs?|years?)\b/gi,
    facet: "tenure", means: "Time in role or with a technology" },
  { re: /\b\d+\+?\s?(?:engineers?|people|reports?)\b/gi,
    facet: "scale", means: "Size of team they operated at" },
];

/** Word-boundary test that treats hyphens as part of a term, unlike \b. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[a-z0-9+#.]/i.test(ch);
}

/**
 * Read the recognised spans out of `text`.
 *
 * Longest match wins and matches never overlap: a highlight that covered
 * "Staff" and "Staff engineer" separately would paint two underlines on the
 * same words and claim two facets for one phrase.
 */
export function read(text: string): readonly Match[] {
  if (!text.trim()) return [];
  const lower = text.toLowerCase();
  const found: Match[] = [];

  /* Longest first, so a specific term consumes the ground a general one would
     otherwise claim. Flattened once here rather than sorting TERMS itself,
     because the source list is grouped by facet for a human to read. */
  const flat = TERMS.flatMap((t) => t.match.map((m) => ({ m, facet: t.facet, means: t.means })))
    .sort((a, b) => b.m.length - a.m.length);

  const taken = new Array<boolean>(text.length).fill(false);
  const claim = (start: number, end: number) => {
    for (let i = start; i < end; i++) if (taken[i]) return false;
    for (let i = start; i < end; i++) taken[i] = true;
    return true;
  };

  /* ── PATTERNS FIRST, AND THAT ORDER IS LOAD-BEARING ──
     A pattern is inherently more specific than a bare word: "5 years" carries
     a quantity, "years" does not. Running the word list first let the bare
     term claim the ground and the richer match then found it taken, so "5
     years" highlighted as "years" and the number was dropped. Caught by test.
     Ground is claimed once, so whoever runs first wins — which means the more
     specific reader has to run first. */
  for (const { re, facet, means } of PATTERNS) {
    /* Fresh lastIndex per call: a module-level /g regex keeps its cursor
       between invocations and silently skips the first match on the next run. */
    re.lastIndex = 0;
    for (;;) {
      const hit = re.exec(text);
      if (!hit) break;
      const start = hit.index;
      const end = start + hit[0].length;
      if (!claim(start, end)) continue;
      found.push({ start, end, facet, text: hit[0], means });
    }
  }


  for (const { m, facet, means } of flat) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(m, from);
      if (at === -1) break;
      from = at + m.length;
      /* Whole words only. Without this, "go" matches inside "Django" and the
         highlight starts making claims about letters rather than terms. */
      if (!isBoundary(text[at - 1])) continue;

      /* ── TOLERATE A TRAILING PLURAL ──
         A recruiter writes "Staff engineers", not "Staff engineer", and the
         vocabulary is stored singular because that is how the terms read in a
         list a human maintains. Without this, "Staff engineers" matched only
         "staff" and the highlight under-claimed the phrase the user actually
         typed — caught by test, not by reading.
         Only ONE trailing `s`, and only when a boundary follows it, so this
         extends a term rather than starting to guess at morphology. */
      let end = at + m.length;
      if (!isBoundary(text[end])) {
        if (text[end] !== "s" || !isBoundary(text[end + 1])) continue;
        end += 1;
      }

      if (!claim(at, end)) continue;
      found.push({ start: at, end, facet, text: text.slice(at, end), means });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * The text split into highlighted and plain runs, ready to render.
 *
 * Returned as a flat list rather than the caller walking `read`'s output
 * against the string, because the composer needs EXACTLY the same segmentation
 * in two places — the overlay behind the textarea and the facet summary below
 * it — and two implementations of that walk would drift.
 */
export type Run = { text: string; match?: Match };

export function segment(text: string): readonly Run[] {
  const matches = read(text);
  if (matches.length === 0) return text ? [{ text }] : [];
  const runs: Run[] = [];
  let at = 0;
  for (const m of matches) {
    if (m.start > at) runs.push({ text: text.slice(at, m.start) });
    runs.push({ text: text.slice(m.start, m.end), match: m });
    at = m.end;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}
