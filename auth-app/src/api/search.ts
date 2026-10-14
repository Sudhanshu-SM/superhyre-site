import { api } from "./client";

/** Quick find (server: modules/search): things already in the workspace, grouped by kind. */

export type SearchResults = {
  campaigns: { id: string; name: string; status: string; clientName: string | null }[];
  candidates: { id: string; fullName: string; currentTitle: string | null; currentCompanyName: string | null; city: string | null }[];
  /** Absent for recruiters, who don't see clients. */
  clients?: { id: string; name: string; status: string; industry: string | null; location: string | null; contact?: string | null }[];
  forms: { id: string; name: string; status: string; campaignId: string; campaignName: string }[];
  tasks: { id: string; title: string; status: string; dueAt: string | null; campaignId: string | null }[];
  conversations: { id: string; title: string; updatedAt: string }[];
};

export const quickFind = (q: string, signal: AbortSignal) =>
  api<{ q: string; results: SearchResults }>("GET", `/v1/search?q=${encodeURIComponent(q)}&limit=5`, undefined, { signal }).then((r) => r.results);

/** One thing found, as a palette row. */
export type Hit = {
  key: string;
  label: string;
  group: string;
  to:
    | { kind: "campaign"; id: string; page: "overview" | "forms" }
    | { kind: "client"; id: string }
    /** One person's profile, on the Candidates page. */
    | { kind: "candidate"; id: string }
    /** One of the agent's chats, opened on the Agent page. */
    | { kind: "chat"; id: string }
    | { kind: "page"; page: "contacts" | "home" | "agent" };
};

const line = (...xs: (string | null | undefined)[]) => xs.filter(Boolean).join(", ");

/** How closely a name answers the query: the whole name, its start, inside it, or only loosely. */
export function closeness(label: string, q: string): number {
  const name = label.toLocaleLowerCase();
  const want = q.trim().toLocaleLowerCase();
  if (!want) return 0;
  if (name === want) return 3;
  if (name.startsWith(want)) return 2;
  return name.includes(want) ? 1 : 0;
}

/**
 * The results in the order the palette lists them. The closest names come first whatever
 * their kind (a client called exactly what was typed beats a campaign that only shares a
 * word); within the same closeness, kinds keep their usual order.
 */
export function hitsOf(r: SearchResults, q = ""): Hit[] {
  const hits = byKind(r);
  return hits
    .map((hit, i) => ({ hit, i, score: closeness(hit.label, q) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.hit);
}

function byKind(r: SearchResults): Hit[] {
  return [
    ...r.campaigns.map((c): Hit => ({ key: `c-${c.id}`, label: c.name, group: line("Campaign", c.clientName), to: { kind: "campaign", id: c.id, page: "overview" } })),
    ...r.candidates.map((c): Hit => ({ key: `p-${c.id}`, label: c.fullName, group: line("Candidate", c.currentTitle, c.currentCompanyName), to: { kind: "candidate", id: c.id } })),
    ...(r.clients ?? []).map((c): Hit => ({ key: `cl-${c.id}`, label: c.name, group: line("Client", c.industry, c.contact ? `via ${c.contact}` : null), to: { kind: "client", id: c.id } })),
    ...r.forms.map((f): Hit => ({ key: `f-${f.id}`, label: f.name, group: line("Form", f.campaignName), to: { kind: "campaign", id: f.campaignId, page: "forms" } })),
    ...r.tasks.map((t): Hit => ({ key: `t-${t.id}`, label: t.title, group: "Task", to: { kind: "page", page: "home" } })),
    ...r.conversations.map((v): Hit => ({ key: `v-${v.id}`, label: v.title, group: "Agent chat", to: { kind: "chat", id: v.id } })),
  ];
}
