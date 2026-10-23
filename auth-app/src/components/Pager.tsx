import { useState } from "react";
import type { FormEvent } from "react";
import { CaretDoubleLeft, CaretDoubleRight, CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * The one pager, drawn twice on a paged list: in the list's toolbar (`bar`, on the right beside the filters; the
 * toolbar is sticky, so the way to the next page is where the hand already is) and under the list (`foot`, with the
 * whole "Showing 11-20 of 54" line), so a long page never has to be scrolled back up to turn.
 *
 * It says where you are, steps (labelled Previous and Next, with their icons), jumps (first, last, and numbered pages
 * with an ellipsis once there are more than fit) and, past seven pages, takes a page number to go to. Every control is
 * a real button or field, 36px or more, with a visible focus ring; the current page is filled. Where the total is not
 * known (a list read by cursor) it says "21-40", offers the pages already seen and the one after, and never invents a
 * last page (so no jump to the last, and no page to type).
 *
 * Announcing the change: a paged list updates in place, so the toolbar's range is a polite live region (the bottom one
 * is not, or it would be read twice) and focus stays on the button that was pressed. Changing page brings the top of
 * the list into view, smoothly, when it had been scrolled past (a list marks itself with `data-pager-list`, or says
 * which one with `target`). Gone only when everything fits one page: the toolbar's keeps the count.
 */

type Props = {
  /** Zero-based index of the first row on the page. */
  offset: number;
  limit: number;
  /** The whole list, or null when it is read by cursor and not known. */
  total: number | null;
  /** With no total: whether a page follows this one. */
  more?: boolean;
  /** With no total: how many rows this page holds, so the range ends where they do. */
  count?: number;
  /** Called with the offset of the page asked for. */
  onChange: (offset: number) => void;
  /** Plural noun for the labels, e.g. "campaigns". */
  unit: string;
  /** The list to bring into view after a change; the page's `[data-pager-list]` by default. */
  target?: string;
  /** Shown in the range while a page is being read. */
  busy?: boolean;
  className?: string;
  /** `bar`: in the sticky toolbar. `foot`: under the list, with its range written out; nothing when there is one page. */
  variant?: "bar" | "foot";
  /** A page size the person can change (25, 50, 100, and 500 or 1,000 once the list is that long); Auto fits the window. */
  sizes?: { choices: readonly number[]; value: "auto" | number; onChoose: (c: "auto" | number) => void };
};

export type PageItem = number | "gap-start" | "gap-end";

/** Pages are 1-based. The first, the last and the two beside the current one; a gap of one page shows that page. */
export function pageItems(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { keep.add(2); keep.add(3); keep.add(4); }
  if (page >= pages - 2) { keep.add(pages - 1); keep.add(pages - 2); keep.add(pages - 3); }
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: PageItem[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev !== undefined && n - prev > 1) out.push(n - prev === 2 ? prev + 1 : i <= 1 ? "gap-start" : "gap-end");
    out.push(n);
  });
  return out;
}

const fmt = (n: number): string => n.toLocaleString("en-IN");

/** Brings the top of the list into view, smoothly: a list with a scroller of its own goes back to its top, and a page scrolled past the list's head is scrolled back up to it. */
export function scrollListTop(target = "[data-pager-list]"): void {
  if (typeof document === "undefined") return;
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return;
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = calm ? "auto" : "smooth";
    if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior });
    if (el.getBoundingClientRect().top < 72) el.scrollIntoView({ block: "start", behavior });
  });
}

/** More pages than this and the pager takes a page number to go to. */
const GOTO_AFTER = 7;

export function Pager({ offset, limit, total, more = false, count, onChange, unit, target, busy = false, className, variant = "bar", sizes }: Props) {
  const [typed, setTyped] = useState("");
  const page = Math.floor(offset / limit) + 1;
  const pages = total === null ? page + (more ? 1 : 0) : Math.max(Math.ceil(total / limit), 1);
  if (total === 0 || (total === null && pages <= 1 && page <= 1)) return null;
  const foot = variant === "foot";
  if (foot && pages <= 1) return null;

  const from = offset + 1;
  const to = total === null ? offset + (count ?? limit) : Math.min(offset + limit, total);
  const atStart = page <= 1;
  const atEnd = page >= pages;
  const go = (p: number) => {
    const next = Math.min(Math.max(p, 1), pages);
    if (next === page) return;
    onChange((next - 1) * limit);
    scrollListTop(target);
  };
  const name = unit.charAt(0).toUpperCase() + unit.slice(1);

  /* A single page still says how many there are, because "how many" is what the range answers; it drops the
     controls that would do nothing. */
  const single = pages <= 1;
  const known = total !== null;
  const jump = (e: FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(typed));
    if (!Number.isFinite(n) || n < 1) return;
    go(n);
    setTyped("");
  };

  return (
    <div className={`pager pager-${variant}${className ? ` ${className}` : ""}`} aria-busy={busy || undefined}>
      <p className="pager-range" {...(foot ? {} : { role: "status", "aria-live": "polite" as const })}>
        <span className={foot ? undefined : "sr-only"}>Showing </span>
        {fmt(from)}–{fmt(to)}{known && <> of {fmt(total)}</>}
        <span className="sr-only"> {unit}</span>
      </p>

      {sizes && sizes.choices.length > 0 && !foot && (
        <label className="pager-size">
          <span className="pager-size-l">Per page</span>
          <select
            value={String(sizes.value)}
            onChange={(e) => { sizes.onChoose(e.target.value === "auto" ? "auto" : Number(e.target.value)); onChange(0); }}
            aria-label={`${name} per page`}
          >
            <option value="auto">Auto</option>
            {sizes.choices.map((n) => <option key={n} value={n}>{n.toLocaleString("en-IN")}</option>)}
          </select>
        </label>
      )}

      {!single && (
        <nav className="pager-nav" aria-label={foot ? `${name}, pages, bottom of the list` : `${name}, pages`}>
          {known && pages > 2 && (
            <button type="button" className="pager-btn pager-end" onClick={() => go(1)} disabled={atStart} aria-label="First page" title="First page">
              <CaretDoubleLeft size={14} weight="bold" aria-hidden="true" />
            </button>
          )}
          <button type="button" className="pager-btn pager-step" onClick={() => go(page - 1)} disabled={atStart} aria-label="Previous page">
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
            <span className="pager-w">Previous</span>
          </button>

          <ol className="pager-pages">
            {pageItems(page, pages).map((it, i, all) => {
              if (typeof it !== "number") {
                /* An ellipsis is a button too: it jumps to the page half-way across what it hides. */
                const before = all[i - 1];
                const after = all[i + 1];
                const lo = (typeof before === "number" ? before : page) + 1;
                const hi = (typeof after === "number" ? after : pages) - 1;
                const mid = Math.round((lo + hi) / 2);
                return (
                  <li key={it}>
                    <button type="button" className="pager-pg pager-gap" aria-label={`Pages ${fmt(lo)} to ${fmt(hi)}, go to page ${fmt(mid)}`} title={`Go to page ${fmt(mid)}`} onClick={() => go(mid)}>…</button>
                  </li>
                );
              }
              return (
                <li key={it}>
                  <button
                    type="button"
                    className={`pager-pg${it === page ? " is-on" : ""}`}
                    aria-label={`Page ${it}`}
                    aria-current={it === page ? "page" : undefined}
                    onClick={() => go(it)}
                  >
                    {fmt(it)}
                  </button>
                </li>
              );
            })}
          </ol>
          {/* Where there is no room for the strip, the page says where it is instead. */}
          <span className="pager-count" aria-hidden="true">{known ? `Page ${fmt(page)} of ${fmt(pages)}` : `Page ${fmt(page)}`}</span>

          <button type="button" className="pager-btn pager-step" onClick={() => go(page + 1)} disabled={atEnd} aria-label="Next page">
            <span className="pager-w">Next</span>
            <CaretRight size={14} weight="bold" aria-hidden="true" />
          </button>
          {known && pages > 2 && (
            <button type="button" className="pager-btn pager-end" onClick={() => go(pages)} disabled={atEnd} aria-label="Last page" title="Last page">
              <CaretDoubleRight size={14} weight="bold" aria-hidden="true" />
            </button>
          )}

          {known && pages > GOTO_AFTER && (
            <form className="pager-goto" onSubmit={jump}>
              <label>
                <span className={foot ? "pager-goto-l" : "pager-goto-l sr-only"}>Go to page</span>
                <input
                  className="pager-goto-in"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pages}
                  value={typed}
                  placeholder={foot ? String(page) : "Page"}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-label={`Go to page, 1 to ${fmt(pages)}`}
                />
              </label>
              <button type="submit" className="pager-go" disabled={!typed}>Go</button>
            </form>
          )}
        </nav>
      )}
    </div>
  );
}
