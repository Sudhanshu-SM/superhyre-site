import { CaretDown, FileText, LinkSimple, SlidersHorizontal, WarningCircle, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { ScopeMenu } from "./AddMenu";
import { type AddContext, type AddScope, SCOPE_WORD, SUGGESTED_WORD, mismatch, resultWord, scopeLabel, scopesFor } from "./adding";
import { Loader } from "./components/Loader";
import { sizeLabel, wordsOf } from "./attachments";
import type { Attachment } from "./attachments";
import "./addMenu.css";

/** How many chips show before "+N more". */
export const CHIPS_SHOWN = 4;

/**
 * What is attached to the message being written, at the top of the composer, inside it: one chip each, all the
 * same (icon, name cut with an ellipsis, size, remove), wrapping onto more lines as they come. A file that could
 * not be read is not explained inside its chip: one calm line under the row says which and why.
 */
export function AttachChips({
  items, cut, onView, onRemove, filters, scopes,
}: {
  /** Files that were chosen or suggested as something: what each is shown as, and how to change it. Without it every chip is just a file. */
  scopes?: {
    ctx: Pick<AddContext, "campaign" | "campaignId" | "mayChange" | "closed">;
    onScope: (id: string, scope: AddScope) => void;
    /** Keep a file as it was chosen, against the line that says it looks like something else. */
    onKeep: (id: string) => void;
  } | undefined;
  /** Filters set for the next message (no campaign in focus): one chip with their count, to open or take off. */
  filters?: { count: number; onOpen: () => void; onRemove: () => void } | undefined;
  items: readonly Attachment[];
  /** Ids of the attachments that do not fit whole in a message. */
  cut: ReadonlySet<string>;
  onView: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  if (!items.length && !filters) return null;

  const chips = items.map((a) => {
    const label = a.label ?? (a.origin === "pasted" ? `Pasted text, ${wordsOf(a.text).toLocaleString("en-IN")} words` : a.name);
    const detail =
      a.status === "reading" ? "Reading…"
      : a.status === "failed" ? ""
      : a.kind === "sheet" || a.scope === "candidates" ? resultWord(a)
      : cut.has(a.id) ? "Start only"
      : a.origin === "file" ? sizeLabel(a.size) : "";
    return { a, label, detail };
  });
  const total = chips.length + (filters ? 1 : 0);
  const room = all ? total : CHIPS_SHOWN;
  const shown = chips.slice(0, room);
  const showFilters = filters && chips.length < room;
  const hidden = total - shown.length - (showFilters ? 1 : 0);

  const failed = chips.filter((c) => c.a.status === "failed");
  const trimmed = chips.filter((c) => c.a.status === "ready" && cut.has(c.a.id));
  /* One calm line, and only one: what could not be read, else a file that looks like something else (with its buttons), else what is cut. */
  const askers = scopes ? chips.flatMap((c) => { const m = mismatch(c.a, scopes.ctx); return m ? [{ id: c.a.id, m }] : []; }) : [];
  const asking = askers[0];
  const line = failed.length
    ? `${failed[0]!.label}: ${failed[0]!.a.note ?? "I couldn't read that file."}${failed.length > 1 ? ` ${failed.length - 1} more couldn't be read either.` : ""}`
    : asking
      ? `${asking.m.line}${askers.length > 1 ? ` ${askers.length - 1} more need a look too.` : ""}`
      : trimmed.length
        ? `${trimmed[0]!.label} is long: only its start fits in one message.`
        : null;
  const buttons = !failed.length && asking && scopes ? asking.m.actions : [];
  const said = chips.find((c) => c.a.kind === "sheet" && c.a.status === "ready" && c.a.scope);

  return (
    <div className="orc-attached">
      <ul className="orc-attached-list" aria-label="Attached">
        {shown.map(({ a, label, detail }) => {
          const body = (
            <>
              {a.status === "reading" ? <Loader size="sm" label="Reading the file" />
                : a.status === "failed" ? <WarningCircle size={15} aria-hidden="true" />
                : a.origin === "link" ? <LinkSimple size={15} aria-hidden="true" />
                : <FileText size={15} aria-hidden="true" />}
              <b title={label}>{label}</b>
            </>
          );
          return (
            <li key={a.id}>
              <span
                className={`orc-file${a.status === "failed" ? " is-failed" : ""}`}
                data-status={a.status}
                onKeyDown={(e) => { if ((e.key === "Backspace" || e.key === "Delete") && e.target instanceof HTMLButtonElement) { e.preventDefault(); onRemove(a.id); } }}
              >
                {a.origin === "pasted" && a.status === "ready" ? (
                  <button type="button" className="orc-file-open" onClick={() => onView(a.id)} aria-label={`View ${label}`}>{body}</button>
                ) : (
                  <span className="orc-file-open">{body}</span>
                )}
                {scopes && a.scope && a.status !== "failed" && <ScopeButton chip={a} ctx={scopes.ctx} onScope={(scope) => scopes.onScope(a.id, scope)} />}
                {detail && <small>{detail}</small>}
                <button type="button" className="orc-file-x" aria-label={`Remove ${label}`} onClick={() => onRemove(a.id)}>
                  <X size={12} weight="bold" aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
        {showFilters && filters && (
          <li>
            <span className="orc-file">
              <button type="button" className="orc-file-open" onClick={filters.onOpen} aria-label={`Filters: ${filters.count}. Change them`}>
                <SlidersHorizontal size={15} aria-hidden="true" />
                <b>Filters: {filters.count}</b>
              </button>
              <button type="button" className="orc-file-x" aria-label="Remove the filters" onClick={filters.onRemove}>
                <X size={12} weight="bold" aria-hidden="true" />
              </button>
            </span>
          </li>
        )}
        {hidden > 0 && (
          <li>
            <button type="button" className="orc-file orc-file-more" onClick={() => setAll(true)}>+{hidden} more</button>
          </li>
        )}
        {all && total > CHIPS_SHOWN && (
          <li>
            <button type="button" className="orc-file orc-file-more" onClick={() => setAll(false)}>Show fewer</button>
          </li>
        )}
      </ul>
      {line && (
        <p className="orc-attached-err" role="status">
          {buttons.length > 0 && asking && scopes ? (
            <span className="am-line">
              <span>{line}</span>
              {buttons.map((b) => (
                <button key={b.label} type="button" onClick={() => (b.scope ? scopes.onScope(asking.id, b.scope) : scopes.onKeep(asking.id))}>{b.label}</button>
              ))}
            </span>
          ) : line}
        </p>
      )}
      {/* A sheet read, said to a screen reader where it can't be seen on the chip: "leads.xlsx: 61 people". */}
      <span className="sr-only" aria-live="polite">{said ? `${said.a.name}: ${resultWord(said.a)}` : ""}</span>
    </div>
  );
}

/** What a file was chosen to be, as muted text with a caret that opens the kinds it can be changed to. */
function ScopeButton({ chip, ctx, onScope }: { chip: Attachment; ctx: Pick<AddContext, "campaign" | "mayChange" | "closed">; onScope: (scope: AddScope) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const scope = chip.scope!;
  const options = scopesFor(chip.kind ?? "document", ctx).map((s) => ({ scope: s, label: scopeLabel(s, ctx) }));
  const word = chip.suggested ? SUGGESTED_WORD[scope] : SCOPE_WORD[scope];
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="am-scope"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${chip.name} is ${word.toLowerCase()}. Change what it is`}
        title={chip.suggested ? `Suggested from the ${chip.origin === "link" ? "sheet" : "file"}. Change it here.` : `Change what this ${chip.origin === "link" ? "sheet" : "file"} is`}
        onClick={() => setOpen((o) => !o)}
      >
        {word}<CaretDown size={11} weight="bold" aria-hidden="true" />
      </button>
      <ScopeMenu anchor={btn} open={open} onClose={() => setOpen(false)} options={options} value={scope} onPick={(s) => { setOpen(false); onScope(s); }} />
    </>
  );
}
