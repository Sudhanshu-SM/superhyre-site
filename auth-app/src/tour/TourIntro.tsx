import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../components/focusTrap";
import { LOGO_PATH } from "../logo";

/**
 * The first thing a new person sees: three slides, one picture and one idea each. What the agent does, who
 * decides, and where everything lives. Skippable at any point, Esc skips, the arrow keys move.
 *
 * The pictures are small inline drawings in the brand orange and the console's own neutrals (tokens, so they
 * follow light and dark), 360 wide so they read the same on a phone as on a desktop.
 */

/* ── the drawing kit: 24px glyphs, drawn as strokes ── */
const GLYPH: Record<string, ReactNode> = {
  brief: (<><path d="M7 3.5h7.5L18 7v13.5H7z" /><path d="M10 11.5h5M10 15h5M10 18h3" /></>),
  people: (<><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" /><circle cx="17.5" cy="9.5" r="2.2" /><path d="M16.6 14c2.3 0 4 1.5 4 4.5" /></>),
  rank: (<path d="M6 20v-6M12 20V6M18 20v-9" />),
  mail: (<><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4.5 8l7.5 5.5L19.5 8" /></>),
  check: (<path d="M5.5 12.5l4.2 4.2L18.5 8" />),
  folder: (<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />),
  person: (<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></>),
  phone: (<path d="M6 4h3.5l1.7 4.3-2.2 1.4a10 10 0 0 0 5.8 5.8l1.4-2.2L20 15v3.5a1.8 1.8 0 0 1-2 1.8A15.5 15.5 0 0 1 3.7 6 1.8 1.8 0 0 1 6 4z" />),
  chart: (<><path d="M4 20h16" /><path d="M7 16v-4M12 16V7M17 16v-6" /></>),
  form: (<><path d="M6.5 3.5h11v17h-11z" /><path d="M9.5 8h5M9.5 11.5h5" /><path d="M9.5 16l1.5 1.5 3-3" /></>),
};

function Glyph({ name, x, y, size = 22 }: { name: keyof typeof GLYPH; x: number; y: number; size?: number }): JSX.Element {
  return (
    <g className="trd-glyph" transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
      {GLYPH[name]}
    </g>
  );
}

function Mark({ x, y, size }: { x: number; y: number; size: number }): JSX.Element {
  const s = size / 34;
  return (
    <path className="trd-mark" d={LOGO_PATH} transform={`translate(${x - (34 * s) / 2} ${y - (35 * s) / 2}) scale(${s})`} />
  );
}

/** Brief, finds people, ranks, reaches out, you hire: one line, left to right, with something travelling along it. */
function FlowDiagram(): JSX.Element {
  const nodes: { x: number; glyph: keyof typeof GLYPH; label: string[] }[] = [
    { x: 36, glyph: "brief", label: ["Your", "brief"] },
    { x: 108, glyph: "people", label: ["Finds", "people"] },
    { x: 180, glyph: "rank", label: ["Matches", "and ranks"] },
    { x: 252, glyph: "mail", label: ["Reaches", "out"] },
    { x: 324, glyph: "check", label: ["You", "hire"] },
  ];
  return (
    <svg className="trd" viewBox="0 0 360 132" role="img" aria-label="Your brief, then the agent finds people, matches and ranks them and reaches out, and you hire.">
      {nodes.slice(0, -1).map((n, i) => (
        <g key={`c${i}`} className="trd-line" style={{ ["--i" as string]: i }}>
          <path d={`M${n.x + 28} 40H${n.x + 44}`} />
          <path d={`M${n.x + 40} 35l5 5-5 5`} />
        </g>
      ))}
      <circle className="trd-pulse" cx="36" cy="40" r="3.5" />
      {nodes.map((n, i) => (
        <g key={n.label.join("")} className="trd-pop" style={{ ["--i" as string]: i }}>
          <circle className={`trd-node${i === nodes.length - 1 ? " is-hire" : ""}`} cx={n.x} cy="40" r="25" />
          <g className={i === nodes.length - 1 ? "trd-on-fill" : undefined}>
            <Glyph name={n.glyph} x={n.x} y={40} />
          </g>
          {n.label.map((l, k) => (
            <text key={l} className="trd-label" x={n.x} y={88 + k * 16} textAnchor="middle">{l}</text>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The agent proposes, a card asks for a yes, and there are two ways to answer it. */
function ControlDiagram(): JSX.Element {
  return (
    <svg className="trd" viewBox="0 0 360 160" role="img" aria-label="The agent proposes an action and a card asks you to approve it or not now.">
      <g className="trd-pop" style={{ ["--i" as string]: 0 }}>
        <circle className="trd-node" cx="48" cy="76" r="27" />
        <Mark x={48} y={76} size={20} />
        <text className="trd-label" x="48" y="124" textAnchor="middle">Agent</text>
      </g>
      <g className="trd-line" style={{ ["--i" as string]: 1 }}>
        <path d="M82 76H108" />
        <path d="M103 71l5 5-5 5" />
      </g>
      <g className="trd-pop" style={{ ["--i" as string]: 2 }}>
        <rect className="trd-card" x="118" y="14" width="226" height="132" rx="16" />
        <text className="trd-cap" x="136" y="40">Agent proposes</text>
        <text className="trd-strong" x="136" y="64">Email 12 candidates</text>
        <text className="trd-sub" x="136" y="84">Senior Backend Engineer</text>
        <rect className="trd-yes" x="136" y="100" width="94" height="32" rx="16" />
        <text className="trd-yes-t" x="183" y="121" textAnchor="middle">Approve</text>
        <rect className="trd-no" x="240" y="100" width="88" height="32" rx="16" />
        <text className="trd-no-t" x="284" y="121" textAnchor="middle">Not now</text>
      </g>
    </svg>
  );
}

/** The agent in the middle, and the five places around it. */
function HubDiagram(): JSX.Element {
  const spots: { x: number; y: number; glyph: keyof typeof GLYPH; label: string; side: "start" | "end" }[] = [
    { x: 180, y: 36, glyph: "folder", label: "Campaigns", side: "start" },
    { x: 254, y: 90, glyph: "person", label: "Candidates", side: "start" },
    { x: 226, y: 177, glyph: "phone", label: "Calls", side: "start" },
    { x: 134, y: 177, glyph: "chart", label: "Analytics", side: "end" },
    { x: 106, y: 90, glyph: "form", label: "Forms", side: "end" },
  ];
  return (
    <svg className="trd" viewBox="0 0 360 212" role="img" aria-label="The agent at the centre, with campaigns, candidates, calls, analytics and forms around it.">
      {spots.map((s, i) => (
        <path key={`s${i}`} className="trd-spoke" d={`M180 114L${s.x} ${s.y}`} style={{ ["--i" as string]: i }} />
      ))}
      <g className="trd-pop" style={{ ["--i" as string]: 0 }}>
        <circle className="trd-node is-hub" cx="180" cy="114" r="34" />
        <Mark x={180} y={114} size={28} />
      </g>
      {spots.map((s, i) => (
        <g key={s.label} className="trd-pop" style={{ ["--i" as string]: i + 1 }}>
          <circle className="trd-node" cx={s.x} cy={s.y} r="20" />
          <Glyph name={s.glyph} x={s.x} y={s.y} size={20} />
          <text className="trd-label" x={s.side === "start" ? s.x + 28 : s.x - 28} y={s.y + 4} textAnchor={s.side}>{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

type Slide = { id: string; title: string; lines: string[]; picture: () => JSX.Element };

export const SLIDES: readonly Slide[] = [
  { id: "meet", title: "Meet your hiring agent", lines: ["Tell it who you need. It finds people, ranks them and reaches out.", "You hear back about the ones worth your time."], picture: FlowDiagram },
  { id: "control", title: "You stay in control", lines: ["The agent proposes, and a card asks for your OK.", "Nothing leaves without a yes."], picture: ControlDiagram },
  { id: "place", title: "Everything in one place", lines: ["Campaigns, candidates, calls, analytics and forms.", "All around your agent, with nothing to stitch together."], picture: HubDiagram },
];

export function TourIntro({ onGuide, onSkip }: { onGuide: () => void; onSkip: () => void }): JSX.Element {
  const [at, setAt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const last = at === SLIDES.length - 1;
  const slide = SLIDES[at]!;
  const Picture = slide.picture;
  useFocusTrap(root, true, { focusFirst: false });

  const next = () => (last ? onGuide() : setAt((i) => i + 1));
  const back = () => setAt((i) => Math.max(0, i - 1));
  const keys = useRef({ next, back, onSkip });
  keys.current = { next, back, onSkip };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        keys.current.onSkip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        keys.current.next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        keys.current.back();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return createPortal(
    <div className="tr-scrim" onMouseDown={(e) => e.target === e.currentTarget && onSkip()}>
      <div ref={root} className="tri" role="dialog" aria-modal="true" aria-labelledby="tri-title" tabIndex={-1}>
        <div className="tri-pic" key={slide.id} aria-hidden={false}>
          <Picture />
        </div>
        <div className="tri-text" key={`${slide.id}-t`} aria-live="polite">
          <h2 id="tri-title" className="tri-title t-title">{slide.title}</h2>
          {slide.lines.map((l) => (
            <p key={l} className="tri-line t-body">{l}</p>
          ))}
        </div>
        <div className="tri-foot">
          <button type="button" className="tr-text" onClick={onSkip}>Skip</button>
          <ol className="tri-dots" aria-label={`Slide ${at + 1} of ${SLIDES.length}`}>
            {SLIDES.map((s, i) => (
              <li key={s.id} className={i === at ? "is-on" : undefined} aria-current={i === at ? "step" : undefined} />
            ))}
          </ol>
          <span className="tri-acts">
            {at > 0 && <button type="button" className="ncx-btn" onClick={back}>Back</button>}
            <button type="button" className="ncx-btn is-primary" onClick={next} autoFocus>{last ? "Show me around" : "Next"}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
