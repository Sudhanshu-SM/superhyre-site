import { useEffect, useState } from "react";
import type { MemoryItem } from "../api/memory";
import { Shimmer, ShimmerRegion } from "../components/Shimmer";
import { confirmMemory, forgetMemory, refreshDoubts, useDoubts } from "../memoryStore";
import type { MemoryState } from "../memoryStore";
import { appliesTo, canChange, confirmHelp, doubtLine, whenLabel } from "../memoryView";
import { useSession } from "../roleStore";
import type { LiveViewProps } from "./types";
import "./memoryDoubts.css";

/**
 * The notes the agent has stopped relying on, because answers that leaned on them were turned down, each with a
 * Confirm (it still holds) and a Forget. Asked for with "which notes are you unsure about", offered beside "what do
 * you remember" while there are any, and opened by the task that counts them. The rows are the live list, so a card
 * shown earlier in the chat is as current as this one. A press changes the row at once and says nothing in the chat:
 * a refusal puts the note back with a line beneath it (the store's `reportProblem`).
 */
export default function MemoryDoubtsView({ ctx }: LiveViewProps): JSX.Element {
  const { doubts, doubted, working } = useDoubts();
  const manages = useSession().role === "admin";
  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [doubts, doubted.length, grow]);
  return (
    <DoubtedNotes
      phase={doubts} items={doubted} working={working} manages={manages}
      onConfirm={(id) => confirmMemory(id)} onForget={(id) => forgetMemory(id)} onRetry={() => void refreshDoubts()}
    />
  );
}

type Result = Promise<{ ok: true } | { ok: false; message: string }>;

/** The card itself, with nothing but what it is given: a ghost while the first look is on its way, then the rows, or a calm line. */
export function DoubtedNotes({ phase, items, working, manages, onConfirm, onForget, onRetry }: {
  phase: MemoryState["doubts"];
  items: readonly MemoryItem[];
  working: readonly string[];
  manages: boolean;
  onConfirm: (id: string) => Result;
  onForget: (id: string) => Result;
  onRetry: () => void;
}): JSX.Element {
  /* What the last press did, said once under the list ("Forgotten."), so a row that left is not a silent gap. */
  const [said, setSaid] = useState<string | null>(null);
  if (phase === "idle" || (phase === "loading" && items.length === 0)) {
    return (
      <section className="src mo lv-md" aria-label="Notes I'm not sure about">
        <ShimmerRegion label="Looking at the notes I'm not sure about">
          <ul className="lv-md-list" aria-hidden="true">
            {[58, 74].map((w, i) => (
              <li key={i} className="lv-md-row">
                <div className="lv-md-main">
                  <p className="lv-md-text"><Shimmer h={13} lh={20} w={`${w}%`} /></p>
                  <p className="lv-md-meta"><Shimmer h={10} lh={16} w="38%" /></p>
                </div>
                <div className="lv-md-acts"><Shimmer h={26} w={64} r={8} /><Shimmer h={26} w={52} r={8} /></div>
              </li>
            ))}
          </ul>
        </ShimmerRegion>
      </section>
    );
  }
  if (phase === "failed" && items.length === 0) {
    return (
      <section className="src mo lv-md" aria-label="Notes I'm not sure about">
        <p className="lv-md-quiet t-body-sm" role="alert">
          Couldn't look at these just now.{" "}
          <button type="button" className="st-link" onClick={onRetry}>Try again</button>
        </p>
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section className="src mo lv-md" aria-label="Notes I'm not sure about">
        <p className="lv-md-quiet t-body-sm" role="status">{said ?? "I'm not unsure about any of my notes right now."}</p>
      </section>
    );
  }
  const mine = items.some((i) => canChange(i, { manages }));
  return (
    <section className="src mo lv-md" aria-label="Notes I'm not sure about">
      <p className="lv-md-lead t-body-sm">
        {mine
          ? "Answers that used these were turned down, so I've stopped opening with them. Confirm the ones that still hold."
          : "Answers that used these were turned down, so I've stopped opening with them. An admin can say whether they still hold."}
      </p>
      <ul className="lv-md-list">
        {items.map((item) => {
          const may = canChange(item, { manages });
          const busy = working.includes(item.id);
          return (
            <li className={`lv-md-row${busy ? " is-busy" : ""}`} key={item.id}>
              <div className="lv-md-main">
                <p className="lv-md-text t-body">{item.text}</p>
                <p className="lv-md-meta t-caption">
                  {[appliesTo(item), doubtLine(item), whenLabel(item.updatedAt)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="lv-md-acts">
                {may ? (
                  <>
                    <button type="button" className="src-btn is-primary mo-small" disabled={busy}
                      onClick={() => void onConfirm(item.id).then((r) => setSaid(r.ok ? "Confirmed. I'll open with it again." : null))}>
                      Confirm
                    </button>
                    <button type="button" className="src-btn is-quiet mo-small" disabled={busy}
                      onClick={() => void onForget(item.id).then((r) => setSaid(r.ok ? "Forgotten." : null))}>
                      Forget
                    </button>
                  </>
                ) : (
                  <span className="lv-md-quiet t-body-sm">{confirmHelp(item, { manages })}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="lv-md-quiet t-body-sm lv-md-said" role="status" aria-live="polite">{said ?? ""}</p>
    </section>
  );
}
