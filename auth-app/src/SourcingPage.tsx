import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./components/Button";
import { Notice } from "./components/Notice";
import {
  fetchSourcingHistory, fetchSourcingRun, forgetSourcingJd, runSourcingSearch,
} from "./sourcing";
import type { Candidate, HistoryRun, Plan, SearchEvent } from "./sourcing";

/** Server-enforced ceiling (see sourcing-search/index.ts MAX_RESULTS). Just a
 *  UI hint for the count field's max attribute — the real cap is server-side
 *  regardless of what a client sends. */
const MAX_RESULTS_HINT = 100;

/**
 * Sourcing: paste a JD, get ContactOut candidates.
 *
 * This is the browser half of the local `sourcing/` tool, rebuilt against the
 * `sourcing-search` Edge Function instead of a same-origin local server — see
 * that function's index.ts for why (it holds the ContactOut and AI-gateway
 * keys, which a static bundle like this one never can). The pipeline, the
 * progress events and the candidate cards are otherwise the same tool: same
 * JD run twice never returns the same person twice, now shared across
 * whoever on the team runs it rather than one laptop's SQLite file.
 */

const CHIP_LABELS: Record<string, string> = {
  job_title: "title", past_job_title: "past title", skills: "skills", location: "location",
  industry: "industry", company: "company", past_company: "past company",
  company_size: "size", seniority: "seniority", job_function: "function",
  years_of_experience: "experience", education: "education",
  exclude_job_titles: "exclude", keyword: "keyword", include_related_job_titles: "related titles",
};

const DATA_TYPE_OPTIONS = [
  { value: "work_email", label: "Work email" },
  { value: "personal_email", label: "Personal email" },
  { value: "phone", label: "Phone" },
];

type LogLine = { text: string; bad?: boolean };

export function SourcingPage() {
  const [jd, setJd] = useState("");
  const [comments, setComments] = useState("");
  const [count, setCount] = useState(20);
  const [revealInfo, setRevealInfo] = useState(false);
  const [dataTypes, setDataTypes] = useState<string[]>(["work_email"]);
  const [fastForward, setFastForward] = useState(true);
  const [broaden, setBroaden] = useState(true);
  const [scorePass, setScorePass] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [resultMeta, setResultMeta] = useState("");
  const [jdStatus, setJdStatus] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryRun[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(() => {
    fetchSourcingHistory()
      .then((runs) => { setHistory(runs); setHistoryError(null); })
      .catch((err: unknown) => setHistoryError(describe(err)));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const appendLog = useCallback((text: string, bad = false) => {
    setLog((prev) => [...prev, { text, bad }]);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = jd.trim();
    if (trimmed.length < 40) { setJdStatus("Paste a fuller JD first."); return; }

    setRunning(true);
    setJdStatus(null);
    setLog([]);
    setProgress(0.04);
    setPlan(null);
    setCandidates(null);

    try {
      await runSourcingSearch(
        { jd: trimmed, comments, count, revealInfo, fastForward, broaden, score: scorePass, dataTypes },
        (event) => handleEvent(event, count, { appendLog, setProgress, setPlan, setCandidates, setResultMeta }),
      );
    } catch (err) {
      const message = describe(err);
      appendLog(`failed: ${message}`, true);
      setJdStatus(message);
    } finally {
      setRunning(false);
      loadHistory();
    }
  }

  async function openRun(id: string) {
    try {
      const run = await fetchSourcingRun(id);
      setJd(run.jd_text);
      setComments(run.comments || "");
      setCount(run.requested);
      setPlan({
        roleSummary: run.summary, filters: run.filters, locked: run.locked,
        mustHaves: [], unmapped: [], dropped: [],
      });
      setCandidates(run.candidates);
      setResultMeta(`${new Date(run.created_at).toLocaleString()} · ${run.skipped_seen} skipped as already delivered`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setJdStatus(describe(err));
    }
  }

  async function forget() {
    const trimmed = jd.trim();
    if (trimmed.length < 40) { setJdStatus("Paste the JD you want to reset."); return; }
    try {
      const res = await forgetSourcingJd(trimmed);
      setJdStatus(`Seen-list cleared — ${res.forgotten} profile(s) can appear again.`);
      loadHistory();
    } catch (err) {
      setJdStatus(describe(err));
    }
  }

  function downloadCsv() {
    if (!candidates?.length) return;
    const url = URL.createObjectURL(new Blob([toCsv(candidates)], { type: "text/csv" }));
    const label = jd.split("\n")[0]?.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "candidates";
    const a = document.createElement("a");
    a.href = url; a.download = `${label}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="con-page con-page-wide">
      <h1 className="con-h1">Sourcing</h1>
      <p className="con-lede">
        Paste a JD, get candidates. Claude turns it into ContactOut search
        filters; anything already delivered for that JD — by anyone on the
        team — is never shown again.
      </p>

      <form className="src-form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="src-jd">Job description</label>
          <textarea
            id="src-jd" className="src-textarea" rows={8} value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the full JD — title, responsibilities, requirements, location."
          />
          <p className="field-help">Same JD run twice never returns the same person twice.</p>
        </div>

        <div className="field">
          <label htmlFor="src-comments">Additional comments <em>optional</em></label>
          <textarea
            id="src-comments" className="src-textarea" rows={3} value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder='Steer the search, e.g. "bias to Series A/B startups, Bengaluru or remote-India only". These override the JD where they conflict.'
          />
        </div>

        <div className="field src-count-field">
          <label htmlFor="src-count">How many candidates</label>
          <input
            id="src-count" type="number" min={1} max={MAX_RESULTS_HINT} value={count}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <label className="src-check">
          <input type="checkbox" checked={revealInfo} onChange={(e) => setRevealInfo(e.target.checked)} />
          Reveal contact info <em>costs extra credits</em>
        </label>

        {revealInfo && (
          <div className="src-datatypes">
            {DATA_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="src-check src-check-sub">
                <input
                  type="checkbox" checked={dataTypes.includes(opt.value)}
                  onChange={(e) => setDataTypes((prev) => (
                    e.target.checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value)
                  ))}
                />
                {opt.label}
              </label>
            ))}
          </div>
        )}

        <button
          type="button" className="src-advanced-toggle"
          onClick={() => setAdvancedOpen((v) => !v)} aria-expanded={advancedOpen}
        >
          {advancedOpen ? "▾" : "▸"} Advanced
        </button>

        {advancedOpen && (
          <div className="src-advanced">
            <label className="src-check">
              <input type="checkbox" checked={fastForward} onChange={(e) => setFastForward(e.target.checked)} />
              Fast-forward past already-scanned pages on a repeat run
            </label>
            <label className="src-check">
              <input type="checkbox" checked={broaden} onChange={(e) => setBroaden(e.target.checked)} />
              Auto-broaden when the pool runs dry
            </label>
            <label className="src-check">
              <input type="checkbox" checked={scorePass} onChange={(e) => setScorePass(e.target.checked)} />
              Score and rank against the JD
            </label>
            <button type="button" className="src-forget" onClick={() => void forget()}>
              Reset the seen-list for this JD
            </button>
          </div>
        )}

        {jdStatus && (
          <p className="field-error" role="alert">
            <Warning size={14} weight="bold" aria-hidden="true" /><span>{jdStatus}</span>
          </p>
        )}

        <Button type="submit" variant="solid" busy={running} busyLabel="Searching…">Search</Button>
      </form>

      {running || log.length > 0 ? (
        <section className="ex-sec src-progress">
          <div className="src-bar-track">
            <div className="src-bar-fill" style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
          </div>
          <div className="src-log" ref={logRef} role="status" aria-live="polite">
            {log.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key -- append-only log, index is a stable position
              <p key={i} className={`src-log-line${line.bad ? " is-bad" : ""}`}>{line.text}</p>
            ))}
          </div>
        </section>
      ) : null}

      {plan && <PlanPanel plan={plan} />}

      {candidates && <ResultsPanel candidates={candidates} meta={resultMeta} onCsv={downloadCsv} />}

      <HistoryPanel runs={history} error={historyError} onOpen={(id) => void openRun(id)} />
    </div>
  );
}

function PlanPanel({ plan }: { plan: Plan }) {
  const notes: string[] = [];
  if (plan.unmapped?.length) notes.push(`Not searchable as filters — check by hand: ${plan.unmapped.join("; ")}.`);
  if (plan.dropped?.length) notes.push(`Dropped as invalid values: ${plan.dropped.join("; ")}.`);

  return (
    <section className="ex-sec src-plan">
      <div className="ex-sec-head"><h2 className="ex-sec-title">Search plan</h2></div>
      {plan.roleSummary && <p className="src-plan-summary">{plan.roleSummary}</p>}
      <div className="src-chips">
        {Object.entries(plan.filters || {}).map(([key, value]) => {
          const isLocked = plan.locked?.includes(key);
          return (
            <span
              key={key} className={`src-chip${isLocked ? " is-locked" : ""}`}
              title={isLocked ? "Locked — auto-broaden will never drop this" : undefined}
            >
              <b>{isLocked ? "🔒 " : ""}{CHIP_LABELS[key] || key}</b>
              {Array.isArray(value) ? value.join(" · ") : String(value)}
            </span>
          );
        })}
      </div>
      {notes.length > 0 && <p className="src-plan-notes">{notes.join(" ")}</p>}
    </section>
  );
}

function ResultsPanel({ candidates, meta, onCsv }: { candidates: Candidate[]; meta: string; onCsv: () => void }) {
  return (
    <section className="ex-sec src-results">
      <div className="ex-sec-head src-results-head">
        <div>
          <h2 className="ex-sec-title">{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</h2>
          <p className="ex-sec-sub">{meta}</p>
        </div>
        {candidates.length > 0 && (
          <button type="button" className="btn btn-outline src-csv-btn" onClick={onCsv}>Export CSV</button>
        )}
      </div>

      {candidates.length === 0 ? (
        <p className="src-empty">
          No new candidates. Every match for this JD has already been
          delivered — widen the JD, add comments, or reset the seen-list
          under Advanced.
        </p>
      ) : (
        <div className="src-cards">
          {candidates.map((c) => <CandidateCard key={c.url} c={c} />)}
        </div>
      )}
    </section>
  );
}

function CandidateCard({ c }: { c: Candidate }) {
  const band = typeof c.score === "number" ? (c.score >= 70 ? "good" : c.score >= 40 ? "mid" : "poor") : null;
  const contact = [...(c.emails || []), ...(c.phones || [])];
  const available = c.available
    ? Object.entries(c.available).filter(([, v]) => v).map(([k]) => k.replace("_", " "))
    : [];
  const metaLine = [c.industry, c.experience?.[0]].filter(Boolean).join(" · ");

  return (
    <article className="src-card">
      <div className="src-card-top">
        <div className="src-card-name">
          {band && <span className={`src-score src-score-${band}`}>{c.score}</span>}
          <a href={c.url} target="_blank" rel="noopener noreferrer">
            {c.name || c.url} <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
          </a>
        </div>
        <div className="src-card-where">{[c.location, c.seniority].filter(Boolean).join(" · ")}</div>
      </div>

      {c.reason && <p className="src-card-reason">{c.reason}</p>}
      {c.matchedAfterDropping && c.matchedAfterDropping.length > 0 && (
        <p className="src-card-warn">found only after dropping: {c.matchedAfterDropping.join(", ")}</p>
      )}

      {(c.title || c.company) && (
        <p className="src-card-role"><b>{c.title || "—"}</b>{c.company ? ` at ${c.company}` : ""}</p>
      )}

      {c.skills?.length > 0 && (
        <div className="src-card-skills">
          {c.skills.slice(0, 12).map((s) => <span key={s} className="src-tag">{s}</span>)}
        </div>
      )}

      {contact.length > 0 ? (
        <p className="src-card-contact">{contact.join(" · ")}</p>
      ) : available.length > 0 ? (
        <p className="src-card-meta">contact on file: {available.join(", ")}</p>
      ) : null}

      {metaLine && <p className="src-card-meta">{metaLine}</p>}
    </article>
  );
}

function HistoryPanel({ runs, error, onOpen }: {
  runs: HistoryRun[] | null; error: string | null; onOpen: (id: string) => void;
}) {
  return (
    <section className="ex-sec src-history">
      <div className="ex-sec-head"><h2 className="ex-sec-title">Previous runs</h2></div>
      {error && <Notice tone="problem">{error}</Notice>}
      {!error && runs === null && <p className="src-empty">Loading…</p>}
      {!error && runs !== null && runs.length === 0 && <p className="src-empty">Nothing yet.</p>}
      {!error && runs !== null && runs.length > 0 && (
        <ul className="src-history-list">
          {runs.map((run) => (
            <li key={run.id} className="src-history-row">
              <button
                type="button" className="src-history-jd" title={run.summary || run.jd_label}
                onClick={() => onOpen(run.id)}
              >
                {run.jd_label}
              </button>
              <span className={`src-history-n${run.status === "error" ? " is-err" : ""}`}>
                {run.status === "error" ? "failed" : `${run.returned}/${run.requested}`}
              </span>
              <span className="src-history-who">{run.mine ? "you" : ""}</span>
              <span className="src-history-when">{new Date(run.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type EventHandlers = {
  appendLog: (text: string, bad?: boolean) => void;
  setProgress: (n: number) => void;
  setPlan: (p: Plan | null) => void;
  setCandidates: (c: Candidate[] | null) => void;
  setResultMeta: (s: string) => void;
};

function handleEvent(event: SearchEvent, requested: number, h: EventHandlers) {
  switch (event.type) {
    case "start":
      h.appendLog(event.previouslySeen
        ? `${event.previouslySeen} candidate(s) already delivered for this JD across ${event.previousRuns} earlier run(s) — they will be skipped`
        : "first run for this JD");
      break;
    case "stage":
      h.appendLog(event.message);
      h.setProgress(event.stage === "score" ? 0.96 : 0.12);
      break;
    case "plan":
      h.setPlan({
        roleSummary: event.roleSummary, mustHaves: event.mustHaves, unmapped: event.unmapped,
        filters: event.filters, locked: event.locked, dropped: event.dropped,
      });
      h.appendLog("filters built · searching ContactOut");
      h.setProgress(0.2);
      break;
    case "page":
      h.appendLog(`page ${event.page} · ${event.fetched} scanned, ${event.kept} new, ${event.collected}/${requested} collected${event.total ? ` · ${event.total} total matches` : ""}`);
      h.setProgress(0.2 + 0.75 * (event.collected / requested));
      break;
    case "done": {
      h.setProgress(1);
      const bits = [`${event.returned} of ${event.requested} requested`];
      if (event.skippedSeen) bits.push(`${event.skippedSeen} already-delivered profile(s) skipped`);
      bits.push(`${event.scanned} profiles scanned`);
      h.appendLog(`done · ${bits.join(" · ")}`);
      if (event.exhausted) h.appendLog("pool exhausted or page budget spent before hitting the target count.", true);
      h.setCandidates(event.candidates);
      h.setResultMeta(bits.join(" · "));
      break;
    }
    case "error":
      h.appendLog(`error: ${event.message}`, true);
      if (event.partial) h.appendLog(`${event.partial} candidate(s) collected before the failure were saved.`);
      break;
  }
}

const CSV_COLUMNS: [string, (c: Candidate) => string][] = [
  ["score", (c) => (c.score ?? "").toString()], ["reason", (c) => c.reason ?? ""],
  ["matched_after_dropping", (c) => (c.matchedAfterDropping || []).join("; ")],
  ["name", (c) => c.name], ["linkedin", (c) => c.url], ["title", (c) => c.title],
  ["company", (c) => c.company], ["location", (c) => c.location], ["seniority", (c) => c.seniority],
  ["industry", (c) => c.industry], ["skills", (c) => (c.skills || []).join("; ")],
  ["emails", (c) => (c.emails || []).join("; ")], ["phones", (c) => (c.phones || []).join("; ")],
];

function toCsv(candidates: Candidate[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [CSV_COLUMNS.map(([header]) => header).join(",")];
  for (const c of candidates) rows.push(CSV_COLUMNS.map(([, get]) => escape(get(c))).join(","));
  return rows.join("\n");
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
