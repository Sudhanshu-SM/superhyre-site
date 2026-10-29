import { useCallback, useEffect, useState } from "react";
import "./agentLive.css";
import { clip, conversationOf, didLine, didOf, questionOf } from "./activityView";
import type { RunDetail } from "./activityView";
import { api, messageOf } from "./api/client";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { EmptyArt } from "./EmptyArt";
import { openChat } from "./liveChat";
import { campaignLink } from "./nav";
import { LoadFailed } from "./ui";

/**
 * Agent activity when the console is connected: the agent's recent work in this
 * workspace, as the server recorded it. Your own runs, and your team's searches
 * and watches on campaigns you can see; other people's chats stay theirs.
 */

export type RunSummary = {
  id: string;
  skill: "chat" | "sourcing" | "watch" | "spec" | string;
  trigger: string;
  status: "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
  mine: boolean;
  /** Sent with the list by a server that does; otherwise they are read from the run itself. */
  conversationId?: string | null;
  question?: string | null;
  did?: string[];
};

/** What a chat run asked and what came of it. */
export type RunWords = { question: string | null; did: string[]; conversationId: string | null };

const WHAT: Record<string, string> = {
  chat: "Answered a question",
  sourcing: "Searched for people",
  watch: "Kept sourcing",
  spec: "Drafted requirements",
};

/** What a run that failed or was stopped says in place of what it was for: it did not do the thing. */
const NOT_DONE: Record<string, string> = {
  chat: "Couldn't answer a question",
  sourcing: "Couldn't search for people",
  watch: "Couldn't keep sourcing",
  spec: "Couldn't draft requirements",
};

/**
 * "Searched for people for Data Engineer", in words; the status only when it isn't simply done. A run that failed
 * or was stopped never reads as done ("Couldn't draft a role spec for Product Designer yet"), and its second
 * line keeps the server's own calm sentence for why.
 */
export function describeRun(r: RunSummary): { what: string; how: string | null } {
  const notDone = r.status === "failed" || r.status === "cancelled";
  const base = notDone ? (NOT_DONE[r.skill] ?? "Couldn't finish something") : (WHAT[r.skill] ?? "Worked on something");
  const named = r.campaignName ? `${base} for ${r.campaignName}` : base;
  const what = notDone ? `${named} yet` : named;
  const how =
    r.status === "running" || r.status === "queued" || r.status === "waiting"
      ? "Still working"
      : r.status === "cancelled"
        ? "Stopped"
        : r.status === "failed"
          ? (r.error?.message ?? "Didn't finish")
          : null;
  return { what: r.mine ? what : `${what} (a teammate)`, how };
}

/**
 * One row: what was done (or, when nothing was, what was asked), a second line for what the first
 * leaves out, and where the row opens. A run that isn't a chat reads as before.
 */
export function rowOf(r: RunSummary, words?: RunWords | null): {
  title: string;
  asked: string | null;
  how: string | null;
  to: { kind: "chat"; id: string } | { kind: "campaign"; id: string } | null;
} {
  const base = describeRun(r);
  const question = words?.question ?? (r.question ? clip(r.question) : null);
  const did = words?.did ?? r.did ?? [];
  const chatId = words?.conversationId ?? r.conversationId ?? null;
  const done = didLine(did);
  if (r.skill === "chat") {
    return {
      title: done ?? (question ? `“${question}”` : base.what),
      asked: done && question ? `You asked: “${question}”` : null,
      how: base.how,
      to: chatId && r.mine ? { kind: "chat", id: chatId } : null,
    };
  }
  return { title: base.what, asked: null, how: base.how, to: r.campaignId ? { kind: "campaign", id: r.campaignId } : null };
}

function when(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** How many of the newest chats are read for what was asked and done, and how many at once. */
const READ_FIRST = 25;
const AT_ONCE = 3;

export function AgentActivity(): JSX.Element {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [words, setWords] = useState<Readonly<Record<string, RunWords>>>({});

  const load = useCallback(() => {
    setFailed(null);
    api<{ runs: RunSummary[] }>("GET", "/v1/runs?limit=50").then(
      (r) => setRuns(r.runs),
      (err: unknown) => setFailed(messageOf(err)),
    );
  }, []);
  useEffect(load, [load]);

  /* The list says only that a chat answered; the question and what came of it are in the run, read
     for the newest chats a few at a time. Rows fill in as they arrive and are never held up by it. */
  useEffect(() => {
    if (!runs) return;
    let live = true;
    const todo = runs.filter((r) => r.skill === "chat" && r.mine && r.question === undefined && r.did === undefined).slice(0, READ_FIRST);
    let next = 0;
    const work = async () => {
      while (live && next < todo.length) {
        const r = todo[next++];
        if (!r) break;
        try {
          const d = await api<RunDetail>("GET", `/v1/runs/${r.id}`);
          if (live) setWords((w) => ({ ...w, [r.id]: { question: questionOf(d), did: didOf(d), conversationId: conversationOf(d) } }));
        } catch {
          /* A run that can't be read keeps its plain row. */
        }
      }
    };
    for (let i = 0; i < AT_ONCE; i++) void work();
    return () => { live = false; };
  }, [runs]);

  return (
    <div className="con-page">
      <h1 className="con-h1">Agent activity</h1>
      <p className="con-lede">What the agent has done here lately.</p>
      {failed ? (
        <LoadFailed what="Agent activity" onRetry={load} />
      ) : !runs ? (
        <ShimmerRegion label="Loading what the agent has done">
          <ol className="aa-list" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="aa-row">
                <div className="aa-open is-plain">
                  <span className="aa-what"><Shimmer h={13} lh={20} w={`${40 + ((i * 17) % 40)}%`} /></span>
                  <span className="aa-meta"><Shimmer h={11} lh={20} w={`${28 + ((i * 13) % 30)}%`} /></span>
                </div>
              </li>
            ))}
          </ol>
        </ShimmerRegion>
      ) : runs.length === 0 ? (
        <div className="aa-empty">
          <EmptyArt name="empty-agent-activity" size={180} />
          <p>Nothing yet. Ask the agent something or start a search and it shows up here.</p>
        </div>
      ) : (
        <ol className="aa-list">
          {runs.map((r) => {
            const row = rowOf(r, words[r.id]);
            const inner = (
              <>
                <span className="aa-what">{row.title}</span>
                <span className="aa-meta">{[row.asked, row.how, when(r.createdAt)].filter(Boolean).join(" · ")}</span>
              </>
            );
            return (
              <li key={r.id} className="aa-row">
                {row.to?.kind === "chat" ? (
                  <button type="button" className="aa-open" onClick={() => { void openChat((row.to as { id: string }).id); window.location.hash = "/agent"; }}>
                    {inner}
                  </button>
                ) : row.to?.kind === "campaign" ? (
                  <a className="aa-open" href={campaignLink(row.to.id)}>{inner}</a>
                ) : (
                  <div className="aa-open is-plain">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
