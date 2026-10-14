import { useId, useState } from "react";
import { specApi } from "./api/agent";
import type { Requirement, RoleSpec } from "./api/agent";
import { messageOf } from "./api/client";
import { FOLLOWING_LINE, useMayChangeCampaign } from "./campaignRights";
import { refreshCampaign, refreshCampaignAgents } from "./campaignStore";
import { useCampaignSpec } from "./specDraft";
import "./sourcing.css";
import "./roleSpec.css";
import { Loader } from "./components/Loader";
import { RunNarration } from "./agentCards";

/**
 * The role spec: what every person found for this campaign is checked against.
 *
 * Drafted from the JD (or from the campaign's must-haves when there is no JD),
 * edited here, and approved by the recruiter. Nothing searches until it is
 * approved, and each edit is a new version, so a score can always say which
 * spec it was judged on.
 */

const IMPORTANCE: Array<{ id: Requirement["importance"]; label: string }> = [
  { id: "must", label: "Must have" },
  { id: "nice", label: "Nice to have" },
  { id: "knockout", label: "Hard requirement" },
];
const WEIGHT: Record<Requirement["importance"], number> = { must: 0.8, nice: 0.3, knockout: 0 };
const FILE_TYPES = ".pdf,.docx,.txt,.png,.jpg,.jpeg";

function nextRequirementId(reqs: readonly Requirement[]): string {
  return `r${Math.max(0, ...reqs.map((r) => Number(r.id.slice(1)) || 0)) + 1}`;
}

export function RoleSpecPanel({ campaignId }: { campaignId: string }): JSX.Element {
  /* One shared read of the spec and of the draft on its way: while Mind drafts, it asks again by
     itself and the spec appears here when it lands. */
  const spec = useCampaignSpec(campaignId);
  /* Writing, drafting and approving the spec belong to the people on the campaign; anyone else reads it. */
  const may = useMayChangeCampaign(campaignId);
  const latest = spec.latest;
  /* Edits belong to the version they were made on: a newer version lands as it is. */
  const [edits, setEdits] = useState<{ id: string; spec: RoleSpec } | null>(null);
  const edit = latest ? (edits?.id === latest.id ? edits.spec : latest.spec) : null;
  const setEdit = (next: RoleSpec | null) => { if (latest && next) setEdits({ id: latest.id, spec: next }); };
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  /* What approving started, said once: the first search, or the people already found ranked on this version. */
  const [started, setStarted] = useState<string | null>(null);
  /* The run it started, followed here so what it is doing is on screen and not only said once. */
  const [running, setRunning] = useState<string | null>(null);
  const jdId = useId();

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setProblem(null);
    setStarted(null);
    setRunning(null);
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

  if (!spec.ready) return <section className="rs" aria-label="Role spec"><Loader size="md" label="Loading the role spec" block /></section>;

  const isApproved = latest !== null && latest.id === spec.approved?.id;
  const changed = latest !== null && edit !== null && JSON.stringify(edit) !== JSON.stringify(latest.spec);

  /* Nothing to paste into while Mind is already at it: the same words, then the spec. */
  if (spec.drafting && !latest) {
    return (
      <section className="rs" aria-label="Role spec" aria-busy="true">
        <h2 className="rs-title">Role spec</h2>
        <div className="rs-wait" role="status">
          <p className="rs-wait-t">Mind is drafting the role</p>
          <p className="rs-copy">
            It shows here as soon as it is ready. Nothing is searched until you approve it.
          </p>
          <Loader size="md" />
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

  const setReq = (id: string, patch: Partial<Requirement>) =>
    setEdit({ ...edit, requirements: edit.requirements.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  return (
    <section className="rs" aria-label="Role spec">
      <header className="rs-head">
        <h2 className="rs-title">{edit.title}</h2>
        {spec.drafting && <p className="rs-note" role="status">Mind is drafting a newer version. It shows here when it is ready.</p>}
        <p className="rs-meta">
          {[
            edit.seniority,
            edit.locations.length ? edit.locations.join(", ") : null,
            edit.remoteOk ? "Remote is fine" : null,
            edit.yearsMin != null ? `${edit.yearsMin}+ years` : null,
            isApproved && !changed ? `Approved, version ${latest.version}` : `Draft, version ${latest.version}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {IMPORTANCE.map(({ id, label }) => {
        const reqs = edit.requirements.filter((r) => r.importance === id);
        if (!reqs.length) return null;
        return (
          <div key={id} className="rs-group">
            <h3 className="rs-group-title">{label}</h3>
            <ul className="rs-reqs">
              {reqs.map((r) => (
                <li key={r.id} className="rs-req">
                  <span className="rs-req-text">{r.text}</span>
                  {/* The group heading already says how much it matters; this only moves it. */}
                  {may && <select
                    className="rs-req-importance"
                    aria-label={`Move "${r.text}" to another group`}
                    value=""
                    onChange={(e) => {
                      const importance = e.target.value as Requirement["importance"];
                      if (importance) setReq(r.id, { importance, weight: WEIGHT[importance] });
                    }}
                  >
                    <option value="" disabled>Move to</option>
                    {IMPORTANCE.filter((o) => o.id !== r.importance).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>}
                  {may && <button
                    type="button"
                    className="rs-remove"
                    aria-label={`Remove "${r.text}"`}
                    disabled={edit.requirements.length === 1}
                    onClick={() => setEdit({ ...edit, requirements: edit.requirements.filter((x) => x.id !== r.id) })}
                  >
                    Remove
                  </button>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {may && <form
        className="rs-add"
        onSubmit={(e) => {
          e.preventDefault();
          const text = adding.trim();
          if (text.length < 2) return;
          const req: Requirement = {
            id: nextRequirementId(edit.requirements),
            kind: "other",
            text,
            importance: "must",
            weight: WEIGHT.must,
          };
          setEdit({ ...edit, requirements: [...edit.requirements, req] });
          setAdding("");
        }}
      >
        <input
          className="rs-add-input"
          aria-label="Add a requirement"
          placeholder="Add a requirement, e.g. 3+ years with Kafka"
          value={adding}
          maxLength={200}
          onChange={(e) => setAdding(e.target.value)}
        />
      </form>}

      {!may && <p className="rs-note">{FOLLOWING_LINE}</p>}
      {may && <div className="rs-actions">
        {changed && (
          <button
            type="button"
            className="src-btn is-primary"
            disabled={busy !== null}
            aria-busy={busy === "save" || undefined}
            onClick={() => void run("save", () => specApi.save(campaignId, edit))}
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
      </div>}
      {started && !problem && <p className="rs-note" role="status">{started}</p>}
      {running && !problem && <RunNarration runId={running} />}
      {problem && <p className="rs-note">{problem}</p>}
    </section>
  );
}
