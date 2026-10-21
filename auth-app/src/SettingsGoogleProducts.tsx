import { Loader } from "./components/Loader";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { ConnectorLogo } from "./ConnectorLogo";
import type { ProductRow } from "./googleProducts";
import "./settingsGoogle.css";

const MARK: Record<ProductRow["product"], "gmail" | "calendar" | "tasks" | "sheets"> = {
  gmail: "gmail", calendar: "calendar", tasks: "tasks", sheets: "sheets",
};

/**
 * The parts of the Google connection, one row each: what it does and where it stands. A part that is on says "On"; one
 * that was not allowed says "Needs access"; one the Google project has switched off says so, with the page that
 * switches it on. State is coloured text, never a dot or a pill.
 */
export function GoogleProducts({ rows, checking, onCheck }: {
  rows: readonly ProductRow[];
  checking: boolean;
  /** Asks Google again (an API was switched on since). */
  onCheck: (() => void) | null;
}): JSX.Element {
  return (
    <ul className="gw-list" aria-label="What Google is used for">
      {rows.map((r) => (
        <li key={r.product} className="gw-row">
          <ConnectorLogo id={MARK[r.product]} size={18} decorative />
          <span className="gw-main">
            <span className="gw-name t-body">{r.name}</span>
            <span className="gw-use t-body-sm">{r.use}</span>
            {r.state === "api_disabled" && (
              <span className="gw-problem t-body-sm" role="alert">
                {r.text}
                {r.help && <> <a href={r.help} target="_blank" rel="noopener noreferrer" className="gw-link">Open Google Cloud</a></>}
                {onCheck && (
                  <> <button type="button" className="st-link" disabled={checking} onClick={onCheck}>{checking ? <><Loader size="sm" tone="inherit" /> Checking</> : "Check again"}</button></>
                )}
              </span>
            )}
          </span>
          {r.state !== "quiet" && r.state !== "api_disabled" && (
            <span className={`gw-state t-body-sm is-${r.state}`}>{r.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The rows while Google is being read: the same four, as ghosts, so the card does not move when they arrive. */
export function GoogleProductsGhost(): JSX.Element {
  return (
    <ShimmerRegion label="Reading what Google is used for">
      <ul className="gw-list" aria-hidden="true">
        {[62, 74, 54, 68].map((w, i) => (
          <li key={i} className="gw-row">
            <Shimmer h={18} w={18} r={5} />
            <span className="gw-main">
              <Shimmer h={13} lh={20} w={`${30 + i * 4}%`} />
              <Shimmer h={11} lh={18} w={`${w}%`} />
            </span>
            <Shimmer h={12} lh={20} w={48} />
          </li>
        ))}
      </ul>
    </ShimmerRegion>
  );
}
