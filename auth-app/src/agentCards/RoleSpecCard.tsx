import { Check, Eye, PencilSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoleSpec, RoleSpecCardData } from "../api/agent";
import { LIVE, messageOf } from "../api/client";
import { useFollowingLine, useMayChangeCampaign } from "../campaignRights";
import { refreshCampaign, refreshCampaignAgents } from "../campaignStore";
import { campaignHref } from "../chatCards";
import { Loader } from "../components/Loader";
import { ShimmerText } from "../components/Shimmer";
import { agentApi } from "../api/agent";
import { SearchRun } from "../liveViews/SearchRun";
import { useCampaignSpec } from "../specDraft";
import { Cta } from "./Cta";
import { Peek } from "./Peek";
import { SpecEditor } from "./SpecEditor";
import { useFoundSearch, useRunSearch } from "./searchFeed";
import { approveAndFind, draftAgain, pressId, readStanding, saveSpec, scoreRest } from "./specActions";
import { leaveStep, sameSpec, specProblem } from "./specEdit";
import { countsLine, specView, standingLine, statusWord } from "./specView";
import type { SpecView, Standing } from "./specView";
import "./roleSpecCard.css";

/**
 * A drafted role spec in the chat: the spec as a short summary, and the decision on the same card. Approving does
 * not send a message and does not make a second card: the button is the Role spec page's own Approve, and what the
 * search is doing streams into this card, which then settles to what it found. What it says (draft or approved, which
 * version, how many people, how many are scored) is read from the server, so it is the same after a reload as before:
 * a search still going when the page was left is picked up and followed, not announced as finished.
 */

type Busy = "approve" | "save" | "draft" | "score" | null;

/** How long the card keeps asking after a run ends for the answers the model gives late (they are saved on the server). */
const CATCH_UP_TRIES = 20;

/** The spec of one campaign and what is done to it from a card: save, approve, draft again, score the rest. */
export function useSpecFlow(campaignId: string, follow = true) {
  const spec = useCampaignSpec(campaignId);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* The run the card follows while it works: the one its button started, or the one still going when it was opened. */
  const [runId, setRunId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [standing, setStanding] = useState<Standing | null>(null);
  const adopted = useRef(false);
  const lateTries = useRef(0);
  const approved = spec.latest?.approvedAt != null;

  const read = useCallback(async (): Promise<Standing | null> => {
    const st = await readStanding(campaignId);
    if (st) setStanding(st);
    return st;
  }, [campaignId]);

  /* A card opened while the search is still going (a reload, another tab) follows that run from its start. */
  useEffect(() => {
    if (!follow || !approved || !LIVE) return;
    let live = true;
    void read().then((st) => {
      if (!live || !st || adopted.current) return;
      adopted.current = true;
      if (st.running) { setRunId(st.running.runId); setSearching(true); }
    });
    return () => { live = false; };
  }, [follow, approved, read]);

  /* Settled, it keeps its numbers true: quickly while something runs (another search from the chat), for a while after one
     ends (the late answers), and now and then otherwise, so found, matched and not scored yet always come from one read. */
  useEffect(() => {
    if (!follow || !approved || !LIVE || searching || standing === null) return;
    const late = standing.unscored > 0 && lateTries.current < CATCH_UP_TRIES;
    const every = standing.running ? 3_000 : late ? 6_000 : 30_000;
    const t = window.setTimeout(() => {
      if (document.hidden) { setStanding({ ...standing }); return; }
      if (!standing.running && late) lateTries.current += 1;
      void read();
    }, every);
    return () => window.clearTimeout(t);
  }, [follow, approved, searching, standing, read]);

  const settle = async () => {
    await spec.reload().catch(() => undefined);
    refreshCampaign(campaignId);
    refreshCampaignAgents(campaignId);
  };

  async function run<T>(label: Exclude<Busy, null>, work: () => Promise<T>): Promise<{ value: T } | null> {
    setBusy(label);
    setProblem(null);
    try {
      const value = await work();
      await settle();
      return { value };
    } catch (err) {
      setProblem(messageOf(err));
      await spec.reload().catch(() => undefined);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const follows = (started: string | null) => {
    adopted.current = true;
    lateTries.current = 0;
    setRunId(started);
    setSearching(started !== null);
  };

  return {
    spec, busy, problem, runId, searching, standing,
    /** A new version from the edited spec (the existing edit API); it stays a draft for the person to approve. */
    save: (edited: RoleSpec) => run("save", () => saveSpec(campaignId, edited)),
    /** Approves (saving first when there are edits) and starts the search, as the Role spec page does. */
    approve: (specId: string | null, edited?: RoleSpec) => run("approve", async () => {
      follows((await approveAndFind(campaignId, specId, edited)).runId);
    }),
    /** Scores the people who have not been read closely, as a run the card follows. */
    score: () => run("score", async () => { follows((await scoreRest(campaignId)).runId); }),
    /** Reads the job description saved on the campaign again. */
    draft: () => run("draft", async () => { await draftAgain(campaignId); }),
    /** Follows another search of this campaign (Find more people) in the place of the last one. */
    adoptRun: follows,
    finished: (how: "done" | "failed") => {
      setSearching(false);
      if (how === "failed") setProblem("The search stopped before it finished.");
      void read();
      refreshCampaign(campaignId);
    },
  };
}
export type SpecFlow = ReturnType<typeof useSpecFlow>;

/** The whole spec, in a popup: edit anything, save once (a new version), approve from the same place. */
export function SpecPeek({ open, onClose, flow, view, campaignName, may, canApprove = true }: {
  open: boolean; onClose: () => void; flow: SpecFlow; view: SpecView; campaignName: string; may: boolean;
  /** False where the decision belongs to another card (an approval waiting beside it). */
  canApprove?: boolean;
}): JSX.Element {
  /* Edits belong to the version they were made on: a newer version lands as it is. */
  const [edits, setEdits] = useState<{ id: string | null; spec: RoleSpec } | null>(null);
  /* Leaving with edits asks once; a save says so, in the foot, and the popup stays open for the next step. */
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const base = view.full;
  const edit = base ? (edits && edits.id === view.specId ? edits.spec : base) : null;
  const changed = base !== null && edit !== null && !sameSpec(edit, base);
  const problem = edit ? specProblem(edit) : null;
  const working = flow.busy !== null;
  const approved = view.state === "approved";
  const sub = `${view.title || campaignName}, ${statusWord(view, flow.busy).toLowerCase()}`;
  const FOLLOWING_LINE = useFollowingLine();
  const decide = may && canApprove && (!approved || changed);

  const leave = () => {
    const step = leaveStep(changed, asking);
    if (step === "keep") return setAsking(false);
    if (step === "ask") return setAsking(true);
    setSaved(null);
    onClose();
  };
  const discard = () => { setEdits(null); setAsking(false); setSaved(null); onClose(); };
  const edited = (next: RoleSpec) => { setSaved(null); setEdits({ id: view.specId, spec: next }); };

  const approve = async () => {
    if (await flow.approve(view.specId, changed && edit ? edit : undefined)) { setEdits(null); setSaved(null); onClose(); }
  };
  const save = async () => {
    const done = edit ? await flow.save(edit) : null;
    if (done) { setEdits(null); setSaved(`Saved. Draft v${done.value.version}`); }
  };

  return (
    <Peek
      open={open}
      onClose={leave}
      title="Role spec"
      subtitle={sub}
      note={asking ? "Discard your changes?" : flow.problem ?? (changed ? "Unsaved changes" : saved)}
      footer={
        asking ? (
          <>
            <Cta onClick={() => setAsking(false)}>Keep editing</Cta>
            <Cta onClick={discard}>Discard</Cta>
          </>
        ) : (
          <>
            {may && changed && (
              <Cta onClick={() => void save()} disabled={working || problem !== null} aria-busy={flow.busy === "save"}>
                {flow.busy === "save" ? <Loader size="sm" tone="inherit" /> : null}Save changes
              </Cta>
            )}
            {decide && (
              <Cta variant="primary" icon={Check} onClick={() => void approve()} disabled={working || problem !== null || !base} aria-busy={flow.busy === "approve"}>
                Approve and start finding people
              </Cta>
            )}
            {!decide && !(may && changed) && <Cta onClick={leave}>Close</Cta>}
          </>
        )
      }
    >
      {edit ? <SpecEditor spec={edit} readOnly={!may} onChange={edited} /> : <ShimmerText lines={6} />}
      {!may && <p className="rc-line" style={{ marginTop: 14 }}>{FOLLOWING_LINE}</p>}
    </Peek>
  );
}

/** What the card draws from, apart from the hooks: the spec as read, and what is being done to it. */
export type CardState = {
  view: SpecView;
  busy: Busy;
  problem: string | null;
  searching: boolean;
  /** Where the search stands, from one read of the server; null until it has been read. */
  standing: Standing | null;
  may: boolean;
};

/** The card itself, from plain props (the tests draw each state from here). */
export function RoleSpecCardView({ card, state, onApprove, onDraft, onOpen, onScore }: {
  card: RoleSpecCardData;
  state: CardState;
  onApprove: () => void;
  onDraft: () => void;
  onOpen: () => void;
  onScore?: () => void;
}): JSX.Element {
  const { view, busy, problem, searching, standing, may } = state;
  const FOLLOWING_LINE = useFollowingLine();
  const approving = busy === "approve";
  const drafting = busy === "draft" || view.state === "drafting";
  const approved = view.state === "approved" && !approving;
  const tone = approving || drafting ? "" : ` is-${view.state}`;
  /* Why it stands unfinished: what just went wrong, or what the card was made saying (the draft failed, or needs a look). */
  const trouble = problem ?? (!approved ? card.trouble : null) ?? (view.state === "missing" ? "The role spec didn't come through this time." : null);
  /* Settled and asked: until the server has said where the search stands, the card does not guess. */
  const reading = approved && !searching && LIVE && standing === null;
  const elsewhere = approved && !searching && standing?.running != null;
  const searchAgain = approved && !searching && !elsewhere && !reading && (problem !== null || standing?.found === 0);
  const rest = approved && !searching && !elsewhere && !reading && (standing?.unscored ?? 0) > 0 && (standing?.found ?? 0) > 0;
  const scoring = busy === "score";

  return (
    <section className="rc" aria-label={`Role spec for ${card.campaignName}`} aria-busy={approving || drafting || undefined}>
      <header className="rc-head">
        <h3 className="rc-title">{view.title || card.campaignName}</h3>
        <span className={`rc-status${tone}`} role="status">{statusWord(view, busy)}</span>
      </header>

      {drafting ? (
        <div className="rc-drafting">
          <p className="rc-wait"><Loader size="sm" />Reading the job description…</p>
          <ShimmerText lines={3} />
        </div>
      ) : view.state === "missing" ? null : (
        <>
          {view.meta && <p className="rc-meta">{view.meta}</p>}
          {!approved && !searching && view.mustCount > 0 && (
            <div className="rc-group">
              <p className="rc-group-t">Must have<span className="rc-group-n">{view.mustCount}</span></p>
              <ul className="rc-musts">{view.musts.map((m) => <li key={m}>{m}</li>)}</ul>
              {view.more > 0 && <p className="rc-more">+{view.more} more</p>}
            </div>
          )}
          <p className="rc-line">
            {approved || searching ? countsLine(view.mustCount, view.niceCount) : view.niceCount > 0 ? `${view.niceCount} nice-to-have${view.niceCount === 1 ? "" : "s"}` : ""}
          </p>
        </>
      )}

      {elsewhere && <p className="rc-wait" role="status"><Loader size="sm" />Matching more people</p>}
      {approved && !searching && !elsewhere && standing && <p className="rc-line is-done" role="status">{standingLine(standing)}</p>}
      {trouble && <p className="kc-problem" role="alert">{trouble}</p>}

      {!drafting && !searching && !reading && (
        <div className="cta-row">
          {view.state === "missing" ? (
            may && <Cta variant="primary" onClick={onDraft}>Try again</Cta>
          ) : approved ? (
            <>
              {searchAgain && may && (
                <Cta variant="primary" icon={Check} disabled={busy !== null} onClick={onApprove}>
                  {problem ? "Try again" : "Find people"}
                </Cta>
              )}
              <Cta href={campaignHref(card.campaignId)}>Open campaign</Cta>
              {rest && may && onScore && (
                <Cta disabled={busy !== null} aria-busy={scoring} onClick={onScore}>
                  {scoring ? <Loader size="sm" tone="inherit" /> : null}{standing && standing.found > standing.unscored ? "Score the rest" : "Score them"}
                </Cta>
              )}
              <Cta icon={Eye} onClick={onOpen}>View spec</Cta>
            </>
          ) : (
            <>
              {may ? (
                <Cta variant="primary" icon={approving ? undefined : Check} disabled={approving} aria-busy={approving} onClick={onApprove}>
                  {approving ? <><Loader size="sm" tone="inherit" />Approving</> : problem ? "Try again" : "Approve and start finding people"}
                </Cta>
              ) : (
                <p className="rc-line">{FOLLOWING_LINE}</p>
              )}
              <Cta icon={may ? PencilSimple : Eye} disabled={approving} onClick={onOpen}>{may ? "View and edit spec" : "View spec"}</Cta>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function RoleSpecCard({ card }: { card: RoleSpecCardData }): JSX.Element {
  const flow = useSpecFlow(card.campaignId);
  const may = useMayChangeCampaign(card.campaignId);
  const view = specView(card, flow.spec);
  const [open, setOpen] = useState(false);
  const st = flow.standing;
  const stamp = st ? `${st.found}:${st.unscored}` : "";
  /* The people it found, under the card: the run it started or was still going when opened, followed live; or, with no run
     to follow (a reload, a search long over), the campaign's ranked list as it stands. Same list either way. */
  const live = useRunSearch(flow.runId, card.campaignId, stamp);
  const found = useFoundSearch(card.campaignId, LIVE && view.state === "approved" && flow.runId === null && st !== null && st.running === null, stamp);
  const search = live ?? found;
  const ended = flow.searching && live !== null && live.status !== "running" ? live.status : null;
  const { finished } = flow;
  useEffect(() => { if (ended) finished(ended === "done" ? "done" : "failed"); }, [ended, finished]);
  const findMoreHere = async () => { flow.adoptRun((await agentApi.findMore(card.campaignId, undefined, pressId())).runId); };
  return (
    <>
      <RoleSpecCardView
        card={card}
        state={{ view, busy: flow.busy, problem: flow.problem, searching: flow.searching, standing: st, may }}
        onApprove={() => void flow.approve(view.specId)}
        onDraft={() => void flow.draft()}
        onOpen={() => setOpen(true)}
        onScore={() => void flow.score()}
      />
      {search && view.state === "approved" && (
        <SearchRun turnKey={`role_spec:${card.campaignId}`} search={search} latest onFindMore={findMoreHere} />
      )}
      {view.state !== "missing" && view.state !== "drafting" && (
        <SpecPeek open={open} onClose={() => setOpen(false)} flow={flow} view={view} campaignName={card.campaignName} may={may} />
      )}
    </>
  );
}

/** Beside an approval that waits (a closed campaign's role spec): read and edit the spec; the decision stays on the approval. */
export function SpecButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }): JSX.Element {
  const flow = useSpecFlow(campaignId, false);
  const may = useMayChangeCampaign(campaignId);
  const view = specView({ spec: null, specId: null, version: null, approved: false }, flow.spec);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Cta icon={Eye} onClick={() => setOpen(true)}>View the role spec</Cta>
      <SpecPeek open={open} onClose={() => setOpen(false)} flow={flow} view={view} campaignName={campaignName} may={may} canApprove={false} />
    </>
  );
}
