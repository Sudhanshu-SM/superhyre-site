import { Check } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { Match, MatchList, RoleSpec } from "../api/agent";
import { agentApi, specApi } from "../api/agent";
import { api } from "../api/client";
import { useMayChangeCampaign } from "../campaignRights";
import { PhaseSummary } from "../agentCards/PhaseTimeline";
import { lineNote, verdictOf } from "../agentPhases";
import { ThinkingFeed } from "../agentCards/ThinkingFeed";
import { vendorWords } from "../displayText";
import { setFromMatches } from "../liveCandidate";
import { getSet, putSet } from "../liveCandidates";
import { onInvalidate } from "../invalidate";
import { findMore } from "../liveChat";
import type { Search } from "../liveChat";
import { bucketsLine, bucketsOfRows } from "../agentCards/specView";
import type { Candidate } from "../sourcing";
import { closeVerdict, liveStages, mergeSet, mustHaveCount, resultsCopy, runStateOfSearch, unscoredIds, unscoredIn } from "../liveSourcing";
import { Results } from "../Sourcing";
import { Stages } from "../Stages";
import { PREVIEW_COUNT } from "../sourcing";
import { useLiveMoment } from "./LiveMoment";

/**
 * A search the chat started (a message, a press on "Find more", approving the role spec, "Score them
 * again"), drawn with the pieces the console built for sourcing and not as a bare list:
 *
 *   while it works   the run's own phases, and under the matching line the lines that say what it is doing
 *                    right now; the people as soon as they are found, in the order the checks that need no
 *                    model give, and with their fit as each group is scored
 *   when it is done  the way the search went, folded; the three best fits as cards (one line on why, a fit
 *                    mark for each thing the role asks for, Shortlist and Reject), the way into the whole
 *                    ranked list, and another search when there is one
 *
 * The cards are `Sourcing.tsx`'s own `Results`, the list is `RankedMatches`, and the people are registered
 * where the profile sheet and the comparison read them, so a person opened here is the same person there.
 */

/** "32 found, 10 scored so far": what the search stands at, from the same list it draws. */
export function searchCount(found: number, scored: number, running: boolean): string {
  if (!found) return "";
  const people = `${found} ${found === 1 ? "person" : "people"} found`;
  if (scored > 0) return `${people}, ${scored} scored${running ? " so far" : ""}`;
  return running ? `${people}, scoring now` : people;
}

/** The line over the cards: what is true of them right now. */
export function searchSub(i: { running: boolean; unscored: number; scored: number }): string | null {
  if (i.running) {
    return i.scored > 0
      ? "Best fits first. Scores arrive as each group is read."
      : "Ordered by skills, years and place for now. Scores arrive as each group is read.";
  }
  /* Done: how many were scored, and the order of the rest, is the closing line's to say (once), not this one's. */
  return null;
}

const NO_MATCHES: readonly Match[] = [];
/** While scoring is catching up after a search, the list is read again this often, this many times. */
const CATCH_UP_EVERY_MS = 8_000;
const CATCH_UP_TRIES = 15;

/** Matched closely: scored into a tier. Someone who needs more evidence, is not scored yet or is ruled out is not a best fit. */
const isMatched = (c: Candidate): boolean =>
  c.result ? c.result.status !== "knocked_out" && c.result.tier !== null : c.scored === true;

export function SearchRun({ turnKey, search, latest, onAsk, onFindMore }: {
  turnKey: string;
  search: Search;
  latest: boolean;
  /** A press that acts on the person's behalf (score them again): its words, and the button's label. */
  onAsk?: (text: string, label: string) => void;
  /** Another search for this campaign, started by whatever holds this list (a card outside a chat turn). */
  onFindMore?: () => Promise<void>;
}): JSX.Element {
  const ctx = useLiveMoment();
  const [next, setNext] = useState<{ size: number; exhausted: boolean } | null>(null);
  const [finding, setFinding] = useState(false);
  const [spec, setSpec] = useState<RoleSpec | null>(null);
  const [whole, setWhole] = useState<MatchList | null>(null);
  /* Searching again, and ranking again, are the campaign's own people's: someone who only follows it sees the result. */
  const may = useMayChangeCampaign(search.campaignId);
  const running = search.status === "running";
  const failed = search.status === "failed";

  /* What the role asks for, once: the fit marks on the cards are the spec's own strongest requirements. */
  useEffect(() => {
    let live = true;
    specApi.get(search.campaignId).then((s) => live && setSpec(s.approved?.spec ?? null)).catch(() => {});
    return () => {
      live = false;
    };
  }, [search.campaignId]);

  /* Something was written about people (a shortlist or a rejection made in another card, or by the agent): the list is read again. */
  const [wrote, setWrote] = useState(0);
  useEffect(() => onInvalidate((effects, campaigns) => {
    if ((effects.has("pipeline") || effects.has("candidates")) && (campaigns.has(null) || campaigns.has(search.campaignId))) setWrote((n) => n + 1);
  }), [search.campaignId]);

  /* When it is done: what another search would ask for, and the campaign's whole ranked list, so "See all"
     opens everyone ranked and not only this search's people. */
  useEffect(() => {
    if (search.status !== "done") return;
    let live = true;
    agentApi.sourcing(search.campaignId).then((s) => live && setNext({ size: s.nextSize, exhausted: s.exhausted })).catch(() => {});
    api<MatchList>("GET", `/v1/campaigns/${search.campaignId}/matches`).then((m) => live && setWhole(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [search.status, search.campaignId, wrote]);

  /* The model may still be reading when the search says scoring is catching up: what it answers after the run
     has ended is saved on the server, so the campaign's list is read again now and then, for a couple of
     minutes, and the cards fill in without anyone pressing anything. */
  const catchingUp = search.status === "done" && Boolean(search.rescore);
  useEffect(() => {
    if (!catchingUp) return;
    let live = true;
    let tries = 0;
    const t = window.setInterval(() => {
      if (++tries > CATCH_UP_TRIES) return window.clearInterval(t);
      api<MatchList>("GET", `/v1/campaigns/${search.campaignId}/matches`).then((m) => live && setWhole(m)).catch(() => {});
    }, CATCH_UP_EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [catchingUp, search.campaignId]);

  const items: readonly Match[] = whole && !running ? whole.rows : (search.items ?? NO_MATCHES);
  const decided = whole && !running ? (whole.decided ?? NO_MATCHES) : NO_MATCHES;
  const set = useMemo(
    () => (items.length ? setFromMatches(search.campaignId, items, spec, new Date(), decided) : null),
    [search.campaignId, items, spec, decided],
  );
  /* Registered where the ranked list, the profile sheet and shortlisting read it. */
  useEffect(() => {
    if (set) putSet(mergeSet(getSet(search.campaignId), set));
  }, [set, search.campaignId]);

  const busy = running;
  const grew = `${items.length}:${search.phases.length}:${search.feed?.length ?? 0}:${search.status}`;
  useEffect(() => {
    ctx?.onBusy(busy);
    return () => ctx?.onBusy(false);
  }, [busy, ctx]);
  useEffect(() => {
    ctx?.onGrow();
  }, [grew, ctx]);

  if (failed) return <p className="lt-note">{search.error ?? "The search didn't finish."}</p>;

  /* This search's people, each as the server has them now (a verdict that came after the run is in it). */
  const nowById = new Map((whole?.rows ?? []).map((m) => [m.personId, m]));
  const shown = (search.items ?? []).map((m) => nowById.get(m.personId) ?? m).filter((m) => !m.knockedOut);
  /* Counted once, by the same function the role spec card uses: found, matched closely, needs more evidence, not scored. */
  const counts = bucketsOfRows(shown);
  const scored = counts.strong + counts.good + counts.partial;
  const waiting = counts.notScored;
  /* The closing line agrees with the count above the cards: "Scored 4 of 20", and what order the rest are in. */
  const lines = running ? search.phases : closeVerdict(search.phases, shown.length, scored);
  const said = verdictOf(lines);
  /* The closing line is that same function's, so it never disagrees with the card above or the list below. */
  const closing = !running && counts.found > 0 ? bucketsLine(counts) : null;
  const verdict = closing ? ({ id: said?.id ?? "closing", phase: "decide", state: "done", label: closing, seq: said?.seq ?? 0 } as const) : said;
  const verdictId = said?.id;
  const rest = verdictId ? lines.filter((l) => l.id !== verdictId) : lines;
  const partlyScored = scored > 0 && waiting > 0;
  /* Nobody left to catch up on: the note about it, and the press, are no longer true. */
  const settled = catchingUp && whole !== null && waiting === 0;
  /* Scores still on their way: a person without one shows where it will appear, instead of an empty card. */
  const arriving = running || (catchingUp && !settled);
  /* The best fits are the people who were matched; someone who needs more evidence, or isn't scored, is in the whole list. */
  const undecided = set?.candidates.filter((c) => !set.decisions?.[c.id]) ?? [];
  const matched = undecided.filter(isMatched);
  const best = (running || matched.length === 0 ? undecided : matched).slice(0, PREVIEW_COUNT);
  const copy = resultsCopy({
    shown: best.length, total: set?.total ?? 0, unscored: running ? 0 : unscoredIn(items, PREVIEW_COUNT), found: shown.length,
  });
  /* Nobody is scored yet: these are first in the list by skills, years and place, not "the best fits". */
  /* One header over the list: how many were found while scoring goes on, "Top matches" once they are scored. */
  const title = running || scored === 0 ? `${shown.length.toLocaleString("en-IN")} found` : "Top matches";
  const count = best.length < shown.length ? `${best.length} shown` : "";
  const subline = running || arriving ? "Scoring now. People move into place as each group is read." : copy.sub;
  const more = !running && may && next && latest && !next.exhausted && next.size > 0
    ? { label: `Find ${next.size} more`, busy: finding, onClick: () => {
        setFinding(true);
        void (onFindMore ? onFindMore() : findMore(turnKey, search.campaignId)).finally(() => setFinding(false));
      } }
    : null;

  /* The owner's goal tracker, from this search's own counts: found, scored of N, the best picked. */
  const track = liveStages({
    readDone: search.pool !== null || search.phases.length > 0,
    buildDone: search.pool !== null,
    searched: false,
    run: runStateOfSearch(search),
    found: shown.length,
    ranked: set?.total ?? shown.length,
    criteria: spec ? mustHaveCount(spec) : (set?.criteria.length ?? 0),
    preview: best.map((c) => c.id),
    verdicts: ctx?.verdicts ?? {},
  });

  return (
    <section className="lt-search src" aria-label="People found">
      <Stages goal={spec ? `Shortlist ${spec.title}` : "Shortlist the best fits"} {...track} />
      {/* The goal card above is the one place the steps and their counts are drawn; only what the search is doing right
          now, as lines that rise and fade, goes under it. */}
      {running && search.feed && search.feed.length > 0 && <ThinkingFeed lines={search.feed} />}
      {!running && rest.length > 0 && <PhaseSummary lines={rest} label="How the search went" />}
      {/* The last thing it said stays on screen: the lines fold away, "Ready for your call" is the outcome. */}
      {!running && verdict && (
        <p className="pt-verdict" role="status">
          <Check size={13} weight="bold" aria-hidden="true" />
          <span>{verdict.label}</span>
          {lineNote(verdict) && <span className="pt-note">{lineNote(verdict)}</span>}
        </p>
      )}
      {/* The note that scoring is catching up says what the closing line says once some are scored: not twice. */}
      {!settled && search.notices.filter((n) => !(partlyScored && /^scoring is catching up/i.test(n.trim()))).map((n) => (
        <p key={n} className="lt-note">{vendorWords(n)}</p>
      ))}
      {/* People nobody could score are said once, by the note: a press scores them. It is the same words the
          person could type. */}
      {!running && !settled && may && search.rescore && onAsk && (
        <button type="button" className="rep-opt" onClick={() => onAsk(search.rescore?.text ?? "", partlyScored ? "Score the rest" : "Score them again")}>{partlyScored ? "Score the rest" : "Score them again"}</button>
      )}
      {/* A city search that came back short asks what to do next: each button is the sentence the person could type. */}
      {!running && may && onAsk && search.choices && search.choices.length > 0 && (
        <div className="lt-choices" role="group" aria-label="What next">
          {search.choices.map((c) => (
            <button key={c.label} type="button" className="rep-opt" onClick={() => onAsk(c.text, c.label)}>{c.label}</button>
          ))}
        </div>
      )}
      {set && best.length > 0 && (
        <Results
          key="results"
          verdicts={ctx?.verdicts ?? {}}
          onVerdict={(id, v) => ctx?.onVerdict(id, v)}
          onOpenProfile={(id) => ctx?.openProfile(id, set.candidates.map((c) => c.id))}
          onOpenList={() => ctx?.openList(search.campaignId)}
          data={{
            candidates: best,
            unscored: unscoredIds(items),
            reasons: set.reasons,
            criteria: set.criteria.map((c) => c.text),
            short: set.criteria.map((c) => c.short),
            ...copy,
            title,
            count,
            sub: subline,
            scoring: arriving,
            more,
          }}
        />
      )}
      {!running && shown.length === 0 && <p className="lt-note">Nobody new matched this time.</p>}
      {/* Through everyone it can reach: said as a result. When the search offered what to do next, those buttons above are the
          answer; without them this is the whole of it, and it never tells the person to come back and ask later. */}
      {!running && may && next && latest && (next.exhausted || next.size === 0) && !(search.choices && search.choices.length > 0) && (
        <p className="lt-note">That's everyone I can find for these filters right now.</p>
      )}
    </section>
  );
}
