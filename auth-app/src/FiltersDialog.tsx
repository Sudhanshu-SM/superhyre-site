import { CaretDown, CaretUp, Check, MagnifyingGlass, Plus, Sparkle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Category, Control, FilterDef, Value, Values } from "./filters";
import { CATEGORIES, activeCount, advancedSetCount, basicCategories, estimate, isActive, openAdvanced } from "./filters";
import { Loader } from "./components/Loader";
import { Dialog } from "./ui";
import "./composer.css";

/**
 * FiltersDialog — every sourcing filter, in one place, without clutter.
 *
 * Categories on the left, the whole list on the right. Clicking a category
 * scrolls the list to it; scrolling the list moves the highlight, so the
 * left side always says where you are. Each category shows how many of its
 * filters are set, and search narrows the list to the filters whose name or
 * options match. The Apply button carries the match estimate.
 */
export function FiltersDialog({
  open, onClose, initial, prefilled, onApply, live, readOnly, focus, lead,
}: {
  open: boolean;
  onClose: () => void;
  initial: Values;
  /** Filter ids that came from the brief, marked so the recruiter knows why. */
  prefilled: readonly string[];
  /** May return a promise: the dialog stays open while it is saved, and says so if it was not. */
  onApply: (v: Values) => void | Promise<void>;
  /**
   * Connected: these are the campaign's own search filters, saved to it and used by its next search. There is
   * no match count (the prototype's is a fixture) and the button says what it does.
   */
  live?: boolean | undefined;
  /** Someone who follows the campaign sees its filters and cannot change them. */
  readOnly?: boolean | undefined;
  /** Opens scrolled to this group (a category id); `n` changes each time so the same group can be asked for again. */
  focus?: { category: string; n: number } | null | undefined;
  /** The line under the title when connected, in place of the usual one. */
  lead?: string | undefined;
}) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [values, setValues] = useState<Values>(initial);
  const [active, setActive] = useState(CATEGORIES[0]!.id);
  const [query, setQuery] = useState("");
  /* Opens on the basics. "View more filters" opens the whole catalogue; searching does too, since a search has
     to look through all of it. */
  const [more, setMore] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const jumping = useRef<number | null>(null);

  useEffect(() => { if (open) { setValues(initial); setQuery(""); setFailed(null); setSaving(false); setMore(false); } }, [open, initial]);

  const apply = () => {
    const done = onApply(values);
    if (!(done instanceof Promise)) { onClose(); return; }
    setSaving(true);
    setFailed(null);
    done.then(
      () => { setSaving(false); onClose(); },
      (err: unknown) => {
        setSaving(false);
        setFailed(err instanceof Error && err.message ? err.message : "Couldn't save the filters. Try again.");
      },
    );
  };

  const set = useCallback((id: string, v: Value) => { if (!readOnly) setValues((x) => ({ ...x, [id]: v })); }, [readOnly]);
  const matches = estimate(values);
  const count = activeCount(values);

  const q = query.trim().toLowerCase();
  const expanded = more || q.length > 0;
  const basics = useMemo(() => basicCategories(), []);
  /* What is set beyond the basics is shown even before "more" is pressed, so nothing set is hidden. */
  const alsoSet = useMemo(() => openAdvanced(values), [values]);
  const setBeyond = advancedSetCount(values);
  const visible = useMemo(() => CATEGORIES.map((c) => ({
    ...c,
    filters: c.filters.filter((f) => !q || f.label.toLowerCase().includes(q) || c.label.toLowerCase().includes(q) ||
      ("options" in f.control && f.control.options.some((o) => o.toLowerCase().includes(q))) ||
      ("suggestions" in f.control && f.control.suggestions.some((o) => o.toLowerCase().includes(q)))),
  })).filter((c) => c.filters.length > 0), [q]);

  /* ── SCROLL SPY ──
     The highlighted category is the last one whose heading has passed the
     top of the list. At the very bottom the last category wins, or a short
     final section could never be selected by scrolling. */
  const spy = useCallback(() => {
    const body = bodyRef.current;
    if (!body || jumping.current !== null) return;
    const top = body.getBoundingClientRect().top + 24;
    let hit = visible[0]?.id ?? "";
    for (const c of visible) {
      const el = body.querySelector<HTMLElement>(`[data-cat="${c.id}"]`);
      if (el && el.getBoundingClientRect().top <= top) hit = c.id;
    }
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) hit = visible[visible.length - 1]?.id ?? hit;
    setActive(hit);
  }, [visible]);

  const jump = (id: string) => {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-cat="${id}"]`);
    if (!body || !el) return;
    setActive(id);
    if (jumping.current) window.clearTimeout(jumping.current);
    body.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
    jumping.current = window.setTimeout(() => { jumping.current = null; }, 650);
  };

  const clearAll = () => setValues({});

  /* Asked to open at a group (the brief's own "Location" or "Skills" was pressed): it is brought into view once
     the dialog has its list. */
  useEffect(() => {
    if (!open || !focus) return;
    const t = window.setTimeout(() => jump(focus.category), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focus?.n]);

  return (
    <Dialog open={open} onClose={onClose} label="Filters" size={expanded ? "xl" : "md"}>
      <div className="fd">
        <header className="fd-top">
          <div className="fd-title">
            <h2>Filters</h2>
            <p>{live
              ? (lead ?? (readOnly ? "What this campaign's searches use" : "The next search uses these"))
              : prefilled.length ? <><Sparkle size={12} weight="fill" aria-hidden="true" />{prefilled.length} set from your brief</> : "Narrow the search before it runs"}</p>
          </div>
          <label className="fd-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input id="fd-search" type="search" placeholder="Search filters" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </header>

        <div className={`fd-body${expanded ? "" : " is-basic"}`}>
          {expanded && (
          <nav className="fd-nav" aria-label="Filter categories">
            {visible.map((c) => {
              const n = activeCount(values, c.filters.map((f) => f.id));
              return (
                <button key={c.id} type="button" className={`fd-cat${active === c.id ? " is-on" : ""}`} onClick={() => jump(c.id)} aria-current={active === c.id}>
                  <c.Icon size={16} weight={active === c.id ? "fill" : "regular"} aria-hidden="true" />
                  <span>{c.label}</span>
                  {n > 0 && <b className="fd-cat-n" key={n}>{n}</b>}
                </button>
              );
            })}
            <button type="button" className="fd-fewer" onClick={() => setMore(false)} disabled={q.length > 0}>
              <CaretUp size={14} weight="bold" aria-hidden="true" />Show fewer
            </button>
          </nav>
          )}

          <div className={`fd-list${readOnly ? " is-readonly" : ""}`} ref={bodyRef} onScroll={expanded ? spy : undefined}>
            {expanded ? (
              <>
                {visible.length === 0 && <p className="fd-empty">No filter matches "{query}".</p>}
                {visible.map((c) => (
                  <Section key={c.id} cat={c} values={values} set={set} prefilled={prefilled} />
                ))}
                <div className="fd-tail" aria-hidden="true" />
              </>
            ) : (
              <>
                {basics.map((c) => (
                  <Section key={c.id} cat={c} values={values} set={set} prefilled={prefilled} />
                ))}
                {alsoSet.map((c) => (
                  <Section key={`more-${c.id}`} cat={c} values={values} set={set} prefilled={prefilled} />
                ))}
                <div className="fd-more-row">
                  <button type="button" className="fd-more" onClick={() => setMore(true)} aria-expanded="false">
                    View more filters{setBeyond > 0 ? ` (${setBeyond} set)` : ""}
                    <CaretDown size={14} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="fd-foot">
          {!readOnly && <button type="button" className="src-btn is-quiet mo-small" onClick={clearAll} disabled={count === 0 || saving}>Clear all</button>}
          <span className="fd-foot-n">{failed ?? (count === 0 ? "No filters set" : `${count} filter${count === 1 ? "" : "s"} set`)}</span>
          <span className="sp" />
          <button type="button" className="src-btn is-quiet mo-small" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</button>
          {!readOnly && (
            <button type="button" className="src-btn is-primary fd-apply" onClick={apply} disabled={saving}>
              {live
                ? (saving ? <><Loader size="sm" tone="inherit" />Saving…</> : "Save filters")
                : <>Apply{count ? ` ${count}` : ""} · {matches.toLocaleString("en-IN")} matches</>}
            </button>
          )}
        </footer>
      </div>
    </Dialog>
  );
}

function Section({
  cat, values, set, prefilled,
}: {
  cat: Category;
  values: Values;
  set: (id: string, v: Value) => void;
  prefilled: readonly string[];
}) {
  return (
    <section className="fd-sec" data-cat={cat.id} aria-labelledby={`fd-h-${cat.id}`}>
      <h3 id={`fd-h-${cat.id}`} className="fd-sec-h"><cat.Icon size={15} aria-hidden="true" />{cat.label}</h3>
      <div className="fd-rows">
        {cat.filters.map((f) => (
          <Row key={f.id} def={f} value={values[f.id]} onChange={(v) => set(f.id, v)} fromBrief={prefilled.includes(f.id)} />
        ))}
      </div>
    </section>
  );
}

function Row({ def, value, onChange, fromBrief }: { def: FilterDef; value?: Value; onChange: (v: Value) => void; fromBrief: boolean }) {
  const on = isActive(def, value);
  return (
    <div className={`fd-row${on ? " is-on" : ""}${def.control.kind === "toggle" ? " is-toggle" : ""}`}>
      <div className="fd-row-k">
        <span className="fd-row-l">
          {def.label}
          {fromBrief && on && <span className="fd-from" title="Set from your brief"><Sparkle size={10} weight="fill" aria-hidden="true" />brief</span>}
        </span>
        {def.hint && def.control.kind !== "toggle" && <span className="fd-row-h">{def.hint}</span>}
      </div>
      <div className="fd-row-v">
        <ControlView c={def.control} id={def.id} value={value} onChange={onChange} label={def.label} />
      </div>
    </div>
  );
}

function ControlView({ c, id, value, onChange, label }: { c: Control; id: string; value?: Value; onChange: (v: Value) => void; label: string }) {
  if (c.kind === "chips") return <Chips options={c.options} value={(value as string[]) ?? []} onChange={onChange} label={label} />;
  if (c.kind === "tags") return <Tags id={id} suggestions={c.suggestions} placeholder={c.placeholder} value={(value as string[]) ?? []} onChange={onChange} label={label} />;
  if (c.kind === "range") return <Range c={c} value={(value as [number, number]) ?? [c.min, c.max]} onChange={onChange} label={label} />;
  if (c.kind === "segment") return <Segment options={c.options} value={(value as string) ?? c.options[0]!} onChange={onChange} label={label} />;
  return <Toggle id={id} hint={c.hint} value={value === true} onChange={onChange} label={label} />;
}

/* ── controls ────────────────────────────────────────────────────────────── */

function Chips({ options, value, onChange, label }: { options: readonly string[]; value: readonly string[]; onChange: (v: Value) => void; label: string }) {
  return (
    <div className="fd-chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className={`fd-chip${on ? " is-on" : ""}`} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {on && <Check size={11} weight="bold" aria-hidden="true" />}{o}
          </button>
        );
      })}
    </div>
  );
}

function Tags({ id, suggestions, placeholder, value, onChange, label }: { id: string; suggestions: readonly string[]; placeholder: string; value: readonly string[]; onChange: (v: Value) => void; label: string }) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setText("");
  };
  const q = text.trim().toLowerCase();
  const offered = suggestions.filter((s) => !value.includes(s) && (!q || s.toLowerCase().includes(q))).slice(0, q ? 8 : 6);
  return (
    <div className="fd-tags">
      <div className="fd-tag-box">
        {value.map((t) => (
          <span key={t} className="fd-tag">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={10} weight="bold" /></button>
          </span>
        ))}
        <input
          id={`fd-${id}`}
          aria-label={label}
          value={text}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(offered[0] && q ? offered[0] : text); }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
        />
      </div>
      {offered.length > 0 && (
        <div className="fd-suggest">
          {offered.map((s) => (
            <button key={s} type="button" className="fd-sugg" onClick={() => add(s)}><Plus size={10} weight="bold" aria-hidden="true" />{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Range({ c, value, onChange, label }: { c: Extract<Control, { kind: "range" }>; value: readonly [number, number]; onChange: (v: Value) => void; label: string }) {
  const [a, b] = value;
  const pct = (x: number) => ((x - c.min) / (c.max - c.min)) * 100;
  const fmt = (x: number, top: boolean) => `${x}${top && c.plus && x === c.max ? "+" : ""}${c.unit ? ` ${c.unit}` : ""}`;
  const any = a === c.min && b === c.max;
  return (
    <div className="fd-range">
      <span className={`fd-range-v${any ? " is-any" : ""}`}>{any ? "Any" : `${fmt(a, false)} – ${fmt(b, true)}`}</span>
      <div className="fd-range-track" style={{ ["--a" as string]: `${pct(a)}%`, ["--b" as string]: `${pct(b)}%` }}>
        <input type="range" min={c.min} max={c.max} step={c.step} value={a} aria-label={`${label} minimum`}
          onChange={(e) => onChange([Math.min(Number(e.target.value), b), b])} />
        <input type="range" min={c.min} max={c.max} step={c.step} value={b} aria-label={`${label} maximum`}
          onChange={(e) => onChange([a, Math.max(Number(e.target.value), a)])} />
      </div>
    </div>
  );
}

function Segment({ options, value, onChange, label }: { options: readonly string[]; value: string; onChange: (v: Value) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(value)}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value]);
  return (
    <div className="fd-seg" role="radiogroup" aria-label={label} ref={ref}>
      {pill && <span className="fd-seg-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden="true" />}
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} data-v={o} className={`fd-seg-o${o === value ? " is-on" : ""}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

function Toggle({ id, hint, value, onChange, label }: { id: string; hint: string; value: boolean; onChange: (v: Value) => void; label: string }) {
  return (
    <label className="fd-toggle">
      <input type="checkbox" id={`fd-${id}`} checked={value} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="fd-switch" aria-hidden="true" />
      <span className="fd-toggle-h">{hint}</span>
    </label>
  );
}
