import { useCallback, useEffect, useState } from "react";
import "./analytics.css";
import {
  meterOf,
  seriesOf,
  USAGE_FIXTURE,
  USAGE_LABEL,
  type UsageKey,
  usageIsIdle,
  usageTotals,
} from "./analytics";
import { getUsageAnalytics, type UsageAnalytics } from "./api/analytics";
import { LIVE } from "./api/client";
import { Shimmer, ShimmerChart, ShimmerRegion } from "./components/Shimmer";
import { EmptyArt } from "./EmptyArt";
import { LoadFailed } from "./ui";
import { Area } from "./viz";

/**
 * DORMANT. The Usage page is out of the navigation and nothing routes to it (an address that named it opens the
 * Analytics overview). The code is kept, with its API and fixtures, until the owner decides whether to delete it
 * (docs/analytics-research-2026-10-13.md section 5). To bring it back: add a route, a loader in consolePages.tsx and a nav row.
 */

type Load<T> = { data: T | null; failed: boolean; retry: () => void };

function useLoad<T>(fetcher: () => Promise<T>, fixture: T, key: string): Load<T> {
  const [data, setData] = useState<T | null>(LIVE ? null : fixture);
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    if (!LIVE) return;
    setFailed(false);
    setData(null);
    fetcher().then(setData, () => setFailed(true));
    // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the period (key) changes
  }, [key]);
  useEffect(run, [run]);
  return { data, failed, retry: run };
}

const PERIODS = [7, 30, 90] as const;

function PeriodSwitch({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="an-period" role="group" aria-label="Period">
      {PERIODS.map((d) => (
        <button key={d} type="button" aria-pressed={days === d} onClick={() => onChange(d)}>
          {d} days
        </button>
      ))}
    </div>
  );
}

function Head({ title, lede, children }: { title: string; lede: string; children?: React.ReactNode }) {
  return (
    <header className="an-head">
      <div>
        <h1 className="con-h1">{title}</h1>
        <p className="con-lede">{lede}</p>
      </div>
      {children}
    </header>
  );
}

/** Usage while it loads: the "Today" meters (a name, a figure, the bar) and the daily chart, in the page's own section classes. */
const Busy = ({ days }: { days: number }) => (
  <ShimmerRegion label="Loading usage">
    <section className="an-sec" aria-hidden="true">
      <h2>Today</h2>
      <ul className="an-meters">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span className="an-meter-l"><Shimmer h={13} lh={20} w={`${96 + i * 22}px`} /></span>
            <span className="an-meter-n"><Shimmer h={12} lh={20} w={64} /></span>
            <span className="an-meter"><Shimmer h={8} r={4} w={`${52 - i * 14}%`} /></span>
          </li>
        ))}
      </ul>
    </section>
    <section className="an-sec" aria-hidden="true">
      <div className="an-sec-h"><h2>Last {days} days</h2></div>
      <ShimmerChart bars={14} h={180} />
    </section>
  </ShimmerRegion>
);
const fmt = (n: number) => n.toLocaleString("en-IN");

export function UsageAnalyticsPage(): JSX.Element {
  const [days, setDays] = useState(30);
  const { data, failed, retry } = useLoad(() => getUsageAnalytics(days), USAGE_FIXTURE, String(days));
  return (
    <div className="con-page an-page">
      <Head title="Usage" lede="What has been used, against the daily limits.">
        <PeriodSwitch days={days} onChange={setDays} />
      </Head>
      {failed ? <LoadFailed what="Usage" onRetry={retry} /> : !data ? <Busy days={days} /> : <UsageBody data={data} />}
    </div>
  );
}

const SERIES: UsageKey[] = ["messages", "searches", "profiles"];

function UsageBody({ data }: { data: UsageAnalytics }) {
  const [kind, setKind] = useState<UsageKey>("messages");
  const totals = usageTotals(data.daily);
  const idle = usageIsIdle(data.daily);
  return (
    <>
      <section className="an-sec">
        <h2>Today</h2>
        <ul className="an-meters">
          {data.today.map(meterOf).map((m) => (
            <li key={m.id}>
              <span className="an-meter-l">{m.label}</span>
              <span className="an-meter-n">{m.text}</span>
              <span className="an-meter" style={{ ["--k" as string]: m.share }} aria-hidden="true" />
              {m.note && <span className="an-meter-note">{m.note}</span>}
            </li>
          ))}
        </ul>
        <p className="an-note">Daily limits reset at midnight UTC.</p>
      </section>

      <section className="an-sec">
        <div className="an-sec-h">
          <h2>Last {data.days} days</h2>
          <div className="an-period is-small" role="group" aria-label="Show">
            {SERIES.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {USAGE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        {idle ? (
          <div className="an-none">
            <EmptyArt name="empty-analytics" size={180} />
            <p className="an-empty">Nothing used in the last {data.days} days. Searches, messages and exports are counted here.</p>
          </div>
        ) : (
        <Area
          data={seriesOf(data.daily, kind)}
          hue="brand"
          accent="var(--accent-fill)"
          h={180}
          labels={5}
          noun={USAGE_LABEL[kind].toLowerCase()}
          total={<span className="an-total">{fmt(totals[kind])}</span>}
        />
        )}
        {!idle && (
        <dl className="an-small-figures">
          {(Object.keys(USAGE_LABEL) as UsageKey[])
            .filter((k) => k !== kind)
            .map((k) => (
              <div key={k}>
                <dt>{USAGE_LABEL[k]}</dt>
                <dd>{fmt(totals[k])}</dd>
              </div>
            ))}
        </dl>
        )}
      </section>

      {data.people && data.people.length > 0 && (
        <section className="an-sec">
          <h2>By person</h2>
          <table className="an-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Agent messages</th>
                <th scope="col">Searches</th>
                <th scope="col">Requirements</th>
                <th scope="col">Exports</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.userId}>
                  <th scope="row">{p.name}</th>
                  <td>{fmt(p.messages)}</td>
                  <td>{fmt(p.searches)}</td>
                  <td>{fmt(p.specs)}</td>
                  <td>{fmt(p.exports)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

