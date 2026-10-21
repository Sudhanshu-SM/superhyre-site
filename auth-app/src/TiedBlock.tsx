import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { LIVE } from "./api/client";
import { looseEnds } from "./api/windDown";
import type { LooseEnds } from "./api/windDown";
import { resolveCampaignId } from "./campaignStore";
import { Shimmer } from "./components/Shimmer";
import { Guard } from "./Guard";
import { useAsked } from "./useAsked";
import { hasLooseEnds, tiedLine, tiedRows } from "./windDown";

/**
 * What is tied to the people in a dialog, in one calm line with the items behind it on a click. While the server is
 * answering it holds its place with ghosts; when there is nothing tied, or the answer never comes, it draws nothing.
 */
export function TiedBlock({ loading, data, noun = "these people", one = false }: { loading: boolean; data: LooseEnds | null; noun?: string; one?: boolean }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (loading) {
    return (
      <div className="tb" aria-hidden="true">
        <Shimmer h={12} lh={18} w="86%" /><Shimmer h={12} lh={18} w="48%" />
      </div>
    );
  }
  if (!data || !hasLooseEnds(data)) return null;
  /* For one person the dialog already names them: their name is not repeated on every row. */
  const rows = tiedRows(data, { withPerson: !one });
  return (
    <div className="tb" role="note" aria-label={`Tied to ${noun}`}>
      <p className="t-body-sm tb-line">{tiedLine(data)}</p>
      {rows.length > 0 && (
        <>
          <button type="button" className="cw-link tb-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide the list" : "See the list"}<CaretDown size={10} weight="bold" style={{ transform: open ? "rotate(180deg)" : undefined }} />
          </button>
          {open && (
            <ul className="tb-list">
              {rows.map((r) => (
                <li key={r.key} className="t-body-sm"><b>{r.title}</b>{r.person && <> · {r.person}</>}{r.when && <span className="tb-when"> · {r.when}</span>}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** What rejecting or hiring these board cards would leave loose, asked while the dialog is open. Nothing for none; nothing without a server. */
export function LooseEndsNote({ on, campaignId, ccIds, to }: { on: boolean; campaignId: string; ccIds: readonly string[]; to: "passed" | "hired" }): JSX.Element | null {
  const want = on && LIVE && ccIds.length > 0;
  const { loading, data } = useAsked(want, `${campaignId}|${to}|${ccIds.join(",")}`, () => looseEnds(resolveCampaignId(campaignId), ccIds, to));
  if (!want) return null;
  return <Guard><TiedBlock loading={loading} data={data} noun={ccIds.length === 1 ? "this person" : "these people"} one={ccIds.length === 1} /></Guard>;
}
