import { Check, User } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Loader } from "../../components/Loader";
import { OrgMark } from "../../OrgMark";
import { flight, flightWords, initialsOf, LINE_AT, TYPE_EVERY, TYPE_FROM, typedLength, useFlight } from "./flight";
import type { FlightState } from "./flight";
import "./flight.css";

/**
 * The arrival: the person's initials glide along a dotted path into the organisation's mark, its name is
 * typed in under it and three quiet lines say what is happening. It sits over everything (the console is
 * already drawn behind it) and fades away when the work is done and a few seconds have passed; see flight.ts
 * for the clock. Mounted once, at the root of the app, so no screen's own render can restart it.
 */

/** Whether the page behind the scene has drawn: the console is there and its page is no longer on its loader. */
function consoleSettled(): boolean {
  if (typeof document === "undefined") return true;
  const main = document.getElementById("con-main");
  return !!main && !main.querySelector(".ldr");
}

/** `settle` is off where there is no console to wait for (the set-up's preview). */
export function FlightHost({ settle = true }: { settle?: boolean }): JSX.Element | null {
  const s = useFlight();
  useEffect(() => {
    flight.setSettled(settle ? consoleSettled : null);
    return () => flight.setSettled(null);
  }, [settle]);
  if (s.phase === "idle" || !s.info) return null;
  return <Scene key={s.n} s={s} />;
}

function Scene({ s }: { s: FlightState }): JSX.Element {
  const info = s.info!;
  const words = flightWords(info.kind);
  const still = s.reduced;
  const letters = Array.from(info.org);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - s.startedAt));

  useEffect(() => {
    if (still) return;
    // Ticks only while there is something still to reveal: the typing and the three lines.
    const end = Math.max(LINE_AT[2], TYPE_FROM + letters.length * TYPE_EVERY) + 200;
    const t = window.setInterval(() => {
      const e = Date.now() - s.startedAt;
      setElapsed(e);
      if (e > end) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [s.startedAt, still, letters.length]);

  const typed = still ? letters.length : typedLength(info.org, elapsed);
  const shown = (i: number): boolean => still || elapsed >= LINE_AT[i]!;
  const finished = s.ready || s.ended === "done";
  const status = (i: number): "wait" | "work" | "done" => {
    if (!shown(i)) return "wait";
    if (finished || (i < 2 && shown(i + 1))) return "done";
    return "work";
  };
  const initials = initialsOf(info.person);

  return (
    <div
      className={`arr${s.phase === "out" ? " is-out" : ""}${s.ended === "failed" ? " is-failed" : ""}${still ? " is-still" : ""}`}
      style={{ ["--arr-fade" as string]: `${s.fadeMs}ms` }}
      role="status"
      aria-label={`${words.verb} ${info.org}`}
    >
      <div className="arr-stage">
        <div className="arr-track" aria-hidden="true">
          <svg className="arr-path" viewBox="0 0 340 100" width="340" height="100" focusable="false">
            <path className="arr-dots" d="M 26 70 Q 168 -20 310 70" />
            <path className="arr-dots arr-lit" d="M 26 70 Q 168 -20 310 70" />
          </svg>
          <span className="arr-org">
            <OrgMark name={info.org} logoUrl={info.logoUrl ?? null} fill />
          </span>
          <span className="arr-chip">{initials ? initials : <User size={22} weight="bold" />}</span>
        </div>

        <h1 className="arr-title" aria-hidden="true">
          <span className="arr-verb">{words.verb}</span> <span className="arr-name">{letters.slice(0, typed).join("")}</span>
        </h1>

        <ol className="arr-lines" aria-hidden="true">
          {words.lines.map((line, i) => (
            <li key={line} className={`arr-line is-${status(i)}`}>
              <span className="arr-ico">{status(i) === "done" ? <Check size={14} weight="bold" /> : status(i) === "work" ? <Loader size="sm" /> : null}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
