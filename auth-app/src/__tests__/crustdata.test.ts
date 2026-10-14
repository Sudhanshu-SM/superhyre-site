import { describe, expect, it } from "vitest";
import type { Values } from "../filters";
import { ALL_FILTERS, CATEGORIES, fromBrief } from "../filters";
import type { Condition, Filter } from "../search/crustdata";
import {
  CERTS, COMPANY_TYPE, CrustdataQuery, CrustdataRequest, DEGREE, FIELD, FILTER_KIND, FUNCTION, HEADCOUNT, INDUSTRY,
  MAX_LIMIT, SCHOOL_TIERS, SENIORITY, SERVICES_INDUSTRIES, TIMEZONE_COUNTRIES, expandSchool, freshOnly, profileKey, toCrustdataQuery,
} from "../search/crustdata";

const NOW = new Date("2026-10-03T00:00:00Z");
const P = "experience.employment_details";
const FAKE: Condition = { field: "assessment.authenticity.verdict", type: "not_in", value: ["probably_fabricated", "clearly_fabricated"] };

/** The query without the always-on authenticity guard, so each test reads as the filter it is about. */
const q = (values: Values, opts: Parameters<typeof toCrustdataQuery>[1] = {}) =>
  toCrustdataQuery(values, { now: NOW, excludeFabricated: false, ...opts });

/** The single hard filter a set of values produces. */
const only = (values: Values) => q(values).body.filters;

/** Top-level conditions, whether one or several. */
const top = (values: Values): Filter[] => {
  const f = q(values).body.filters;
  if (!f) return [];
  return "op" in f && f.op === "and" ? f.conditions : [f];
};

const optionsOf = (id: string): readonly string[] => {
  const c = ALL_FILTERS.get(id)!.control;
  return "options" in c ? c.options : [];
};

describe("toCrustdataQuery: shape", () => {
  it("returns no filters for empty values, and still validates", () => {
    const out = q({});
    expect(out.body).toEqual({ limit: MAX_LIMIT });
    expect(out.postFilters).toEqual([]);
    expect(out.rankHints).toEqual([]);
    expect(out.unsupported).toEqual([]);
    expect(CrustdataQuery.parse(out)).toEqual(out);
  });

  it("treats defaults and blanks as no filter", () => {
    const out = q({
      titles: [], must: ["", "  "], radius: "City only", tenure: "Any", recentMove: "Either", skillMatch: "All of them",
      years: [0, 25], currentRole: [0, 10], ctc: [0, 150], expected: [0, 150], gradYear: [2000, 2025],
      notice: "Any", likelihood: "Any", active: "Any time", ghStars: "Any", model: "Either",
      contacted: "Include", rejected: "Include", pastTitles: false, openToWork: false, github: false,
    });
    expect(out.body.filters).toBeUndefined();
    expect(out.postFilters).toEqual([]);
    expect(out.rankHints).toEqual([]);
  });

  it("adds the authenticity guard by default, so even an empty search has one filter", () => {
    expect(toCrustdataQuery({}, { now: NOW }).body.filters).toEqual(FAKE);
    const two = toCrustdataQuery({ countries: ["India"] }, { now: NOW }).body.filters as { op: string; conditions: Filter[] };
    expect(two.op).toBe("and");
    expect(two.conditions.at(-1)).toEqual(FAKE);
  });

  it("clamps the page size and passes the cursor, fields and exclusions through", () => {
    expect(q({}, { limit: 5000 }).body.limit).toBe(MAX_LIMIT);
    expect(q({}, { limit: 0 }).body.limit).toBe(1);
    expect(q({}, { limit: 12.7 }).body.limit).toBe(12);
    expect(q({}).body.limit).toBe(20);
    const b = q({}, { cursor: "abc", fields: ["basic_profile"], excludeProfileUrls: [
      "https://www.linkedin.com/in/asha-verma", "linkedin.com/in/Asha-Verma/?trk=x", "https://in.linkedin.com/in/rohan", "not a url",
    ] }).body;
    expect(b.cursor).toBe("abc");
    expect(b.fields).toEqual(["basic_profile"]);
    expect(b.post_processing).toEqual({ exclude_profiles: ["https://www.linkedin.com/in/asha-verma", "https://www.linkedin.com/in/rohan"] });
    expect(q({}, { excludeProfileUrls: ["junk"] }).body.post_processing).toBeUndefined();
  });

  it("sends the brief as a hybrid search that ranks inside the hard filters", () => {
    const b = q({ titles: ["Backend Engineer"] }, { query: "  scaled payments in Go  " }).body;
    expect(b.search).toEqual({ query: "scaled payments in Go", mode: "hybrid" });
    expect(b.mode).toBe("exact");
    expect(q({}, { query: "   " }).body.search).toBeUndefined();
  });

  it("produces a body the request schema accepts for a full set of filters", () => {
    const everything: Values = Object.fromEntries([...ALL_FILTERS.values()].map((f) => {
      const c = f.control;
      if (c.kind === "chips") return [f.id, [...c.options]];
      if (c.kind === "tags") return [f.id, c.suggestions.slice(0, 2)];
      if (c.kind === "range") return [f.id, [c.min + c.step, c.max - c.step]];
      if (c.kind === "segment") return [f.id, c.options[c.options.length - 1]!];
      return [f.id, true];
    }));
    const out = toCrustdataQuery(everything, { now: NOW, query: "x", limit: 50 });
    expect(() => CrustdataRequest.parse(out.body)).not.toThrow();
    expect(() => CrustdataQuery.parse(out)).not.toThrow();
  });
});

describe("toCrustdataQuery: role", () => {
  it("matches current titles by all words, any of them", () => {
    expect(only({ titles: ["Backend Engineer", "Platform Engineer"] })).toEqual({
      op: "or", conditions: [
        { field: `${P}.current.title`, type: "(.)", value: "Backend Engineer" },
        { field: `${P}.current.title`, type: "(.)", value: "Platform Engineer" },
      ],
    });
  });

  it("matches any title, current or past, when past titles are allowed", () => {
    expect(only({ titles: ["Staff Engineer"], pastTitles: true })).toEqual({ field: `${P}.title`, type: "(.)", value: "Staff Engineer" });
  });

  it("past titles alone add nothing", () => {
    expect(only({ pastTitles: true })).toBeUndefined();
  });

  it("maps seniority labels to Crustdata levels, merging Manager", () => {
    expect(only({ seniority: ["Senior", "Manager"] })).toEqual({
      field: `${P}.current.seniority_level`, type: "in", value: ["Senior", "Entry Level Manager", "Experienced Manager"],
    });
  });

  it("maps functions to Crustdata categories", () => {
    expect(only({ function: ["Product", "Customer success", "HR"] })).toEqual({
      field: `${P}.current.function_category`, type: "in", value: ["Product Management", "Customer Success and Support", "Human Resources"],
    });
  });

  it("needs every keyword, in the headline or the summary", () => {
    expect(only({ keywords: ["payments", "low latency"] })).toEqual({
      op: "and", conditions: ["payments", "low latency"].map((k) => ({
        op: "or", conditions: [
          { field: "basic_profile.headline", type: "(.)", value: k },
          { field: "basic_profile.summary", type: "(.)", value: k },
        ],
      })),
    });
  });
});

describe("toCrustdataQuery: location", () => {
  it("matches cities by name, including common old spellings", () => {
    expect(only({ cities: ["Bengaluru", "Pune"] })).toEqual({
      op: "or", conditions: [
        { field: "basic_profile.location.full_location", type: "(.)", value: "Bengaluru" },
        { field: "basic_profile.location.full_location", type: "(.)", value: "Bangalore" },
        { field: "basic_profile.location.full_location", type: "(.)", value: "Pune" },
      ],
    });
  });

  it("uses a geo radius per city when a distance is chosen", () => {
    expect(only({ cities: ["Pune", "Delhi NCR"], radius: "50 km" })).toEqual({
      op: "or", conditions: [
        { field: "professional_network.location.raw", type: "geo_distance", value: { location: "Pune", distance: 50, unit: "km" } },
        { field: "professional_network.location.raw", type: "geo_distance", value: { location: "New Delhi", distance: 50, unit: "km" } },
      ],
    });
  });

  it("a radius with no city adds nothing", () => {
    expect(only({ radius: "100 km" })).toBeUndefined();
  });

  it("filters countries by full name", () => {
    expect(only({ countries: ["India", "Singapore"] })).toEqual({ field: "basic_profile.location.country", type: "in", value: ["India", "Singapore"] });
  });

  it("narrows time zones to countries only when no place is set, and always checks the zone after", () => {
    const alone = q({ timezones: ["IST", "GST"] });
    expect(alone.body.filters).toEqual({ field: "basic_profile.location.country", type: "in", value: ["India", "Sri Lanka", "United Arab Emirates", "Oman"] });
    expect(alone.postFilters).toEqual([{ filter: "timezones", source: "profile", rule: "timezone_in", params: { zones: ["IST", "GST"] } }]);
    const withCity = q({ timezones: ["IST"], cities: ["Pune"] });
    expect(JSON.stringify(withCity.body.filters)).not.toContain("location.country");
    expect(withCity.postFilters).toHaveLength(1);
  });

  it("dedupes countries shared by two zones", () => {
    expect(only({ timezones: ["EST", "PST"] })).toEqual({ field: "basic_profile.location.country", type: "in", value: ["United States", "Canada"] });
  });

  it("keeps work mode and relocation for our own data", () => {
    const out = q({ workMode: ["Remote"], relocate: true, cities: ["Pune"] });
    expect(out.postFilters).toEqual([
      { filter: "workMode", source: "screening", rule: "work_mode_in", params: { modes: ["Remote"] } },
      { filter: "relocate", source: "our_db", rule: "include_relocators", params: { cities: ["Pune"] } },
    ]);
  });
});

describe("toCrustdataQuery: experience", () => {
  it("bounds total experience on both sides", () => {
    expect(top({ years: [5, 12] })).toEqual([
      { field: "years_of_experience_raw", type: "=>", value: 5 },
      { field: "years_of_experience_raw", type: "=<", value: 12 },
    ]);
  });

  it("leaves the ceiling open at the top of the range", () => {
    expect(top({ years: [8, 25] })).toEqual([{ field: "years_of_experience_raw", type: "=>", value: 8 }]);
  });

  it("leaves the floor open at zero", () => {
    expect(top({ years: [0, 3] })).toEqual([{ field: "years_of_experience_raw", type: "=<", value: 3 }]);
  });

  it("bounds years at the current company", () => {
    expect(top({ currentRole: [1, 4] })).toEqual([
      { field: `${P}.current.years_at_company_raw`, type: "=>", value: 1 },
      { field: `${P}.current.years_at_company_raw`, type: "=<", value: 4 },
    ]);
  });

  it("filters recent movers by current start date", () => {
    expect(only({ recentMove: "Exclude <6 months" })).toEqual({ field: `${P}.current.start_date`, type: "=<", value: "2026-04-04" });
    expect(only({ recentMove: "Only <6 months" })).toEqual({ field: `${P}.current.start_date`, type: "=>", value: "2026-04-04" });
  });

  it("derives average tenure after the call", () => {
    expect(q({ tenure: "2+ yrs" }).postFilters).toEqual([{ filter: "tenure", source: "profile", rule: "avg_tenure_min_years", params: { years: 2 } }]);
  });
});

describe("toCrustdataQuery: skills", () => {
  it("needs every must-have by default", () => {
    expect(only({ must: ["Go", "Kafka"] })).toEqual({ field: "skills.professional_network_skills", type: "has_all", value: ["Go", "Kafka"] });
  });

  it("needs any must-have when asked", () => {
    expect(only({ must: ["Go", "Rust"], skillMatch: "Any of them" })).toEqual({ field: "skills.professional_network_skills", type: "in", value: ["Go", "Rust"] });
  });

  it("excludes skills and ranks the nice-to-haves without filtering", () => {
    const out = q({ exclude: ["PHP"], nice: ["Redis"] });
    expect(out.body.filters).toEqual({ field: "skills.professional_network_skills", type: "not_in", value: ["PHP"] });
    expect(out.rankHints).toEqual([{ filter: "nice", signal: "nice_to_have_skills", params: { skills: ["Redis"] } }]);
  });

  it("checks must-haves were used in a role after the call", () => {
    expect(q({ must: ["Go"], inRole: true }).postFilters).toEqual([{ filter: "inRole", source: "profile", rule: "skills_used_in_role", params: { skills: ["Go"] } }]);
    expect(q({ inRole: true }).postFilters).toEqual([]);
  });
});

describe("toCrustdataQuery: company", () => {
  it("includes current and past companies, and excludes current ones", () => {
    expect(top({ current: ["Razorpay"], past: ["Flipkart", "Swiggy"], excludeCo: ["TCS"] })).toEqual([
      { field: `${P}.current.company_name`, type: "in", value: ["Razorpay"] },
      { field: `${P}.past.company_name`, type: "in", value: ["Flipkart", "Swiggy"] },
      { field: `${P}.current.company_name`, type: "not_in", value: ["TCS"] },
    ]);
  });

  it("maps size bands to headcount ranges", () => {
    expect(only({ size: ["1–10", "10k+"] })).toEqual({ field: `${P}.current.company_headcount_range`, type: "in", value: ["myself only", "2-10", "10001+"] });
  });

  it("maps industries to their LinkedIn names", () => {
    expect(only({ industry: ["Gaming"] })).toEqual({ field: `${P}.current.company_industries`, type: "in", value: ["Computer Games", "Mobile Gaming Apps"] });
  });

  it("splits product from services by industry", () => {
    expect(only({ model: "Services" })).toEqual({ field: `${P}.current.company_industries`, type: "in", value: [...SERVICES_INDUSTRIES] });
    expect(only({ model: "Product" })).toEqual({ field: `${P}.current.company_industries`, type: "not_in", value: [...SERVICES_INDUSTRIES] });
  });

  it("maps ownership to company type", () => {
    expect(only({ type: ["Public", "Private"] })).toEqual({ field: `${P}.current.company_type`, type: "in", value: ["Public Company", "Privately Held"] });
  });

  it("resolves funding stage through the company API, not people search", () => {
    const out = q({ stage: ["Series B"] });
    expect(out.body.filters).toBeUndefined();
    expect(out.postFilters).toEqual([{ filter: "stage", source: "company_api", rule: "funding_stage_in", params: { stages: ["Series B"] } }]);
  });
});

describe("toCrustdataQuery: education", () => {
  it("matches degree phrases", () => {
    expect(only({ degree: ["PhD"] })).toEqual({
      op: "or", conditions: DEGREE.PhD!.map((p) => ({ field: "education.schools.degree", type: "[.]", value: p })),
    });
  });

  it("matches fields of study", () => {
    expect(only({ field: ["Computer Science"] })).toEqual({ field: "education.schools.field_of_study", type: "(.)", value: "Computer Science" });
  });

  it("turns an institution group into exact school phrases, so IIT does not catch IIIT", () => {
    expect(only({ tier: ["IIT"] })).toEqual({
      op: "or", conditions: [
        { field: "education.schools.school", type: "[.]", value: "Indian Institute of Technology" },
        { field: "education.schools.school", type: "[.]", value: "IIT" },
      ],
    });
  });

  it("joins groups and named schools in one any-of", () => {
    const f = only({ tier: ["IISc"], schools: ["IIT Bombay"] }) as { op: string; conditions: Condition[] };
    expect(f.op).toBe("or");
    expect(f.conditions.map((c) => c.value)).toEqual([
      "Indian Institute of Science", "IISc", "IIT Bombay", "Indian Institute of Technology Bombay",
    ]);
  });

  it("expands short school names", () => {
    expect(expandSchool("IIIT Hyderabad")).toEqual(["IIIT Hyderabad", "International Institute of Information Technology Hyderabad"]);
    expect(expandSchool("NIT Trichy")).toEqual(["NIT Trichy", "National Institute of Technology Trichy"]);
    expect(expandSchool("Delhi Technological University")).toEqual(["Delhi Technological University"]);
  });

  it("ranks education instead of filtering when non-traditional backgrounds are in", () => {
    const out = q({ degree: ["Bachelor's"], tier: ["IIT"], nonTraditional: true });
    expect(out.body.filters).toBeUndefined();
    expect(out.rankHints).toEqual([{ filter: "nonTraditional", signal: "education_preferred", params: { degrees: ["Bachelor's"], fields: [], tiers: ["IIT"], schools: [] } }]);
    expect(q({ nonTraditional: true }).rankHints).toEqual([]);
  });

  it("checks graduation year after the call", () => {
    expect(q({ gradYear: [2015, 2020] }).postFilters).toEqual([{ filter: "gradYear", source: "profile", rule: "graduated_between", params: { from: 2015, to: 2020 } }]);
  });
});

describe("toCrustdataQuery: compensation and exclusions (ours only)", () => {
  it("never sends money or notice to Crustdata", () => {
    const out = q({ ctc: [20, 150], expected: [30, 60], notice: "≤ 30 days" });
    expect(out.body.filters).toBeUndefined();
    expect(out.postFilters).toEqual([
      { filter: "ctc", source: "screening", rule: "ctc_between", params: { minLpa: 20, maxLpa: null } },
      { filter: "expected", source: "screening", rule: "expected_ctc_between", params: { minLpa: 30, maxLpa: 60 } },
      { filter: "notice", source: "screening", rule: "notice_max_days", params: { days: 30 } },
    ]);
  });

  it("immediate notice is zero days", () => {
    expect(q({ notice: "Immediate" }).postFilters[0]!.params).toEqual({ days: 0 });
  });

  it("keeps exclusions in our own database", () => {
    const out = q({ contacted: "Exclude last 90 days", rejected: "Exclude ever", otherCampaigns: true, contact: ["Phone"] });
    expect(out.body.filters).toBeUndefined();
    expect(out.postFilters.map((p) => [p.rule, p.params])).toEqual([
      ["exclude_contacted", { withinDays: 90 }],
      ["exclude_in_other_campaigns", {}],
      ["exclude_rejected", { withinDays: null }],
      ["has_contact", { kinds: ["Phone"] }],
    ]);
    expect(out.rankHints).toEqual([]);
  });

  it("prefers a verified work email when email is wanted", () => {
    expect(q({ contact: ["Email"] }).rankHints).toEqual([{ filter: "contact", signal: "verified_work_email", params: {} }]);
  });
});

describe("toCrustdataQuery: availability and signals", () => {
  it("open to work reads LinkedIn or GitHub", () => {
    expect(only({ openToWork: true })).toEqual({
      op: "or", conditions: [
        { field: "professional_network.open_to_cards", type: "in", value: ["CAREER_INTEREST"] },
        { field: "dev_platform_profiles.is_hireable", type: "=", value: true },
      ],
    });
  });

  it("profile updated becomes a date floor", () => {
    expect(only({ active: "30 days" })).toEqual({ field: "basic_profile.last_updated", type: "=>", value: "2026-09-03" });
  });

  it("likelihood to move only ranks", () => {
    const out = q({ likelihood: "High" });
    expect(out.body.filters).toBeUndefined();
    expect(out.rankHints).toEqual([{ filter: "likelihood", signal: "move_likelihood", params: { min: "high" } }]);
  });

  it("maps the GitHub filters", () => {
    expect(top({ github: true, ghActive: true, ghLanguages: ["Go", "Rust"], ghStars: "1,000+" })).toEqual([
      { field: "dev_platform_profiles.public_repo_count", type: "=>", value: 1 },
      { field: "dev_platform_profiles.repos.github_pushed_at", type: "=>", value: "2026-07-05" },
      { field: "dev_platform_profiles.all_languages", type: "in", value: ["Go", "Rust"] },
      { field: "dev_platform_profiles.total_stars", type: "=>", value: 1000 },
    ]);
  });

  it("derives promotion and open-source work after the call", () => {
    expect(q({ promoted: true, oss: true }).postFilters.map((p) => [p.filter, p.source])).toEqual([["oss", "enrichment"], ["promoted", "profile"]]);
  });

  it("reports talks as unsupported but still ranks on it", () => {
    const out = q({ talks: true });
    expect(out.unsupported.map((u) => u.filter)).toEqual(["talks"]);
    expect(out.rankHints.map((r) => r.signal)).toEqual(["public_writing_or_talks"]);
  });

  it("maps certifications by name or issuer", () => {
    expect(only({ certs: ["AWS", "CKA"] })).toEqual({ op: "or", conditions: [CERTS.AWS, CERTS.CKA] });
  });

  it("maps spoken languages", () => {
    expect(only({ spoken: ["Kannada", "English"] })).toEqual({ field: "basic_profile.languages", type: "in", value: ["Kannada", "English"] });
  });

  it("career returners only change ranking", () => {
    expect(q({ returners: true }).rankHints).toEqual([{ filter: "returners", signal: "no_gap_penalty", params: {} }]);
  });
});

describe("toCrustdataQuery: combinations", () => {
  it("joins a realistic search with and, in a stable order", () => {
    const out = toCrustdataQuery({
      titles: ["Backend Engineer"], seniority: ["Senior"], cities: ["Pune"], radius: "25 km",
      years: [6, 25], must: ["Go"], current: ["Razorpay"], excludeCo: ["Acme (your company)"],
    }, { now: NOW });
    const f = out.body.filters as { op: string; conditions: Filter[] };
    expect(f.op).toBe("and");
    expect(f.conditions.map((c) => ("field" in c ? `${c.field} ${c.type}` : c.op))).toEqual([
      `${P}.current.title (.)`,
      `${P}.current.seniority_level in`,
      "professional_network.location.raw geo_distance",
      "years_of_experience_raw =>",
      "skills.professional_network_skills has_all",
      `${P}.current.company_name in`,
      `${P}.current.company_name not_in`,
      "assessment.authenticity.verdict not_in",
    ]);
  });

  it("is pure: the same values give the same query", () => {
    const v: Values = { titles: ["SRE"], active: "7 days", must: ["Go"] };
    expect(q(v)).toEqual(q(v));
  });
});

describe("filter catalogue coverage", () => {
  it("classifies every filter in the dialog, and nothing else", () => {
    expect(Object.keys(FILTER_KIND).sort()).toEqual([...ALL_FILTERS.keys()].sort());
  });

  it("has a Crustdata value for every option of every mapped chip", () => {
    const maps: Record<string, Record<string, unknown>> = {
      seniority: SENIORITY, function: FUNCTION, size: HEADCOUNT, industry: INDUSTRY, type: COMPANY_TYPE,
      degree: DEGREE, field: FIELD, tier: SCHOOL_TIERS, certs: CERTS, timezones: TIMEZONE_COUNTRIES,
    };
    for (const [id, map] of Object.entries(maps)) {
      for (const o of optionsOf(id)) expect(map[o], `${id}: ${o}`).toBeDefined();
    }
  });

  it("only offers seniority and function values Crustdata knows", () => {
    const levels = ["Entry Level", "Entry Level Manager", "Senior", "Director", "Owner / Partner", "CXO", "Vice President", "In Training", "Experienced Manager", "Strategic"];
    for (const vals of Object.values(SENIORITY)) for (const x of vals) expect(levels).toContain(x);
    const fns = ["Engineering", "Sales", "Consulting", "Marketing", "Operations", "Finance", "Research", "Customer Success and Support", "Arts and Design", "Human Resources", "Legal", "Product Management"];
    for (const x of Object.values(FUNCTION)) expect(fns).toContain(x);
  });

  it("every segment option the mapping reads is one the dialog offers", () => {
    expect(optionsOf("radius")).toEqual(["City only", "25 km", "50 km", "100 km"]);
    expect(optionsOf("ghStars")).toEqual(["Any", "10+", "100+", "1,000+"]);
    expect(optionsOf("recentMove")).toEqual(["Either", "Exclude <6 months", "Only <6 months"]);
    expect(optionsOf("model")).toEqual(["Either", "Product", "Services"]);
    expect(optionsOf("skillMatch")).toEqual(["All of them", "Any of them"]);
  });

  it("every active filter does something somewhere", () => {
    for (const cat of CATEGORIES) for (const f of cat.filters) {
      if (f.id === "radius" || f.id === "pastTitles" || f.id === "skillMatch") continue; // modifiers of another filter
      const c = f.control;
      const val = c.kind === "chips" ? [c.options[0]!] : c.kind === "tags" ? [c.suggestions[0]!] : c.kind === "range" ? [c.min + c.step, c.max - c.step] as [number, number] : c.kind === "segment" ? c.options[1]! : true;
      const extra: Values = f.id === "inRole" ? { must: ["Go"] } : f.id === "nonTraditional" ? { degree: ["PhD"] } : {};
      const out = q({ ...extra, [f.id]: val });
      const touched = out.body.filters !== undefined || out.postFilters.length + out.rankHints.length + out.unsupported.length > 0;
      expect(touched, f.id).toBe(true);
    }
  });

  it("the brief's prefill uses the new seniority labels", () => {
    expect(fromBrief("Staff engineers in Bangalore").seniority).toEqual(["Senior"]);
    expect(only(fromBrief("Staff engineers in Bangalore"))).toBeDefined();
  });
});

describe("never the same person twice", () => {
  const url = (p: { u: string }) => p.u;
  it("keys a profile the same whatever form its URL takes", () => {
    expect(profileKey("https://www.linkedin.com/in/Asha-Verma/")).toBe("asha-verma");
    expect(profileKey("linkedin.com/in/asha-verma?trk=abc")).toBe("asha-verma");
    expect(profileKey("https://in.linkedin.com/in/asha-verma#x")).toBe("asha-verma");
    expect(profileKey("https://www.linkedin.com/company/acme")).toBeNull();
  });
  it("drops people already seen and repeats inside one response", () => {
    const got = freshOnly(
      [{ u: "https://www.linkedin.com/in/a" }, { u: "https://www.linkedin.com/in/B/" }, { u: "linkedin.com/in/b" }, { u: "" }, { u: "https://www.linkedin.com/in/c" }],
      url, ["https://www.linkedin.com/in/c"],
    );
    expect(got.map(url)).toEqual(["https://www.linkedin.com/in/a", "https://www.linkedin.com/in/B/"]);
  });
});
