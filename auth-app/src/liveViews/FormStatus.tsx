import { useEffect, useMemo, useState } from "react";
import { matchNote } from "../api/forms";
import { Loader } from "../components/Loader";
import type { ResponseMeta } from "../api/forms";
import { agoLabel } from "../clients";
import { Clarified } from "../Clarify";
import { useCampaignRows } from "../campaignStore";
import type { Form, FormResponse } from "../campaign";
import { mustHaves } from "../campaign";
import { candidateFromCardPerson } from "../liveCandidate";
import { putSet } from "../liveCandidates";
import { act } from "../moments";
import {
  decideResponse, getFormMeta, loadResponses, retryForms, useFormMeta, useForms, useFormsLoad, useResponses,
} from "../formsStore";
import { FormStatusList } from "../Moments";
import type { FormStatusRow } from "../Moments";
import { campaignAsk, resolvedCampaignId } from "./ask";
import type { Counts } from "./formStatus";
import { answeredLine, defaultOpen, inView, orderForms, responseLine, stageWords, standingOf, stateLine, totalsLine } from "./formStatus";
import type { FormSummary } from "./formSummary";
import { hasMustHaves, useSummaries } from "./formSummary";
import type { LiveViewProps } from "./types";
import "./liveFormsOutreach.css";

/**
 * How a campaign's forms are doing, in the chat: each form with its state, how many answered and
 * how many met every must-have, the link to share once it is published, and who answered, with
 * the call to make on each (add to the shortlist, or pass). Counts come from the server, against
 * the version applicants saw. Which campaign is asked first when the request didn't say.
 */
export default function FormStatusView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const ask = useMemo(() => campaignAsk(card, rows, { ask: "Which campaign's forms?" }), [card, rows]);
  return (
    <Clarified kind="form-status" ctx={ctx} ask={ask}>
      {(c) => <Body card={card} ctx={c} />}
    </Clarified>
  );
}

const SHOWN = 5;

function Body({ card, ctx }: LiveViewProps): JSX.Element | null {
  const campaignId = resolvedCampaignId(card, ctx) ?? "";
  const campaigns = useCampaignRows();
  const name = campaigns.find((r) => r.id === campaignId)?.name ?? card.campaignName ?? "This campaign";
  const forms = useForms(campaignId);
  const load = useFormsLoad(campaignId);
  const ordered = useMemo(
    () => orderForms(forms, (f) => ({ status: getFormMeta(f.id).status, answered: getFormMeta(f.id).responses })),
    [forms],
  );
  const summaries = useSummaries(ordered.map((f) => ({ id: f.id, answered: getFormMeta(f.id).responses })));
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  const open = chosen ?? new Set(defaultOpen(ordered, (f) => {
    const m = getFormMeta(f.id);
    return { answered: m.responses, waiting: m.newApplicants };
  }) ?? []);

  useEffect(() => { ctx.onGrow(); }, [forms, load, summaries.byId, chosen, ctx]);

  if (!campaignId) return null;
  if (load === "loading") return <p className="pt-first" aria-live="polite"><Loader size="sm" /> Counting the answers</p>;
  if (load !== "ready") {
    return (
      <div className="src mo">
        <p className="mo-note" role="alert">{load}</p>
        <div className="mo-acts"><button type="button" className="src-btn is-quiet mo-small" onClick={() => retryForms(campaignId)}>Try again</button></div>
      </div>
    );
  }
  if (!ordered.length) {
    return (
      <div className="src mo">
        <p className="mo-note">{name} has no form yet.</p>
        <div className="mo-acts">
          <button type="button" className="src-btn is-primary mo-small" onClick={() => act(ctx, `Create a screening form for ${name}`)}>Write a screening form</button>
        </div>
      </div>
    );
  }

  const countsOf = (id: string): Counts => {
    const s = summaries.byId.get(id);
    return {
      total: s?.total ?? getFormMeta(id).responses,
      met: s?.met ?? 0,
      missed: s?.missed ?? 0,
      waiting: getFormMeta(id).newApplicants,
      hasMust: s ? hasMustHaves(s) : false,
    };
  };
  const lead = totalsLine(ordered.map((f) => countsOf(f.id)));
  const toggle = (id: string) => setChosen((cur) => {
    const next = new Set(cur ?? open);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const list: FormStatusRow[] = ordered.map((f) => ({
    id: f.id,
    name: f.name || "Untitled form",
    sub: <State id={f.id} closesOn={f.page?.closesOn ?? null} />,
    said: <Said id={f.id} summary={summaries.byId.get(f.id)} />,
    ...(getFormMeta(f.id).responses > 0 ? { onOpen: () => ctx.openForm?.(campaignId, f.id, "responses") } : {}),
    ...(ctx.openForm ? { onBuild: () => ctx.openForm?.(campaignId, f.id, "build") } : {}),
    more: (
      <div className="lf-more">
        <Share form={f} campaignId={campaignId} ctx={ctx} traffic={summaries.byId.get(f.id)?.traffic} />
        <WhoAnswered form={f} campaignId={campaignId} ctx={ctx} summary={summaries.byId.get(f.id)} open={open.has(f.id)} onToggle={() => toggle(f.id)} />
      </div>
    ),
  }));

  return (
    <div className="src mo">
      {lead && <p className="src-para">{lead}</p>}
      <FormStatusList rows={list} className="lf-fstat" />
    </div>
  );
}

/** Under the name: where the form stands, in plain words. */
function State({ id, closesOn }: { id: string; closesOn: string | null }) {
  const meta = useFormMeta(id);
  return <>{stateLine(meta.status, closesOn)}</>;
}

/** How many answered and how many cleared the must-haves. Updates as decisions are made. */
function Said({ id, summary }: { id: string; summary: FormSummary | undefined }) {
  const meta = useFormMeta(id);
  /* Until the server's count of who met the must-haves arrives, only the number who answered is known. */
  if (meta.responses > 0 && !summary) return <>{meta.responses} answered</>;
  return (
    <>
      {answeredLine({
        total: summary?.total ?? meta.responses,
        met: summary?.met ?? 0,
        missed: summary?.missed ?? 0,
        waiting: meta.newApplicants,
        hasMust: summary ? hasMustHaves(summary) : false,
      })}
    </>
  );
}

/** The link to send, shown only once the form is published; a draft says how to get one. */
function Share({ form, campaignId, ctx, traffic }: { form: Form; campaignId: string; ctx: LiveViewProps["ctx"]; traffic: FormSummary["traffic"] }) {
  const meta = useFormMeta(form.id);
  const [copied, setCopied] = useState(false);
  if (meta.status === "closed") return <p className="lf-line">The link now says the form has closed.</p>;
  if (meta.status !== "live" || !meta.publicLink) {
    return (
      <p className="lf-line">
        It has no link until it is published.{" "}
        <button type="button" className="lt-link" onClick={() => ctx.openForm?.(campaignId, form.id, "share")}>Publish it from the builder</button>
      </p>
    );
  }
  const link = meta.publicLink;
  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }, () => {});
  };
  return (
    <div className="lf-link">
      <a className="lf-url" href={link} target="_blank" rel="noreferrer" title={link}>{link}</a>
      <button type="button" className="src-btn is-quiet mo-small" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
      {traffic && traffic.views > 0 && (
        <span className="lf-traffic t-body-sm">
          {traffic.views} {traffic.views === 1 ? "person has" : "people have"} opened it, {traffic.applications} applied
        </span>
      )}
    </div>
  );
}

/** Who answered, newest and undecided first, with the call to make on each. Opens on demand. */
function WhoAnswered({ form, campaignId, ctx, summary, open, onToggle }: {
  form: Form; campaignId: string; ctx: LiveViewProps["ctx"]; summary: FormSummary | undefined; open: boolean; onToggle: () => void;
}) {
  const meta = useFormMeta(form.id);
  if (meta.responses === 0) return null;
  return (
    <div className="lf-who">
      <button type="button" className="lt-link" aria-expanded={open} onClick={onToggle}>{open ? "Hide who answered" : "See who answered"}</button>
      {open && <Answers form={form} campaignId={campaignId} ctx={ctx} hasMust={summary ? hasMustHaves(summary) : mustHaves(form).length > 0} />}
    </div>
  );
}

function Answers({ form, campaignId, ctx, hasMust }: { form: Form; campaignId: string; ctx: LiveViewProps["ctx"]; hasMust: boolean }) {
  const live = useResponses(form.id);
  const [problem, setProblem] = useState<string | null>(null);

  /* People already in the workspace open their profile from their name; the sheet looks them up here. */
  const matched = useMemo(() => live.list.filter((r) => !r.person.id.startsWith("applicant-")), [live.list]);
  useEffect(() => {
    const candidates = matched
      .map((r) => candidateFromCardPerson({
        personId: null, candidateId: r.person.id, name: r.person.name, title: r.person.title || null, company: r.person.company || null,
        city: null, years: null, strengths: [], linkedinUrl: r.linkedin ?? null,
      }))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (candidates.length) putSet({ key: `form:${form.id}`, campaignId, candidates, criteria: [], reasons: {}, total: candidates.length });
  }, [matched, form.id, campaignId]);
  useEffect(() => { ctx.onGrow(); }, [live.list, live.loading, problem, ctx]);

  if (live.loading && live.list.length === 0) return <p className="pt-first"><Loader size="sm" /> Loading who answered</p>;
  if (live.error && live.list.length === 0) {
    return <p className="lt-note" role="alert">{live.error}{" "}<button type="button" className="lt-link" onClick={() => void loadResponses(form.id)}>Try again</button></p>;
  }
  const { shown, hidden } = inView(live.list, (id) => live.meta.get(id), SHOWN);
  const ids = matched.map((r) => r.person.id);
  const decide = async (r: FormResponse, d: "add" | "pass", linkTo?: string) => {
    setProblem(null);
    const err = await decideResponse(form.id, r.id, d, linkTo);
    if (err) setProblem(err);
  };
  return (
    <>
      <ol className="lt-people">
        {shown.map((r) => (
          <Person key={r.id} r={r} form={form} hasMust={hasMust} meta={live.meta.get(r.id)}
            onOpen={ids.includes(r.person.id) ? () => ctx.openProfile(r.person.id, ids) : undefined}
            onDecide={(d, linkTo) => void decide(r, d, linkTo)} />
        ))}
      </ol>
      {problem && <p className="lt-note" role="alert">{problem}</p>}
      {hidden > 0 && (
        <p className="lt-more">
          <button type="button" className="lt-link" onClick={() => ctx.openForm?.(campaignId, form.id, "responses")}>
            {hidden} more in the responses
          </button>
        </p>
      )}
    </>
  );
}

function Person({ r, form, hasMust, meta, onOpen, onDecide }: {
  r: FormResponse; form: Form; hasMust: boolean; meta: ResponseMeta | undefined; onOpen?: () => void; onDecide: (d: "add" | "pass", linkTo?: string) => void;
}) {
  const standing = standingOf(meta);
  const match = standing !== "on-board" && meta?.decision !== "passed" ? meta?.possibleMatch : null;
  const first = r.person.name.split(/\s+/)[0] ?? r.person.name;
  return (
    <li className="lt-person">
      <div className="lt-person-main">
        {onOpen
          ? <button type="button" className="lt-person-open" onClick={onOpen}>{r.person.name}</button>
          : <span className="lt-person-name">{r.person.name}</span>}
        <span className="lt-person-meta">{responseLine(r, form, hasMust)}, {agoLabel(r.at).toLowerCase()}</span>
        {match && <span className="lt-person-why">{matchNote(match)}</span>}
        {standing === "passed" && <span className="lt-person-why">You passed on {first}</span>}
      </div>
      {standing === "on-board" ? (
        <span className="lt-person-done">{stageWords(meta?.stage ?? "")}</span>
      ) : (
        <span className="lt-person-acts">
          {match ? (
            <>
              <button type="button" className="src-btn is-primary mo-small" onClick={() => onDecide("add", match.candidateId)}>Add as {match.name}</button>
              <button type="button" className="src-btn is-quiet mo-small" onClick={() => onDecide("add")}>Add as a new person</button>
            </>
          ) : (
            <button type="button" className={`src-btn mo-small${standing === "waiting" ? " is-primary" : " is-quiet"}`} onClick={() => onDecide("add")}>Add to shortlist</button>
          )}
          {standing === "waiting" && <button type="button" className="src-btn is-quiet mo-small" onClick={() => onDecide("pass")}>Pass</button>}
        </span>
      )}
    </li>
  );
}
