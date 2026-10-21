import { AttentionCard } from "./AttentionCard";
import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { CardPerson, ChatCard } from "../api/agent";
import { campaignFacts, campaignHref, funnel, type PersonField, peopleHeading, peopleSubline, personLine, personStatus, searchLine, specLine } from "../chatCards";
import { candidateFromCardPerson } from "../liveCandidate";
import { putSet } from "../liveCandidates";
import { LiveView } from "../liveViews";
import { useLiveMoment } from "../liveViews/LiveMoment";
import { ConnectCard } from "./ConnectCard";
import { CountsCard } from "./CountsCard";
import { Cta } from "./Cta";
import { DraftsCard } from "./DraftsCard";
import { ExportCard } from "./ExportCard";
import { FileCard } from "./FileCard";
import { OutcomeCard } from "./OutcomeCard";
import { RoleSpecCard } from "./RoleSpecCard";
import { EmailNeededCard } from "./EmailNeededCard";
import { SlotsCard } from "./SlotsCard";

/**
 * What the agent looked up, drawn where the answer is: the people with their fit and a way to
 * act on them, a campaign's board, the list of campaigns. The agent's words say what stands
 * out; these hold the detail, so the same facts aren't typed twice. Every figure on a card
 * came from the lookup the agent made, and a name opens the person's profile.
 *
 * The other kinds of card live beside this file: an approval (which turns into what it did), what a
 * write did, and a connection the agent needs. A kind this console doesn't know is drawn as nothing.
 */

/**
 * A list of people with the actions a recruiter wants on each: open the profile, shortlist,
 * pass with a reason. Used for the cards the agent shows and for the results of a search, so
 * they read and behave alike. Actions are for sourced people on a campaign; people already on
 * the board only open.
 */
const FIRST = 8;

export function PeopleList({ setKey, campaignId, people, actions, fields }: { setKey: string; campaignId: string | null; people: readonly CardPerson[]; actions: boolean; fields?: readonly PersonField[] | undefined }): JSX.Element {
  const ctx = useLiveMoment();
  const [more, setMore] = useState(false);
  const shown = more ? people : people.slice(0, FIRST);
  const canAct = actions && campaignId !== null;

  /* The people in view are registered where the ranked list, the profile sheet and the
     comparison can reach them, so opening a name here opens the console's own profile. */
  /* `people` is a new array on every render of whatever drew this list, so the effect is keyed on what
     is IN it. Keyed on the array itself, each registration re-rendered the parent, which built a new
     array, which registered again, until React gave up and the whole console went blank. */
  const candidates = people.map(candidateFromCardPerson).filter((c): c is NonNullable<typeof c> => c !== null);
  const signature = JSON.stringify(candidates);
  const latest = useRef(candidates);
  latest.current = candidates;
  useEffect(() => {
    const now = latest.current;
    if (now.length) putSet({ key: `card:${setKey}`, campaignId, candidates: now, criteria: [], reasons: {}, total: now.length });
  }, [setKey, campaignId, signature]);

  const idOf = (p: CardPerson) => p.personId ?? p.candidateId;
  const ids = people.map(idOf).filter((id): id is string => id !== null);

  return (
    <>
      <ol className="lt-people">
        {shown.map((p, i) => {
          const id = idOf(p);
          const verdict = id ? ctx?.verdicts[id] : undefined;
          const status = personStatus(p, fields);
          const line = [personLine(p, fields), status].filter(Boolean).join(" · ");
          return (
            <li key={id ?? p.campaignCandidateId ?? `${p.name}${i}`} className="lt-person">
              <div className="lt-person-main">
                <button type="button" className="lt-person-name lt-person-open" onClick={() => id && ctx?.openProfile(id, ids)}>
                  {p.name}
                </button>
                {line && <span className="lt-person-meta">{line}</span>}
                {(p.email !== undefined || p.phone !== undefined) && (
                  <span className="lt-person-meta">
                    {[p.email, p.phone].filter(Boolean).join(" · ") || "No email or phone on file"}
                  </span>
                )}
                {p.strengths[0] && (!fields || fields.includes("fit")) && <span className="lt-person-why">{p.strengths[0]}</span>}
              </div>
              {canAct && p.personId &&
                (verdict ? (
                  <span className="lt-person-done">{verdict === "shortlisted" ? "Shortlisted" : "Rejected"}</span>
                ) : (
                  <span className="lt-person-acts">
                    <button type="button" className="rep-opt" onClick={() => ctx?.onVerdict(p.personId as string, "shortlisted")}>
                      Shortlist
                    </button>
                    <button type="button" className="rep-act" onClick={() => ctx?.onVerdict(p.personId as string, "rejected")}>
                      Reject
                    </button>
                  </span>
                ))}
            </li>
          );
        })}
      </ol>
      {people.length > shown.length && (
        <p className="lt-more">
          <Cta small bare icon={CaretDown} onClick={() => setMore(true)}>Show {people.length - shown.length} more</Cta>
        </p>
      )}
    </>
  );
}

/* ── the cards ───────────────────────────────────────────────────────────── */

function PeopleCard({ card }: { card: Extract<ChatCard, { kind: "people" }> }) {
  const sub = peopleSubline(card);
  return (
    <section className="lk" aria-label={peopleHeading(card)}>
      <header className="lk-head">
        <h3 className="lk-title">{peopleHeading(card)}</h3>
        {sub && <p className="lk-sub">{sub}</p>}
      </header>
      <PeopleList setKey={card.key} campaignId={card.campaignId} people={card.people} actions={card.source === "matches"} fields={card.fields} />
      {card.campaignId && (
        <p className="lk-foot">
          <Cta small href={campaignHref(card.campaignId, card.source === "pipeline" ? "pipeline" : "")}>
            {card.source === "pipeline" ? "Open pipeline" : "Open campaign"}
          </Cta>
        </p>
      )}
    </section>
  );
}

function CampaignCard({ card, charted = false }: { card: Extract<ChatCard, { kind: "campaign" }>; charted?: boolean }) {
  const stages = funnel(card.stages);
  const facts = campaignFacts(card);
  return (
    <section className="lk" aria-label={card.name}>
      <header className="lk-head">
        <h3 className="lk-title">
          <a href={campaignHref(card.campaignId)}>{card.name}</a>
        </h3>
        {facts && <p className="lk-sub">{facts}</p>}
      </header>
      {/* With the campaign's charts in the same answer the counts are theirs: they are stated once. */}
      {!charted && (
        <ol className="lk-funnel" aria-label="People by stage">
          {stages.map((s) => (
            <li key={s.stage} className={s.stage === "passed" ? "is-quiet" : undefined}>
              <b>{s.people}</b>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <ul className="lk-lines">
        <li>{specLine(card)}</li>
        {card.sourcing && <li>{searchLine(card.sourcing)}</li>}
        {card.watches.map((w) => (
          <li key={w.summary}>
            {w.summary}
            {w.found ? `, ${w.found} found` : ""}
            {w.state !== "running" ? ` (${w.state})` : ""}
          </li>
        ))}
      </ul>
      <p className="lk-foot">
        <Cta small href={campaignHref(card.campaignId)}>Open campaign</Cta>
        <Cta small href={campaignHref(card.campaignId, "pipeline")}>Pipeline</Cta>
        <Cta small href={campaignHref(card.campaignId, "shortlisted")}>Shortlisted</Cta>
      </p>
    </section>
  );
}

/** "3 open campaigns", or "3 open, 1 closed" when a closed one is listed too (the agent lists them so it can reopen one). */
export function campaignsHeading(items: readonly { status: string }[]): string {
  const closed = items.filter((c) => c.status === "closed" || c.status === "completed").length;
  const open = items.length - closed;
  if (!closed) return open === 1 ? "1 open campaign" : `${open} open campaigns`;
  return open ? `${open} open, ${closed} closed` : closed === 1 ? "1 closed campaign" : `${closed} closed campaigns`;
}

function CampaignsCard({ card }: { card: Extract<ChatCard, { kind: "campaigns" }> }) {
  return (
    <section className="lk" aria-label="Your campaigns">
      <header className="lk-head">
        <h3 className="lk-title">{campaignsHeading(card.items)}</h3>
      </header>
      <ul className="lk-rows">
        {card.items.map((c) => (
          <li key={c.id}>
            <a className="lk-row" href={campaignHref(c.id)}>
              <span className="lk-row-name">{c.name}</span>
              <span className="lk-row-meta">{[c.client, c.status !== "active" ? c.status : null].filter(Boolean).join(" · ")}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The cards a turn collected, in the order they were looked up. `turnSaid` is what a connect card sends again. */
export function Cards({ cards, turnSaid = null, charted, approvalOpen = false, quiet }: {
  cards: readonly ChatCard[];
  turnSaid?: string | null;
  /** Outcome cards (by key) whose sentence the agent's own words already say: they show only their counts and next steps. */
  quiet?: ReadonlySet<string>;
  /** Campaigns whose charts are drawn in the same answer (see chartedCampaigns). */
  charted?: ReadonlySet<string>;
  /** An approval of this turn is still waiting for a yes: a connect card does not send the request again. */
  approvalOpen?: boolean;
}): JSX.Element | null {
  if (!cards.length) return null;
  return (
    <>
      {cards.map((c) => {
        switch (c.kind) {
          case "people": return <PeopleCard key={c.key} card={c} />;
          case "campaign": return <CampaignCard key={c.key} card={c} charted={charted?.has(c.campaignId) ?? false} />;
          case "view": return <LiveView key={c.key} card={c} />;
          case "campaigns": return <CampaignsCard key={c.key} card={c} />;
          case "counts": return <CountsCard key={c.key} card={c} />;
          case "outcome": return <OutcomeCard key={c.key} summary={c.summary} counts={c.counts} next={c.next} undo={c.undo} campaignId={c.campaignId} quiet={quiet?.has(c.key) ?? false} />;
          case "role_spec": return <RoleSpecCard key={c.key} card={c} />;
          case "link": return <p key={c.key} className="at-link"><Cta href={c.href}>{c.label}</Cta></p>;
          case "attention": return <AttentionCard key={c.key} items={c.items} more={c.more} tasks={c.tasks} />;
          case "export": return <ExportCard key={c.key} campaignId={c.campaignId} campaignName={c.campaignName} list={c.list} format={c.format} />;
          case "file": return <FileCard key={c.key} card={c} />;
          case "connect": return <ConnectCard key={c.key} provider={c.provider} url={c.url} mode={c.mode} field={c.field} reason={c.reason} retryText={c.retryText} turnSaid={turnSaid} waiting={c.waiting !== false} approvalOpen={approvalOpen} products={c.products ?? []} label={c.label ?? null} />;
          case "slots": return <SlotsCard key={c.key} card={c} />;
          case "need_email": return <EmailNeededCard key={c.key} card={c} />;
          case "drafts": return <DraftsCard key={c.key} card={c} />;
          default: return null;
        }
      })}
    </>
  );
}
