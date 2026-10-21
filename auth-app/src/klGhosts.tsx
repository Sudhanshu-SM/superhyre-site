import { Shimmer, ShimmerRegion } from "./components/Shimmer";

/**
 * What the calls and the outreach lists look like while they load: their own classes (calls.css, outreachActivity.css),
 * so a ghost row is the real row's grid, height and padding, and a ghost group is the real group card: a chip, two
 * lines, the figures in their fixed columns, the caret's slot. Nothing is copied from the CSS but the shape.
 */

type Kind = "call" | "outreach";

function Rows({ n, kind, className = "kl-rows" }: { n: number; kind: Kind; className?: string }): JSX.Element {
  return (
    <ul className={className} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>
          <div className={`kl-row${kind === "outreach" ? " ko-row" : ""}`}>
            <Shimmer circle w={34} h={34} />
            <span className="kl-main">
              <span className="kl-l1"><Shimmer h={13} lh={20} w={`${46 + ((i * 17) % 30)}%`} /></span>
              <Shimmer h={11} lh={20} w={`${56 + ((i * 11) % 32)}%`} />
            </span>
            <span className="kl-how"><Shimmer h={12} w={64} /></span>
            <span className="kl-tail"><Shimmer h={12} w={34} /><Shimmer h={12} w={76} /></span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A list of lines. "page" is a campaign's own calls or outreach (the page is already scoped to one, so the rows sit in
 * the one framed card, no group header), "group" the rows inside an opened group, "modal" the list in a "view all" dialog.
 */
export function KlRowsGhost({ n = 8, kind = "call", label, variant = "group" }: { n?: number; kind?: Kind; label: string; variant?: "page" | "group" | "modal" }): JSX.Element {
  const rows = <Rows n={n} kind={kind} className={variant === "modal" ? "kl-rows klm-rows" : "kl-rows"} />;
  return (
    <ShimmerRegion label={label}>
      {variant === "page" ? <ul className="kl-groups is-flat" aria-hidden="true"><li className="kl-group is-open"><div className="kl-gbody">{rows}</div></li></ul> : rows}
    </ShimmerRegion>
  );
}

/** The groups, one card per campaign, the first one opened as the page opens it. */
export function KlGroupsGhost({ n = 4, kind = "call", open = 1, label }: { n?: number; kind?: Kind; open?: number; label: string }): JSX.Element {
  return (
    <ShimmerRegion label={label}>
      <ul className="kl-groups" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className={`kl-group${i < open ? " is-open" : ""}`}>
            <h2 className="kl-ghead">
              <span className="kl-gbtn">
                <Shimmer w={36} h={36} r={10} />
                <span className="kl-gtitle">
                  <Shimmer h={14} lh={20} w={`${46 + ((i * 19) % 32)}%`} />
                  <Shimmer h={11} lh={20} w={`${24 + ((i * 13) % 20)}%`} />
                </span>
                {kind === "call" ? (
                  <span className="kl-gstats"><Shimmer h={12} w={52} /><Shimmer h={3} r={2} /><Shimmer h={12} w={118} style={{ justifySelf: "end" }} /></span>
                ) : (
                  <span className="ko-gstats"><Shimmer h={12} w={64} /><Shimmer h={12} w={118} style={{ justifySelf: "end" }} /></span>
                )}
                <Shimmer w={14} h={14} r={4} style={{ justifySelf: "end" }} />
              </span>
            </h2>
            {i < open && <div className="kl-gbody"><Rows n={3} kind={kind} /></div>}
          </li>
        ))}
      </ul>
    </ShimmerRegion>
  );
}

/** Where the pager will be once the list is read, so the toolbar does not change when it arrives: the range and the numbers' width. */
export function PagerSlot(): JSX.Element {
  return (
    <span className="pager pager-slot" aria-hidden="true">
      <Shimmer h={12} w={84} />
      <Shimmer h={36} w={260} r={9} />
    </span>
  );
}
