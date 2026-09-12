// ContactOut People Search client.
// POST https://api.contactout.com/v1/people/search — auth is the `token` header.
// Ported from sourcing/lib/contactout.js. Distinct from reveal-phone's own
// contactout.ts in this project, which calls a different endpoint
// (/v1/people/linkedin, single-profile enrich) for a different purpose.

export const PAGE_SIZE = 25; // hard API maximum

const base = () => (Deno.env.get("CONTACTOUT_BASE_URL") || "https://api.contactout.com").replace(/\/+$/, "");

export class ContactOutError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`ContactOut ${status}: ${body}`);
    this.name = "ContactOutError";
    this.status = status;
    this.body = body;
  }
}

export type Candidate = {
  url: string; name: string; title: string; headline: string; company: string;
  companyDomain: string; companySize: number | null; industry: string; location: string;
  seniority: string; jobFunction: string; skills: string[]; experience: string[];
  education: string[]; available: Record<string, boolean> | null;
  emails: string[]; phones: string[];
};

export async function searchPage({ filters, page, revealInfo = false, dataTypes = [], timeoutMs = 60_000 }: {
  filters: Record<string, unknown>; page: number; revealInfo?: boolean; dataTypes?: string[]; timeoutMs?: number;
}): Promise<{ profiles: Candidate[]; total: number; raw: unknown }> {
  const token = Deno.env.get("CONTACTOUT_API_KEY");
  if (!token) throw new Error("CONTACTOUT_API_KEY must be set as a function secret.");

  const body: Record<string, unknown> = { ...filters, page, page_size: PAGE_SIZE };
  if (revealInfo) {
    body.reveal_info = true;
    if (dataTypes.length) body.data_types = dataTypes;
  }

  const res = await fetch(`${base()}/v1/people/search`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  if (!res.ok) throw new ContactOutError(res.status, text.slice(0, 800));

  let data: { profiles?: Record<string, unknown>; metadata?: { total_results?: number } };
  try {
    data = JSON.parse(text);
  } catch {
    throw new ContactOutError(res.status, `unparseable response: ${text.slice(0, 300)}`);
  }

  // `profiles` is an object keyed by LinkedIn URL, not an array.
  const profiles = Object.entries(data.profiles || {}).map(([url, p]) => normalize(url, p as Record<string, unknown>));
  return { profiles, total: Number(data?.metadata?.total_results ?? 0), raw: data };
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return firstString(v.title || v.name || v.school || "");
  }
  return "";
}

function normalize(url: string, p: Record<string, unknown> = {}): Candidate {
  const contact = (p.contact_info || {}) as Record<string, string[] | undefined>;
  const company = (p.company || {}) as Record<string, unknown>;
  return {
    url,
    name: (p.full_name as string) || "",
    title: (p.title as string) || (p.headline as string) || "",
    headline: (p.headline as string) || "",
    company: (company.name as string) || "",
    companyDomain: (company.domain as string) || (company.email_domain as string) || "",
    companySize: (company.size as number) ?? null,
    industry: (company.industry as string) || "",
    location: (p.location as string) || (p.country as string) || "",
    seniority: (p.seniority as string) || "",
    jobFunction: (p.job_function as string) || "",
    skills: Array.isArray(p.skills) ? (p.skills as string[]).slice(0, 20) : [],
    experience: Array.isArray(p.experience) ? (p.experience as unknown[]).slice(0, 6).map(firstString).filter(Boolean) : [],
    education: Array.isArray(p.education) ? (p.education as unknown[]).slice(0, 4).map(firstString).filter(Boolean) : [],
    available: (p.contact_availability as Record<string, boolean>) || null,
    emails: [...new Set([...(contact.work_emails || []), ...(contact.personal_emails || []), ...(contact.emails || [])])],
    phones: contact.phones || [],
  };
}
