import { ArrowRight, Check, FolderSimplePlus } from "@phosphor-icons/react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { TurnContext, saveMade, savedMade } from "../agentThread";
import { Clarified } from "../Clarify";
import { rowFromDraft } from "../campaignDraft";
import {
  addCampaignRow, resolveCampaignId, saveClient, setCampaignClient, useCampaignRows, useClients, useClientsFailed, useClientsReady, useTeam,
} from "../campaignStore";
import { newClientOf } from "../clarify";
import { EMPTY_DRAFT, clientFromDraft } from "../clients";
import { ClientLogo } from "../ClientLogo";
import { CAMPAIGN_REFUSAL, FactCard, Refusal } from "../ClientMoments";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import { createdMessage } from "../NewCampaign";
import { useProblem } from "../problems";
import { useSession } from "../roleStore";
import { Waiting, useGrow, useOwnerLabel } from "./ClientBits";
import { campaignChecks, campaignDraftFor, campaignFacts, findClient, liveCampaignAnswers, reasonFrom } from "./clientCampaign";
import { liveCampaignAsk } from "./clientQuestions";
import type { LiveViewProps } from "./types";

/**
 * "Start a new campaign", in the chat, with real records. The console's own guided questions (role,
 * client, team, work mode, city, openings, experience, pay, must-haves) lead to a card that shows the
 * campaign as it will be made; nothing is created until the person presses Create. It is made through
 * the same store the Campaigns page uses (POST /v1/campaigns), as a draft or started. Afterwards the
 * next step is offered as a sentence for the message box: draft the role spec, make the screening form.
 */

export default function NewCampaignView({ ctx }: LiveViewProps): JSX.Element {
  const session = useSession();
  /* Setting up a campaign is for admins (the server refuses anyone else), so the chat says so up front. */
  if (session.role !== "admin") return <Refusal ctx={ctx} text={CAMPAIGN_REFUSAL} />;
  return <CampaignFlow ctx={ctx} />;
}

function CampaignFlow({ ctx }: { ctx: MomentCtx }): JSX.Element {
  const ready = useClientsReady();
  const failed = useClientsFailed();
  const { clients } = useClients();
  const rows = useCampaignRows();
  /* Read when each question is asked, so the clients, teams and cities offered are never older than the store. */
  const latest = useRef({ clients, rows });
  latest.current = { clients, rows };
  const ask = useMemo(() => liveCampaignAsk(() => latest.current), []);
  const [run, setRun] = useState(0);

  if (!ready) return <Waiting text="Looking at your clients and campaigns" />;
  return (
    <>
      {failed && <p className="lt-note">I couldn't load your clients, so I can't offer them here. The campaign can be linked to one afterwards.</p>}
      <Clarified key={run} kind="campaign-new" ctx={ctx} ask={ask}>
        {(c) => <CampaignCard ctx={c} onRestart={() => setRun((n) => n + 1)} />}
      </Clarified>
    </>
  );
}

type Sent = { rowId: string };

function CampaignCard({ ctx, onRestart }: { ctx: MomentCtx; onRestart: () => void }): JSX.Element {
  const owner = useOwnerLabel();
  const team = useTeam();
  const { clients } = useClients();
  const rows = useCampaignRows();
  const problem = useProblem();
  const a = liveCampaignAnswers(ctx.said, ctx.answers, clients);
  const sig = JSON.stringify(a);
  const d = useMemo(() => campaignDraftFor(a, owner, clients), [sig, owner, clients]);
  const client = clients.find((c) => c.id === d.clientId);
  /* "Add Orchid Bank as a new client" was chosen: the company is added, by its name alone, with the campaign. */
  const newClient = newClientOf(a);
  const checks = useMemo(() => campaignChecks(d), [d]);

  const [sent, setSent] = useState<Sent | null>(null);
  /* A campaign this card already made (the chat was left and came back): it shows done, it never offers Create twice. */
  const turn = useContext(TurnContext);
  const [madeId, setMadeId] = useState<string | null>(() => (turn ? savedMade(turn.id) : null));
  const [refused, setRefused] = useState(false);
  const pressed = useRef(false);
  const phase: "ready" | "making" | "done" = madeId ? "done" : sent ? "making" : "ready";
  /* The store drops a campaign the server refused and says why in its one-line notice; keep that line. */
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    const why = reasonFrom(problem?.text, d.name.trim(), "created");
    if (why) setReason(why);
  }, [problem, d.name]);
  useGrow(ctx, phase, refused);

  /* An open campaign with this name already: worth a word, not a stop (two can share a name). */
  const twin = phase === "ready"
    && rows.some((r) => r.status !== "closed" && r.name.trim().toLowerCase() === d.name.trim().toLowerCase());

  const create = () => {
    if (pressed.current || checks.blocking) return;
    pressed.current = true;
    setRefused(false);
    setReason(null);
    /* The new client first (a company that is already there is the one used), so the campaign links to it once it has its id. */
    let clientId = d.clientId;
    if (newClient) {
      const there = findClient(newClient, clients);
      clientId = there
        ? there.id
        : saveClient(clientFromDraft({ ...EMPTY_DRAFT, name: newClient, status: "prospect", owner }, `cl-${Date.now().toString(36)}`)).id;
    }
    const row = rowFromDraft({ ...d, clientId }, team);
    setSent({ rowId: row.id });
    const saved = addCampaignRow(row);
    if (clientId) setCampaignClient(row.id, clientId);
    void saved.then((ok) => {
      if (ok) {
        const made = resolveCampaignId(row.id);
        if (turn) saveMade(turn.id, made);
        setMadeId(made);
      } else {
        pressed.current = false;
        setSent(null);
        setRefused(true);
      }
    });
  };

  const notes = phase === "ready"
    ? [
        ...(checks.blocking ? [checks.blocking] : []),
        ...(twin ? [`You already have an open campaign called ${d.name}.`] : []),
      ]
    : [];
  /* The server's own words, or a plain line when it gave none. */
  const failure = phase === "ready" && refused ? reason ?? `${d.name} wasn't created.` : null;

  return (
    <div className="src mo is-formflow">
      {phase === "ready" && <p className="src-para">Here's {d.name} as I have it. Create it when it looks right.</p>}
      <FactCard
        label={`Campaign: ${d.name}`}
        mark={client ? <ClientLogo client={client} size={40} /> : <span className="mo-client-ico" aria-hidden="true"><FolderSimplePlus size={20} /></span>}
        title={d.name}
        sub={`${client ? `For ${client.name}` : newClient ? `For ${newClient}, a new client` : "Internal hire"}${d.hiringManager ? `, with ${d.hiringManager} as hiring manager` : ""}`}
        facts={campaignFacts(d)}
        two
        extra={[...notes, ...(failure ? [failure] : [])].map((t) => (
          <p key={t} className="mo-client-warn t-body-sm" role={t === failure ? "alert" : undefined}>{t}</p>
        ))}
      >
        {phase === "ready" && (
          <div className="mo-acts">
            <button type="button" className="src-btn is-primary mo-small" disabled={!!checks.blocking} onClick={create}>Create campaign</button>
            <button type="button" className="src-btn is-quiet mo-small" onClick={onRestart}>Start again</button>
          </div>
        )}
        {phase === "making" && <p className="t-body-sm" role="status">Creating {d.name}…</p>}
        {phase === "done" && madeId && (
          <>
            <div className="mo-client-done">
              <p className="t-body"><Check size={14} weight="bold" aria-hidden="true" />{createdMessage({ name: d.name })}</p>
            </div>
            <div className="mo-acts">
              <button type="button" className="src-btn is-primary mo-small" onClick={() => ctx.openCampaign?.(madeId)}>Open campaign<ArrowRight size={13} weight="bold" aria-hidden="true" /></button>
              <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, `Draft the role spec for ${d.name}`)}>Draft the role spec</button>
              <button type="button" className="src-btn is-quiet mo-small" onClick={() => act(ctx, `Create a screening form for ${d.name}`)}>Create a screening form</button>
            </div>
          </>
        )}
      </FactCard>
    </div>
  );
}
