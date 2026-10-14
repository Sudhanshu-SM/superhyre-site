import type { CampaignRow } from "./campaignsData";

/**
 * Clients: the companies an agency hires for.
 *
 * Pure data and rules, no React, so the list's filtering, the summary
 * figures and the add-client validation are testable on their own. The live
 * store sits in campaignStore.ts beside `clientOf`, which links campaigns to
 * clients.
 *
 * A client owns campaigns; every figure on a client (open campaigns, hires,
 * people in process, last activity) is read from those campaigns, so the
 * Clients page can never disagree with the Campaigns page.
 */

export type ClientStatus = "active" | "inactive" | "prospect";

export const CLIENT_STATUS_LABEL: Readonly<Record<ClientStatus, string>> = {
  active: "Active", inactive: "Inactive", prospect: "Prospect",
};

export const CLIENT_STATUSES: readonly ClientStatus[] = ["active", "prospect", "inactive"];

/** Someone at the client: a hiring manager, a talent partner, a founder. */
export type ClientContact = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
};

/** Something that happened with a client this session. */
export type ClientEvent = { id: string; at: number; text: string; note?: boolean };

export type Client = {
  id: string;
  name: string;
  /* The primary contact, flattened. Kept because the campaign Overview's
     client card reads them; `normaliseClient` keeps them in step with
     `contacts`. */
  manager: string;
  email: string;
  phone: string;
  notes: string;
  industry?: string;
  /** Bare domain or URL, e.g. "razorpay.com". */
  website?: string;
  location?: string;
  status?: ClientStatus;
  /** The account owner on our side, one of TEAM. */
  owner?: string;
  contacts?: ClientContact[];
  /** Fee terms in the agency's own words, e.g. "18% of first-year CTC". */
  fee?: string;
  /** ISO date, e.g. "2025-03-14". */
  createdAt?: string;
  /** This session's changes, newest first. */
  history?: ClientEvent[];
};

export const INDUSTRIES = [
  "Fintech", "Consumer internet", "Quick commerce", "E-commerce", "SaaS", "Developer tools", "Healthtech", "Edtech", "Other",
] as const;

/* ── seed ── */

/** An ISO date `n` days before today, so the seed never ages. */
export function isoDaysAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const CLIENT_SEED: readonly Client[] = ([
  {
    id: "cl-razorpay", name: "Razorpay", industry: "Fintech", website: "razorpay.com", location: "Bengaluru",
    status: "active", owner: "Punith S", fee: "18% of first-year CTC, 60-day replacement", createdAt: isoDaysAgo(250),
    notes: "Prefers candidates with payments or ledger experience. Feedback on shortlists usually within two days.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-rz-1", name: "Neha Kapoor", title: "Director of Engineering", email: "neha.kapoor@razorpay.com", phone: "+91 98450 11223", primary: true },
      { id: "ct-rz-2", name: "Karthik Rao", title: "Talent Partner", email: "karthik.rao@razorpay.com", phone: "+91 99001 44120", primary: false },
    ],
  },
  {
    id: "cl-swiggy", name: "Swiggy", industry: "Consumer internet", website: "swiggy.com", location: "Bengaluru",
    status: "active", owner: "Sudhanshu M", fee: "16% of first-year CTC", createdAt: isoDaysAgo(180),
    notes: "On-call experience matters more to them than any one cloud.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-sw-1", name: "Rahul Menon", title: "Head of Platform", email: "rahul.menon@swiggy.in", phone: "+91 98860 32011", primary: true },
    ],
  },
  {
    id: "cl-cred", name: "CRED", industry: "Fintech", website: "cred.club", location: "Bengaluru",
    status: "active", owner: "Riya K", fee: "20% of first-year CTC", createdAt: isoDaysAgo(230),
    notes: "Search is paused while they settle the iOS team's lead.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-cr-1", name: "Ananya Iyer", title: "Engineering Manager, iOS", email: "ananya@cred.club", phone: "+91 97400 55102", primary: true },
      { id: "ct-cr-2", name: "Vivek Shah", title: "Recruiting Lead", email: "vivek.shah@cred.club", phone: "", primary: false },
    ],
  },
  {
    id: "cl-zepto", name: "Zepto", industry: "Quick commerce", website: "zeptonow.com", location: "Mumbai",
    status: "active", owner: "Arnab J", fee: "18% of first-year CTC", createdAt: isoDaysAgo(110),
    notes: "Wants a design lead who has shipped consumer apps at scale.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-zp-1", name: "Ishita Bansal", title: "VP Design", email: "ishita@zeptonow.com", phone: "+91 98201 77340", primary: true },
    ],
  },
  {
    id: "cl-meesho", name: "Meesho", industry: "E-commerce", website: "meesho.com", location: "Bengaluru",
    status: "active", owner: "Riya K", fee: "15% of first-year CTC", createdAt: isoDaysAgo(210),
    notes: "",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-ms-1", name: "Aditi Rao", title: "Director, Data Science", email: "aditi.rao@meesho.com", phone: "+91 99860 21455", primary: true },
      { id: "ct-ms-2", name: "Sameer Khan", title: "HR Business Partner", email: "sameer.khan@meesho.com", phone: "+91 98450 66019", primary: false },
    ],
  },
  {
    id: "cl-freshworks", name: "Freshworks", industry: "SaaS", website: "freshworks.com", location: "Chennai",
    status: "inactive", owner: "Punith S", fee: "15% of first-year CTC", createdAt: isoDaysAgo(400),
    notes: "Both enterprise AE roles filled. They will come back for the next hiring cycle.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-fw-1", name: "Lakshmi Narayanan", title: "Sales Director, APAC", email: "lakshmi.n@freshworks.com", phone: "+91 94440 10233", primary: true },
    ],
  },
  {
    id: "cl-groww", name: "Groww", industry: "Fintech", website: "groww.in", location: "Bengaluru",
    status: "prospect", owner: "Sudhanshu M", fee: "To be agreed", createdAt: isoDaysAgo(11),
    notes: "Interested in a finance controller search. Terms still being discussed.",
    manager: "", email: "", phone: "",
    contacts: [
      { id: "ct-gw-1", name: "Pooja Desai", title: "CFO's office", email: "pooja.desai@groww.in", phone: "", primary: true },
    ],
  },
  {
    id: "cl-postman", name: "Postman", industry: "Developer tools", website: "postman.com", location: "Bengaluru",
    status: "prospect", owner: "Arnab J", fee: "", createdAt: isoDaysAgo(4),
    notes: "Intro call done. They may want help with developer relations hiring next quarter.",
    manager: "", email: "", phone: "",
    contacts: [],
  },
] satisfies Client[]).map((c) => normaliseClient(c));

/** Which client each seeded campaign is for. */
export const SEED_CLIENT_OF: Readonly<Record<string, string>> = {
  "backend-snr": "cl-razorpay",
  "platform-sre": "cl-swiggy",
  "ios-mid": "cl-cred",
  "design-lead": "cl-zepto",
  "gtm-ae": "cl-freshworks",
  "ds-applied": "cl-meesho",
  "fin-controller": "cl-groww",
};

/* ── rules ── */

/** "https://www.razorpay.com/careers" → "razorpay.com". Empty when there is nothing that looks like a domain. */
export function domainOf(website: string | undefined): string {
  const raw = (website ?? "").trim().toLowerCase();
  if (!raw) return "";
  const host = raw.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

/** The person to write to first: the flagged primary, else the first contact. */
export function primaryContact(c: Pick<Client, "contacts" | "manager" | "email" | "phone">): ClientContact | undefined {
  const list = c.contacts ?? [];
  const hit = list.find((x) => x.primary) ?? list[0];
  if (hit) return hit;
  return c.manager || c.email ? { id: "legacy", name: c.manager, title: "", email: c.email, phone: c.phone, primary: true } : undefined;
}

/**
 * A client with its contacts and flat fields agreeing: exactly one primary
 * when there are contacts, and manager/email/phone mirroring it. A client
 * made the old way (manager and email only) gains a contacts list.
 */
export function normaliseClient(c: Client): Client {
  let contacts = c.contacts ? c.contacts.map((x) => ({ ...x })) : [];
  if (!contacts.length && (c.manager || c.email)) {
    contacts = [{ id: `ct-${c.id}-1`, name: c.manager || c.email, title: "Hiring manager", email: c.email, phone: c.phone, primary: true }];
  }
  if (contacts.length) {
    const at = Math.max(0, contacts.findIndex((x) => x.primary));
    contacts = contacts.map((x, i) => ({ ...x, primary: i === at }));
  }
  const p = contacts.find((x) => x.primary);
  return {
    ...c,
    status: c.status ?? "active",
    contacts,
    manager: p?.name ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
  };
}

/** Contacts with `id` as the one primary, keeping order. */
export function makePrimary(contacts: readonly ClientContact[], id: string): ClientContact[] {
  return contacts.map((x) => ({ ...x, primary: x.id === id }));
}

/* ── figures, read from the client's campaigns ── */

const OPEN = new Set(["active"]);

/** "12m ago" / "3d ago" / "2w ago" / "Just now" as minutes. Unknown → very old. */
export function agoMinutes(s: string): number {
  if (/just now/i.test(s)) return 0;
  const m = /(\d+)\s*(mo|m|h|d|w)\b/.exec(s);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const unit: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080, mo: 43200 };
  return Number(m[1]) * unit[m[2]!]!;
}

/** Minutes as the console says it: "12m ago", "3d ago", "Just now". */
export function agoLabel(min: number): string {
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  if (min < 10080) return `${Math.round(min / 1440)}d ago`;
  if (min < 43200) return `${Math.round(min / 10080)}w ago`;
  return `${Math.round(min / 43200)}mo ago`;
}

export type ClientSummary = {
  campaigns: CampaignRow[];
  /** Active, paused or draft. */
  open: number;
  hires: number;
  target: number;
  /** Shortlisted or contacted and not yet hired, across open campaigns. */
  inProcess: number;
  /** Minutes since anything moved on any of its campaigns, or since it was added. */
  lastMin: number;
};

/** Days since an ISO date, from `now`. */
const minutesSince = (iso: string | undefined, now: number) => {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(`${iso}T12:00:00`);
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : Number.MAX_SAFE_INTEGER;
};

export function clientSummary(
  client: Pick<Client, "id" | "createdAt" | "history">,
  clientOf: Readonly<Record<string, string>>,
  rows: readonly CampaignRow[],
  now = Date.now(),
): ClientSummary {
  const campaigns = rows.filter((r) => clientOf[r.id] === client.id);
  const open = campaigns.filter((r) => OPEN.has(r.status));
  const touched = [
    ...campaigns.map((r) => agoMinutes(r.updatedAgo)),
    ...(client.history ?? []).map((e) => Math.max(0, Math.round((now - e.at) / 60000))),
    minutesSince(client.createdAt, now),
  ];
  return {
    campaigns,
    open: open.length,
    hires: campaigns.reduce((t, r) => t + r.funnel.hired, 0),
    target: campaigns.reduce((t, r) => t + r.target, 0),
    inProcess: open.reduce((t, r) => t + r.funnel.shortlisted + r.funnel.contacted, 0),
    lastMin: Math.min(...touched),
  };
}

/* ── the list ── */

export type ClientFilter = { q: string; status: ClientStatus | null; industry: string | null; owner: string | null };
export const NO_CLIENT_FILTER: ClientFilter = { q: "", status: null, industry: null, owner: null };

export function matchesClient(c: Client, f: ClientFilter): boolean {
  const needle = f.q.trim().toLowerCase();
  const p = primaryContact(c);
  const hay = [c.name, c.industry, c.location, c.website, c.owner, p?.name, p?.email].filter(Boolean).join(" ").toLowerCase();
  return (!needle || hay.includes(needle))
    && (!f.status || c.status === f.status)
    && (!f.industry || c.industry === f.industry)
    && (!f.owner || c.owner === f.owner);
}

export type ClientSortKey = "name" | "industry" | "location" | "contact" | "owner" | "open" | "hires" | "last" | "status";
export type ClientSort = { key: ClientSortKey; dir: 1 | -1 };

const STATUS_ORDER: Readonly<Record<ClientStatus, number>> = { active: 0, prospect: 1, inactive: 2 };

/** Sorted copy. Ties fall back to the name, so the order is stable. */
export function sortClients(list: readonly Client[], sort: ClientSort, sum: (c: Client) => ClientSummary): Client[] {
  const val = (c: Client): string | number => {
    switch (sort.key) {
      case "name": return c.name;
      case "industry": return c.industry ?? "";
      case "location": return c.location ?? "";
      case "contact": return primaryContact(c)?.name ?? "";
      case "owner": return c.owner ?? "";
      case "open": return sum(c).open;
      case "hires": return sum(c).hires;
      case "last": return sum(c).lastMin;
      case "status": return STATUS_ORDER[c.status ?? "active"];
    }
  };
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return d * sort.dir || a.name.localeCompare(b.name);
  });
}

/* ── adding one ── */

export type ClientDraft = {
  name: string; website: string; industry: string; location: string; status: ClientStatus; owner: string;
  contactName: string; contactTitle: string; contactEmail: string; contactPhone: string; fee: string; notes: string;
};

export const EMPTY_DRAFT: ClientDraft = {
  name: "", website: "", industry: "", location: "", status: "active", owner: "",
  contactName: "", contactTitle: "", contactEmail: "", contactPhone: "", fee: "", notes: "",
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * What is wrong with a draft, by field. Empty means it can be saved.
 * Only the company is required; everything else is checked when given, and
 * a duplicate name is refused so the picker never shows two of one company.
 */
export function clientProblems(d: ClientDraft, existing: readonly Pick<Client, "id" | "name">[] = [], selfId?: string): Partial<Record<keyof ClientDraft, string>> {
  const out: Partial<Record<keyof ClientDraft, string>> = {};
  const name = d.name.trim();
  if (name.length < 2) out.name = "Add the company's name.";
  else if (existing.some((c) => c.id !== selfId && c.name.trim().toLowerCase() === name.toLowerCase())) out.name = `${name} is already a client.`;
  if (d.website.trim() && !domainOf(d.website)) out.website = "That doesn't look like a website yet, e.g. acme.in";
  if (d.contactEmail.trim() && !EMAIL.test(d.contactEmail.trim())) out.contactEmail = "That doesn't look like an email yet.";
  if (d.contactPhone.trim() && d.contactPhone.replace(/\D/g, "").length < 8) out.contactPhone = "A phone number needs at least 8 digits.";
  if ((d.contactEmail.trim() || d.contactPhone.trim() || d.contactTitle.trim()) && !d.contactName.trim()) out.contactName = "Add the contact's name.";
  return out;
}

/** A draft as a client, ready for the store. */
export function clientFromDraft(d: ClientDraft, id: string, today = new Date()): Client {
  const contacts: ClientContact[] = d.contactName.trim()
    ? [{ id: `${id}-ct-1`, name: d.contactName.trim(), title: d.contactTitle.trim(), email: d.contactEmail.trim(), phone: d.contactPhone.trim(), primary: true }]
    : [];
  return normaliseClient({
    id, name: d.name.trim(), manager: "", email: "", phone: "",
    website: domainOf(d.website) || undefined,
    industry: d.industry.trim() || undefined,
    location: d.location.trim() || undefined,
    status: d.status,
    owner: d.owner || undefined,
    fee: d.fee.trim() || undefined,
    notes: d.notes.trim(),
    contacts,
    createdAt: today.toISOString().slice(0, 10),
  });
}

/** A client's draft, for editing it in the same form. */
export function draftOf(c: Client): ClientDraft {
  const p = primaryContact(c);
  return {
    name: c.name, website: c.website ?? "", industry: c.industry ?? "", location: c.location ?? "",
    status: c.status ?? "active", owner: c.owner ?? "",
    contactName: p?.name ?? "", contactTitle: p?.title ?? "", contactEmail: p?.email ?? "", contactPhone: p?.phone ?? "",
    fee: c.fee ?? "", notes: c.notes,
  };
}

/* ── the agent ── */

/**
 * The company a chat message names, if any: "add Acme Fintech as a client"
 * → "Acme Fintech". Null for "add a client" or "new client".
 */
export function clientNameIn(said: string): string | null {
  const s = said.trim().replace(/[.!?]+$/, "");
  const pats = [
    /\b(?:add|create|onboard|register|set ?up)\s+(.+?)\s+as\s+(?:a\s+|our\s+|the\s+)?(?:new\s+)?client\b/i,
    /\b(?:add|create|onboard|register|set ?up)\s+(?:a\s+)?(?:new\s+)?client(?:\s+(?:called|named))?\s*[:,-]?\s+(.+)$/i,
    /\bnew client\s*[:,-]?\s+(.+)$/i,
  ];
  for (const re of pats) {
    const m = re.exec(s);
    const name = m?.[1]?.trim().replace(/^(?:called|named)\s+/i, "").replace(/^["'“]|["'”]$/g, "");
    if (name && !/^(a|an|the|new|one|another|some)$/i.test(name) && name.length <= 60) return name;
  }
  return null;
}
