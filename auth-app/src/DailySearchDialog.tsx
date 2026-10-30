import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { dailySearchApi } from "./api/dailySearch";
import type { DailyDetail, DailyRead, DailyRow, DailySearch, DailySuggestion, DailySuggestions, OtherSearch } from "./api/dailySearch";
import { messageOf } from "./api/client";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { controlAgent } from "./liveAgents";
import { watchesChanged } from "./liveChat";
import { saveDraft } from "./dailySearchSave";
import { campaignLink } from "./nav";
import { askToShow } from "./suggestNudge";
import { useToast } from "./toast";
import { Dialog, LoadFailed } from "./ui";
import {
  allSet,
  atLimit,
  changesOf,
  dayWords,
  draftOf,
  firstLooksWords,
  hasSuggestions,
  heldWords,
  isPicked,
  matches,
  morningLine,
  otherLine,
  overLimit,
  perCampaignMaxOf,
  pickedCount,
  pickedWords,
  rowAction,
  rowText,
  runAtWords,
  scoreLines,
  SEARCH_ABOVE,
  spendWords,
  splitRows,
  startingNow,
  suggestionWhere,
  toggled,
  validClock,
  validPerCampaign,
  whenWords,
} from "./dailySearchView";
import type { Draft } from "./dailySearchView";
import "./roles.css";
import "./dailySearch.css";

/**
 * The Daily search, in a popup the Campaigns page's Daily search button (and the bell's row about it, and the rail's row) opens: whether it
 * is on, the morning it looks, the campaigns it holds as a list to tick (a search box above eight), the ones that cannot be searched yet
 * with why and a way to their requirements, the last mornings, and for an owner or admin the searches other people have. Save is the
 * person's yes to what it will search every morning; pausing is not asked, it only spends less. Built on the Requirements dialog's own
 * anatomy (.rl-dlg), with the recruiter list's rows (AssignDialog). Nothing is drawn as a badge or a dot: how a campaign stands is muted
 * words under its name. Nothing is read from the server until someone opens it.
 *
 * Under the last mornings sit the changes the search suggests (one row for each campaign, with a "Show me" that puts it in the chat as a
 * card to press, as the Sourced page's nudge does) and the scoreboard of how the suggestions have done, two plain lines of counts. They
 * are drawn only while the server has the suggestions on and has something to say: otherwise nothing, not even a frame. Two campaigns of one
 * name are told apart there by client and city. After a Save that left ready campaigns out (past the most one search holds), one plain line
 * says how many, in the foot beside Save where the person is looking. The popup then stays with nothing more to save (the campaigns left out
 * say they are over the limit, and the foot says Close), and the line goes as soon as a tick or the morning is changed.
 */

type ViewProps = {
  search: DailySearch | null;
  detail: DailyDetail;
  draft: Draft;
  q: string;
  /** What is on its way: "save", "switch", or the id of the campaign's watch or the search that a button was pressed on. */
  busy: string;
  /** Why the last change was not done, in the server's words. */
  problem: string;
  others: readonly OtherSearch[];
  /** The changes the search suggests and how they have done; null (or off) draws nothing. */
  suggestions?: DailySuggestions | null;
  /** The line after a Save that left campaigns out; empty when it left none. */
  held?: string;
  now?: number;
  onDraft: (draft: Draft) => void;
  onQuery: (q: string) => void;
  onSwitch: () => void;
  onRow: (row: DailyRow, action: "pause" | "resume") => void;
  onOther: (search: OtherSearch, action: "pause" | "resume") => void;
  /** "Show me" on a suggestion: the popup is put away and the agent shows the change as a card. */
  onShow?: (suggestion: DailySuggestion) => void;
  onSave: () => void;
  onClose: () => void;
};

/** The popup's content for a search that is loaded. Pure: the stateful panel below holds what is typed and what is busy. */
export function DailySearchView({ search, detail, draft, q, busy, problem, others, suggestions, held, now, onDraft, onQuery, onSwitch, onRow, onOther, onShow, onSave, onClose }: ViewProps): JSX.Element {
  const live = search !== null && search.status !== "off";
  const { main, blocked } = splitRows(detail.campaigns);
  const ids = main.map((r) => r.id);
  const shown = main.filter((r) => matches(r, q));
  const n = pickedCount(draft.sel, ids);
  const cap = detail.defaults.maxCampaigns;
  const change = changesOf(search, draft, detail.campaigns, cap);
  const roomOk =
    draft.reserve >= 0 && draft.reserve <= 400 && draft.waitingCap >= 1 && draft.waitingCap <= 100 && validPerCampaign(draft.perCampaign, perCampaignMaxOf(detail.defaults.perCampaignMax));
  // What Save spends: said beside it, because Save is the yes.
  const canSave = busy === "" && n > 0 && !overLimit(draft.sel, n, cap) && roomOk && validClock(draft.runAt) !== null && change.any;
  const searchStatus = search?.status ?? null;
  // A search that holds the most it may has no room for a ticked campaign that is ready: its row says so, not that it starts when saved.
  const full = atLimit(search, cap);
  // What Save would spend is said from what is typed, so the sentence moves with the number.
  const perCampaign = draft.perCampaign;
  const firstLooks = firstLooksWords(startingNow(search, draft.sel, detail.campaigns, cap), { perCampaign, reserve: draft.reserve, profilesLeft: detail.room.profilesLeft });
  const running = (search?.campaigns ?? []).filter((c) => c.state === "running");
  const next = whenWords(
    running
      .map((c) => c.nextRunAt)
      .filter((t): t is string => t !== null)
      .sort()[0],
    now,
  );
  return (
    <form className="rl-dlg ds" onSubmit={(e) => { e.preventDefault(); if (canSave) onSave(); }}>
      <header className="rl-dlg-h">
        <h2 className="t-title">Daily search</h2>
        <p className="t-body rl-dlg-b">Each morning the agent looks for new people on the campaigns you pick. It contacts nobody and shortlists nobody.</p>
      </header>
      <div className="ds-body">
        {problem && <p className="rl-dlg-err t-body" role="alert">{problem}</p>}

        {live && search && (
          <button type="button" role="switch" aria-checked={search.status === "on"} className={`ncx-toggle${search.status === "on" ? " is-on" : ""}`} disabled={busy !== ""} aria-busy={busy === "switch" || undefined} onClick={onSwitch}>
            <span className="ncx-toggle-t">
              <strong className="t-body-strong">{search.status === "on" ? "On" : "Paused"}</strong>
              <span className="t-body-sm">
                {search.status === "on"
                  ? next ? `Next look ${next}.` : `It looks every morning at ${runAtWords(search.runAt)}.`
                  : `Nothing is searched until you turn it on.${search.pausedUntil ? ` It turns on again ${whenWords(search.pausedUntil, now)}.` : ""}`}
              </span>
            </span>
            <span className="ncx-switch" aria-hidden="true"><span /></span>
          </button>
        )}

        <section className="ds-sec" aria-label="Each morning">
          <h3 className="ds-h t-body-strong">Each morning</h3>
          <div className="ds-when">
            <label className="ds-field">
              <span className="t-body-sm">Time</span>
              <input className="ncx-in" type="time" value={draft.runAt} required onChange={(e) => onDraft({ ...draft, runAt: e.target.value })} />
            </label>
            <label className="ds-field">
              <span className="t-body-sm">Days</span>
              <select className="ncx-in" value={draft.repeat} onChange={(e) => onDraft({ ...draft, repeat: e.target.value === "weekdays" ? "weekdays" : "daily" })}>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays only</option>
              </select>
            </label>
            <label className="ds-field">
              <span className="t-body-sm">New people on each campaign (up to {perCampaignMaxOf(detail.defaults.perCampaignMax)})</span>
              <input className="ncx-in ds-num" type="number" inputMode="numeric" min={1} max={perCampaignMaxOf(detail.defaults.perCampaignMax)} value={draft.perCampaign} onChange={(e) => onDraft({ ...draft, perCampaign: Number(e.target.value) })} />
            </label>
          </div>
          <details className="ds-more">
            <summary className="t-body-sm">How much it takes</summary>
            <p className="ds-sentence t-body">
              <span>Leave</span>
              <input className="ncx-in ds-num" type="number" inputMode="numeric" min={0} max={400} value={draft.reserve} aria-label="Profiles a day left for your own searches" onChange={(e) => onDraft({ ...draft, reserve: Number(e.target.value) })} />
              <span>of each day's searches for yours.</span>
            </p>
            <p className="ds-sentence t-body">
              <span>Let a campaign rest when</span>
              <input className="ncx-in ds-num" type="number" inputMode="numeric" min={1} max={100} value={draft.waitingCap} aria-label="People waiting for you before a campaign rests" onChange={(e) => onDraft({ ...draft, waitingCap: Number(e.target.value) })} />
              <span>people are waiting for you.</span>
            </p>
          </details>
        </section>

        <section className="ds-sec" aria-label="Campaigns">
          <h3 className="ds-h t-body-strong">Campaigns</h3>
          {main.length > SEARCH_ABOVE && (
            <label className="ds-find">
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" spellCheck={false} />
            </label>
          )}
          {main.length === 0 ? (
            <p className="ds-none t-body">No campaign is ready to search yet. A campaign is ready once its requirements are approved.</p>
          ) : (
            <ul className="rl-pick ds-pick" role="group" aria-label="Campaigns">
              <li className="ds-item">
                <label className={`rl-pick-i${draft.sel.all ? " is-on" : ""}`}>
                  <input type="checkbox" checked={draft.sel.all} onChange={() => onDraft({ ...draft, sel: allSet(draft.sel, !draft.sel.all, ids) })} />
                  <span className="rl-pick-t">
                    <b className="t-body-strong">All open campaigns</b>
                    <small className="t-body-sm">Every campaign that can be searched now. One whose requirements are approved later joins when you save again.</small>
                  </span>
                  <span className="rl-box" aria-hidden="true">{draft.sel.all && <Check size={12} weight="bold" />}</span>
                </label>
              </li>
              {shown.map((row) => {
                const on = isPicked(draft.sel, row.id);
                const text = rowText(row, now === undefined ? { picked: on, searchStatus, over: full } : { picked: on, searchStatus, over: full, now });
                const act = rowAction(row, searchStatus);
                return (
                  <li key={row.id} className="ds-item">
                    <label className={`rl-pick-i${on ? " is-on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => onDraft({ ...draft, sel: toggled(draft.sel, row.id) })} />
                      <span className="rl-pick-t">
                        <b className="t-body-strong">{row.name}</b>
                        {text.line && <small className="t-body-sm">{text.line}</small>}
                        {text.note && <small className="t-body-sm">{text.note}</small>}
                      </span>
                      <span className="rl-box" aria-hidden="true">{on && <Check size={12} weight="bold" />}</span>
                    </label>
                    {row.watch && act && (
                      <button type="button" className="hp-link ds-act" disabled={busy !== ""} aria-label={`${act === "pause" ? "Pause" : "Resume"} ${row.name}`} onClick={() => onRow(row, act)}>
                        {act === "pause" ? "Pause" : "Resume"}
                      </button>
                    )}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="ds-none t-body-sm">No campaign matches that.</li>}
            </ul>
          )}
        </section>

        {blocked.length > 0 && (
          <details className="ds-blocked">
            <summary className="t-body-strong">Can't be searched yet <span className="ds-n t-body-sm">{blocked.length}</span></summary>
            {detail.drafts && <p className="ds-note t-body-sm">{detail.drafts}</p>}
            <ul className="ds-off">
              {blocked.map((row) => (
                <li key={row.id} className="ds-off-i">
                  <span className="rl-pick-t">
                    <b className="t-body-strong">{row.name}</b>
                    <small className="t-body-sm">{[[row.clientName, row.city].filter(Boolean).join(", "), row.why].filter(Boolean).join(" · ")}</small>
                  </span>
                  {(row.blocked === "needs_approval" || row.blocked === "no_requirements" || row.blocked === "needs_city") && (
                    <a className="hp-link ds-act" href={campaignLink(row.id)} onClick={onClose}>Requirements</a>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {detail.mornings.length > 0 && (
          <section className="ds-sec" aria-label="Last mornings">
            <h3 className="ds-h t-body-strong">Last mornings</h3>
            <ul className="ds-days">
              {detail.mornings.map((m) => (
                <li key={m.day} className="ds-day">
                  <span className="t-body">{now === undefined ? dayWords(m.day) : dayWords(m.day, now)}</span>
                  <span className="t-body-sm">{morningLine(m)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasSuggestions(suggestions) && (
          <section className="ds-sec" aria-label="Suggested changes">
            <h3 className="ds-h t-body-strong">Suggested changes</h3>
            {suggestions.waiting.length > 0 && (
              <ul className="ds-off">
                {suggestions.waiting.map((s) => {
                  // Two campaigns of one name are told apart by their client and city, as the list above does.
                  const where = suggestionWhere(s.campaignId, detail.campaigns);
                  return (
                    <li key={s.id} className="ds-off-i">
                      <span className="rl-pick-t">
                        <b className="t-body-strong">{s.campaign}</b>
                        {where && <small className="t-body-sm">{where}</small>}
                        <small className="t-body-sm">{s.headline}</small>
                        <small className="t-body-sm">{s.why}</small>
                      </span>
                      {onShow && (
                        <button type="button" className="hp-link ds-act" aria-label={`Show me the change suggested for ${s.campaign}${where ? ` (${where})` : ""}`} onClick={() => onShow(s)}>Show me</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {suggestions.scoreboard && suggestions.scoreboard.suggested > 0 && (
              <ul className="ds-days ds-score">
                {scoreLines(suggestions.scoreboard).map((l) => (
                  <li key={l.label} className="ds-day">
                    <span className="t-body">{l.label}</span>
                    <span className="t-body-sm">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section className="ds-sec" aria-label="Other people's daily searches">
            <h3 className="ds-h t-body-strong">Other people's daily searches</h3>
            <ul className="ds-off">
              {others.map((o) => (
                <li key={o.id} className="ds-off-i">
                  <span className="rl-pick-t">
                    <b className="t-body-strong">{o.owner}</b>
                    <small className="t-body-sm">{otherLine(o, now)}</small>
                  </span>
                  <button type="button" className="hp-link ds-act" disabled={busy !== ""} aria-label={`${o.status === "on" ? "Pause" : "Resume"} ${o.owner}'s daily search`} aria-busy={busy === o.id || undefined} onClick={() => onOther(o, o.status === "on" ? "pause" : "resume")}>
                    {o.status === "on" ? "Pause" : "Resume"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="rl-dlg-f">
        <p className="t-body-sm">
          {pickedWords(draft.sel.all, n, cap)}
          {held && <span className="ds-spend" role="status">{held}</span>}
          {n > 0 && <span className="ds-spend">{spendWords(Math.min(n, cap), { perCampaign, creditsPerProfile: detail.defaults.creditsPerProfile, reserve: draft.reserve, repeat: draft.repeat })}</span>}
          {firstLooks && <span className="ds-spend">{firstLooks}</span>}
        </p>
        {/* After a Save that left campaigns out the popup stays: what was asked is saved, so there is nothing to cancel. */}
        <button type="button" className="ct-btn" onClick={onClose}>{held ? "Close" : "Cancel"}</button>
        <button type="submit" className="ct-btn is-primary" disabled={!canSave} aria-busy={busy === "save" || undefined}>
          {live ? "Save" : "Start"}
        </button>
      </footer>
    </form>
  );
}

/** The popup's content while the search is on its way: the real title, and the room the lists will fill. */
export function DailySearchWait({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg ds">
      <header className="rl-dlg-h">
        <h2 className="t-title">Daily search</h2>
      </header>
      <ShimmerRegion label="Reading the daily search" className="ds-body">
        <ShimmerText lines={6} h={14} gap={10} />
      </ShimmerRegion>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" autoFocus onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** The popup when the search could not be read, or the server has it switched off. */
export function DailySearchFailed({ off, onRetry, onClose }: { off: boolean; onRetry: () => void; onClose: () => void }): JSX.Element {
  return (
    <div className="rl-dlg ds">
      <header className="rl-dlg-h">
        <h2 className="t-title">Daily search</h2>
      </header>
      <div className="ds-body">
        {off ? <p className="t-body rl-dlg-b">The daily search isn't switched on yet.</p> : <LoadFailed what="The daily search" compact onRetry={onRetry} />}
      </div>
      <footer className="rl-dlg-f">
        <span />
        <button type="button" className="ct-btn" onClick={onClose}>Close</button>
      </footer>
    </div>
  );
}

/** What the popup holds while it is open: the search, read when it opens, and the changes a person makes to it. */
export function DailySearchPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [read, setRead] = useState<DailyRead | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [others, setOthers] = useState<readonly OtherSearch[]>([]);
  const [suggestions, setSuggestions] = useState<DailySuggestions | null>(null);
  const [held, setHeld] = useState("");
  const [again, setAgain] = useState(0);
  const toast = useToast();

  /* `keep`: what was typed stays (a pause or a resume changes the search's state, not the ticks a person is part-way through). */
  const load = useCallback(async (keep: boolean) => {
    try {
      const r = await dailySearchApi.read();
      setRead(r);
      setFailed(false);
      if (r.detail && !keep) setDraft(draftOf(r.search, r.detail.defaults));
      if (r.detail?.admin) void dailySearchApi.others().then((o) => setOthers(o.searches)).catch(() => undefined);
      // The suggestions are a quiet extra: one that cannot be read, or is off, leaves nothing drawn and no complaint.
      if (r.detail) void dailySearchApi.suggestions().then(setSuggestions).catch(() => setSuggestions(null));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(false); }, [load, again]);

  /* One change at a time: the buttons wait, and a refusal is said in the server's words where the person is looking. */
  const run = async (key: string, work: () => Promise<string | void>, closes = false) => {
    setBusy(key);
    setProblem("");
    let done = false;
    try {
      const said = await work();
      watchesChanged();
      if (said) toast(said);
      done = true;
    } catch (err) {
      setProblem(messageOf(err));
    }
    setBusy("");
    // The popup closes after a save; otherwise (or when it did not go through) it reads again, keeping what was typed.
    if (!(closes && done)) void load(true);
    return done;
  };

  if (!read || !read.detail || !draft) {
    return failed || (read && (!read.on || !read.detail)) ? <DailySearchFailed off={Boolean(read && !read.on)} onRetry={() => setAgain((n) => n + 1)} onClose={onClose} /> : <DailySearchWait onClose={onClose} />;
  }
  const { search, detail } = read;
  const save = async () => {
    if (!validClock(draft.runAt)) { setProblem("Say the time as a clock time, like 7:00 am."); return; }
    setHeld("");
    let left = 0;
    const done = await run("save", async () => {
      const out = await saveDraft(search, draft, detail.campaigns, dailySearchApi, detail.defaults.maxCampaigns);
      left = out.held;
      return out.how === "started" ? "Daily search started" : "Daily search saved";
    }, true);
    if (!done) return;
    // Campaigns the search could not hold are said where the person is still looking: the popup stays, read again as it now stands.
    if (left > 0) { setHeld(heldWords(left, detail.defaults.maxCampaigns)); void load(false); } else onClose();
  };
  return (
    <DailySearchView
      search={search}
      detail={detail}
      draft={draft}
      q={q}
      busy={busy}
      problem={problem}
      others={others}
      suggestions={suggestions}
      held={held}
      // A tick or a change of the morning asks for something else: the line about what the last Save left out is not about that.
      onDraft={(next) => { setDraft(next); setHeld(""); }}
      onQuery={setQ}
      onSwitch={() => void run("switch", async () => {
        if (search?.status === "on") { await dailySearchApi.pause(); return "Daily search paused"; }
        await dailySearchApi.resume();
        return "Daily search is on again";
      })}
      onRow={(row, action) => void run(row.watch?.agentId ?? row.id, async () => {
        if (!row.watch) return;
        await controlAgent(row.watch.agentId, action);
        return action === "pause" ? `Paused ${row.name}` : `Resumed ${row.name}`;
      })}
      onOther={(o, action) => void run(o.id, async () => {
        await dailySearchApi.steer(o.id, action);
        const list = await dailySearchApi.others();
        setOthers(list.searches);
        return action === "pause" ? `Paused ${o.owner}'s daily search` : `Put ${o.owner}'s daily search back on`;
      })}
      onShow={(s) => { onClose(); askToShow({ campaignId: s.campaignId, campaignName: s.campaign }); }}
      onSave={() => void save()}
      onClose={onClose}
    />
  );
}

/** The popup: read the daily search, and let a person change it. */
export function DailySearchDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} label="Daily search" size="md">
      <DailySearchPanel onClose={onClose} />
    </Dialog>
  );
}
