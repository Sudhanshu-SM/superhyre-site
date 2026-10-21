import type { CSSProperties, ReactNode } from "react";
import { SlowNote } from "./SlowNote";
import { useSlowWhile } from "../slowState";
import "./shimmer.css";

/**
 * The one way a part of a page says it is still loading: a muted tile with a soft light sweeping across it, in the
 * shape of what is coming, so the room is already the right size when the data lands. The Loader (mark and ring)
 * is for a whole screen: boot, sign-in, a route. Anything smaller than that, a list, a table, a panel, a tile, a
 * sheet or a modal body, shimmers instead.
 *
 * Every composed skeleton takes a `label`. With one it is a status the screen reader announces (the same words the
 * Loader had), busy, and its tiles are hidden from assistive tech; without one it is plain shapes, for nesting inside
 * a skeleton that already has a label. Reduced motion holds the sweep still and lets the tiles breathe instead.
 */

type Len = number | string;
const px = (n: Len | undefined): string | undefined => (n === undefined ? undefined : typeof n === "number" ? `${n}px` : n);
const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(" ");

/** One tile. Size and corner by prop or by class; `circle` is for an avatar, `ring` a donut (the number is its thickness). */
export function Shimmer({ w, h, r, lh, circle = false, ring, className, style }: {
  w?: Len;
  h?: Len;
  r?: Len;
  /** The line height of the text this stands for (px): the tile is centred in a line that tall, so a stack of them is as tall as the real lines. */
  lh?: number;
  circle?: boolean;
  ring?: boolean | number;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const round = circle || !!ring;
  const margin = lh !== undefined ? Math.max(0, (lh - (typeof h === "number" ? h : 12)) / 2) : undefined;
  const vars = { "--shm-w": px(w), "--shm-h": px(h), "--shm-r": round ? "50%" : px(r), ...(margin ? { "--shm-m": `${margin}px` } : {}), ...(typeof ring === "number" ? { "--shm-ring": `${ring}px` } : {}), ...style } as CSSProperties;
  return <span className={cx("shm", round && "is-circle", !!ring && "is-ring", className)} style={vars} aria-hidden="true" />;
}

/** Lines of text, the last one shorter. */
export function ShimmerText({ lines = 3, last = "62%", h = 12, gap = 8, w, className }: {
  lines?: number;
  last?: Len;
  h?: Len;
  gap?: Len;
  w?: Len;
  className?: string;
}): JSX.Element {
  return (
    <span className={cx("shm-text", className)} style={{ "--shm-gap": px(gap), ...(w !== undefined ? { width: px(w) } : {}) } as CSSProperties} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Shimmer key={i} h={h} r={Math.min(6, Number(h) / 2 || 6)} w={i === lines - 1 && lines > 1 ? last : undefined} />
      ))}
    </span>
  );
}

/** The status wrapper: busy, announced, with the words the screen reader hears. */
export function ShimmerRegion({ label, className, style, children, as: Tag = "div" }: {
  label: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  as?: "div" | "section" | "ul" | "ol";
}): JSX.Element {
  /* A part of a page never loads for ever: past the first limit it says it is slow, past the second that it did not
     arrive and how to ask again. (Requests give up on their own at 30 s; this is for a wait that has no request.) */
  const slow = useSlowWhile(true, { soft: 12_000, hard: 60_000 });
  const Note = Tag === "ul" || Tag === "ol" ? "li" : "div";
  return (
    <Tag className={cx("shm-region", className)} style={style} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
      {slow !== "ok" && (
        <Note className="shm-slow">
          <SlowNote level={slow} soft="Taking longer than usual." stuck="This didn't load in time. Nothing was changed." onRetry={() => window.location.reload()} />
        </Note>
      )}
    </Tag>
  );
}

/** Wraps in a status when there is a label; otherwise hands the shapes back bare. */
function Maybe({ label, className, style, children }: { label?: string | undefined; className?: string; style?: CSSProperties; children: ReactNode }): JSX.Element {
  return label
    ? <ShimmerRegion label={label} {...(className ? { className } : {})} {...(style ? { style } : {})}>{children}</ShimmerRegion>
    : <div className={className} {...(style ? { style } : {})}>{children}</div>;
}

/** A list of rows: a round lead, two lines of text, something short at the end. Row height is the real row's. */
export function ShimmerRows({ n = 5, label, lead = 36, h = 60, gap = 0, trail = true, divided = true, pad, className }: {
  n?: number;
  label?: string | undefined;
  /** Size of the round lead; `false` for none. */
  lead?: number | false;
  /** Height of one row, which is the real row's, so nothing moves when the data arrives. */
  h?: number;
  gap?: number;
  trail?: boolean;
  divided?: boolean;
  /** Padding round the list, where the real list has some (CSS shorthand). */
  pad?: string;
  className?: string;
}): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-rows", divided && "is-divided", className)} style={{ "--shm-row-h": `${h}px`, "--shm-row-gap": `${gap}px`, ...(pad ? { "--shm-pad": pad } : {}) } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <span className="shm-row" key={i} aria-hidden="true">
          {lead !== false && <Shimmer circle w={lead} h={lead} />}
          <span className="shm-row-main">
            <Shimmer h={13} w={`${54 + ((i * 17) % 26)}%`} />
            <Shimmer h={11} w={`${34 + ((i * 11) % 24)}%`} />
          </span>
          {trail && <Shimmer h={13} w={64} />}
        </span>
      ))}
    </Maybe>
  );
}

/** A grid of cards: a title line, a few lines of text, and (optionally) a block. */
export function ShimmerCards({ n = 3, label, cols = 3, h = 148, lines = 2, block = false, gap = 14, className }: {
  n?: number;
  label?: string | undefined;
  cols?: number;
  h?: number;
  lines?: number;
  block?: boolean;
  gap?: number;
  className?: string;
}): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-cards", className)} style={{ "--shm-cols": cols, "--shm-card-h": `${h}px`, "--shm-gap": `${gap}px` } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <span className="shm-card" key={i} aria-hidden="true">
          <Shimmer h={15} w={`${46 + ((i * 13) % 28)}%`} />
          <ShimmerText lines={lines} h={11} gap={7} />
          {block && <Shimmer h="100%" r={10} className="shm-card-fill" />}
        </span>
      ))}
    </Maybe>
  );
}

/** One cell of a ghost row, for a page whose table has its own header and column classes. */
export type ShimCell = {
  /** The real cell's class: it carries the column's width, padding and height, so the tile sits where the data will. */
  cls?: string;
  /** Width of the main line (a number is px, a string any length); varied a little from row to row. */
  w?: Len;
  /** A leading tile of this size (round when `round`), as in a person's or a company's cell. */
  lead?: number;
  round?: boolean;
  /** A second, shorter line under the main one. */
  sub?: Len;
  /** A box instead of a line: this wide and this tall (a chip, a checkbox, a small count). */
  box?: [Len, Len];
  /** Hold the width as given, no variation (a fixed-size tile). */
  fixed?: boolean;
  /** Nothing in this cell (an empty column, an action slot). */
  empty?: boolean;
};

const vary = (w: Len, r: number, c: number): string => `calc(${px(w)} * ${(0.78 + (((r * 7 + c * 3) % 6) * 0.045)).toFixed(3)})`;

/**
 * Rows for the inside of a real `<tbody>`: the table keeps its own header and its fixed column widths, so the tiles
 * sit exactly under the headers. With `cells` each column says what its tile is, and carries the real cell's class, so
 * the row is the real row's height and padding without a number copied here. Without it, `cols` columns of lines (and
 * "lead" for a person's round avatar and two lines) at the height `h`.
 */
export function ShimmerTableRows({ rows = 6, cols = 5, h, lead = true, check = false, label, cells }: {
  rows?: number;
  cols?: number;
  /** Row height; with `cells` only when the real rows are not already that height. */
  h?: number;
  /** The first cell is a person: a round lead, a name and a line under it. */
  lead?: boolean;
  /** An empty narrow first cell, for the checkbox column. */
  check?: boolean;
  /** Announced from the first row. */
  label?: string;
  cells?: readonly ShimCell[];
}): JSX.Element {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => {
        const say = label && r === 0;
        const trProps = say ? { role: "status", "aria-busy": true } : { "aria-hidden": true };
        if (cells) {
          return (
            <tr className="shm-tr is-real" key={r} {...(h ? { style: { height: h } } : {})} {...trProps}>
              {cells.map((cell, c) => (
                <td className={cell.cls} key={c}>
                  {say && c === 0 && <span className="sr-only">{label}</span>}
                  {cell.empty ? null : cell.box ? (
                    <Shimmer w={cell.box[0]} h={cell.box[1]} r={cell.box[1] === cell.box[0] && cell.round ? "50%" : 6} />
                  ) : cell.lead || cell.sub !== undefined ? (
                    <span className="shm-td-who">
                      {cell.lead ? <Shimmer w={cell.lead} h={cell.lead} {...(cell.round ? { circle: true } : { r: Math.round(cell.lead * 0.26) })} /> : null}
                      <span>
                        <Shimmer h={13} w={cell.fixed ? cell.w ?? "70%" : vary(cell.w ?? "70%", r, c)} />
                        {cell.sub !== undefined && <Shimmer h={11} w={cell.fixed ? cell.sub : vary(cell.sub, r, c + 1)} />}
                      </span>
                    </span>
                  ) : (
                    <Shimmer h={12} w={cell.fixed ? cell.w ?? "60%" : vary(cell.w ?? "60%", r, c)} />
                  )}
                </td>
              ))}
            </tr>
          );
        }
        return (
          <tr className="shm-tr" key={r} style={{ height: h ?? 62 }} {...trProps}>
            {check && <td className="shm-td">{say && <span className="sr-only">{label}</span>}<Shimmer w={16} h={16} r={5} /></td>}
            {Array.from({ length: cols }, (_, c) => (
              <td className="shm-td" key={c}>
                {say && c === 0 && !check && <span className="sr-only">{label}</span>}
                {c === 0 && lead ? (
                  <span className="shm-td-who">
                    <Shimmer circle w={34} h={34} />
                    <span><Shimmer h={13} w={`${60 + ((r * 13) % 28)}%`} /><Shimmer h={11} w={`${36 + ((r * 7) % 24)}%`} /></span>
                  </span>
                ) : (
                  <Shimmer h={12} w={`${42 + (((r + c) * 19) % 46)}%`} />
                )}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

/** A stand-alone table: a header row of short tiles, then rows. For places that have no table of their own yet. */
export function ShimmerTable({ rows = 5, cols = 4, label, h = 52, className }: {
  rows?: number;
  cols?: number;
  label?: string | undefined;
  h?: number;
  className?: string;
}): JSX.Element {
  const table = (
    <table className="shm-table" aria-hidden="true">
      <thead>
        <tr>{Array.from({ length: cols }, (_, c) => <th key={c}><Shimmer h={10} w={c === 0 ? "46%" : "34%"} /></th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r} style={{ height: h }}>
            {Array.from({ length: cols }, (_, c) => <td key={c}><Shimmer h={12} w={`${40 + (((r + c) * 23) % 48)}%`} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return <Maybe label={label} className={cx("shm-table-wrap", className)}>{table}</Maybe>;
}

/** Tiles that each hold a ring or a donut with a figure beside it: Home's campaigns, a row of stage counts. */
export function ShimmerGrid({ n = 4, label, cols = 2, donut = true, h = 76, className }: {
  n?: number;
  label?: string | undefined;
  cols?: number;
  donut?: boolean;
  h?: number;
  className?: string;
}): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-grid", className)} style={{ "--shm-cols": cols, "--shm-tile-h": `${h}px` } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <span className="shm-tile" key={i} aria-hidden="true">
          {donut && <Shimmer circle w={44} h={44} />}
          <span className="shm-tile-main">
            <Shimmer h={13} w={`${52 + ((i * 15) % 30)}%`} />
            <Shimmer h={11} w={`${30 + ((i * 9) % 22)}%`} />
          </span>
        </span>
      ))}
    </Maybe>
  );
}

/** Bars of different heights on a baseline: the funnel, a day-by-day count. */
export function ShimmerChart({ bars = 7, label, h = 180, className }: {
  bars?: number;
  label?: string | undefined;
  h?: number;
  className?: string;
}): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-chart", className)} style={{ "--shm-chart-h": `${h}px` } as CSSProperties}>
      <span className="shm-bars" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => (
          <Shimmer key={i} className="shm-bar" h={`${34 + ((i * 29 + 11) % 58)}%`} r="8px 8px 4px 4px" />
        ))}
      </span>
    </Maybe>
  );
}

/** The body of a sheet or a modal: a heading line, a few lines of text, a block, more text. */
export function ShimmerPanel({ label, title = true, lines = 3, block = 110, more = 2, className }: {
  label?: string | undefined;
  title?: boolean;
  lines?: number;
  /** Height of the block in the middle; 0 for none. */
  block?: number;
  more?: number;
  className?: string;
}): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-panel", className)}>
      <span className="shm-panel-in" aria-hidden="true">
        {title && <Shimmer h={18} w="38%" />}
        <ShimmerText lines={lines} />
        {block > 0 && <Shimmer h={block} r={12} />}
        {more > 0 && <ShimmerText lines={more} last="48%" />}
      </span>
    </Maybe>
  );
}

/** A whole page's worth: a title and a line under it, then whatever the page is made of. */
export function ShimmerPage({ label, children, className }: { label: string; children?: ReactNode; className?: string }): JSX.Element {
  return (
    <ShimmerRegion label={label} className={cx("shm-page", className)}>
      <span className="shm-page-head" aria-hidden="true">
        <Shimmer h={28} w="min(280px, 52%)" r={8} />
        <Shimmer h={13} w="min(420px, 72%)" />
      </span>
      {children ?? <ShimmerRows n={6} />}
    </ShimmerRegion>
  );
}

/** A dashboard's body: a row of figures, a chart, a table. For the analytics pages and the campaign overview. */
export function ShimmerBoard({ label, kpis = 3, className }: { label?: string | undefined; kpis?: number; className?: string }): JSX.Element {
  return (
    <Maybe label={label} className={cx("shm-board", className)}>
      <ShimmerCards n={kpis} cols={kpis} h={88} lines={1} />
      <span className="shm-board-card" aria-hidden="true"><ShimmerChart bars={10} h={170} /></span>
      <ShimmerTable rows={4} cols={4} />
    </Maybe>
  );
}
