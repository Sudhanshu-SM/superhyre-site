import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "./components/focusTrap";
import { download, toCSV } from "./exportTable";
import { GhostChart, type GhostAction, type GhostKind } from "./GhostChart";
import { useSlide } from "./switchMotion";
import { Dialog } from "./ui";
import type { Table } from "./xlsx";

/**
 * The few parts the five Analytics pages are made of: three figures in one card, a card with a title, a plain
 * table that sorts, the window of a full list, a drawer for one person, and "Details" for everything that is not
 * the first answer. No icons, no chips, no colour but the one orange mark a page may have.
 */

/* ── three figures ── */

export type Kpi = { id: string; label: string; value: string; note?: string | null };

/** The figures of a page in one card, side by side, with an optional quiet action (Details) at the right. */
export function Kpis({ items, action }: { items: readonly Kpi[]; action?: React.ReactNode }): JSX.Element {
  return (
    <section className="an-kpis" aria-label="Figures">
      <dl>
        {items.map((k) => (
          <div key={k.id}>
            <dt>{k.label}</dt>
            <dd>{k.value}</dd>
            <dd className="an-muted">{k.note ?? ""}</dd>
          </div>
        ))}
      </dl>
      {action && <div className="an-kpis-a">{action}</div>}
    </section>
  );
}

/* ── a card ── */

export type GhostSpec = { kind: GhostKind; line: string; action?: GhostAction | null; compact?: boolean };

/** A card: a title, one muted line under it if needed, a place for quiet actions, the content. With `ghost`, the soft picture of what will be there. */
export function Panel({ area, title, sub, action, ghost, foot, children, className = "" }: {
  area: string;
  title: string;
  sub?: string | null;
  action?: React.ReactNode;
  ghost?: GhostSpec | null;
  foot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}): JSX.Element {
  if (ghost) {
    return (
      <section className={`an-card is-ghost ${className}`} style={{ gridArea: area }}>
        <h2 className="an-sr">{title}</h2>
        <GhostChart kind={ghost.kind} title={title} line={ghost.line} action={ghost.action ?? null} compact={ghost.compact ?? false} />
      </section>
    );
  }
  return (
    <section className={`an-card ${className}`} style={{ gridArea: area }}>
      <header className="an-card-h">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action && <div className="an-card-act">{action}</div>}
      </header>
      <div className="an-card-b">{children}</div>
      {foot && <p className="an-card-f">{foot}</p>}
    </section>
  );
}

/* ── small things ── */

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  /** `count` is written after the name, muted; leave it out where a count would be zero. */
  options: ReadonlyArray<{ id: T; name: string; count?: number | null }>;
  onChange: (v: T) => void;
}): JSX.Element {
  // The fill of the pressed button is a mark that slides to the next one (switchMotion.tsx).
  const slide = useSlide<HTMLDivElement>('[aria-pressed="true"]');
  return (
    <div className="an-seg sw-host" role="group" aria-label={label} {...slide.host}>
      {slide.mark}
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.name}
          {o.count ? <span className="an-seg-n">{o.count.toLocaleString("en-IN")}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The download of a card with a table, built in the browser from the rows on the page. */
export function Export({ table, file }: { table: Table | undefined; file: string }): JSX.Element | null {
  if (!table || table.rows.length === 0) return null;
  return (
    <button type="button" className="an-link" aria-label="Download CSV" onClick={() => download(toCSV(table), "text/csv;charset=utf-8", file)}>
      CSV
    </button>
  );
}

/** "View all 12": opens the full list in a window. Only there when there is more than the card shows. */
export function ViewAll({ count, shown, onOpen }: { count: number; shown: number; onOpen: () => void }): JSX.Element | null {
  if (count <= shown) return null;
  return (
    <button type="button" className="an-link" onClick={onOpen}>
      View all {count}
    </button>
  );
}

/** A name or a label that is cut with an ellipsis when it is long, and whole in the tooltip. */
export function Cut({ text, className = "" }: { text: string; className?: string }): JSX.Element {
  return <span className={`an-cut ${className}`} title={text}>{text}</span>;
}

/** A thin bar for one row of a table: the share of a plan that is done, never above full. */
export function Thin({ share }: { share: number }): JSX.Element {
  const w = Math.min(100, Math.max(0, share * 100));
  return <span className="an-thin" aria-hidden="true">{w > 0 && <i style={{ width: `${Math.max(4, w)}%` }} />}</span>;
}

/* ── a table that sorts ── */

export type ModalCol<T> = {
  id: string;
  label: string;
  cell: (r: T) => React.ReactNode;
  /** What a sort and the search read; a number sorts as a number. */
  sort: (r: T) => string | number;
  right?: boolean;
  /** What the foot row says under this column (a total), when the table has one. */
  total?: React.ReactNode;
};

export type SortState = { col: string; dir: "asc" | "desc" } | null;

/** The rows for what was typed and how it is sorted: a search reads `searchOf`, a sort reads the column. */
export function shapeRows<T>(
  rows: readonly T[],
  cols: ReadonlyArray<Pick<ModalCol<T>, "id" | "sort">>,
  q: string,
  sort: SortState,
  searchOf: (r: T) => string,
): T[] {
  const needle = q.trim().toLowerCase();
  const kept = needle ? rows.filter((r) => searchOf(r).toLowerCase().includes(needle)) : [...rows];
  const col = sort ? cols.find((c) => c.id === sort.col) : undefined;
  if (!col || !sort) return kept;
  const sign = sort.dir === "asc" ? 1 : -1;
  return kept.sort((a, b) => {
    const x = col.sort(a);
    const y = col.sort(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * sign;
  });
}

/** The next sort when a header is pressed: a column's own way first (words up, numbers down), then the other way. */
export function nextSort<T>(cols: ReadonlyArray<Pick<ModalCol<T>, "id" | "right">>, sort: SortState, id: string): SortState {
  if (sort && sort.col === id) return { col: id, dir: sort.dir === "asc" ? "desc" : "asc" };
  return { col: id, dir: cols.find((c) => c.id === id)?.right ? "desc" : "asc" };
}

export function DataTable<T>({ rows, cols, rowKey, sort, onSort, onRow, label }: {
  rows: readonly T[];
  cols: ReadonlyArray<ModalCol<T>>;
  rowKey: (r: T) => string;
  sort: SortState;
  onSort?: (id: string) => void;
  /** Pressing a row opens something about it. */
  onRow?: (r: T) => void;
  label: string;
}): JSX.Element {
  const foot = cols.some((c) => c.total !== undefined);
  return (
    <div className="an-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="an-tbl">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.id} scope="col" className={c.right ? "is-r" : undefined} aria-sort={sort?.col === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                {onSort ? (
                  <button type="button" onClick={() => onSort(c.id)}>
                    {c.label}
                    {sort?.col === c.id && <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRow ? "is-open" : undefined} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c, i) => (i === 0
                ? <th key={c.id} scope="row">{c.cell(r)}</th>
                : <td key={c.id} className={c.right ? "is-r" : undefined}>{c.cell(r)}</td>))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {cols.map((c, i) => (i === 0 ? <th key={c.id} scope="row">{c.total}</th> : <td key={c.id} className={c.right ? "is-r" : undefined}>{c.total}</td>))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ── the window of a full list ── */

export function DataModal<T>({ open, onClose, title, sub, rows, cols, rowKey, searchOf, tableOf, file, initialSort, placeholder = "Search" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string | null;
  rows: readonly T[];
  cols: ReadonlyArray<ModalCol<T>>;
  rowKey: (r: T) => string;
  /** The words a search looks in. */
  searchOf: (r: T) => string;
  /** The rows in view, as a table for the download. */
  tableOf?: (rows: readonly T[]) => Table;
  file?: string;
  initialSort?: { col: string; dir: "asc" | "desc" };
  placeholder?: string;
}): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label={title} size="lg">
      {open && (
        <ModalBody
          title={title} sub={sub ?? null} rows={rows} cols={cols} rowKey={rowKey} searchOf={searchOf}
          tableOf={tableOf} file={file} initialSort={initialSort ?? null} placeholder={placeholder}
        />
      )}
    </Dialog>
  );
}

function ModalBody<T>({ title, sub, rows, cols, rowKey, searchOf, tableOf, file, initialSort, placeholder }: {
  title: string; sub: string | null; rows: readonly T[]; cols: ReadonlyArray<ModalCol<T>>; rowKey: (r: T) => string;
  searchOf: (r: T) => string; tableOf: ((rows: readonly T[]) => Table) | undefined; file: string | undefined;
  initialSort: SortState; placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>(initialSort);
  const plain = useMemo(() => cols.map((c) => ({ ...c, total: undefined })), [cols]);
  const shown = useMemo(() => shapeRows(rows, plain, q, sort, searchOf), [rows, plain, q, sort, searchOf]);
  return (
    <div className="anm">
      <header className="anm-head">
        <h2>{title}</h2>
        <p>{sub ? `${sub} · ` : ""}{q.trim() ? `${shown.length} of ${rows.length}` : `${rows.length} in all`}</p>
      </header>
      <div className="anm-bar" role="search">
        <label className="anm-search">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus />
        </label>
        {tableOf && file && shown.length > 0 && <Export table={tableOf(shown)} file={file} />}
      </div>
      <div className="anm-body">
        {shown.length === 0
          ? <p className="anm-none">Nothing matches &ldquo;{q.trim()}&rdquo;.</p>
          : <DataTable rows={shown} cols={plain} rowKey={rowKey} sort={sort} onSort={(id) => setSort((s) => nextSort(plain, s, id))} label={title} />}
      </div>
    </div>
  );
}

/* ── a drawer for one thing ── */

/** A panel from the right edge: Esc and the scrim close it, Tab stays inside it, focus goes back where it was. */
export function Drawer({ open, onClose, title, sub, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string | null;
  children: React.ReactNode;
}): JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, open);
  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="and">
      <div className="and-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="and-panel" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="and-head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="and-x" aria-label="Close (Esc)" title="Close (Esc)" onClick={onClose}><X size={14} weight="bold" /></button>
        </header>
        <div className="and-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ── everything that is not the first answer ── */

export type DetailSection = { heading: string; body: React.ReactNode };

/** The "Details" link and its window: the rest of the page's numbers, then how all of them are counted. */
export function Details({ sections, how, window: against }: { sections: readonly DetailSection[]; how: readonly string[]; window?: string | null }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="an-link" onClick={() => setOpen(true)}>Details</button>
      <Dialog open={open} onClose={() => setOpen(false)} label="Details" size="md">
        {open && (
          <div className="anm">
            <header className="anm-head"><h2>Details</h2>{against && <p>{against}</p>}</header>
            <div className="anm-body anm-pad">
              {sections.map((s) => (
                <section key={s.heading} className="anm-sec">
                  <h3>{s.heading}</h3>
                  {s.body}
                </section>
              ))}
              <section className="anm-sec">
                <h3>How these are counted</h3>
                <ul className="anm-defs">{how.map((l) => <li key={l}>{l}</li>)}</ul>
              </section>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Label and value in rows, for the details of one thing. */
export function Facts({ rows }: { rows: ReadonlyArray<readonly [string, React.ReactNode]> }): JSX.Element {
  return (
    <dl className="an-facts">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
