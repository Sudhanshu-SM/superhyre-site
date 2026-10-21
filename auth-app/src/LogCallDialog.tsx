import { useEffect, useMemo, useRef, useState } from "react";
import { listCandidates } from "./api/candidates";
import type { CandidateRow } from "./api/candidates";
import { LIVE } from "./api/client";
import { Shimmer, ShimmerRegion } from "./components/Shimmer";
import { emptyForm, LOG_OUTCOMES, MINUTES_MAX, NOTES_MAX, whenInput, whyNot } from "./logCallView";
import type { LogCallForm, PersonPick } from "./logCallView";
import { Dialog } from "./ui";
import "./roles.css";
import "./logCall.css";

/**
 * "Log a call": a call made from the person's own phone, written down by hand. Who it was with (searched among the
 * campaign's people on a campaign's page, among all their people on the Outreach page, or already known when it is
 * opened from a person's sheet), how it went, when (now unless they say), and optionally how long and a note. Saving
 * hands the form to the page, which shows the call at once and sends it; nothing is sent from here.
 */

export type CampaignRef = { id: string; name: string; client?: string | null };

export const personOfRow = (r: CandidateRow): PersonPick => ({
  id: r.id,
  name: r.fullName,
  title: r.currentTitle,
  company: r.currentCompanyName,
  campaigns: r.campaigns.map((c) => ({ id: c.id, name: c.name })),
});

const sub = (p: Pick<PersonPick, "title" | "company">): string => [p.title, p.company].filter(Boolean).join(" at ");

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

type Found = { phase: "loading" | "ready" | "failed"; rows: PersonPick[] };

/** The people a search finds: a campaign's own on its page, everyone's otherwise; a quiet shimmer while it looks. */
export function PersonSearch({ fixed, onPick }: { fixed?: CampaignRef | null | undefined; onPick: (p: PersonPick) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const [found, setFound] = useState<Found>({ phase: LIVE ? "loading" : "ready", rows: [] });
  const asked = useRef(0);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!LIVE) return;
    const mine = ++asked.current;
    setFound((f) => ({ phase: f.rows.length ? f.phase : "loading", rows: f.rows }));
    listCandidates({ ...(dq ? { q: dq } : {}), ...(fixed ? { campaignId: fixed.id } : {}), sort: "name", limit: 6 }).then(
      (got) => { if (mine === asked.current) setFound({ phase: "ready", rows: got.rows.map(personOfRow) }); },
      () => { if (mine === asked.current) setFound((f) => ({ phase: "failed", rows: f.rows })); },
    );
  }, [dq, fixed?.id, again]);
  return (
    <div className="lc-search">
      <input
        type="search"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={fixed ? "Search this campaign's people" : "Search your people by name"}
        aria-label="Who was the call with"
        autoComplete="off"
      />
      {found.phase === "loading" && found.rows.length === 0 && (
        <ShimmerRegion label="Looking for people" className="lc-people">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lc-person is-ghost"><Shimmer h={13} lh={20} w={110 + i * 22} /><Shimmer h={11} lh={18} w={150 - i * 20} /></div>
          ))}
        </ShimmerRegion>
      )}
      {found.phase === "failed" && found.rows.length === 0 && (
        <p className="t-body-sm lc-quiet" role="alert">
          People couldn't be loaded. <button type="button" className="kl-link" onClick={() => setAgain((n) => n + 1)}>Try again</button>
        </p>
      )}
      {found.phase === "ready" && found.rows.length === 0 && (
        <p className="t-body-sm lc-quiet">{dq ? "Nobody matches." : fixed ? "Nobody is on this campaign yet." : LIVE ? "No people yet." : "Search is available once you're signed in."}</p>
      )}
      {found.rows.length > 0 && (
        <ul className="lc-people" aria-label="People">
          {found.rows.map((p) => (
            <li key={p.id}>
              <button type="button" className="lc-person" onClick={() => onPick(p)}>
                <span className="lc-person-n kl-ell">{p.name}</span>
                {sub(p) && <span className="lc-person-s kl-ell">{sub(p)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The dialog's fields and buttons (exported so they can be read without a screen). */
export function LogCallFields({ person, fixed, onClose, onSave }: {
  person: PersonPick | null;
  fixed: CampaignRef | null | undefined;
  onClose: () => void;
  onSave: (f: LogCallForm) => void;
}) {
  const [form, setForm] = useState<LogCallForm>(() => emptyForm(person));
  const set = (patch: Partial<LogCallForm>) => setForm((f) => ({ ...f, ...patch }));
  const why = useMemo(() => whyNot(form), [form]);
  const known = person !== null;
  const choose = !fixed && (form.person?.campaigns.length ?? 0) > 1;
  return (
    <form
      className="rl-dlg lc"
      onSubmit={(e) => {
        e.preventDefault();
        if (why === null) onSave(form);
      }}
    >
      <header className="rl-dlg-h">
        <h2 className="t-title">Log a call</h2>
        <p className="t-body rl-dlg-b">{fixed ? `A call you made, for ${fixed.name}.` : "A call you made from your own phone."}</p>
      </header>
      <div className="lc-body">
        <section className="lc-field" aria-label="Who">
          <span className="t-label">Who was it with</span>
          {form.person ? (
            <div className="lc-chosen">
              <span className="lc-person-n kl-ell">{form.person.name}</span>
              {sub(form.person) && <span className="lc-person-s kl-ell">{sub(form.person)}</span>}
              {!known && <button type="button" className="kl-link" onClick={() => set({ person: null, campaignId: "" })}>Change</button>}
            </div>
          ) : (
            <PersonSearch fixed={fixed} onPick={(p) => set({ person: p, campaignId: "" })} />
          )}
        </section>

        {choose && form.person && (
          <label className="lc-field">
            <span className="t-label">Campaign</span>
            <select value={form.campaignId} onChange={(e) => set({ campaignId: e.target.value })} aria-label="Campaign">
              <option value="">Their latest campaign</option>
              {form.person.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <section className="lc-field" aria-label="How it went">
          <span className="t-label">How it went</span>
          <div className="lc-chips" role="radiogroup" aria-label="How it went">
            {LOG_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={form.outcome === o.value}
                className={`ct-btn${form.outcome === o.value ? " is-primary" : ""}`}
                onClick={() => set({ outcome: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <div className="lc-row">
          <label className="lc-field">
            <span className="t-label">When</span>
            <input type="datetime-local" value={form.when} max={whenInput()} onChange={(e) => set({ when: e.target.value })} aria-label="When" />
          </label>
          <label className="lc-field is-short">
            <span className="t-label">Minutes <span className="lc-quiet">(optional)</span></span>
            <input
              inputMode="numeric"
              value={form.minutes}
              maxLength={3}
              placeholder="Not sure"
              onChange={(e) => set({ minutes: e.target.value.replace(/\D/g, "").slice(0, String(MINUTES_MAX).length) })}
              aria-label="How long, in minutes"
            />
          </label>
        </div>

        <label className="lc-field">
          <span className="t-label">Note <span className="lc-quiet">(optional)</span></span>
          <textarea
            rows={3}
            value={form.notes}
            maxLength={NOTES_MAX}
            placeholder="What to remember about this call"
            onChange={(e) => set({ notes: e.target.value })}
            aria-label="Note for this call"
          />
        </label>
      </div>
      <footer className="rl-dlg-f">
        <span className="t-body-sm" aria-live="polite">{why && form.person ? why : ""}</span>
        <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="ct-btn is-primary" disabled={why !== null}>Save</button>
      </footer>
    </form>
  );
}

/**
 * `seed` is what opens it: null is closed; `person` is who the call was with when that is already known (a person's sheet).
 * Closing keeps nothing, and each opening starts from now.
 */
export function LogCallDialog({ seed, fixed, onClose, onSave }: {
  seed: { person: PersonPick | null; n: number } | null;
  /** A campaign's own page: its people, and the call is on it. */
  fixed?: CampaignRef | null | undefined;
  onClose: () => void;
  onSave: (f: LogCallForm) => void;
}) {
  return (
    <Dialog open={seed !== null} onClose={onClose} label="Log a call" size="md">
      {seed && <LogCallFields key={seed.n} person={seed.person} fixed={fixed} onClose={onClose} onSave={onSave} />}
    </Dialog>
  );
}
