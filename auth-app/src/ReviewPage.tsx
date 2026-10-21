import { useEffect, useState } from "react";
import { ApiError, LIVE } from "./api/client";
import type { PublicReview, ReviewCandidate } from "./api/stages";
import { getPublicReview, sendVerdict } from "./api/stages";
import { Loader } from "./components/Loader";
import { EmptyArt } from "./EmptyArt";
import type { EmptyArtName } from "./EmptyArt";
import { errorCopy, errorKindOf } from "./ErrorStates";
import type { ErrorKind } from "./ErrorStates";
import { REVIEW_FIXTURE } from "./reviewFixture";
import {
  NOTE_MAX, answerLine, answeredOnly, metaLine, progressLine, rememberName, rememberedName, safeLink, schoolRows, skillsLine, verdictBody, workRows,
} from "./reviewView";
import "./review.css";

/**
 * The client's page, with no console around it: #/review/<token>. Nobody signs in here; the link is the key.
 *
 * A calm column: who the search is for, then one card per person with what the client needs to decide (what they
 * do, why they match, their work and schooling, their screening answers, their resume) and two ways to answer,
 * Approve or Not for us, each with an optional note. An answer can be changed. No contact detail is ever on the
 * page: the server does not send any. The reviewer's name is asked once and kept for the tab.
 */
export function ReviewPage({ token }: { token: string }): JSX.Element {
  return LIVE && token !== "preview" ? <LiveReview token={token} /> : <Screen review={REVIEW_FIXTURE} send={() => Promise.resolve()} />;
}

type Art = { name: EmptyArtName; size: number };
/** What the page says once the role has closed. */
export const CLOSED_LINE = "This role has closed. Thank you.";
const GONE_ART: Art = { name: "form-closed", size: 180 };
const NOTHING_ART: Art = { name: "empty-shortlist", size: 180 };

type Loaded =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "failed"; reason: Extract<ErrorKind, "network" | "rate-limit" | "server"> }
  | { kind: "ready"; review: PublicReview };

/** Why the page didn't come, as far as a client needs to know: their connection, a pause, or ours. */
export const reviewFailure = (err: unknown): "network" | "rate-limit" | "server" => {
  const k = errorKindOf(err);
  return k === "network" || k === "rate-limit" ? k : "server";
};

function LiveReview({ token }: { token: string }) {
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let gone = false;
    setState({ kind: "loading" });
    getPublicReview(token).then(
      (review) => { if (!gone) setState({ kind: "ready", review }); },
      (err: unknown) => {
        if (gone) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: "gone" } : { kind: "failed", reason: reviewFailure(err) });
      },
    );
    return () => { gone = true; };
  }, [token, attempt]);
  /* The tab says what the page is. */
  useEffect(() => {
    const before = document.title;
    document.title = state.kind === "ready" ? `${state.review.campaign.title} · people to review` : "People to review";
    return () => { document.title = before; };
  }, [state]);

  if (state.kind === "loading") return <Notice busy text="Loading" />;
  if (state.kind === "gone") return <Notice art={GONE_ART} title="This link isn't active any more" text="Ask your recruiter for a new one." />;
  if (state.kind === "failed") {
    const c = errorCopy(state.reason);
    return <Notice art={c.art} title={c.title} text={c.text} retry={() => setAttempt((n) => n + 1)} />;
  }
  return <Screen review={state.review} send={(id, body) => sendVerdict(token, id, body).then(() => undefined)} />;
}

/** The quiet page for loading, a link that is off, and a page that didn't come. */
export function Notice({ text, title, art, busy, retry }: {
  text: string;
  title?: string;
  art?: { name: EmptyArtName; size: number };
  busy?: boolean;
  retry?: () => void;
}): JSX.Element {
  return (
    <main className="rv-page">
      <div className="rv rv-notice">
        {busy ? <Loader size="lg" label={text} block /> : (
          <>
            {art && <EmptyArt name={art.name} size={art.size} />}
            {title && <h1 className="t-title">{title}</h1>}
            <p className="t-body rv-calm" role="status">{text}</p>
            {retry && <button type="button" className="rv-btn" onClick={retry}>Try again</button>}
          </>
        )}
      </div>
    </main>
  );
}

type Send = (candidateId: string, body: { verdict: "approved" | "declined"; note?: string; reviewerName?: string }) => Promise<void>;

/** The page once it has people: also what the preview shows. */
export function Screen({ review, send }: { review: PublicReview; send: Send }): JSX.Element {
  const { campaign, candidates } = review;
  const [name, setName] = useState(() => rememberedName());
  const [said, setSaid] = useState<Record<string, ReviewCandidate["verdict"]>>(() => Object.fromEntries(candidates.map((c) => [c.id, c.verdict])));
  const answered = candidates.filter((c) => said[c.id]).length;

  const closed = campaign.closed === true;
  if (candidates.length === 0 && closed) {
    return <Notice art={GONE_ART} title={CLOSED_LINE} text="There is nothing more to look at." />;
  }
  if (candidates.length === 0) {
    return (
      <Notice art={NOTHING_ART} title="Nothing to review right now" text={`When someone is ready for you to look at, they will be here${campaign.orgName ? ` from ${campaign.orgName}` : ""}.`} />
    );
  }

  return (
    <main className="rv-page">
      <div className="rv">
        <header className="rv-head">
          {(campaign.orgLogoUrl || campaign.orgName) && (
            <p className="rv-org t-label">
              {campaign.orgLogoUrl && <img className="rv-logo" src={campaign.orgLogoUrl} alt="" />}
              <span>{campaign.orgName}</span>
            </p>
          )}
          <h1 className="t-title-lg">{campaign.title}</h1>
          <p className="t-body rv-sub">
            {campaign.company ? `Hiring for ${campaign.company}. ` : ""}{closed ? CLOSED_LINE : progressLine(candidates.length, answered)}
          </p>
        </header>

        <label className="rv-who">
          <span className="t-label">Your name</span>
          <input
            className="rv-in" value={name} maxLength={80} autoComplete="name" spellCheck={false}
            onChange={(e) => setName(e.target.value)} onBlur={() => rememberName(name)}
          />
          <small className="t-caption">So the team knows who answered. You only need to say it once.</small>
        </label>

        <ol className="rv-list">
          {candidates.map((c) => (
            <li key={c.id}>
              <Card
                c={c} verdict={said[c.id] ?? null} closed={closed}
                onSaid={(v) => setSaid((cur) => ({ ...cur, [c.id]: v }))}
                send={(body) => { rememberName(name); return send(c.id, { ...body, ...(name.trim() ? { reviewerName: name.trim().slice(0, 80) } : {}) }); }}
              />
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function Card({ c, verdict, closed = false, onSaid, send }: {
  c: ReviewCandidate;
  /** The role has closed: what was answered is shown, and nothing more can be. */
  closed?: boolean;
  verdict: ReviewCandidate["verdict"];
  onSaid: (v: NonNullable<ReviewCandidate["verdict"]>) => void;
  send: (body: ReturnType<typeof verdictBody>) => Promise<void>;
}) {
  const work = workRows(c.experience);
  const school = schoolRows(c.education);
  const answers = answeredOnly(c.screening);
  const resume = safeLink(c.resumeUrl);
  const meta = metaLine(c);
  const skills = skillsLine(c.skills);
  return (
    <article className="rv-card" aria-labelledby={`rv-${c.id}`}>
      <header>
        <h2 className="t-title" id={`rv-${c.id}`}>{c.name}</h2>
        {c.headline && <p className="t-body-lg rv-headline">{c.headline}</p>}
        {meta && <p className="t-body-sm rv-meta">{meta}</p>}
      </header>

      {c.summary && <p className="t-body rv-text">{c.summary}</p>}
      {c.whyMatch && (
        <section>
          <h3 className="t-label">Why they match</h3>
          <p className="t-body rv-text">{c.whyMatch}</p>
        </section>
      )}
      {skills && (
        <section>
          <h3 className="t-label">Skills</h3>
          <p className="t-body rv-text">{skills}</p>
        </section>
      )}
      {work.length > 0 && (
        <section>
          <h3 className="t-label">Experience</h3>
          <ul className="rv-rows">
            {work.map((w, i) => (
              <li key={i}>
                <span className="t-body-strong">{w.title}</span>
                {(w.company || w.when) && <span className="t-body-sm rv-meta">{[w.company, w.when].filter(Boolean).join(", ")}</span>}
                {w.about && <span className="t-body-sm rv-text">{w.about}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {school.length > 0 && (
        <section>
          <h3 className="t-label">Education</h3>
          <ul className="rv-rows">
            {school.map((s, i) => (
              <li key={i}>
                <span className="t-body-strong">{s.school}</span>
                {(s.detail || s.when) && <span className="t-body-sm rv-meta">{[s.detail, s.when].filter(Boolean).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {answers.length > 0 && (
        <section>
          <h3 className="t-label">Their answers</h3>
          <dl className="rv-qa">
            {answers.map((a, i) => (
              <div key={i}>
                <dt className="t-body-sm rv-meta">{a.question}</dt>
                <dd className="t-body rv-text">{a.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {resume && <p className="rv-resume t-body"><a href={resume} target="_blank" rel="noopener noreferrer">Open their resume</a></p>}

      {closed ? <Said name={c.name} verdict={verdict} /> : <Answer name={c.name} verdict={verdict} onSaid={onSaid} send={send} />}
    </article>
  );
}

/** After the role has closed: an answer already given is told back, and there is no way to give or change one. */
function Said({ name, verdict }: { name: string; verdict: ReviewCandidate["verdict"] }) {
  if (!verdict) return null;
  return (
    <footer className="rv-answer" role="group" aria-label={`Your answer for ${name}`}>
      <p className="t-body-strong"><span className={verdict.verdict === "approved" ? "rv-yes" : "rv-no"}>{answerLine(verdict.verdict)}</span></p>
      {verdict.note && <p className="t-body rv-text rv-said">{verdict.note}</p>}
    </footer>
  );
}

/** Approve or Not for us, with a note if they like; after it, what they said and a way to change it. */
function Answer({ name, verdict, onSaid, send }: {
  name: string;
  verdict: ReviewCandidate["verdict"];
  onSaid: (v: NonNullable<ReviewCandidate["verdict"]>) => void;
  send: (body: ReturnType<typeof verdictBody>) => Promise<void>;
}) {
  const [note, setNote] = useState(verdict?.note ?? "");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState<"approved" | "declined" | null>(null);
  const [failed, setFailed] = useState(false);

  const answer = (v: "approved" | "declined") => {
    if (busy) return;
    setBusy(v);
    setFailed(false);
    const body = verdictBody(v, note, "");
    send(body).then(
      () => {
        setBusy(null);
        setChanging(false);
        onSaid({ verdict: v, note: body.note ?? null, at: new Date().toISOString() });
      },
      () => { setBusy(null); setFailed(true); },
    );
  };

  if (verdict && !changing) {
    return (
      <footer className="rv-answer" role="group" aria-label={`Your answer for ${name}`}>
        <p className="t-body-strong">
          <span className={verdict.verdict === "approved" ? "rv-yes" : "rv-no"}>{answerLine(verdict.verdict)}</span>
        </p>
        {verdict.note && <p className="t-body rv-text rv-said">{verdict.note}</p>}
        <button type="button" className="rv-link" onClick={() => { setNote(verdict.note ?? ""); setChanging(true); }}>Change</button>
      </footer>
    );
  }
  return (
    <footer className="rv-answer" role="group" aria-label={`Your answer for ${name}`}>
      <input
        className="rv-in" value={note} maxLength={NOTE_MAX} placeholder="Add a note for the team (optional)" aria-label={`A note about ${name}`}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="rv-btns">
        <button type="button" className="rv-btn is-primary" disabled={busy !== null} onClick={() => answer("approved")}>{busy === "approved" ? "Saving" : "Approve"}</button>
        <button type="button" className="rv-btn" disabled={busy !== null} onClick={() => answer("declined")}>{busy === "declined" ? "Saving" : "Not for us"}</button>
        {changing && <button type="button" className="rv-link" disabled={busy !== null} onClick={() => setChanging(false)}>Keep my answer</button>}
      </div>
      {failed && <p className="t-body-sm rv-calm" role="status">That didn't go through. Please try again in a moment.</p>}
    </footer>
  );
}
