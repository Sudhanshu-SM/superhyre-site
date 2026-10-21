import {
  ArrowLeft, CaretDown, CaretLeft, CaretRight, ChartBar, CheckCircle, ClipboardText, DownloadSimple, FileCsv, FileXls,
  GoogleDriveLogo, Info, MagnifyingGlass, Table as TableIcon, User, X,
} from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { decidedLine, getTraffic, matchNote, type ResponseMeta, type Traffic } from "./api/forms";
import type { ExportKind } from "./api/exports";
import { EXPORT_COLUMNS, exportRows, exportToSheets, recordExport } from "./api/exports";
import { LIVE, lastFailureKind, messageOf } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { ErrorState, kindOfLastFailure } from "./ErrorStates";
import { Bars } from "./Bars";
import type { Answer, Form, FormResponse, PipelinePerson, Question, StageId } from "./campaign";
import { STAGES, agoLabel, answerable, meetsMustHave, missedMustHaves, mustHaveOf, mustHaves, responsesFor } from "./campaign";
import { useMayChangeCampaign } from "./campaignRights";
import { movePerson, usePipeline } from "./campaignStore";
import { Avatar } from "./CandidateBits";
import { PersonDialog } from "./CampaignWorkspace";
import { PassReasonDialog } from "./PassReason";
import { Popover, useToast } from "./Contacts";
import type { AnswerFilter, MustFilter } from "./exportTable";
import {
  copyText, download, exportName, filterResponses, responseTable, shortlistName, shortlistTable, submittedAt, toCSV, toTSV, toXLSX, tookLabel,
} from "./exportTable";
import { cap, shortTitle } from "./formKit";
import { googleHint, useGoogle } from "./googleSetup";
import { useScrollMemory, useSectionSave } from "./sectionMemory";
import { hasDeepLink, loadSection, take } from "./sectionState";
import { decideResponse, getFormMeta, loadResponses, saveResponse, useResponses } from "./formsStore";
import { displayPhone } from "./phone";
import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";

/**
 * Responses to one form, three ways: a summary per question, one person at
 * a time, and a table. One filter (must-haves, a clicked answer, a search)
 * applies to every view and to every export. A missed must-have is shown
 * calmly, as something to look at; nothing happens to anyone automatically.
 */

type View = "summary" | "one" | "table";

const median = (xs: readonly number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};
const isEmpty = (a: Answer | undefined) => a === undefined || a === "" || (Array.isArray(a) && !a.length);
const first = (name: string) => name.split(/\s+/)[0] ?? name;
const stageLabel = (s: StageId) => (s === "passed" ? "Rejected" : STAGES.find((x) => x.id === s)?.label ?? s);
const STAGE_IDS: readonly string[] = ["shortlisted", "outreach", "interviewing", "hired", "passed"];
const asStage = (s: string | null | undefined): StageId | null => (s && STAGE_IDS.includes(s) ? (s as StageId) : null);

/** Who a response is matched to, for the stage column and the exports. */
type Placed = { id: string; stage: StageId; email?: { value: string } | null };

/** With the API: what was decided about each response, and how to decide. */
type Decisions = {
  meta: ReadonlyMap<string, ResponseMeta>;
  /** `linkTo`: add as an existing candidate the recruiter confirmed is the same person. */
  decide: (ids: readonly string[], d: "add" | "pass", linkTo?: string, reason?: string) => void;
  /** Keeps one applicant in Candidates, on no campaign's board and with no decision made. */
  save: (id: string) => void;
};
const inField = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const isLink = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s);
const href = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
/** A distribution: one colour, the most common bucket (the mode) in full accent with its count. */
const mode = (data: { label: string; value: number }[]) => {
  const top = Math.max(0, ...data.map((d) => d.value));
  return data.map((d) => ({ ...d, color: d.value === top && top > 0 ? "var(--accent)" : "var(--accent-line)", strong: d.value === top && top > 0 }));
};

/* Where the person left this form's responses in this tab. A view, a question or a must-have filter this form does not have
   falls back to the default. */
type Remembered = { view: View; answer: AnswerFilter; search: string; onlyNew: boolean; must: MustFilter };
const NOTHING: Remembered = { view: "summary", answer: null, search: "", onlyNew: false, must: "all" };
export function readResponsesRemembered(r: Record<string, unknown>, form: Pick<Form, "questions">): Remembered {
  const a = take.rec(r.answer);
  const qid = take.str(a.qid, "", 80);
  const value = take.str(a.value, "", 200);
  const known = qid !== "" && form.questions.some((q) => q.id === qid);
  return {
    view: take.oneOf(r.view, ["summary", "one", "table"] as const, "summary"),
    answer: known ? { qid, value } : null,
    search: take.str(r.search, "", 100),
    onlyNew: take.bool(r.onlyNew),
    must: take.oneOf(r.must, ["all", "met", "missed"] as const, "all"),
  };
}

export function FormResponses({ form, must, onMust, onBuild, onShare }: {
  form: Form; must: MustFilter; onMust: (m: MustFilter) => void; onBuild: () => void; onShare: () => void;
}) {
  const live = useResponses(form.id);
  const toast = useToast();
  const fixture = useMemo(() => (LIVE ? [] : responsesFor(form)), [form]);
  const all = LIVE ? live.list : fixture;
  const pipeline = usePipeline(form.campaign);
  const people = useMemo(() => new Map(pipeline.map((p) => [p.id, p])), [pipeline]);
  /* With the API the stage comes with each response, not from the fixture board. */
  const placed = useMemo<ReadonlyMap<string, Placed>>(() => {
    if (!LIVE) return people;
    const out = new Map<string, Placed>();
    for (const r of all) {
      const m = live.meta.get(r.id);
      /* Passed on from the responses before ever reaching the board still has a stage to show. */
      const stage = asStage(m?.stage) ?? (m?.decision === "passed" ? "passed" : null);
      if (stage) out.set(r.person.id, { id: r.person.id, stage });
    }
    return out;
  }, [people, all, live.meta]);
  /* Deciding who is shortlisted or rejected from a form is the campaign's people's; anyone else reads the answers. */
  const may = useMayChangeCampaign(form.campaign);
  const decisions: Decisions | null = LIVE && may ? {
    meta: live.meta,
    decide: (ids, d, linkTo, reason) => {
      // Adding in bulk never decides who someone is: applicants whose email matches a
      // candidate wait for a one-by-one choice, so no duplicate person is made by accident.
      const held = d === "add" && !linkTo && ids.length > 1 ? ids.filter((id) => live.meta.get(id)?.possibleMatch) : [];
      const go = ids.filter((id) => !held.includes(id));
      void Promise.all(go.map((id) => decideResponse(form.id, id, d, linkTo, reason))).then((errs) => {
        const failed = errs.filter((e): e is string => e !== null);
        const ok = go.length - failed.length;
        if (ok) toast(decidedLine(d, ok, linkTo ? live.meta.get(go[0] ?? "")?.possibleMatch ?? null : null));
        if (held.length) toast(`${held.length === 1 ? "One has" : `${held.length} have`} the same email as someone in your candidates. Decide ${held.length === 1 ? "that one" : "those"} one by one.`);
        if (failed[0]) toast(failed[0], "error");
      });
    },
    save: (id) => {
      void saveResponse(form.id, id).then((err) => toast(err ?? "Added to your candidates", err ? "error" : undefined));
    },
  } : null;
  const hasMust = mustHaves(form).length > 0;
  const section = `responses:${form.id}`;
  const [start] = useState<Remembered>(() => (hasDeepLink() ? NOTHING : loadSection(section, (r) => readResponsesRemembered(r, form), NOTHING)));
  const [view, setView] = useState<View>(start.view);
  const [answer, setAnswer] = useState<AnswerFilter>(start.answer);
  const [search, setSearch] = useState(start.search);
  const [onlyNew, setOnlyNew] = useState(start.onlyNew);
  useEffect(() => { if (start.must !== must) onMust(start.must); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useSectionSave(section, { view, answer, search, onlyNew, must }, true);
  useScrollMemory(section, !(LIVE && !live.list.length && live.loading), !hasDeepLink());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);

  const mustF = hasMust ? must : "all";
  const missedN = useMemo(() => all.filter((r) => missedMustHaves(form, r.answers).length > 0).length, [all, form]);
  const newN = useMemo(() => all.filter((r) => live.meta.get(r.id)?.isNew).length, [all, live.meta]);
  const rows = useMemo(() => {
    const hit = filterResponses(form, all, { must: mustF, answer, search: view === "summary" ? "" : search });
    return onlyNew ? hit.filter((r) => live.meta.get(r.id)?.isNew) : hit;
  }, [form, all, mustF, answer, search, view, onlyNew, live.meta]);
  const times = all.map((r) => r.took).filter(Number.isFinite);

  if (LIVE && !all.length && (live.loading || live.error)) {
    return (
      live.error
        ? <ErrorState kind={kindOfLastFailure(lastFailureKind())} title={null} text={live.error} action={{ label: "Try again", onClick: () => void loadResponses(form.id) }} />
        : <ResponsesGhost />
    );
  }

  if (!all.length) {
    const draft = LIVE ? getFormMeta(form.id).status !== "live" : form.status === "draft" || !form.sent;
    return draft ? (
      <div className="cw-empty">
        <EmptyArt name="empty-responses" size={180} />
        <h2>Nothing in yet.</h2>
        <p>{LIVE ? "Publish the form and share its link. Answers show up here as they arrive." : "Publish the form and send it with your outreach. Answers show up here as they arrive."}</p>
        <button type="button" className="cw-btn is-primary" onClick={onShare}>Go to Share</button>
      </div>
    ) : (
      <div className="cw-empty">
        <EmptyArt name="empty-responses" size={180} />
        <h2>Waiting for the first response</h2>
        <p>{LIVE ? "Share the link with candidates. Answers show up here as they arrive." : "Responses usually start within a day of outreach going out."}</p>
      </div>
    );
  }

  const rate = form.sent ? Math.min(100, Math.round((all.length / form.sent) * 100)) : 0;
  const answerQ = answer ? form.questions.find((q) => q.id === answer.qid) : null;
  const openOne = (id: string) => { setCurrent(id); setView("one"); };

  return (
    <div className="fm-resp">
      <div className="cw-stats fm-stats">
        <div>
          <strong className="t-num-md">{LIVE && live.more ? `${all.length}+` : all.length}</strong><span className="t-body-sm">{all.length === 1 ? "response" : "responses"}</span>
          {LIVE && live.more && <small className="t-body-sm fm-stat-sub">Showing the newest {all.length}</small>}
          {form.sent > 0 && <small className="t-body-sm fm-stat-sub">{rate}% of {form.sent} sent</small>}
        </div>
        {hasMust ? (
          <>
            <div><strong className="t-num-md">{all.length - missedN}</strong><span className="t-body-sm">met every must-have</span></div>
            <div><strong className="t-num-md">{missedN}</strong><span className="t-body-sm">missed a must-have</span></div>
          </>
        ) : (
          <div className="fm-stat-wide"><strong className="t-body-strong">No must-haves set</strong><button type="button" className="fm-link-btn is-accent" onClick={onBuild}>Add one</button></div>
        )}
        {times.length > 0 && <div><strong className="t-num-md">{tookLabel(median(times))}</strong><span className="t-body-sm">typical time</span></div>}
      </div>

      <div className="fm-controls">
        <div className="cw-seg" role="tablist" aria-label="Responses view">
          {([["summary", "Summary", <ChartBar key="i" size={14} />], ["one", "One by one", <User key="i" size={14} />], ["table", "Table", <TableIcon key="i" size={14} />]] as const).map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? "is-on" : ""} onClick={() => setView(id)}>{icon} {label}</button>
          ))}
        </div>
        {hasMust && (
          <div className="cw-seg" role="group" aria-label="Filter by must-haves">
            {([["all", "All", all.length], ["met", "Met must-haves", all.length - missedN], ["missed", "Missed a must-have", missedN]] as const).map(([id, label, n]) => (
              <button key={id} type="button" aria-pressed={must === id} className={must === id ? "is-on" : ""} onClick={() => { onMust(id); setSelected(new Set()); }}>
                {label} <span className="fm-tab-n">{n}</span>
              </button>
            ))}
          </div>
        )}
        {LIVE && newN > 0 && (
          <div className="cw-seg" role="group" aria-label="New applicants">
            <button type="button" aria-pressed={onlyNew} className={onlyNew ? "is-on" : ""} onClick={() => { setOnlyNew((o) => !o); setSelected(new Set()); }}>
              New applicants <span className="fm-tab-n">{newN}</span>
            </button>
          </div>
        )}
        {answer && answerQ && (
          <button type="button" className="fm-afilter" onClick={() => setAnswer(null)} aria-label={`Remove filter ${cap(shortTitle(answerQ))}: ${answer.value}`}>
            {cap(shortTitle(answerQ))}: {answer.value} <X size={12} weight="bold" aria-hidden="true" />
          </button>
        )}
        {view !== "summary" && (
          <label className="fm-search">
            <MagnifyingGlass size={14} aria-hidden="true" />
            <span className="sr-only">Search responses</span>
            <input type="search" value={search} placeholder="Search people or answers" onChange={(e) => setSearch(e.target.value)} />
          </label>
        )}
        <ExportMenu form={form} rows={rows} all={all} selected={selected} must={mustF} filtered={!!answer || onlyNew || (view !== "summary" && !!search.trim())} people={placed} />
      </div>

      {view === "summary" && <Summary form={form} rows={rows} people={people} hasMust={hasMust} onAnswer={(q, value) => setAnswer({ qid: q.id, value })} />}
      {view === "one" && <OneByOne form={form} rows={rows} people={people} hasMust={hasMust} current={current} setCurrent={setCurrent} decisions={decisions} />}
      {view === "table" && <ResponseTable form={form} rows={rows} people={placed} hasMust={hasMust} selected={selected} setSelected={setSelected} onOpen={openOne} decisions={decisions} />}
    </div>
  );
}

/** The responses while they load: the figures row, the real view switch, and two question cards, in the page's own classes. */
function ResponsesGhost(): JSX.Element {
  return (
    <ShimmerRegion label="Loading responses" className="fm-resp">
      <div className="cw-stats fm-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i}><strong className="t-num-md"><Shimmer h={20} lh={28} w={34} r={6} /></strong><span className="t-body-sm"><Shimmer h={12} lh={20} w={96 + i * 12} /></span></div>
        ))}
      </div>
      <div className="fm-controls" aria-hidden="true">
        <div className="cw-seg" role="tablist" aria-label="Responses view">
          {([["summary", "Summary", <ChartBar key="i" size={14} />], ["one", "One by one", <User key="i" size={14} />], ["table", "Table", <TableIcon key="i" size={14} />]] as const).map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={id === "summary"} className={id === "summary" ? "is-on" : ""} disabled tabIndex={-1}>{icon} {label}</button>
          ))}
        </div>
      </div>
      <div className="fm-sum" aria-hidden="true">
        {[0, 1].map((i) => (
          <article key={i} className="fm-qsum">
            <header className="fm-qsum-h"><Shimmer h={14} lh={24} w={`${48 + i * 14}%`} /></header>
            <ul className="bars is-h">
              {[0, 1, 2].map((k) => (
                <li key={k}>
                  <div className="bars-row">
                    <span className="bars-l"><Shimmer h={11} w={`${50 + ((k * 21 + i * 9) % 40)}%`} /></span>
                    <span className="bars-track"><Shimmer h={7} r={4} w={`${36 + ((k * 27 + i * 13) % 56)}%`} /></span>
                    <span className="bars-v"><Shimmer h={11} w={24} /></span>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </ShimmerRegion>
  );
}

/* ── export ── */

function ExportMenu({ form, rows, all, selected, must, filtered, people }: {
  form: Form; rows: readonly FormResponse[]; all: readonly FormResponse[]; selected: ReadonlySet<string>; must: MustFilter; filtered: boolean;
  people: ReadonlyMap<string, Placed>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const close = useCallback(() => setOpen(false), []);
  const picked = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
  const n = picked.length;
  const scope = selected.size ? `Exporting ${n} selected`
    : !filtered && must === "all" && n === all.length ? `Exporting all ${n} responses`
    : must === "met" && !filtered ? `Exporting ${n} that met every must-have`
    : must === "missed" && !filtered ? `Exporting ${n} that missed a must-have`
    : `Exporting ${n} matching response${n === 1 ? "" : "s"}`;
  const table = () => responseTable(form, picked, people);
  /* The file is already on their machine; a missed audit row isn't worth an error. */
  const audit = (format: "csv" | "xlsx") => {
    if (LIVE) void recordExport({ kind: "responses", campaignId: form.campaign, format, rowCount: n, filters: { formId: form.id, must, filtered, selected: selected.size } }).catch(() => {});
  };
  const done = (msg: string) => { close(); toast(msg); };
  return (
    <>
      <button ref={ref} type="button" className="cw-btn fm-export" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DownloadSimple size={14} /> Export <CaretDown size={12} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={280}>
        <div className="ct-menu fm-export-menu" role="menu">
          <p className="t-caption fm-export-h">{scope}</p>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!n}
            onClick={() => { download(toCSV(table()), "text/csv;charset=utf-8", exportName(form, "csv")); audit("csv"); done(`Downloaded ${n} response${n === 1 ? "" : "s"}`); }}>
            <FileCsv size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>Download CSV</strong><small>Works anywhere. UTF-8, opens cleanly in Excel</small></span>
          </button>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!n}
            onClick={() => { download(toXLSX(table()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", exportName(form, "xlsx")); audit("xlsx"); done(`Downloaded ${n} response${n === 1 ? "" : "s"}`); }}>
            <FileXls size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>Download Excel (.xlsx)</strong><small>Formatted, header row frozen</small></span>
          </button>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!n}
            onClick={() => { void copyText(toTSV(table())).then(() => done(`Copied ${n} row${n === 1 ? "" : "s"}`)); }}>
            <ClipboardText size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>Copy as table</strong><small>Paste straight into Sheets or Excel</small></span>
          </button>
        </div>
      </Popover>
    </>
  );
}

/* ── summary ── */

function Summary({ form, rows, people, hasMust, onAnswer }: {
  form: Form; rows: readonly FormResponse[]; people: ReadonlyMap<string, PipelinePerson>; hasMust: boolean; onAnswer: (q: Question, v: string) => void;
}) {
  const musts = mustHaves(form);
  let n = 0;
  /* Charts sit two to a row only in pairs: a choice question with no
     partner beside it takes the whole row, so the grid never has a hole. */
  const half = (q: Question) => q.type === "choice" || q.type === "yesno" || q.type === "multi" || q.type === "dropdown";
  const wideIds = new Set<string>();
  let run: Question[] = [];
  const flush = () => { if (run.length % 2) wideIds.add(run[run.length - 1]!.id); run = []; };
  for (const q of form.questions) { if (half(q)) run.push(q); else flush(); }
  flush();
  return (
    <div className="fm-sum">
      {LIVE && <TrafficCard formId={form.id} />}
      {hasMust && (
        <article className="fm-qsum is-wide">
          <header className="fm-qsum-h"><h3>Must-haves</h3></header>
          <ul className="fm-must-rows">
            {musts.map((q) => {
              const answered = rows.filter((r) => !isEmpty(r.answers[q.id]));
              const met = answered.filter((r) => meetsMustHave(q, r.answers[q.id])).length;
              const missed = answered.length - met;
              const tot = Math.max(1, met + missed);
              return (
                <li key={q.id}>
                  <span className="fm-must-q">{q.title}</span>
                  <span className="fm-must-bar" role="img" aria-label={`${met} met, ${missed} missed`}>
                    <span className="is-met" style={{ width: `${(met / tot) * 100}%` }} />
                    <span className="is-missed" style={{ width: `${(missed / tot) * 100}%` }} />
                  </span>
                  <span className="t-body-sm fm-must-n">{met} met · {missed} missed</span>
                </li>
              );
            })}
          </ul>
          <p className="t-caption fm-muted">A missed must-have does not mean rejected. Have a look and decide.</p>
        </article>
      )}
      {form.questions.map((q) => {
        if (q.type === "section") return <p key={q.id} className="fm-sum-sec t-label">{q.title || "Untitled section"}</p>;
        n += 1;
        return <QSummary key={q.id} q={q} n={n} rows={rows} people={people} onAnswer={onAnswer} wide={wideIds.has(q.id)} />;
      })}
    </div>
  );
}

/** What a source is called in a sentence: "linkedin" → "LinkedIn", a domain stays a domain. */
const SOURCE_NAMES: Readonly<Record<string, string>> = {
  linkedin: "LinkedIn", whatsapp: "WhatsApp", email: "Email", careers: "Careers page", direct: "Opened directly",
  "linkedin.com": "LinkedIn", "lnkd.in": "LinkedIn", "naukri.com": "Naukri", "instagram.com": "Instagram", "t.co": "X",
};
export const sourceName = (s: string) => SOURCE_NAMES[s] ?? (s.includes(".") ? s : cap(s.replace(/[-_]+/g, " ")));

/** How the link is doing: who opened it, who applied, and where they came from. */
function TrafficCard({ formId }: { formId: string }) {
  const [t, setT] = useState<Traffic | null>(null);
  useEffect(() => {
    let gone = false;
    getTraffic(formId).then((x) => { if (!gone) setT(x); }, () => {});
    return () => { gone = true; };
  }, [formId]);
  if (!t || (!t.views && !t.applications)) return null;
  const top = Math.max(1, ...t.sources.map((s) => s.views + s.applications));
  return (
    <article className="fm-qsum is-wide fm-traffic" aria-labelledby={`fm-traffic-${formId}`}>
      <header className="fm-qsum-h"><h3 id={`fm-traffic-${formId}`}>How the link is doing</h3></header>
      <dl className="fm-traffic-nums">
        <div><dt>Opened by</dt><dd className="t-num-lg">{t.views.toLocaleString("en-IN")}</dd></div>
        <div><dt>Applied</dt><dd className="t-num-lg">{t.applications.toLocaleString("en-IN")}</dd></div>
        {t.conversion !== null && <div><dt>Of those who opened it</dt><dd className="t-num-lg">{t.conversion}%</dd></div>}
      </dl>
      {t.sources.length > 0 && (
        <ul className="fm-traffic-src" aria-label="Where people came from">
          {t.sources.map((s) => (
            <li key={s.source}>
              <span className="fm-traffic-n">{sourceName(s.source)}</span>
              <span className="fm-traffic-bar" aria-hidden="true"><span style={{ width: `${((s.views + s.applications) / top) * 100}%` }} /></span>
              <span className="t-body-sm fm-traffic-v">{s.views} opened · {s.applications} applied</span>
            </li>
          ))}
        </ul>
      )}
      <p className="t-caption fm-muted">Each visitor counts once a day. Copy a link for each place you share it (Share tab) to see which one works.</p>
    </article>
  );
}

function QSummary({ q, n, rows, people, onAnswer, wide: alone }: {
  q: Question; n: number; rows: readonly FormResponse[]; people: ReadonlyMap<string, PipelinePerson>; onAnswer: (q: Question, v: string) => void; wide?: boolean;
}) {
  const [all, setAll] = useState(false);
  const answered = rows.filter((r) => !isEmpty(r.answers[q.id]));
  const k = answered.length;
  let body: ReactNode = null;
  let sub: ReactNode = null;

  if (q.type === "choice" || q.type === "yesno" || q.type === "dropdown") {
    const opts = q.type === "yesno" ? ["Yes", "No"] : q.options ?? [];
    const acc = mustHaveOf(q);
    const counts = opts.map((o) => answered.filter((r) => r.answers[q.id] === o).length);
    const theirs = otherAnswers(q, answered);
    const top = Math.max(...counts, theirs.length, 0);
    const pct = (c: number) => `${k ? Math.round((c / k) * 100) : 0}%`;
    body = <Bars orient="horizontal" unit="people" data={[
      ...opts.map((o, i) => {
        const c = counts[i]!;
        return {
          label: o, value: c, hint: `${c} people, ${pct(c)}`, shown: `${c} · ${pct(c)}`, onClick: () => onAnswer(q, o),
          ...(acc ? (acc.includes(o) ? { color: "var(--c-sage-fill)" } : { muted: true }) : { color: c === top && c > 0 ? "var(--accent)" : "var(--accent-line)" }),
        };
      }),
      ...(q.allowOther ? [{ label: "Other", value: theirs.length, hint: `${theirs.length} wrote their own`, shown: `${theirs.length} · ${pct(theirs.length)}`, color: "var(--accent-line)" }] : []),
    ]} />;
    sub = (
      <>
        <OtherAnswers answers={theirs} />
        {acc && <p className="t-caption fm-muted">Green answers meet the must-have. An answer of their own is left for you to read.</p>}
      </>
    );
  } else if (q.type === "multi") {
    const opts = (q.options ?? []).map((o) => ({ o, c: answered.filter((r) => (r.answers[q.id] as string[]).includes(o)).length })).sort((a, b) => b.c - a.c);
    const theirs = otherAnswers(q, answered);
    body = <Bars orient="horizontal" unit="people" data={[
      ...opts.map(({ o, c }, i) => {
        const pct = `${k ? Math.round((c / k) * 100) : 0}%`;
        return { label: o, value: c, hint: `${pct} of respondents`, shown: `${c} · ${pct}`, onClick: () => onAnswer(q, o), color: i === 0 && c > 0 ? "var(--accent)" : "var(--accent-line)" };
      }),
      ...(q.allowOther ? [{ label: "Other", value: theirs.length, hint: `${theirs.length} wrote their own`, shown: `${theirs.length} · ${k ? Math.round((theirs.length / k) * 100) : 0}%`, color: "var(--accent-line)" }] : []),
    ]} />;
    sub = (
      <>
        <OtherAnswers answers={theirs} />
        <p className="t-caption fm-muted">People could pick more than one</p>
      </>
    );
  } else if (q.type === "number") {
    const nums = answered.map((r) => Number(r.answers[q.id])).filter((x) => Number.isFinite(x));
    const uniq = [...new Set(nums)].sort((a, b) => a - b);
    let data: { label: string; value: number }[];
    if (uniq.length <= 8) data = uniq.map((u) => ({ label: String(u), value: nums.filter((x) => x === u).length }));
    else {
      const lo = uniq[0]!, hi = uniq[uniq.length - 1]!;
      const w = Math.max(1, Math.ceil((hi - lo + 1) / 6));
      data = Array.from({ length: 6 }, (_, i) => {
        const a = lo + i * w, b = a + w - 1;
        return { label: `${a}–${b}`, value: nums.filter((x) => x >= a && x <= b).length };
      }).filter((d, i, arr) => d.value > 0 || i < arr.length - 1);
    }
    body = (
      <div className="fm-num">
        <p className="fm-num-big"><span className="t-num-lg">{median(nums)}</span><span className="t-body-sm"> median{q.unit ? ` ${q.unit}` : ""}</span></p>
        <Bars height={160} variant="dist" data={mode(data)} unit="people" />
      </div>
    );
  } else if (q.type === "scale") {
    const nums = answered.map((r) => Number(r.answers[q.id])).filter((x) => Number.isFinite(x));
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const s = q.scale ?? { low: "Not at all", high: "Very" };
    body = (
      <div className="fm-num">
        <p className="fm-num-big"><span className="t-num-lg">{avg.toFixed(1)}</span><span className="t-body-sm"> out of 5</span></p>
        <Bars height={160} variant="dist" data={mode([1, 2, 3, 4, 5].map((v) => ({ label: String(v), value: nums.filter((x) => x === v).length })))} unit="people" />
        <p className="fm-scale-ends t-caption"><span>1 · {s.low}</span><span>5 · {s.high}</span></p>
      </div>
    );
  } else {
    const shown = all ? answered : answered.slice(0, 5);
    body = (
      <>
        <ul className={`fm-texts${all ? " is-all" : ""}`}>
          {shown.map((r) => {
            const v = String(r.answers[q.id]);
            return (
              <li key={r.id}>
                <p className="fm-text-a">{q.type === "link" || isLink(v) ? <a href={href(v)} target="_blank" rel="noopener noreferrer">{v}</a> : v}</p>
                <p className="t-caption fm-muted">{people.get(r.person.id)?.name ?? r.person.name} · {agoLabel(r.at)}</p>
              </li>
            );
          })}
        </ul>
        {!all && k > 5 && <button type="button" className="fm-link-btn is-accent" onClick={() => setAll(true)}>Show all {k}</button>}
      </>
    );
  }

  const wide = alone || !(q.type === "choice" || q.type === "yesno" || q.type === "multi" || q.type === "dropdown");
  return (
    <article className={`fm-qsum${wide ? " is-wide" : ""}`}>
      <header className="fm-qsum-h">
        <span className="fm-q-n t-caption" aria-hidden="true">{n}</span>
        <h3>{q.title || "Untitled question"}</h3>
        <span className="t-caption fm-muted">{k} of {rows.length} answered</span>
      </header>
      {body}
      {sub}
    </article>
  );
}

/** What people wrote next to "Other", one per response, newest first. */
function otherAnswers(q: Question, answered: readonly FormResponse[]): string[] {
  if (!q.allowOther) return [];
  const opts = new Set(q.options ?? []);
  return answered.flatMap((r) => {
    const a = r.answers[q.id];
    const own = (Array.isArray(a) ? a : [a]).map(String).filter((x) => x && !opts.has(x));
    return own.length ? [own.join(", ")] : [];
  });
}

function OtherAnswers({ answers }: { answers: readonly string[] }) {
  const [all, setAll] = useState(false);
  if (!answers.length) return null;
  const shown = all ? answers : answers.slice(0, 4);
  return (
    <p className="t-body-sm fm-other-list">
      <span className="fm-muted">In their own words: </span>
      {shown.map((a, i) => <Fragment key={i}>{i > 0 && <span className="fm-muted"> · </span>}"{a}"</Fragment>)}
      {!all && answers.length > 4 && <> <button type="button" className="fm-link-btn is-accent" onClick={() => setAll(true)}>and {answers.length - 4} more</button></>}
    </p>
  );
}

/* ── one by one ── */

function fmtAnswer(a: Answer | undefined): ReactNode {
  if (isEmpty(a)) return <span className="fm-muted">Skipped</span>;
  if (Array.isArray(a)) return <span className="fm-pills">{a.map((x) => <span key={x} className="fm-pill">{x}</span>)}</span>;
  if (typeof a === "boolean") return a ? "Yes" : "No";
  const s = String(a);
  if (isLink(s) && !/^\d+$/.test(s)) return <a href={href(s)} target="_blank" rel="noopener noreferrer">{s}</a>;
  return s;
}

function OneByOne({ form, rows, people, hasMust, current, setCurrent, decisions }: {
  form: Form; rows: readonly FormResponse[]; people: ReadonlyMap<string, PipelinePerson>; hasMust: boolean;
  current: string | null; setCurrent: (id: string | null) => void; decisions: Decisions | null;
}) {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [listOnly, setListOnly] = useState(() => window.matchMedia("(max-width: 900px)").matches && !current);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const idx = Math.max(0, rows.findIndex((r) => r.id === current));
  const r = rows[idx] ?? null;
  const go = useCallback((d: number) => { const n = rows[idx + d]; if (n) setCurrent(n.id); }, [rows, idx, setCurrent]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".dg")) return;
      if (e.key === "j" || e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "k" || e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!rows.length) return <p className="cw-calm fm-none">No responses match this filter.</p>;
  const showList = !narrow || listOnly;
  const showDetail = !narrow || !listOnly;

  return (
    <div className="fm-one">
      {showList && (
        <ul className="fm-one-list" aria-label="Responses">
          {rows.map((x) => {
            const miss = missedMustHaves(form, x.answers).length;
            const on = x.id === r?.id;
            return (
              <li key={x.id}>
                <button type="button" className={`fm-one-row${on && !narrow ? " is-on" : ""}`} aria-current={on && !narrow ? "true" : undefined}
                  onClick={() => { setCurrent(x.id); setListOnly(false); }}>
                  <Avatar name={x.person.name} hue={x.person.hue} size={28} />
                  <span className="fm-one-t"><strong>{x.person.name}</strong><small>{[x.person.title, x.person.company].filter(Boolean).join(" · ") || x.email}</small></span>
                  <span className="fm-one-m">
                    <small>{decisions?.meta.get(x.id)?.isNew ? `New, ${agoLabel(x.at).toLowerCase()}` : agoLabel(x.at)}</small>
                    {miss > 0 && <span className="fm-chip is-amber" title="Missed a must-have">Missed {miss}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showDetail && r && (
        <Fragment>
          <Detail key={r.id} form={form} r={r} person={people.get(r.person.id) ?? null} hasMust={hasMust} i={idx} total={rows.length}
            onPrev={() => go(-1)} onNext={() => go(1)} onBack={narrow ? () => setListOnly(true) : undefined} decisions={decisions} />
        </Fragment>
      )}
    </div>
  );
}

function Detail({ form, r, person, hasMust, i, total, onPrev, onNext, onBack, decisions }: {
  form: Form; r: FormResponse; person: PipelinePerson | null; hasMust: boolean; i: number; total: number;
  onPrev: () => void; onNext: () => void; onBack?: () => void; decisions: Decisions | null;
}) {
  const toast = useToast();
  const [profile, setProfile] = useState(false);
  const [rejectingBoard, setRejectingBoard] = useState(false);
  const misses = missedMustHaves(form, r.answers);
  const next: { stage: StageId; label: string; done: string } | null = !person ? null
    : person.stage === "outreach" || person.stage === "shortlisted" ? { stage: "interviewing", label: "Move to Interviewing", done: "moved to Interviewing" }
    : person.stage === "interviewing" ? { stage: "hired", label: "Mark hired", done: "marked hired" } : null;
  const name = first(r.person.name);
  return (
    <section className="cw-card fm-detail" aria-label={`Response from ${r.person.name}`}>
      {onBack && <button type="button" className="fm-link-btn fm-detail-back" onClick={onBack}><ArrowLeft size={13} weight="bold" /> All responses</button>}
      <header className="fm-detail-h">
        <Avatar name={r.person.name} hue={r.person.hue} size={44} />
        <div className="fm-detail-t">
          <h2 className="t-title">{r.person.name}</h2>
          <p className="t-body-sm">
            {[r.person.title, r.person.company].filter(Boolean).join(" at ")}{r.person.title || r.person.company ? ". " : ""}
            Answered {agoLabel(r.at).toLowerCase()}{Number.isFinite(r.took) ? `, took ${tookLabel(r.took)}` : ""}
          </p>
          {(r.email || person?.email?.value || r.phone) && (
            <p className="t-body-sm fm-detail-mail">
              {(r.email || person?.email?.value) && <a href={`mailto:${r.email ?? person?.email?.value}`}>{r.email ?? person?.email?.value}</a>}
              {r.emailVerified && <span className="fm-muted"> (confirmed)</span>}
              {r.phone && <> <span aria-hidden="true">·</span> <a href={`tel:${r.phone}`}>{displayPhone(r.phone)}</a>
                {" "}<a href={`https://wa.me/${r.phone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
              {r.linkedin && <> <span aria-hidden="true">·</span> <a href={href(r.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}
            </p>
          )}
          {r.source && (
            <p className="t-caption fm-muted fm-detail-src">Came from {sourceName(r.source)}</p>
          )}
        </div>
        <div className="fm-detail-side">
          <div className="fm-pager">
            <button type="button" aria-label="Previous response" title="Previous (K)" onClick={onPrev} disabled={i === 0}><CaretLeft size={14} weight="bold" /></button>
            <span className="t-num-sm">{i + 1} of {total}</span>
            <button type="button" aria-label="Next response" title="Next (J)" onClick={onNext} disabled={i >= total - 1}><CaretRight size={14} weight="bold" /></button>
          </div>
          {/* The call on this person sits with their name, where the eye already is, not under a long list. */}
          <div className="fm-detail-acts">
            {decisions ? (
              <>
                <Decide
                  meta={decisions.meta.get(r.id)} name={name} inCandidates={!r.person.id.startsWith("applicant-")}
                  onDecide={(d, linkTo, reason) => decisions.decide([r.id], d, linkTo, reason)} onSave={() => decisions.save(r.id)}
                />
                {/* Once the applicant is on the board the profile opens from here, as it does in the prototype. */}
                {person && <button type="button" className="cw-btn is-quiet" onClick={() => setProfile(true)}><User size={13} /> Open profile</button>}
              </>
            ) : person ? (
              <>
                <span className="fm-stage-chip t-label">{stageLabel(person.stage)}</span>
                {next && (
                  <button type="button" className="cw-btn is-primary" onClick={() => { movePerson(form.campaign, person.id, next.stage); toast(`${name} ${next.done}`); }}>{next.label}</button>
                )}
                {person.stage !== "passed" && person.stage !== "hired" && (
                  <button type="button" className="cw-btn is-quiet" onClick={() => setRejectingBoard(true)}>Reject</button>
                )}
                <button type="button" className="cw-btn is-quiet" onClick={() => setProfile(true)}><User size={13} /> Open profile</button>
              </>
            ) : (
              <button type="button" className="cw-btn" disabled title="Coming soon: matched by email">Add to pipeline</button>
            )}
          </div>
        </div>
      </header>

      {misses.length > 0 ? (
        /* One line: each missed must-have is marked on its own answer below, so it is not listed twice. */
        <p className="fm-missed t-body-strong">
          <Info size={15} weight="bold" aria-hidden="true" />
          Missed {misses.length} must-have{misses.length === 1 ? "" : "s"}
          <span className="t-body-sm fm-muted">Worth a quick look. Nothing happened automatically.</span>
        </p>
      ) : hasMust ? (
        <p className="fm-met t-body-sm"><CheckCircle size={15} weight="fill" aria-hidden="true" /> Met every must-have</p>
      ) : null}

      <ResponseAnswers form={form} answers={r.answers} />
      <PersonDialog person={profile ? person : null} onClose={() => setProfile(false)} onMove={(p, s) => movePerson(form.campaign, p.id, s)} />
      <PassReasonDialog
        who={rejectingBoard ? name : null}
        onClose={() => setRejectingBoard(false)}
        onPass={(reason) => { setRejectingBoard(false); movePerson(form.campaign, person!.id, "passed", reason); toast(`Rejected ${name}`); }}
      />
    </section>
  );
}

/**
 * What the person answered, question by question: the question in the page's body type and dark ink, the
 * answer under it larger, and for a must-have the result as coloured words beside the answer (Met, or what
 * it had to be). A missed one sits on a quiet tint, so the eye finds it without a banner.
 */
export function ResponseAnswers({ form, answers }: { form: Form; answers: Readonly<Record<string, Answer>> }) {
  const missIds = new Set(missedMustHaves(form, answers).map((m) => m.q.id));
  return (
    <ol className="fm-answers">
      {form.questions.map((q) => {
        if (q.type === "section") return <li key={q.id} className="fm-answers-sec t-caption">{q.title}</li>;
        const acc = mustHaveOf(q);
        const missed = missIds.has(q.id);
        const met = acc && !missed && !isEmpty(answers[q.id]);
        return (
          <li key={q.id} className={missed ? "is-missed" : ""}>
            <p className="fm-answers-q">{q.title || "Untitled question"}</p>
            <div className="fm-answers-a">
              <span className="fm-answers-v">{fmtAnswer(answers[q.id])}</span>
              {missed && <span className="fm-chip is-amber">Must-have was {acc!.join(" or ")}</span>}
              {met && <span className="fm-chip is-sage">Met</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What to do with an applicant: on the board already (their stage shows), or add them to the shortlist,
 * pass, or keep them in Candidates for later without deciding. Rejecting can be undone by adding.
 */
export function Decide({ meta, name, inCandidates, onDecide, onSave }: {
  meta: ResponseMeta | undefined; name: string; inCandidates: boolean;
  onDecide: (d: "add" | "pass", linkTo?: string, reason?: string) => void; onSave: () => void;
}) {
  /* Rejecting asks why first, the same optional step as on the board. */
  const [asking, setAsking] = useState(false);
  const stage = asStage(meta?.stage);
  if (stage) return <span className="fm-stage-chip t-label">{stageLabel(stage)}</span>;
  const match = meta?.decision !== "passed" ? meta?.possibleMatch : null;
  const why = <PassReasonDialog who={asking ? name : null} onClose={() => setAsking(false)} onPass={(reason) => { setAsking(false); onDecide("pass", undefined, reason); }} />;
  if (match) {
    return (
      <>
        <span className="t-body-sm fm-muted fm-match">{matchNote(match)}</span>
        <button type="button" className="cw-btn is-primary" onClick={() => onDecide("add", match.candidateId)}>Link to {match.name}</button>
        <button type="button" className="cw-btn" onClick={() => onDecide("add")}>Add as a new person</button>
        <button type="button" className="cw-btn is-quiet" onClick={() => setAsking(true)}>Reject</button>
        {why}
      </>
    );
  }
  return (
    <>
      {meta?.decision === "passed" && <span className="t-body-sm fm-muted">You rejected {name}</span>}
      <button type="button" className={`cw-btn${meta?.decision === "passed" ? "" : " is-primary"}`} onClick={() => onDecide("add")}>Add to shortlist</button>
      {meta?.decision !== "passed" && <button type="button" className="cw-btn is-quiet" onClick={() => setAsking(true)}>Reject</button>}
      {why}
      {inCandidates
        ? <span className="t-body-sm fm-muted fm-saved">In your candidates</span>
        : <button type="button" className="cw-btn is-quiet" onClick={onSave}>Add to candidates</button>}
    </>
  );
}

/* ── table ── */

/** The short form of a possible match, for a table cell. */
const sameAs = (m: NonNullable<ResponseMeta["possibleMatch"]>) =>
  m.by === "person" ? `This is ${m.name}` : `Looks like ${m.name}`;

type SortKey = "name" | "stage" | "must" | "at" | "took" | string;
const STAGE_ORDER: Readonly<Record<StageId, number>> = { shortlisted: 0, outreach: 1, interviewing: 2, hired: 3, passed: 4 };
const plain = (a: Answer | undefined) => (isEmpty(a) ? "" : Array.isArray(a) ? a.join(", ") : typeof a === "boolean" ? (a ? "Yes" : "No") : String(a));

function ResponseTable({ form, rows, people, hasMust, selected, setSelected, onOpen, decisions }: {
  form: Form; rows: readonly FormResponse[]; people: ReadonlyMap<string, Placed>; hasMust: boolean;
  selected: ReadonlySet<string>; setSelected: (s: ReadonlySet<string>) => void; onOpen: (id: string) => void; decisions: Decisions | null;
}) {
  /* Bulk decisions apply to the picked applicants who aren't on the board yet. */
  const open = decisions ? [...selected].filter((id) => !asStage(decisions.meta.get(id)?.stage)) : [];
  const [rejecting, setRejecting] = useState<readonly string[] | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: 1 });
  const qs = answerable(form);
  const misses = useMemo(() => new Map(rows.map((r) => [r.id, missedMustHaves(form, r.answers).length])), [rows, form]);
  const sorted = useMemo(() => {
    const val = (r: FormResponse): string | number => {
      switch (sort.key) {
        case "name": return r.person.name.toLowerCase();
        case "email": return (r.email ?? people.get(r.person.id)?.email?.value ?? "").toLowerCase();
        case "phone": return r.phone ?? "";
        case "stage": { const p = people.get(r.person.id); return p ? STAGE_ORDER[p.stage] : 9; }
        case "must": return misses.get(r.id) ?? 0;
        case "at": return r.at;
        case "took": return r.took;
        default: { const a = r.answers[sort.key]; return typeof a === "number" ? a : plain(a).toLowerCase(); }
      }
    };
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, sort, people, misses]);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); setSelected(s); };
  const head = (key: SortKey, label: string, title?: string, isQ?: boolean) => {
    const on = sort.key === key;
    return (
      <th aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} title={title} className={isQ ? "is-q" : undefined}>
        <button type="button" onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })}>
          <span className="fm-th-l">{label}</span>{on && <CaretDown size={11} weight="bold" className={sort.dir === 1 ? "" : "is-up"} aria-hidden="true" />}
        </button>
      </th>
    );
  };
  const fmtAt = (at: number) => { const d = new Date(Date.now() - at * 60000); return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}, ${submittedAt(at).slice(11)}`; };

  if (!rows.length) return <p className="cw-calm fm-none">No responses match this filter.</p>;
  return (
    <div className="fm-table-box">
      <PassReasonDialog
        who={rejecting ? (rejecting.length === 1 ? "them" : `${rejecting.length} people`) : null}
        onClose={() => setRejecting(null)}
        onPass={(reason) => { const ids = rejecting ?? []; setRejecting(null); decisions?.decide(ids, "pass", undefined, reason); setSelected(new Set()); }}
      />
      {selected.size > 0 && (
        <div className="fm-selbar t-body-sm">
          <strong>{selected.size} selected</strong>
          <span className="fm-muted">Use Export to download only these.</span>
          {decisions && open.length > 0 && (
            <>
              <button type="button" className="fm-link-btn is-accent" onClick={() => { decisions.decide(open, "add"); setSelected(new Set()); }}>Add {open.length} to shortlist</button>
              <button type="button" className="fm-link-btn" onClick={() => setRejecting(open)}>Reject {open.length}</button>
            </>
          )}
          <button type="button" className="fm-link-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      <div className="fm-table-wrap">
        <table className="fm-table" style={{ width: 236 + 220 + 150 + 120 + 116 + 140 + 84 + qs.length * 220 }}>
          <colgroup>
            <col style={{ width: 236 }} /><col style={{ width: 220 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /><col style={{ width: 116 }} />
            <col style={{ width: 140 }} /><col style={{ width: 84 }} />
            {qs.map((q) => <col key={q.id} style={{ width: 220 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="is-first" aria-sort={sort.key === "name" ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <span className="fm-first">
                  <input type="checkbox" checked={allOn} aria-label="Select all shown responses"
                    onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
                  <button type="button" onClick={() => setSort({ key: "name", dir: sort.key === "name" ? (sort.dir === 1 ? -1 : 1) : 1 })}>
                    Candidate{sort.key === "name" && <CaretDown size={11} weight="bold" className={sort.dir === 1 ? "" : "is-up"} aria-hidden="true" />}
                  </button>
                </span>
              </th>
              {head("email", "Email")}
              {head("phone", "Phone")}
              {head("stage", "Stage")}
              {head("must", "Must-haves")}
              {head("at", "Submitted")}
              {head("took", "Time")}
              {qs.map((q) => <Fragment key={q.id}>{head(q.id, q.title || "Untitled question", q.title, true)}</Fragment>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const p = people.get(r.person.id);
              const m = misses.get(r.id) ?? 0;
              const on = selected.has(r.id);
              return (
                <tr key={r.id} className={on ? "is-sel" : ""} onClick={(e) => { if (!(e.target as HTMLElement).closest("input,a,button")) onOpen(r.id); }}>
                  <td className="is-first">
                    <span className="fm-first">
                      <input type="checkbox" checked={on} aria-label={`Select ${r.person.name}`} onChange={() => toggle(r.id)} />
                      <Avatar name={r.person.name} hue={r.person.hue} size={24} />
                      <button type="button" className="fm-first-n" title={`Open ${r.person.name}'s response`} onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.person.name}</button>
                    </span>
                  </td>
                  <td title={r.email ?? p?.email?.value}>{r.email ?? p?.email?.value ?? ""}</td>
                  <td className="is-num">{r.phone ? displayPhone(r.phone) : ""}</td>
                  <td>{p
                    ? <span className="fm-stage-chip">{stageLabel(p.stage)}</span>
                    : decisions?.meta.get(r.id)?.possibleMatch
                      ? <span className="fm-muted t-body-sm">{sameAs(decisions.meta.get(r.id)!.possibleMatch!)}</span>
                      : <span className="fm-muted t-body-sm">Not shortlisted yet</span>}</td>
                  <td>{!hasMust ? "" : m ? <span className="fm-chip is-amber">Missed {m}</span> : <span className="fm-chip is-sage">Met</span>}</td>
                  <td className="is-num">{fmtAt(r.at)}</td>
                  <td className="is-num">{tookLabel(r.took)}</td>
                  {qs.map((q) => { const v = plain(r.answers[q.id]); return <td key={q.id} title={v}>{v}</td>; })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── a campaign's shortlist or pipeline ──
   One Export button for the Shortlisted and Pipeline pages (needs the API).
   CSV and Excel are made here from the API's rows, every column in the
   plan's order; Google Sheets is made on the server, in the recruiter's own
   Drive, and opens in a new tab. */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function CampaignExport({ campaignId, campaignName, kind }: { campaignId: string; campaignName: string; kind: ExportKind }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"csv" | "xlsx" | "sheets" | null>(null);
  const [connect, setConnect] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const close = useCallback(() => { setOpen(false); setConnect(null); }, []);
  const what = kind === "shortlist" ? "shortlist" : "pipeline";
  const sheetsHint = googleHint(useGoogle(), "sheets");

  const file = async (format: "csv" | "xlsx") => {
    setBusy(format);
    try {
      const r = await exportRows(campaignId, kind, EXPORT_COLUMNS.map(([k]) => k));
      const t = shortlistTable(r.rows, r.columns, kind);
      if (format === "csv") download(toCSV(t), "text/csv;charset=utf-8", shortlistName(campaignName, kind, "csv"));
      else download(toXLSX(t), XLSX_MIME, shortlistName(campaignName, kind, "xlsx"));
      /* The file is already on their machine; a missed audit row isn't worth an error. */
      void recordExport({ kind, campaignId, format, rowCount: r.rows.length }).catch(() => {});
      close();
      toast(`Downloaded the ${what}, ${r.rows.length} ${r.rows.length === 1 ? "person" : "people"}`);
    } catch (err) {
      toast(messageOf(err), "error");
    }
    setBusy(null);
  };

  const sheets = async () => {
    /* Opened now, while the click still counts: a tab opened after the
       request returns is treated as a popup and blocked. */
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy("sheets");
    try {
      const r = await exportToSheets(campaignId, kind, EXPORT_COLUMNS.map(([, h]) => h));
      if (r.kind === "made") {
        if (tab) tab.location.href = r.url;
        else window.open(r.url, "_blank", "noopener");
        close();
        toast(`Sheet made with ${r.rows} ${r.rows === 1 ? "row" : "rows"}`);
      } else {
        tab?.close();
        setConnect(r.message);
      }
    } catch (err) {
      tab?.close();
      toast(messageOf(err), "error");
    }
    setBusy(null);
  };

  return (
    <>
      <button ref={ref} type="button" className="cw-btn fm-export" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <DownloadSimple size={14} /> Export <CaretDown size={12} weight="bold" />
      </button>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={290}>
        <div className="ct-menu fm-export-menu" role="menu">
          <p className="t-caption fm-export-h">{connect ? (sheetsHint ?? connect) : `The whole ${what}, every column`}</p>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!!busy} onClick={() => void file("csv")}>
            <FileCsv size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>{busy === "csv" ? <><Loader size="sm" tone="inherit" />Preparing CSV</> : "Download CSV"}</strong><small>Works anywhere. UTF-8, opens cleanly in Excel</small></span>
          </button>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!!busy} onClick={() => void file("xlsx")}>
            <FileXls size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>{busy === "xlsx" ? <><Loader size="sm" tone="inherit" />Preparing Excel</> : "Download Excel (.xlsx)"}</strong><small>Formatted, header row frozen</small></span>
          </button>
          <button type="button" role="menuitem" className="ct-menu-i" disabled={!!busy} onClick={() => void sheets()}>
            <GoogleDriveLogo size={18} aria-hidden="true" />
            <span className="ct-menu-t"><strong>{busy === "sheets" ? "Making the sheet" : "Google Sheets"}</strong><small>A new sheet in your Drive, opened in a new tab</small></span>
          </button>
        </div>
      </Popover>
    </>
  );
}
