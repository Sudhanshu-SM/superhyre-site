import type { RoleSpec } from "./api/agent";
import type { CampaignSetup } from "./campaignsData";
import { ALL_FILTERS, isActive } from "./filters";
import type { Value, Values } from "./filters";

/**
 * A campaign's search filters, live.
 *
 * The campaign's search reads its role spec (location, years, seniority, skills), and over it whatever the
 * recruiter set in the filters (`setup.filters`, saved with PUT /v1/campaigns/:id/filters). The dialog shows
 * the two together, and what is saved is only what differs from the spec, so a new job description still
 * moves the filters the recruiter never touched. The server reads them the same way (withRecruiterFilters in
 * sourcing/crustdata.ts); this is its mirror, for what is shown.
 */

const SENIORITY_OPTIONS = ["Intern", "Entry level", "Senior", "Manager", "Director", "VP", "C-level", "Founder or partner"];

/** The dialog's own word for a seniority a spec or brief states in free text; null when it names none. */
export function seniorityOf(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const exact = SENIORITY_OPTIONS.find((o) => o.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  if (/\bintern/i.test(t)) return "Intern";
  if (/\b(junior|jr|entry|graduate|fresher|associate)\b/i.test(t)) return "Entry level";
  if (/\b(senior|sr|staff|principal|lead)\b/i.test(t)) return "Senior";
  if (/\bmanager\b/i.test(t)) return "Manager";
  if (/\bdirector\b/i.test(t)) return "Director";
  if (/\b(vp|vice president)\b/i.test(t)) return "VP";
  if (/\b(cto|ceo|cxo|chief)\b/i.test(t)) return "C-level";
  return null;
}

const dedupe = (xs: readonly string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** What the approved role spec puts in the search, as the dialog's values (the server's `specToValues`, without its margins). */
export function valuesFromSpec(spec: RoleSpec): Values {
  const out: Record<string, Value> = {};
  const s = seniorityOf(spec.seniority);
  if (s) out.seniority = [s];
  if (spec.locations.length && !spec.remoteOk) out.cities = dedupe(spec.locations);
  if (spec.yearsMin != null || spec.yearsMax != null) out.years = [Math.max(0, spec.yearsMin ?? 0), Math.min(25, spec.yearsMax ?? 25)];
  const must = spec.requirements.flatMap((r) => (r.importance === "knockout" && r.skill ? [r.skill] : []));
  const nice = spec.requirements.flatMap((r) => (r.importance !== "knockout" && r.skill ? [r.skill] : []));
  if (must.length) out.must = dedupe(must);
  if (nice.length) out.nice = dedupe(nice);
  return out;
}

/** The brief's own fields, for a campaign with no role spec yet: what the first draft will be made from. */
export function valuesFromSetup(setup: CampaignSetup | undefined): Values {
  const out: Record<string, Value> = {};
  if (!setup) return out;
  const s = seniorityOf(setup.seniority);
  if (s) out.seniority = [s];
  if (setup.locations?.length) out.cities = dedupe(setup.locations);
  if (setup.expMin != null || setup.expMax != null) out.years = [Math.max(0, setup.expMin ?? 0), Math.min(25, setup.expMax ?? 25)];
  if (setup.mustHave?.length) out.must = dedupe(setup.mustHave);
  if (setup.niceToHave?.length) out.nice = dedupe(setup.niceToHave);
  return out;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === false || v === "" || (Array.isArray(v) && v.length === 0);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What the saved filters leave of the spec's: a value they set replaces it, an empty one takes it away. */
export function withSaved(base: Values, saved: Values | undefined): Values {
  const out: Record<string, Value> = { ...base };
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (isEmpty(v)) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** The filters worth saving: only where `values` differs from `base`; a value that was cleared is saved empty. */
export function diffFilters(base: Values, values: Values): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(values)])) {
    const was = base[k];
    const now = values[k];
    if (isEmpty(was) && isEmpty(now)) continue;
    if (!isEmpty(now)) {
      if (!same(was, now)) out[k] = now as Value;
    } else out[k] = [];
  }
  return out;
}

const LEAD = ["cities", "countries", "years", "seniority", "titles", "must", "nice", "current", "past", "excludeCo"];

function partOf(id: string, v: Value): string | null {
  const list = Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as readonly string[]) : null;
  if (id === "years" && Array.isArray(v) && v.length === 2 && typeof v[0] === "number") {
    const [a, b] = v as unknown as readonly [number, number];
    if (a > 0 && b < 25) return `${a} to ${b} years`;
    if (a > 0) return `${a}+ years`;
    if (b < 25) return `up to ${b} years`;
    return null;
  }
  if (list?.length) return list.length > 1 ? `${list[0]} +${list.length - 1}` : (list[0] ?? null);
  if (typeof v === "string") return v;
  return ALL_FILTERS.get(id)?.label ?? null;
}

/** "Pune, 4 to 8 years, 2 more": the first two filters set, then how many others; null when none narrow the search. */
export function summariseFilters(values: Values): string | null {
  const ids = [...new Set([...LEAD, ...Object.keys(values)])].filter((id) => {
    const def = ALL_FILTERS.get(id);
    return def ? isActive(def, values[id]) : !isEmpty(values[id]);
  });
  const parts = ids.flatMap((id) => {
    const p = partOf(id, values[id] as Value);
    return p ? [p] : [];
  });
  if (!parts.length) return null;
  const shown = parts.slice(0, 2);
  const more = parts.length - shown.length;
  return more > 0 ? `${shown.join(", ")}, ${more} more` : shown.join(", ");
}

const wordsFor = (id: string, v: Value): string | null => {
  const def = ALL_FILTERS.get(id);
  if (!def || !isActive(def, v)) return null;
  const c = def.control;
  if (c.kind === "range" && Array.isArray(v) && v.length === 2) {
    const [a, b] = v as unknown as readonly [number, number];
    const unit = c.unit ? ` ${c.unit}` : "";
    if (a > c.min && b < c.max) return `${def.label} ${a} to ${b}${unit}`;
    if (a > c.min) return `${def.label} ${a}+${unit}`;
    return `${def.label} up to ${b}${unit}`;
  }
  if (c.kind === "toggle") return def.label;
  if (Array.isArray(v)) return `${def.label} ${(v as readonly string[]).join(", ")}`;
  return `${def.label} ${String(v)}`;
};

/**
 * The filters as one short line the agent reads with the message, for a campaign that does not exist yet:
 * "Search filters: Cities Pune; Total experience 4 to 8 yrs; Must have Go, Kafka." Null when none are set.
 */
export function filtersLine(values: Values): string | null {
  const parts = Object.keys(values).flatMap((id) => {
    const w = wordsFor(id, values[id] as Value);
    return w ? [w] : [];
  });
  if (!parts.length) return null;
  const line = `Search filters: ${parts.join("; ")}.`;
  return line.length > 400 ? `${line.slice(0, 397)}...` : line;
}
