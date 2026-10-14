import { useEffect, useMemo, useRef, useState } from "react";
import { applyEvent, newTurn } from "../liveChat";
import type { ChatState } from "../liveChat";
import { LiveTurnBody } from "../LiveTurn";
import { startTheme } from "../theme";
import { Loader } from "../components/Loader";
import { approvedShortlist, connectCard, sourcingRun } from "./fixtures";
import type { Step } from "./fixtures";
import "./agentCards.css";

/**
 * `#/agent-preview`: the chat's narration and cards driven by a scripted run, with no server and no sign-in.
 * Play the whole sourcing run, step through it, or look at an approved action turning into its outcome. A
 * place to look at the motion and the words, as `#/setup-preview` is for the set-up.
 */

const CHAT = "r1";
const SECOND = "r2";

function seed(): ChatState {
  const first = { ...newTurn("t1", "Find me 30 software engineers for the open role", Date.parse("2026-10-11T10:00:00.000Z")), runId: CHAT, status: "working" as const };
  const second = { ...newTurn("t2", "Shortlist the best fits", Date.parse("2026-10-11T10:05:00.000Z")), runId: SECOND, status: "working" as const };
  return { conversationId: "preview", turns: [first, second], owners: { [CHAT]: "t1", [SECOND]: "t2" }, orphans: {}, applied: {}, loading: false, error: null };
}

export function AgentPreview(): JSX.Element {
  const run = useMemo(() => sourcingRun(CHAT, "s1").turn, []);
  const act = useMemo(() => approvedShortlist(SECOND), []);
  const [which, setWhich] = useState<"sourcing" | "approval" | "connect">("sourcing");
  const script: readonly Step[] = which === "sourcing" ? run : which === "approval" ? act : connectCard(SECOND);
  const [state, setState] = useState<ChatState>(seed);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | null>(null);
  /* The device's theme, or the one chosen in the console, so both can be looked at. */
  useEffect(() => startTheme(), []);

  const reset = (next = which) => {
    setWhich(next);
    setState(seed());
    setAt(0);
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    if (at >= script.length) { setPlaying(false); return; }
    const prev = at === 0 ? 0 : script[at - 1]!.at;
    const wait = Math.max(30, script[at]!.at - prev);
    timer.current = window.setTimeout(() => {
      setState((s) => applyEvent(s, script[at]!.event));
      setAt((n) => n + 1);
    }, wait);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [playing, at, script]);

  const turns = which === "sourcing" ? [state.turns[0]!] : [state.turns[1]!];

  return (
    <div className="ap-preview">
      <header className="ap-preview-head">
        <h1>The agent, narrated</h1>
        <div className="ap-preview-bar" role="group" aria-label="What to play">
          {(["sourcing", "approval", "connect"] as const).map((k) => (
            <button key={k} type="button" className={which === k ? "is-on" : undefined} onClick={() => reset(k)}>
              {k === "sourcing" ? "A sourcing run" : k === "approval" ? "An approved action" : "A connection"}
            </button>
          ))}
          <button type="button" onClick={() => setPlaying((p) => !p)} disabled={at >= script.length}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => { setPlaying(false); if (at < script.length) { setState((s) => applyEvent(s, script[at]!.event)); setAt((n) => n + 1); } }}>Step</button>
          <button type="button" onClick={() => reset()}>Again</button>
          <span className="ap-preview-n">{at} of {script.length} events</span>
        </div>
        <p className="ap-preview-note">Scripted, not a server: the same events the server sends, replayed here. <Loader size="sm" tone="inherit" /></p>
      </header>
      {turns.map((t) => (
        <article key={t.key} className="ap-preview-turn">
          <p className="ap-preview-said">{t.said}</p>
          <div className="ap-preview-body"><LiveTurnBody turn={t} onAnswer={() => {}} /></div>
        </article>
      ))}
    </div>
  );
}
