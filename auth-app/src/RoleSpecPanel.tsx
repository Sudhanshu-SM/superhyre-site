import { useId, useState } from "react";
import { specApi } from "./api/agent";
import type { RoleSpec } from "./api/agent";
import { messageOf } from "./api/client";
import { useFollowingLine, useMayChangeCampaign } from "./campaignRights";
import { refreshCampaign, refreshCampaignAgents } from "./campaignStore";
import { useCampaignSpec } from "./specDraft";
import "./sourcing.css";
import "./roleSpec.css";
import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { RunNarration, SpecEditor } from "./agentCards";
import { readStanding } from "./agentCards/specActions";
import { bucketsLine } from "./agentCards/specView";
import { sameSpec, specProblem, tidy } from "./agentCards/specEdit";

/**
 * The role spec: what every person found for this campaign is checked against.
 *
 * Drafted from the JD (or from the campaign's must-haves when there is no JD),
 * edited here, and approved by the recruiter. Nothing searches until it is
 * approved, and each edit is a new version, so a score can always say which
 * spec it was judged on.
 */

const GHOST_GROUPS = ["Must have", "Nice to have"];
/** The spec while it loads: its own head, group titles and requirement rows, so the page keeps its shape when the spec lands. */
function SpecGhost(): JSX.Element {
  return (
    <ShimmerRegion as="section" label="Loading the role spec" className="rs">
      <header className="rs-head" aria-hidden="true">
        <h2 className="rs-title">Role spec</h2>
        <p className="rs-meta"><Shimmer h={12} lh={20} w="64%" /></p>
      </header>
      {GHOST_GROUPS.map((label, g) => (
        <div key={label} className="rs-group" aria-hidden="true">
          <h3 className="rs-group-title">{label}</h3>
          <ul className="rs-reqs">
            {Array.from({ length: g === 0 ? 3 : 2 }, (_, i) => (
              <li key={i} className="rs-req"><span className="rs-req-text"><Shimmer h={13} lh={20} w={`${52 + ((i * 17 + g * 11) % 40)}%`} /></span></li>
            ))}
          </ul>
        </div>
      ))}
    </ShimmerRegion>
  );
}

const FILE_TYPES = ".pdf,.docx,.txt,.png,.jpg,.jpeg";

export function RoleSpecPanel({ campaignId, onClose }: { campaignId: string; onClose?: () => void }): JSX.Element {
  /* One shared read of the spec and of the draft on its way: while Mind drafts, it asks again by
     itself and the spec appears here when it lands. */
  const spec = useCampaignSpec(campaignId);
  /* Writing, drafting and approving the spec belong to the people on the campaign; anyone else reads it. */
  const may = useMayChangeCampaign(campaignId);
  const FOLLOWING_LINE = useFollowingLine();
  const latest = spec.latest;
  /* Edits belong to the version they were made on: a newer version lands as it is. */
  const [edits, setEdits] = useState<{ id: string; spec: RoleSpec } | null>(null);
  const edit = latest ? (edits?.id === latest.id ? edits.spec : latest.spec) : null;
  const setEdit = (next: RoleSpec | null) => { if (latest && next) setEdits({ id: latest.id, spec: next }); };
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* What approving started, said once: the first search, or the people already found ranked on this version. */
  const [started, setStarted] = useState<string | null>(null);
  /* The run it started, followed here so what it is doing is on screen and not only said once. */
  const [running, setRunning] = useState<string | null>(null);
  /* How it ended, once the run has: the calm last word, with a way to close. */
  const [done, setDone] = useState<string | null>(null);
  const jdId = useId();

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setProblem(null);
    setStarted(null);
    setRunning(null);
    setDone(null);
    try {
      await work();
      await spec.reload();
      /* The Overview's log and figures name what just happened. */
      refreshCampaign(campaignId);
      refreshCampaignAgents(campaignId);
    } catch (err) {
      setProblem(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  if (!spec.ready) return <SpecGhost />;

  const isApproved = latest !== null && latest.id === spec.approved?.id;
  const changed = latest !== null && edit !== null && !sameSpec(edit, latest.spec);

  /* Nothing to paste into while Mind is already at it: the same words, then the spec. */
  if (spec.drafting && !latest) {
    return (
      <section className="rs" aria-label="Role spec" aria-busy="true">
        <h2 className="rs-title">Role spec</h2>
        <div className="rs-wait" role="status">
          <p className="rs-wait-t">SuperHyre is drafting the role</p>
          <p className="rs-copy">
            It shows here as soon as it is ready. Nothing is searched until you approve it.
          </p>
          <ShimmerText lines={3} />
        </div>
      </section>
    );
  }

  if (!latest || !edit) {
    if (!may) {
      return (
        <section className="rs" aria-label="Role spec">
          <h2 className="rs-title">Role spec</h2>
          <p className="rs-copy">There is no role spec yet. {FOLLOWING_LINE}</p>
        </section>
      );
    }
    return (
      <section className="rs" aria-label="Role spec">
        <h2 className="rs-title">Role spec</h2>
        {spec.failed && !problem && (
          <>
            {/* The description was given already: trying again reads what is saved, nothing is pasted twice. */}
            <p className="rs-note">The last draft did not come through. I can try again from what is saved on the campaign.</p>
            <div className="rs-actions">
              <button
                type="button"
                className="src-btn is-primary"
                disabled={busy !== null}
                onClick={() => void run("retry", () => specApi.draft(campaignId))}
              >
                {busy === "retry" ? "Reading the JD" : "Try again"}
              </button>
            </div>
          </>
        )}
        <p className="rs-copy">
          Paste the job description and we'll turn it into the requirements every candidate is checked against. You can edit
          them before anything is searched.
        </p>
        <label className="rs-label" htmlFor={jdId}>Job description</label>
        <textarea id={jdId} className="rs-jd" rows={8} value={jd} onChange={(e) => setJd(e.target.value)} />
        <div className="rs-actions">
          <button
            type="button"
            className="src-btn is-primary"
            disabled={busy !== null || jd.trim().length < 80}
            onClick={() => void run("draft", () => specApi.draft(campaignId, jd.trim()))}
          >
            {busy === "draft" ? "Reading the JD" : "Draft the spec"}
          </button>
          <label className="src-btn is-quiet rs-file">
            {busy === "file" ? "Reading the file" : "Upload the JD"}
            <input
              type="file"
              accept={FILE_TYPES}
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run("file", () => specApi.draftFromFile(campaignId, file));
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="src-btn is-quiet"
            disabled={busy !== null}
            onClick={() => void run("setup", () => specApi.draft(campaignId))}
          >
            Use the campaign's must-haves
          </button>
        </div>
        {jd.trim().length > 0 && jd.trim().length < 80 && <p className="rs-note">A little more of the JD, please.</p>}
        {problem && <p className="rs-note">{problem}</p>}
      </section>
    );
  }

  const problem_ = specProblem(edit);
  const finished = async (how: "done" | "failed") => {
    setRunning(null);
    setStarted(null);
    if (how === "failed") { setProblem("The search stopped before it finished."); return; }
    const st = await readStanding(campaignId);
    setDone(`Done. ${st ? bucketsLine(st.buckets) : "The people found are in the ranked list."}`);
    refreshCampaign(campaignId);
  };

  return (
    <section className="rs" aria-label="Role spec">
      <header className="rs-head">
        <h2 className="rs-title">Role spec</h2>
        {spec.drafting && <p className="rs-note" role="status">SuperHyre is drafting a newer version. It shows here when it is ready.</p>}
        <p className="rs-meta">
          {isApproved
            ? changed
              ? `Editing approved version ${latest.version}. Saving makes draft version ${latest.version + 1}.`
              : `Approved, version ${latest.version}`
            : `Draft, version ${latest.version}`}
        </p>
      </header>

      {/* The whole spec at once, edited where it stands: one Save for all of it, one Approve. */}
      <SpecEditor spec={edit} readOnly={!may} onChange={setEdit} />

      {!may && <p className="rs-note">{FOLLOWING_LINE}</p>}
      {/* The decision stays in view while the spec scrolls: one Save, one Approve, and how it went. */}
      <footer className="rs-foot">
      {started && !problem && !done && <p className="rs-note" role="status">{started}</p>}
      {running && !problem && !done && <RunNarration runId={running} onFinish={(how) => void finished(how)} />}
      {done && !problem && <p className="rs-note is-done" role="status">{done}</p>}
      {problem && <p className="rs-note">{problem}</p>}
      {may && <div className="rs-actions">
        {changed && (
          <button
            type="button"
            className="src-btn is-primary"
            disabled={busy !== null || problem_ !== null}
            aria-busy={busy === "save" || undefined}
            onClick={() => void run("save", () => specApi.save(campaignId, tidy(edit)))}
          >
            {busy === "save" ? <><Loader size="sm" tone="inherit" />Saving</> : "Save changes"}
          </button>
        )}
        {!changed && !isApproved && (
          <button
            type="button"
            className="src-btn is-primary"
            disabled={busy !== null}
            onClick={() => void run("approve", async () => {
              const done = await specApi.approve(campaignId, latest.id, { match: true });
              const m = done.matching;
              if (m?.kind === "rank") setStarted(`Matching the ${m.people === 1 ? "1 person" : `${m.people} people`} found so far to this version. They show in the ranked list as they are scored.`);
              else if (m?.kind === "search") setStarted("Looking for people now. They show in the ranked list as they are scored.");
              setRunning(m?.runId ?? null);
            })}
          >
            {busy === "approve" ? <><Loader size="sm" tone="inherit" />Approving</> : "Approve and start matching"}
          </button>
        )}
        {changed && (
          <button type="button" className="src-btn is-quiet" disabled={busy !== null} onClick={() => setEdit(latest.spec)}>
            Undo changes
          </button>
        )}
        {done && onClose && <button type="button" className="src-btn is-primary" onClick={onClose}>Close</button>}
      </div>}
      </footer>
    </section>
  );
}
