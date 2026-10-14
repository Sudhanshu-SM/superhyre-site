import { ArrowSquareOut, Check, LinkSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clarified } from "../Clarify";
import {
  getClients, resolveClientId, saveClient, setCampaignClient, useCampaignRows, useClients, useClientsFailed, useClientsReady,
} from "../campaignStore";
import { clientAnswers } from "../clarify";
import { ClientLogo } from "../ClientLogo";
import { CLIENT_REFUSAL, FactCard, LinkCampaigns, Refusal, clientDraftFromAnswers } from "../ClientMoments";
import { CLIENT_STATUS_LABEL, clientFromDraft, domainOf, primaryContact } from "../clients";
import type { Client } from "../clients";
import type { MomentCtx } from "../moments";
import { useProblem } from "../problems";
import { useSession } from "../roleStore";
import { Waiting, useGrow, useOwnerLabel } from "./ClientBits";
import { clientChecks, reasonFrom } from "./clientCampaign";
import { liveClientAsk } from "./clientQuestions";
import type { LiveViewProps } from "./types";

/**
 * "Add a client", in the chat, with real records. One guided question (the company's name; the rest is
 * optional and added on the Clients page later) leads to a card that shows the client as it will be added;
 * nothing is created until the person presses Add. It is made through the same store the Clients
 * page uses (POST /v1/clients with its contact), so the page shows it too. A name that is already
 * a client is caught before asking for the rest, and again if the server says so.
 */

export default function ClientView({ ctx }: LiveViewProps): JSX.Element {
  const session = useSession();
  /* Adding clients is for admins; the server refuses anyone else, so the chat says so up front. */
  if (session.role !== "admin") return <Refusal ctx={ctx} text={CLIENT_REFUSAL} />;
  return <ClientFlow ctx={ctx} />;
}

function ClientFlow({ ctx }: { ctx: MomentCtx }): JSX.Element {
  const ready = useClientsReady();
  const failed = useClientsFailed();
  const { clients } = useClients();
  const rows = useCampaignRows();
  /* Read when each question is asked, so the options are never older than the store. */
  const latest = useRef({ clients, rows });
  latest.current = { clients, rows };
  const ask = useMemo(() => liveClientAsk(() => latest.current), []);
  const [run, setRun] = useState(0);

  if (!ready) return <Waiting text="Checking your clients" />;
  return (
    <>
      {failed && <p className="lt-note">I couldn't load your clients, so I can't check for a repeat. If it's already one, SuperHyre will say so.</p>}
      <Clarified key={run} kind="client" ctx={ctx} ask={ask}>
        {(c) => <ClientCard ctx={c} onRestart={() => setRun((n) => n + 1)} />}
      </Clarified>
    </>
  );
}

type Sent = { id: string };

function ClientCard({ ctx, onRestart }: { ctx: MomentCtx; onRestart: () => void }): JSX.Element | null {
  const owner = useOwnerLabel();
  const { clients, clientOf } = useClients();
  const rows = useCampaignRows();
  const problem = useProblem();
  const a = clientAnswers(ctx.said, ctx.answers);
  const sig = JSON.stringify(a);
  const draft = useMemo(() => clientDraftFromAnswers(a, owner), [sig, owner]);

  /* Taken when the card appears, before anything is made: is the name already a client? */
  const [found] = useState(() => clientChecks(draft, getClients().clients));
  const dup = found.duplicate ? clients.find((c) => c.id === found.duplicate?.id) : undefined;
  /* What stops it otherwise (a name too short). The clients are left out: once it's added, its own name would match. */
  const checks = useMemo(() => clientChecks(draft, []), [draft]);

  const [sent, setSent] = useState<Sent | null>(null);
  const [seen, setSeen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const pressed = useRef(false);

  const real = sent ? resolveClientId(sent.id) : null;
  const stored = real ? clients.find((c) => c.id === real) : undefined;
  useEffect(() => { if (stored) setSeen(true); }, [stored]);
  const phase: "draft" | "adding" | "done" = !sent ? "draft" : stored && real !== sent.id ? "done" : "adding";

  /* The store drops a client the server refused and says why in its one-line notice; keep that line. */
  useEffect(() => {
    const why = reasonFrom(problem?.text, draft.name, "added");
    if (why) setReason(why);
  }, [problem, draft.name]);
  useEffect(() => {
    if (sent && seen && !stored) {
      pressed.current = false;
      setSent(null);
      setSeen(false);
      setFailedOnce(true);
    }
  }, [sent, seen, stored]);
  useGrow(ctx, phase, linking, failedOnce, found.duplicate?.id);

  const add = () => {
    if (pressed.current || sent || checks.blocking) return;
    pressed.current = true;
    setReason(null);
    setFailedOnce(false);
    const made = saveClient(clientFromDraft(draft, `cl-${Date.now().toString(36)}`));
    setSent({ id: made.id });
  };

  const shown: Client | undefined = dup ?? stored;
  const open = (id: string) => { window.location.hash = `/clients/${id}`; };

  /* ── already a client ── */
  if (found.duplicate && dup) {
    const p = primaryContact(dup);
    const linked = rows.filter((r) => clientOf[r.id] === dup.id);
    return (
      <div className="src mo is-formflow">
        <FactCard
          label={`Client: ${dup.name}`}
          mark={<ClientLogo client={dup} size={40} />}
          title={dup.name}
          sub={[dup.industry, domainOf(dup.website), CLIENT_STATUS_LABEL[dup.status ?? "active"]].filter(Boolean).join(", ")}
          facts={[
            ["Primary contact", p ? <>{p.name}{p.email && <span className="mo-client-sub">{p.email}</span>}</> : "None yet"],
            ["Fee terms", dup.fee || "Not agreed yet"],
            ["Campaigns", linked.length ? linked.map((r) => r.name).join(", ") : "None linked yet"],
          ]}
          extra={linking && (
            <LinkCampaigns client={dup} rows={rows} clientOf={clientOf} clients={clients} onPick={(rid) => { setCampaignClient(rid, dup.id); setLinking(false); }} />
          )}
        >
          <div className="mo-client-done">
            <p className="t-body"><Check size={14} weight="bold" aria-hidden="true" />{dup.name} is already a client, so I haven't added them again.</p>
          </div>
          <div className="mo-acts">
            <button type="button" className="src-btn is-primary mo-small" onClick={() => open(dup.id)}><ArrowSquareOut size={14} aria-hidden="true" />Open client</button>
            <button type="button" className="src-btn is-quiet mo-small" aria-expanded={linking} onClick={() => setLinking((x) => !x)}>
              <LinkSimple size={14} aria-hidden="true" />{linking ? "Not now" : "Link to a campaign"}
            </button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={onRestart}>Start again</button>
          </div>
        </FactCard>
      </div>
    );
  }

  /* ── the client as it will be, then as it is ── */
  const c = shown ?? clientFromDraft(draft, "draft");
  const p = primaryContact(c);
  const linked = shown ? rows.filter((r) => clientOf[r.id] === shown.id) : [];
  /* Only what is known: a client is added by its name, and the rest is filled in on the Clients page. */
  const facts: [string, React.ReactNode][] = [
    ...(p ? [["Primary contact", <>{p.name}{p.email && <span className="mo-client-sub">{p.email}</span>}</>] as [string, React.ReactNode]] : []),
    ...(c.fee ? [["Fee terms", c.fee] as [string, string]] : []),
    ...(phase === "done" ? [["Campaigns", linked.length ? linked.map((r) => r.name).join(", ") : "None linked yet"] as [string, string]] : []),
  ];
  /* The server's own words ("Acme is already a client."), or a plain line when it gave none. */
  const failure = failedOnce ? reason ?? `${draft.name} wasn't added.` : null;

  return (
    <div className="src mo is-formflow">
      {phase === "draft" && <p className="src-para">Here's {c.name} as I have it. Add it to Clients when it looks right.</p>}
      <FactCard
        label={`Client: ${c.name || "new"}`}
        mark={<ClientLogo client={{ name: c.name || "?" }} size={40} />}
        title={c.name || "New client"}
        sub={[c.industry, domainOf(c.website), CLIENT_STATUS_LABEL[c.status ?? "active"]].filter(Boolean).join(", ")}
        facts={facts}
        extra={
          <>
            {phase === "draft" && [...found.notes, ...(checks.blocking ? [checks.blocking] : []), ...(failure ? [failure] : [])].map((t) => (
              <p key={t} className="mo-client-warn t-body-sm" role={t === failure ? "alert" : undefined}>{t}</p>
            ))}
            {phase === "done" && linking && shown && (
              <LinkCampaigns client={shown} rows={rows} clientOf={clientOf} clients={clients} onPick={(rid) => { setCampaignClient(rid, shown.id); setLinking(false); }} />
            )}
          </>
        }
      >
        {phase === "draft" && (
          <div className="mo-acts">
            <button type="button" className="src-btn is-primary mo-small" disabled={!!checks.blocking} onClick={add}>Add {c.name || "client"}</button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={onRestart}>Start again</button>
          </div>
        )}
        {phase === "adding" && <p className="t-body-sm" role="status">Adding {c.name}…</p>}
        {phase === "done" && shown && (
          <>
            <div className="mo-client-done">
              <p className="t-body"><Check size={14} weight="bold" aria-hidden="true" />{shown.name} is in Clients{shown.status === "prospect" ? " as a prospect" : ""}. Their website, contact and fee terms can be added on the Clients page.</p>
            </div>
            <div className="mo-acts">
              <button type="button" className="src-btn is-primary mo-small" onClick={() => open(shown.id)}><ArrowSquareOut size={14} aria-hidden="true" />Open client</button>
              <button type="button" className="src-btn is-quiet mo-small" aria-expanded={linking} onClick={() => setLinking((x) => !x)}>
                <LinkSimple size={14} aria-hidden="true" />{linking ? "Not now" : "Link to a campaign"}
              </button>
            </div>
          </>
        )}
      </FactCard>
    </div>
  );
}
