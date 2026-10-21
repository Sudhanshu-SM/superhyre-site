import { Shimmer, ShimmerRegion } from "./components/Shimmer";

/**
 * The lists in Settings while they load, in the real rows' own classes: a note or an entry (the line, what it is,
 * the action at the right: `sm-row`), or a person (their name over a line, their actions: `st-item`). Each page keeps
 * its real heading and intro; only the rows are ghosts, so the page does not move when they arrive.
 */

/** Notes or entries: a line of text over a quiet line, the action at the right. */
export function SmRowsGhost({ n = 4, label, said = false }: { n?: number; label: string; said?: boolean }): JSX.Element {
  return (
    <ShimmerRegion label={label}>
      <ul className="sm-list" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className="sm-row">
            <div className="sm-main">
              <p className="sm-text"><Shimmer h={13} lh={20} w={`${52 + ((i * 17) % 38)}%`} /></p>
              {said && <p className="sm-said"><Shimmer h={11} lh={20} w={`${30 + ((i * 13) % 30)}%`} /></p>}
              <p className="sm-meta"><Shimmer h={10} lh={16} w={`${34 + ((i * 11) % 24)}%`} /></p>
            </div>
            <div className="sm-acts"><Shimmer h={12} lh={20} w={54} /></div>
          </li>
        ))}
      </ul>
    </ShimmerRegion>
  );
}

/** What the agent remembers: its search and scope row, then a group of notes. */
export function SmPageGhost({ label }: { label: string }): JSX.Element {
  return (
    <ShimmerRegion label={label}>
      <div className="sm-bar" aria-hidden="true">
        <span className="sm-search"><Shimmer h={40} r={10} /></span>
        <span className="sm-scope"><Shimmer h={40} w={150} r={10} /></span>
      </div>
      <div className="sm-groups" aria-hidden="true">
        <section className="sm-type">
          <h3 className="sm-th"><Shimmer h={14} lh={24} w={120} /></h3>
          <ul className="sm-list">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="sm-row">
                <div className="sm-main">
                  <p className="sm-text"><Shimmer h={13} lh={20} w={`${52 + ((i * 17) % 38)}%`} /></p>
                  <p className="sm-meta"><Shimmer h={10} lh={16} w={`${34 + ((i * 11) % 24)}%`} /></p>
                </div>
                <div className="sm-acts"><Shimmer h={12} lh={20} w={54} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ShimmerRegion>
  );
}

/** People: a name over a line, their actions at the right. */
export function StItemsGhost({ n = 3, label }: { n?: number; label: string }): JSX.Element {
  return (
    <ShimmerRegion label={label}>
      <ul className="st-list" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <li key={i} className="st-item">
            <span className="st-who">
              <Shimmer h={13} lh={20} w={`${120 + ((i * 31) % 70)}px`} />
              <Shimmer h={11} lh={20} w={`${150 + ((i * 23) % 80)}px`} />
            </span>
            <span className="st-acts"><Shimmer h={32} w={116} r={8} /></span>
          </li>
        ))}
      </ul>
    </ShimmerRegion>
  );
}
