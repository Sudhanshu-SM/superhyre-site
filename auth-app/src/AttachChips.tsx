import { FileText, SlidersHorizontal, WarningCircle, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Loader } from "./components/Loader";
import { sizeLabel, wordsOf } from "./attachments";
import type { Attachment } from "./attachments";

/** How many chips show before "+N more". */
export const CHIPS_SHOWN = 4;

/**
 * What is attached to the message being written, at the top of the composer, inside it: one chip each, all the
 * same (icon, name cut with an ellipsis, size, remove), wrapping onto more lines as they come. A file that could
 * not be read is not explained inside its chip: one calm line under the row says which and why.
 */
export function AttachChips({
  items, cut, onView, onRemove, filters,
}: {
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
  const line = failed.length
    ? `${failed[0]!.label}: ${failed[0]!.a.note ?? "I couldn't read that file."}${failed.length > 1 ? ` ${failed.length - 1} more couldn't be read either.` : ""}`
    : trimmed.length
      ? `${trimmed[0]!.label} is long: only its start fits in one message.`
      : null;

  return (
    <div className="orc-attached">
      <ul className="orc-attached-list" aria-label="Attached">
        {shown.map(({ a, label, detail }) => {
          const body = (
            <>
              {a.status === "reading" ? <Loader size="sm" label="Reading the file" />
                : a.status === "failed" ? <WarningCircle size={15} aria-hidden="true" />
                : <FileText size={15} aria-hidden="true" />}
              <b title={label}>{label}</b>
              {detail && <small>{detail}</small>}
            </>
          );
          return (
            <li key={a.id}>
              <span className={`orc-file${a.status === "failed" ? " is-failed" : ""}`} data-status={a.status}>
                {a.origin === "pasted" && a.status === "ready" ? (
                  <button type="button" className="orc-file-open" onClick={() => onView(a.id)} aria-label={`View ${label}`}>{body}</button>
                ) : (
                  <span className="orc-file-open">{body}</span>
                )}
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
      {line && <p className="orc-attached-err" role="status">{line}</p>}
    </div>
  );
}
