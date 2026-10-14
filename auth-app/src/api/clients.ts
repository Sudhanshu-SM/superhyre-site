import type { Client, ClientContact, ClientEvent, ClientStatus } from "../clients";
import { normaliseClient } from "../clients";
import { api } from "./client";

/**
 * Clients, their contacts and notes, as the API serves them
 * (server: modules/clients), and the adapters to the console's Client.
 * Owners and admins only: a recruiter's request is refused.
 */

type ApiContact = { id: string; name: string; title: string | null; email: string | null; phone: string | null; primary: boolean };

export type ApiClientRow = {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  industry: string | null;
  location: string | null;
  status: ClientStatus;
  ownerId: string | null;
  ownerName: string | null;
  fee: string | null;
  notes: string | null;
  primaryContact: { name: string; title: string | null; email: string | null; phone: string | null } | null;
  /** Every contact, primary first (newer servers); the list then needs no detail call. */
  contacts?: { id: string; name: string; title: string | null; email: string | null; primary: boolean }[];
  createdAt: string;
  lastActivityAt: string;
};

export type ApiClientDetail = {
  client: ApiClientRow;
  contacts: ApiContact[];
  notes: { id: string; body: string; authorName: string | null; createdAt: string }[];
  activity: { id: string; verb: string; data: Record<string, unknown>; at: string; actorName: string | null }[];
};

export type ClientBody = {
  name?: string;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  status?: ClientStatus;
  fee?: string | null;
  notes?: string | null;
  ownerId?: string | null;
};

export type ContactBody = { name: string; title: string | null; email: string | null; phone: string | null; primary?: boolean };

export const listClients = () => api<{ clients: ApiClientRow[] }>("GET", "/v1/clients").then((r) => r.clients);
export const getClient = (id: string) => api<ApiClientDetail>("GET", `/v1/clients/${id}`);
export const createClient = (body: ClientBody & { name: string; contacts: ContactBody[] }) => api<ApiClientDetail>("POST", "/v1/clients", body);
export const updateClient = (id: string, body: ClientBody) => api<ApiClientDetail>("PATCH", `/v1/clients/${id}`, body);
export const addContact = (id: string, body: ContactBody) => api<ApiContact>("POST", `/v1/clients/${id}/contacts`, body);
export const updateContact = (id: string, contactId: string, body: Partial<ContactBody>) =>
  api<ApiContact>("PATCH", `/v1/clients/${id}/contacts/${contactId}`, body);
export const deleteContact = (id: string, contactId: string) => api<null>("DELETE", `/v1/clients/${id}/contacts/${contactId}`);
export const deleteClient = (id: string) => api<null>("DELETE", `/v1/clients/${id}`);
export const addNote = (id: string, body: string) => api<{ id: string; body: string; createdAt: string }>("POST", `/v1/clients/${id}/notes`, { body });

const contactOf = (c: ApiContact): ClientContact => ({
  id: c.id, name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "", primary: c.primary,
});

/* What each logged change says on the client's Activity tab. Notes are listed from the notes themselves. */
function eventText(verb: string, data: Record<string, unknown>): string | null {
  const name = typeof data.name === "string" ? data.name : "someone";
  switch (verb) {
    case "created": return "Added as a client";
    case "updated": return "Details updated";
    case "contact_added": return `Added ${name} as a contact`;
    case "contact_updated": return "Contact details updated";
    case "primary_contact_changed": return "Primary contact changed";
    case "contact_removed": return `Removed ${name} as a contact`;
    default: return null;
  }
}

/**
 * A client as the console keeps it. The list row carries only the primary
 * contact; the detail adds every contact, notes and the client's own log.
 */
export function clientFromApi(row: ApiClientRow, detail?: ApiClientDetail): Client {
  const p = row.primaryContact;
  const contacts = detail
    ? detail.contacts.map(contactOf)
    : row.contacts
      ? row.contacts.map((c) => ({ id: c.id, name: c.name, title: c.title ?? "", email: c.email ?? "", phone: "", primary: c.primary }))
      : p ? [{ id: `${row.id}-primary`, name: p.name, title: p.title ?? "", email: p.email ?? "", phone: p.phone ?? "", primary: true }] : [];
  const history: ClientEvent[] = detail
    ? [
        ...detail.notes.map((x) => ({ id: `n-${x.id}`, at: Date.parse(x.createdAt), text: x.body, note: true })),
        ...detail.activity.flatMap((a) => {
          const text = eventText(a.verb, a.data);
          return text ? [{ id: `a-${a.id}`, at: Date.parse(a.at), text }] : [];
        }),
      ].sort((a, b) => b.at - a.at)
    : [];
  return normaliseClient({
    id: row.id,
    name: row.name,
    manager: "", email: "", phone: "",
    notes: row.notes ?? "",
    ...(row.industry ? { industry: row.industry } : {}),
    ...(row.website ?? row.domain ? { website: row.website ?? row.domain ?? "" } : {}),
    ...(row.location ? { location: row.location } : {}),
    status: row.status,
    ...(row.ownerName ? { owner: row.ownerName } : {}),
    ...(row.fee ? { fee: row.fee } : {}),
    contacts,
    createdAt: row.createdAt.slice(0, 10),
    history,
  });
}

const orNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

/** The fields a Client form changes, as the API's body. The owner is added by the caller, by id. */
export function clientBody(c: Client): ClientBody & { name: string } {
  return {
    name: c.name,
    website: orNull(c.website),
    industry: orNull(c.industry),
    location: orNull(c.location),
    status: c.status ?? "active",
    fee: orNull(c.fee),
    notes: orNull(c.notes),
  };
}

export const contactBody = (c: Omit<ClientContact, "id">): ContactBody => ({
  name: c.name, title: orNull(c.title), email: orNull(c.email), phone: orNull(c.phone), primary: c.primary,
});
