import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * Offset pagination for a server-paged table.
 *
 * ── WHY OFFSET AND NOT A CURSOR ─────────────────────────────────────────────
 * The SQL orders by `started_at desc` behind `calls_user_idx (user_id,
 * started_at desc)` and returns an exact total. A recruiter's own call log is
 * thousands of rows, not millions, so deep-offset cost never bites, and a page
 * number is what the control needs to show. The real cost is drift: a row
 * inserted while someone is on page 3 shifts everything down one, so a row can
 * be seen twice or missed. Keyset on (started_at, id) is the fix when that
 * starts to matter; it is not free, because it cannot offer page numbers.
 *
 * ── ANNOUNCING THE CHANGE ───────────────────────────────────────────────────
 * A paged table updates in place, so a screen reader gets no navigation event
 * and nothing is spoken. The range line is therefore a live region: it changes
 * on every page and reads out "Showing 26 to 50 of 1,240". Focus deliberately
 * stays on the button that was pressed, so paging repeatedly does not move the
 * user somewhere else on every click.
 */

type Props = {
  /** Zero-based index of the first row on the page. */
  offset: number;
  limit: number;
  /** Exact unpaged count, from the same snapshot as the rows. */
  total: number;
  onChange: (offset: number) => void;
  /** Plural noun for the range line, e.g. "calls". */
  unit: string;
  busy?: boolean;
};

export function Pager({ offset, limit, total, onChange, unit, busy = false }: Props) {
  if (total === 0) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(Math.ceil(total / limit), 1);
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  const atStart = offset <= 0;
  const atEnd = to >= total;

  /* A single page still shows the count, because "how many are there" is the
     question the line answers; it just drops the controls that would do
     nothing. */
  const single = pages <= 1;

  return (
    <div className="pager">
      <p className="pager-range" role="status" aria-live="polite">
        Showing {fmt(from)} to {fmt(to)} of {fmt(total)} {unit}
      </p>

      {!single && (
        <nav className="pager-nav" aria-label="Pagination">
          <button
            type="button"
            className="pager-btn"
            onClick={() => onChange(Math.max(offset - limit, 0))}
            disabled={atStart || busy}
            aria-label="Previous page"
          >
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
          </button>

          {/* Page x of y as text rather than a numbered strip: a strip of page
              buttons is a lot of tab stops for a log nobody navigates by page
              number, and it has to invent an ellipsis rule at 50 pages. */}
          <span className="pager-count">
            Page {fmt(page)} of {fmt(pages)}
          </span>

          <button
            type="button"
            className="pager-btn"
            onClick={() => onChange(offset + limit)}
            disabled={atEnd || busy}
            aria-label="Next page"
          >
            <CaretRight size={14} weight="bold" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}
