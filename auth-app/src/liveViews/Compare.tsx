import { ArrowsOutSimple, Sparkle } from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { messageOf } from "../api/client";
import { Avatar, FitMark } from "../CandidateBits";
import { CompareDialog, verdictForSource } from "../CompareDialog";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import type { Question } from "../clarify";
import { campaignQuestion } from "./ask";
import { useCampaignRows } from "../campaignStore";
import { putSet } from "../liveCandidates";
import type { MomentCtx } from "../moments";
import "../compare.css";
import "../liveCompareEtc.css";
import type { Dir, Loaded } from "./compareData";
import { loadComparison, loadDir } from "./compareData";
import type { Entry } from "./compareLogic";
import { explicitIds, optionOf, plan, whoOptions } from "./compareLogic";
import { useFresh } from "./fleetKit";
import { PhaseRun, Working } from "./PhaseRun";
import type { LiveViewProps } from "./types";

/**
 * Two to four people side by side, from the workspace's own people. The summary card and the
 * full comparison are the console's (`cs2-*`, `CompareDialog`); what changed is where they read:
 * the campaign's real criteria, the judge's verdict on each person, and the profiles themselves.
 * Who to compare comes from the card, else the names in the request, else a question.
 */

/* A person is named in full: first words alone were "Imp" and "Apollosync" for two different people. */
const called = (name: string) => name.trim() || name;
const idsOf = (v: string | undefined) => (v ?? "").split(",").filter(Boolean);
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default function CompareView({ card, ctx }: LiveViewProps): JSX.Element {
  const rows = useCampaignRows();
  const [dir, setDir] = useState<Dir | null>(null);
  const [error, setError] = useState<unknown>(null);
  const poolCampaign = card.campaignId ?? ctx.campaign?.id ?? null;

  useEffect(() => {
    let live = true;
    loadDir({ said: ctx.said, card, poolCampaign }).then(
      (d) => { if (live) setDir(d); },
      (e) => { if (live) setError(e); },
    );
    return () => { live = false; };
    // The request is fixed for the turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [dir, error, grow]);

  const ask = useMemo<Ask | undefined>(() => {
    if (!dir) return undefined;
    const names = { ...Object.fromEntries(rows.map((r) => [r.id, r.name])), ...dir.names };
    return (_kind, said, c) => {
      const picked = idsOf(c.answers?.people);
      const p = plan({
        said,
        card: { campaignId: card.campaignId, ids: explicitIds(card, dir.pool) },
        picked,
        answeredCampaign: c.answers?.campaignId || null,
        pool: dir.pool,
      });
      const nameOf = (id: string) => dir.pool.find((e) => e.id === id)?.name ?? "";

      if (p.need === "which") {
        const g = p.ambiguous[0]!;
        const options = g.ids.map((id) => dir.pool.find((e) => e.id === id)).filter((e): e is Entry => !!e).map((e) => optionOf(e, poolCampaign, names));
        const q: Question = {
          id: `compare-which-${g.phrase.toLowerCase().replace(/\W+/g, "-")}`,
          found: `More than one person is called “${g.phrase}”`,
          ask: `Which ${g.phrase} do you mean?`,
          options,
          apply: ([id]) => ({ answers: { people: [...picked, id ?? ""].filter(Boolean).join(",") } }),
        };
        return q;
      }

      if (p.need === "who") {
        const options = whoOptions(dir.pool, poolCampaign, p.ids, 16, names);
        if (options.length < 2 - p.ids.length) return null;
        const have = p.ids.length;
        const q: Question = {
          id: "compare-who",
          found: have ? `${list(p.ids.map((id) => called(nameOf(id))))} ${have === 1 ? "is" : "are"} in the comparison so far` : "The request doesn't say who to compare",
          ask: have === 1 ? `Who should I compare ${called(nameOf(p.ids[0] as string))} with?` : "Who should I compare?",
          why: "Pick two to four. The comparison lines their profiles up side by side.",
          options,
          multi: { min: Math.max(1, 2 - have), max: Math.max(1, 4 - have), verb: "Compare" },
          apply: (chosen) => ({ answers: { people: [...picked, ...chosen].join(",") } }),
        };
        return q;
      }

      if (p.need === "campaign" && p.campaign.kind === "ask") {
        const shared = p.campaign.options.map((id) => rows.find((r) => r.id === id) ?? { id, name: names[id] ?? "A campaign", department: "", location: "", status: "active" as const });
        return campaignQuestion(shared, {
          found: `${list(p.ids.map((id) => called(nameOf(id))))} are in ${shared.length} campaigns`,
          ask: "Which campaign should I compare them for?",
          current: ctx.campaign?.id ?? null,
          remember: "compare.campaign",
        });
      }
      return null;
    };
  }, [dir, rows, card, ctx.campaign?.id, poolCampaign]);

  return (
    <div className="src mo">
      {error ? <p className="lv-note" role="alert">{messageOf(error)}</p> : !dir || !ask ? (
        <Working label="Looking up the people" />
      ) : (
        <Clarified kind="compare" ctx={ctx} ask={ask}>
          {(c) => <Comparison card={card} ctx={c} dir={dir} rows={rows} />}
        </Clarified>
      )}
    </div>
  );
}

function Comparison({ card, ctx, dir, rows }: { card: LiveViewProps["card"]; ctx: MomentCtx; dir: Dir; rows: ReturnType<typeof useCampaignRows> }): JSX.Element {
  const p = useMemo(() => plan({
    said: ctx.said,
    card: { campaignId: card.campaignId, ids: explicitIds(card, dir.pool) },
    picked: idsOf(ctx.answers?.people),
    answeredCampaign: ctx.answers?.campaignId || null,
    pool: dir.pool,
  }), [ctx.said, ctx.answers, card, dir.pool]);
  const campaignId = p.campaign.kind === "use" ? p.campaign.id : null;
  const campaignName = campaignId ? (rows.find((r) => r.id === campaignId)?.name ?? dir.names[campaignId] ?? card.campaignName ?? "") : "";
  const ready = p.need === null && p.ids.length >= 2;

  const [state, setState] = useState<{ status: "loading" } | { status: "failed"; error: unknown } | { status: "ready"; data: Loaded }>({ status: "loading" });
  useEffect(() => {
    if (!ready) return;
    let live = true;
    loadComparison({ ids: p.ids, dir, campaignId, campaignName }).then(
      (data) => { if (live) setState({ status: "ready", data }); },
      (error) => { if (live) setState({ status: "failed", error }); },
    );
    return () => { live = false; };
    // One read per answered question: the slot is remounted when an answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = state.status === "ready" ? state.data : null;
  /* Registered where the profile sheet and the list reach them, so a name opens the same person everywhere. */
  useEffect(() => {
    if (!data || !data.people.length) return;
    putSet({ key: `compare:${campaignId ?? "none"}:${p.ids.join(",")}`, campaignId, candidates: data.people, criteria: data.criteria, reasons: {}, total: data.people.length });
  }, [data, campaignId, p.ids]);

  const grow = ctx.onGrow;
  useEffect(() => { grow(); }, [state.status, grow]);

  if (!ready) {
    return <p className="lv-note">I couldn't find two people to compare. Name them and I'll line them up.</p>;
  }
  if (state.status === "failed") return <p className="lv-note" role="alert">{messageOf(state.error)}</p>;
  const loaded = state.status === "ready" ? state.data : null;
  const n = p.ids.length;
  const readable = loaded?.people.length ?? n;
  return (
    <PhaseRun
      id="cmp-read"
      live={`Reading ${n} profiles`}
      done={`Compared ${readable} ${readable === 1 ? "person" : "people"}`}
      running={!loaded}
      steps={loaded ? [
        `Read ${loaded.people.length === 1 ? "a profile" : `${loaded.people.length} profiles`}`,
        loaded.source.criteria.length ? `Lined them up on ${loaded.source.name || "the campaign"}'s ${loaded.source.criteria.length} criteria` : "No shared campaign, so no criteria to line up on",
        ...(loaded.missing.length ? [`Couldn't read ${list(loaded.missing)}`] : []),
      ] : []}
      onGrow={ctx.onGrow}
    >
      {loaded && loaded.people.length < 2 ? (
        <p className="lv-note">I could only read {loaded.people.length === 1 ? `${called(loaded.people[0]!.name)}'s profile` : "none of the profiles"}, so there's nothing to line up yet.</p>
      ) : loaded ? (
        <Summary ctx={ctx} cardKey={card.key} people={loaded.people} source={loaded.source} />
      ) : null}
    </PhaseRun>
  );
}

function Summary({ ctx, cardKey, people, source }: { ctx: MomentCtx; cardKey: string; people: Loaded["people"]; source: Loaded["source"] }): JSX.Element {
  const [open, setOpen] = useState(false);
  /* The comparison opens by itself in the turn being answered, not every time a chat is reopened. */
  const fresh = useFresh({ key: cardKey }, ctx.said);
  const opened = useRef(false);
  const v = verdictForSource(people, source);
  const ids = people.map((x) => x.id);
  const judged = people.some((x) => source.meets[x.id]);
  const showFit = judged && source.criteria.length > 0;

  const auto = useCallback(() => {
    if (opened.current || !fresh) return;
    opened.current = true;
    window.setTimeout(() => setOpen(true), 500);
  }, [fresh]);
  useEffect(() => { auto(); }, [auto]);

  return (
    <>
      <section className="cs2" style={{ ["--n" as string]: people.length }} aria-label="Comparison summary">
        <div className="cs2-faces">
          {people.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 && <span className="cs2-vs">vs</span>}
              <button type="button" className={`cs2-face${p === v.lead ? " is-lead" : ""}`} onClick={() => ctx.openProfile(p.id, ids)}>
                <Avatar name={p.name} hue={p.hue} size={30} />
                <span>
                  <b>{called(p.name)}</b>
                  <small>{[p.totalYears ? `${p.totalYears} yrs` : "", p.jobs[0]?.org.name ?? p.current.name].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
            </Fragment>
          ))}
        </div>
        {showFit && (
          <div className="cs2-fit">
            {source.criteria.map((cr, i) => (
              <Fragment key={`${cr}${i}`}>
                <span className="cs2-k">{cr}</span>
                {people.map((p) => (
                  <span key={p.id} className="cs2-m">
                    {source.meets[p.id] ? <FitMark met={!!source.meets[p.id]?.[i]} label={cr} /> : <span className="cs2-none" role="img" aria-label={`Not judged: ${cr}`}>–</span>}
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
        )}
        <div className="cs2-foot">
          <span><Sparkle size={12} weight="fill" className="mo-spark" aria-hidden="true" />{v.line}</span>
          <button type="button" className="src-btn is-primary mo-small" onClick={() => setOpen(true)}>
            <ArrowsOutSimple size={13} weight="bold" aria-hidden="true" />Full comparison
          </button>
        </div>
      </section>
      <CompareDialog open={open} onClose={() => setOpen(false)} people={people} source={source} ctx={ctx} />
    </>
  );
}
