import { ArrowRight, ArrowSquareOut, Check, FolderSimplePlus, LinkSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CampaignDraft } from "./campaignDraft";
import { CHANNEL_LABEL, WORK_MODE_LABEL, blankDraft, compLabel, draftProblems, num, prefillFromClient, rowFromDraft, addTag } from "./campaignDraft";
import type { WorkMode } from "./campaignsData";
import { STATUS_LABEL } from "./campaignsData";
import {
  addCampaignRow, resolveClientId, saveClient, setCampaignClient, useCampaignRows, useClients, useTeam,
} from "./campaignStore";
import { clientAnswers, newCampaignAnswers, newClientOf, parseContact } from "./clarify";
import type { Client, ClientDraft } from "./clients";
import { CLIENT_STATUS_LABEL, EMPTY_DRAFT, clientFromDraft, domainOf, primaryContact } from "./clients";
import { ClientLogo } from "./ClientLogo";
import type { MomentCtx } from "./moments";
import type { Phase } from "./sourcing";
import { Staged } from "./Staged";
import { getSession, useSession } from "./roleStore";

/**
 * The agent's add-client and new-campaign moments: what the guided questions
 * end in. Both are admin only; a recruiter gets one calm line instead.
 */

const made = new Map<string, string>();
const ownerFor = (name: string, team: readonly string[]) => (team.includes(name) ? name : team[0] ?? name);

export const CLIENT_REFUSAL = "Only admins can add clients. Ask an admin on your team to add it, and its campaigns will show up for you once you're on one.";
export const CAMPAIGN_REFUSAL = "Only admins can set up campaigns. Ask an admin to create it and add you, and it'll appear in your Campaigns.";

export function Refusal({ ctx, text }: { ctx: MomentCtx; text: string }) {
  useEffect(() => { ctx.onBusy(false); ctx.onGrow(); }, [ctx]);
  return <div className="src mo"><p className="src-para">{text}</p></div>;
}

/**
 * The card both moments end in: a header (a mark, a title and a line under it), the facts, anything
 * that sits between them and the footer, then the footer. The connected chat draws the same card.
 */
export function FactCard({ label, mark, title, sub, facts, two = false, extra, children }: {
  label: string;
  mark: ReactNode;
  title: string;
  sub: string;
  facts: readonly (readonly [string, ReactNode])[];
  two?: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mo-card mo-client" aria-label={label}>
      <header className="mo-client-h">
        {mark}
        <div className="mo-client-t">
          <h3 className="t-title-sm">{title}</h3>
          <p className="t-body-sm">{sub}</p>
        </div>
      </header>
      {facts.length > 0 && (
        <dl className={`mo-client-facts${two ? " is-two" : ""}`}>
          {facts.map(([k, v]) => <div key={k}><dt className="t-body-sm">{k}</dt><dd className="t-body">{v}</dd></div>)}
        </dl>
      )}
      {extra}
      <footer className="mo-client-f">{children}</footer>
    </article>
  );
}

/** Picking a campaign to put under a client. Campaigns with no client come first. */
export function LinkCampaigns({ client, rows, clientOf, clients, onPick }: {
  client: Pick<Client, "id" | "name">;
  rows: ReturnType<typeof useCampaignRows>;
  clientOf: Readonly<Record<string, string>>;
  clients: readonly Pick<Client, "id" | "name">[];
  onPick: (campaignId: string) => void;
}) {
  const open = (r: { status: string }) => r.status !== "closed";
  const free = rows.filter((r) => !clientOf[r.id] && open(r));
  const others = rows.filter((r) => clientOf[r.id] && clientOf[r.id] !== client.id && open(r));
  return (
    <div className="mo-client-link">
      <p className="t-label">Link a campaign to {client.name}</p>
      {others.length > 0 && <p className="t-body-sm">Campaigns with no client come first. Picking one that already has a client moves it here.</p>}
      <ul>
        {[...free, ...others].slice(0, 6).map((r) => (
          <li key={r.id}>
            <button type="button" className="mo-client-pick" onClick={() => onPick(r.id)}>
              <span className="mo-client-pick-t"><b className="t-body-strong">{r.name}</b><span className="t-body-sm">{STATUS_LABEL[r.status]}{clientOf[r.id] ? `, now for ${clients.find((x) => x.id === clientOf[r.id])?.name ?? "another client"}` : ", no client yet"}</span></span>
              <LinkSimple size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
        {!free.length && !others.length && <li className="t-body-sm mo-client-none">Every open campaign is already linked here.</li>}
      </ul>
    </div>
  );
}

/** The add-client answers as the Add client form's draft. */
export function clientDraftFromAnswers(a: Readonly<Record<string, string>>, owner: string): ClientDraft {
  const contact = parseContact(a.contact ?? "");
  const fee = a.fee && a.fee !== "none" ? a.fee : "";
  return {
    ...EMPTY_DRAFT,
    name: (a.company ?? "").trim(),
    website: a.website ?? "",
    industry: a.industry && a.industry !== "Other" ? a.industry : "",
    status: fee ? "active" : "prospect",
    owner,
    contactName: contact.name || (contact.email ? contact.email.split("@")[0]! : ""),
    contactEmail: contact.email,
    fee,
  };
}

/* ═══════════════════════════════ a client ═══════════════════════════════ */

export function ClientMoment({ ctx }: { ctx: MomentCtx }) {
  const session = useSession();
  if (session.role !== "admin") {
    return <Refusal ctx={ctx} text={CLIENT_REFUSAL} />;
  }
  return <ClientCard ctx={ctx} />;
}

function ClientCard({ ctx }: { ctx: MomentCtx }) {
  const a = clientAnswers(ctx.said, ctx.answers);
  const { clients, clientOf } = useClients();
  const rows = useCampaignRows();
  const team = useTeam();
  const [linking, setLinking] = useState(false);

  /* Made once per turn, whatever re-renders: keyed on the request and answers. */
  const [result] = useState<{ id: string; existed: boolean }>(() => {
    const company = (a.company ?? "").trim() || ctx.said;
    const key = `${ctx.said}|${JSON.stringify(a)}`;
    const had = made.get(key);
    if (had) return { id: had, existed: false };
    const dup = clients.find((c) => c.name.trim().toLowerCase() === company.toLowerCase());
    if (dup) return { id: dup.id, existed: true };
    const c = saveClient(clientFromDraft({
      ...clientDraftFromAnswers(a, ownerFor(getSession().name, team)),
      name: company,
    }, `cl-${Date.now().toString(36)}`));
    made.set(key, c.id);
    return { id: c.id, existed: false };
  });

  /* Live, a client made here gets its real id when the API answers. */
  const id = resolveClientId(result.id);
  const c = clients.find((x) => x.id === id);
  const linked = rows.filter((r) => clientOf[r.id] === id);

  const phases: readonly Phase[] = useMemo(() => [{
    id: "cl-add", live: result.existed ? "Checking your clients" : "Adding the client", ms: 900,
    done: result.existed ? `${c?.name ?? "They"} is already a client` : `Added ${c?.name ?? "the client"}`,
    steps: result.existed ? ["Found them in Clients"] : [
      c?.website ? `Logo from ${c.website}` : "No website yet, so a letter for the logo",
      primaryContact(c ?? { contacts: [], manager: "", email: "", phone: "" })?.name ? `${primaryContact(c!)!.name} as the primary contact` : "No contact yet",
      c?.fee ? `Fee terms: ${c.fee}` : "No fee terms yet, so they start as a prospect",
    ],
    says: result.existed
      ? `${c?.name} is already in Clients, so I didn't add them twice.`
      : `${c?.name} is in Clients now${c?.status === "prospect" ? " as a prospect, until fee terms are agreed" : ""}. Link a campaign to them here, or open their page to add more.`,
    // Fixed for the turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }], []);

  if (!c) return null;
  const p = primaryContact(c);
  const open = () => { window.location.hash = `/clients/${c.id}`; };

  return (
    <div className="src mo is-formflow">
      <Staged phases={phases} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <FactCard
          label={`Client: ${c.name}`}
          mark={<ClientLogo client={c} size={40} />}
          title={c.name}
          sub={[c.industry, domainOf(c.website), CLIENT_STATUS_LABEL[c.status ?? "active"]].filter(Boolean).join(", ")}
          facts={[
            ["Primary contact", p ? <>{p.name}{p.email && <span className="mo-client-sub">{p.email}</span>}</> : "None yet"],
            ["Fee terms", c.fee || "Not agreed yet"],
            ["Campaigns", linked.length ? linked.map((r) => r.name).join(", ") : "None linked yet"],
          ]}
          extra={linking && (
            <LinkCampaigns client={c} rows={rows} clientOf={clientOf} clients={clients} onPick={(rid) => { setCampaignClient(rid, c.id); setLinking(false); ctx.onGrow(); }} />
          )}
        >
          <div className="mo-acts">
            <button type="button" className="src-btn is-primary mo-small" onClick={open}><ArrowSquareOut size={14} aria-hidden="true" />Open client</button>
            <button type="button" className="src-btn is-quiet mo-small" aria-expanded={linking} onClick={() => { setLinking((x) => !x); ctx.onGrow(); }}>
              <LinkSimple size={14} aria-hidden="true" />{linking ? "Not now" : "Link to a campaign"}
            </button>
          </div>
        </FactCard>
      </Staged>
    </div>
  );
}

/* ═══════════════════════════════ a campaign ═══════════════════════════════ */

export function NewCampaignMoment({ ctx }: { ctx: MomentCtx }) {
  const session = useSession();
  if (session.role !== "admin") {
    return <Refusal ctx={ctx} text={CAMPAIGN_REFUSAL} />;
  }
  return <CampaignCard ctx={ctx} />;
}

/** "30 to 45", "30-45 LPA", "40" → min and max as typed. */
export function parseRange(text: string): { min: string; max: string } {
  const ns = (text.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 2);
  return { min: ns[0] ?? "", max: ns[1] ?? "" };
}

/** The chat's answers as a New campaign draft. */
export function draftFromAnswers(a: Readonly<Record<string, string>>, owner: string, clients: Parameters<typeof prefillFromClient>[1][]): CampaignDraft {
  let d = blankDraft(owner);
  const client = clients.find((c) => c?.id === a.client);
  d = prefillFromClient(d, client);
  const r = parseRange(a.comp ?? "");
  /* Years of experience, when the chat asked (the connected chat does). */
  const exp = parseRange(a.exp ?? "");
  const mode = (a.mode as WorkMode) || "hybrid";
  const loc = (a.location ?? "").trim();
  return {
    ...d,
    name: (a.role ?? "").trim(),
    department: a.dept || d.department,
    workMode: mode,
    locations: loc ? [loc] : mode === "remote" ? [] : d.locations,
    openings: Math.max(1, Number(a.openings) || 1),
    compMin: r.min, compMax: r.max,
    expMin: exp.min, expMax: exp.max,
    mustHave: addTag([], a.skills ?? ""),
    agents: (a.agents ?? "").split(",").filter(Boolean) as CampaignDraft["agents"],
  };
}

function CampaignCard({ ctx }: { ctx: MomentCtx }) {
  const a = newCampaignAnswers(ctx.said, ctx.answers);
  const { clients } = useClients();
  const session = useSession();
  const team = useTeam();
  const [d] = useState(() => draftFromAnswers(a, ownerFor(session.name, team), clients));
  const key = `${ctx.said}|${JSON.stringify(a)}`;
  const [rowId, setRowId] = useState<string | null>(() => made.get(key) ?? null);
  const client = clients.find((c) => c.id === d.clientId);
  /* "Add Orchid Bank as a new client" was chosen: the company is added, by its name alone, with the campaign. */
  const newClient = newClientOf(a);
  const problems = draftProblems(d);
  const canStart = Object.keys(problems).length === 0;

  const phases: readonly Phase[] = useMemo(() => [{
    id: "nc-plan", live: "Putting the campaign together", ms: 900, done: "Put the campaign together",
    steps: [
      client ? `For ${client.name}${client.fee ? `, on ${client.fee}` : ""}` : newClient ? `For ${newClient}, a new client` : "An internal hire, no client",
      d.mustHave.length ? `Must-haves: ${d.mustHave.join(", ")}` : "No must-haves yet. The agent will ask as it goes",
    ],
    says: `Here's ${d.name || "the campaign"} as I have it. Create it and the agents get to work.`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }], []);

  const create = () => {
    if (rowId) return;
    /* The new client first (a company that is already there is the one used), so the campaign links to it. */
    let clientId = d.clientId;
    if (newClient) {
      const there = clients.find((c) => c.name.trim().toLowerCase() === newClient.toLowerCase());
      clientId = there
        ? there.id
        : saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: newClient, status: "prospect", owner: ownerFor(session.name, team) }, `cl-${Date.now().toString(36)}`)).id;
    }
    const r = rowFromDraft({ ...d, clientId }, team);
    addCampaignRow(r);
    if (clientId) setCampaignClient(r.id, clientId);
    made.set(key, r.id);
    setRowId(r.id);
    ctx.onGrow();
  };

  const comp = compLabel(d.compMin || d.compMax ? { currency: d.currency, min: num(d.compMin) ?? undefined, max: num(d.compMax) ?? undefined, shown: false } : undefined);
  const where = d.workMode === "remote" ? (d.locations[0] ? `Remote, near ${d.locations[0]}` : "Remote") : `${WORK_MODE_LABEL[d.workMode]}, ${d.locations[0] ?? "no city yet"}`;
  const facts: [string, string][] = [
    ["Team", d.department],
    ["Where", where],
    ["Openings", `${d.openings} ${d.openings === 1 ? "hire" : "hires"}`],
    ["CTC", comp || "Not set"],
    ["Must-haves", d.mustHave.join(", ") || "None yet"],
    ["Agents", d.agents.join(", ") || "None"],
    ["Channels", d.channels.map((c) => CHANNEL_LABEL[c]).join(", ")],
    ["Fee", d.fee || "Not set"],
  ];

  return (
    <div className="src mo is-formflow">
      <Staged phases={phases} onBusy={ctx.onBusy} onGrow={ctx.onGrow}>
        <FactCard
          label={`Campaign: ${d.name}`}
          mark={client ? <ClientLogo client={client} size={40} /> : <span className="mo-client-ico" aria-hidden="true"><FolderSimplePlus size={20} /></span>}
          title={d.name}
          sub={`${client ? `For ${client.name}` : newClient ? `For ${newClient}, a new client` : "Internal hire"}${d.hiringManager ? `, with ${d.hiringManager} as hiring manager` : ""}`}
          facts={facts}
          two
          extra={!canStart && !rowId && (
            <p className="mo-client-warn t-body-sm">{Object.values(problems)[0]}</p>
          )}
        >
          {rowId ? (
            <div className="mo-client-done">
              <p className="t-body"><Check size={14} weight="bold" aria-hidden="true" />{`${d.name} is live. ${d.agents.join(" and ")} ${d.agents.length === 1 ? "has" : "have"} started.`}</p>
              <div className="mo-acts">
                <button type="button" className="src-btn is-primary mo-small" onClick={() => ctx.openCampaign?.(rowId)}>Open campaign<ArrowRight size={13} weight="bold" aria-hidden="true" /></button>
                {client && <button type="button" className="src-btn is-quiet mo-small" onClick={() => { window.location.hash = `/clients/${client.id}/campaigns`; }}>Open {client.name}</button>}
              </div>
            </div>
          ) : (
            <div className="mo-acts">
              <button type="button" className="src-btn is-primary mo-small" disabled={!canStart} onClick={create}>Create campaign</button>
            </div>
          )}
        </FactCard>
      </Staged>
    </div>
  );
}
