import { X } from "@phosphor-icons/react";

/**
 * The filters that are narrowing a list, as chips with a way to take each off and one to clear them all. Shown whenever
 * a list is narrowed, so a filter that came back from the last visit (or was set and forgotten) is never invisible.
 */
export type FilterChip = { key: string; label: string; onClear: () => void };

export function FilterChips({ chips, onClearAll, label = "Filters on this list" }: { chips: readonly FilterChip[]; onClearAll: () => void; label?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className="fchips" role="group" aria-label={label}>
      {chips.map((c) => (
        <button key={c.key} type="button" className="fchip" onClick={c.onClear} aria-label={`Remove filter: ${c.label}`}>
          <span className="fchip-t">{c.label}</span>
          <X size={10} weight="bold" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="fchips-clear" onClick={onClearAll}>Clear</button>
    </div>
  );
}
