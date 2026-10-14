import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { mayChangeCampaign } from "./campaignRights";
import { useCampaignRows } from "./campaignStore";
import { onWatchesChanged } from "./liveChat";
import { useSession } from "./roleStore";
import { LoadFailed } from "./ui";
import "./agentLive.css";

/**
 * Keep-sourcing watches the recruiter can see, for the agent rail: what each
 * is doing in plain words, and the three controls a watch has. Refreshed on
 * an interval because a watch moves on its own schedule, not on a click.
 */

type Watch = {
  id: string;
  campaignId: string;
  campaignName: string;
  state: "queued" | "running" | "waiting" | "paused" | "done" | "stopped" | "error";
  stateReason: string | null;
  summary: string;
  config: { stop: { profiles?: number } };
  counters: { found: number };
  nextRunAt: string | null;
};

const REFRESH_MS = 60_000;

function nextCheck(nextRunAt: string | null, now = Date.now()): string | null {
  if (!nextRunAt) return null;
  const mins = Math.round((Date.parse(nextRunAt) - now) / 60_000);
  if (mins <= 1) return "checking again shortly";
  return mins < 60 ? `next check in ${mins} min` : `next check in ${Math.round(mins / 60)} h`;
}

export function statusLine(w: Pick<Watch, "state" | "stateReason" | "config" | "counters" | "nextRunAt">, now = Date.now()): string {
  const target = w.config.stop.profiles;
  const found = target ? `${w.counters.found} of ${target} found` : `${w.counters.found} found`;
  if (w.state === "running") {
    // A reason on a running watch is why it's waiting (scoring was down, today's budget is
    // used): it replaces "Keeping an eye out", which would read as if all were well.
    const why = w.stateReason?.trim().replace(/\.$/, "");
    return [why || "Keeping an eye out", found, nextCheck(w.nextRunAt, now)].filter(Boolean).join(" · ");
  }
  if (w.state === "paused") {
    const why = w.stateReason?.trim();
    if (!why) return "Paused by you.";
    return /^paused\b/i.test(why) ? why : `Paused: ${why}`;
  }
  return w.stateReason ?? found;
}

export function WatchList(): JSX.Element | null {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* A watch on a campaign the person only follows is theirs to read, not to pause or stop. */
  const session = useSession();
  const rows = useCampaignRows();
  const mayControl = (campaignId: string) => mayChangeCampaign(session, rows.find((r) => r.id === campaignId));
  /* A change (pause, resume, stop) that didn't go through. Said calmly: the server's own sentence
     for a generic failure is "Something went wrong.", which tells a person nothing. */
  const [problem, setProblem] = useState<string | null>(null);
  /* The list itself didn't load. A refresh that fails while a list is showing leaves the list alone. */
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { agents } = await api<{ agents: Watch[] }>("GET", "/v1/agents?active=true");
      setWatches(agents);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    const stop = onWatchesChanged(() => void load());
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [load]);

  async function control(id: string, action: "pause" | "resume" | "stop") {
    setBusy(id);
    setProblem(null);
    try {
      await api("PATCH", `/v1/agents/${id}`, { action });
      await load();
    } catch {
      setProblem(`That didn't go through. Try ${action === "stop" ? "stopping" : action === "pause" ? "pausing" : "resuming"} it again.`);
    } finally {
      setBusy(null);
    }
  }

  const failedBlank = loadFailed && !watches;
  if (!watches?.length && !problem && !failedBlank) return null;
  return (
    <section className="rail-sec">
      <div className="rail-panel">
        <p className="rail-panel-label">Keeping watch</p>
        {failedBlank && <LoadFailed compact what="Your watches" onRetry={() => void load()} />}
        <ul className="wl">
          {watches?.map((w) => (
            <li key={w.id} className="wl-item">
              <span className="wl-name">{w.campaignName}</span>
              <span className="wl-line">{statusLine(w)}</span>
              {mayControl(w.campaignId) && <span className="wl-acts">
                {w.state === "running" ? (
                  <button type="button" className="lt-link" disabled={busy === w.id} onClick={() => void control(w.id, "pause")}>
                    Pause
                  </button>
                ) : (
                  <button type="button" className="lt-link" disabled={busy === w.id} onClick={() => void control(w.id, "resume")}>
                    Resume
                  </button>
                )}
                <button type="button" className="lt-link" disabled={busy === w.id} onClick={() => void control(w.id, "stop")}>
                  Stop
                </button>
              </span>}
            </li>
          ))}
        </ul>
        {problem && <p className="lt-note">{problem}</p>}
      </div>
    </section>
  );
}
