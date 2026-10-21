import {
  ArrowUpRight, CaretLeft, CaretRight, GithubLogo, LinkedinLogo, MapPin, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CandidateDetail } from "./api/candidates";
import { getCandidate } from "./api/candidates";
import { LIVE } from "./api/client";
import { Avatar, Career, FitRow, Logo, Summary, Verdicts } from "./CandidateBits";
import { MatchResult } from "./MatchResult";
import { ShimmerRegion, ShimmerText } from "./components/Shimmer";
import { useFullCandidate } from "./profileLoad";
import { openerNow, restoreFocus, trapTab } from "./components/focusTrap";
import { ContactSideLine } from "./ContactsFetch";
import { ContactEditable } from "./ContactEditable";
import { useContacts } from "./contactsFetch";
import { plainText } from "./displayText";
import { isStandardName } from "./boardStages";
import { statusKey } from "./chatCards";
import { statusProps } from "./statusTones";
import type { Candidate, Job, Verdict } from "./sourcing";

/**
 * ProfileSidebar — one candidate's full profile, in a sheet on the right.
 *
 * Standalone on purpose: it knows nothing about where it was opened from.
 * The transcript opens it over a scrim; the ranked list opens it BESIDE
 * itself with no scrim of its own, so both stay usable; any other page that
 * has a candidate can open it the same way. Whoever opens it owns the list
 * the arrows walk, by passing `onPrev` / `onNext` and a `position`.
 */

export type ProfileSidebarProps = {
  /** The candidate to show, or null for closed. */
  candidate: Candidate | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** "3 of 12" beside the arrows. Omitted when there is no list to walk. */
  position?: { index: number; total: number };
  verdict?: Verdict;
  onVerdict: (id: string, v: Verdict | null) => void;
  /** Dim and block the page behind. Off when the opener stays interactive. */
  scrim?: boolean;
  /** What this person was ranked on, when it isn't the demo's three. */
  criteria?: { text: readonly string[]; short: readonly string[] };
  /** False for someone who belongs to no campaign here, where shortlisting and passing have no meaning. */
  canDecide?: boolean;
  /** What the opener adds under the header's actions (a campaign page puts the person's stage there). */
  extra?: React.ReactNode;
  /** The campaign the opener knows the person is in: their match on it is read and shown as the Match tab. */
  campaignId?: string | null;
  /** Changes when the person was moved from outside (the board): their places on campaigns are read again, so the Status row never lags. */
  refresh?: number;
};

const EXIT_MS = 240;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGE_LABEL: Readonly<Record<string, string>> = {
  shortlisted: "Shortlisted", outreach: "In outreach", replied: "Replied", interviewing: "Interviewing", hired: "Hired", passed: "Rejected",
};

/**
 * What a person's place on a campaign says: the console's word for the default stages ("Interviewing"), and the
 * campaign's own name for a stage it made ("In Client review"), which the kind-word would otherwise misname.
 */
export function placeOf(x: { stage: string; step?: string | null; stageName?: string | null }): { word: string; tone: string; own: boolean } {
  const tone = STAGE_LABEL[statusKey(x.stage, x.step)] ?? x.stage;
  const name = x.stageName?.trim();
  if (name && (x.stage === "shortlisted" || x.stage === "outreach" || x.stage === "interviewing") && !isStandardName(x.stage, name)) {
    return { word: `In ${name}`, tone, own: true };
  }
  return { word: tone, tone, own: false };
}

/**
 * With the API, a candidate already in the workspace also has its own row:
 * the contacts this workspace holds, where they are in each campaign, and
 * the team's notes. Anyone else (a match not saved yet) has none.
 */
function useWorkspaceRow(id: string, inWorkspace: boolean, refresh = 0): CandidateDetail | null {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    /* Another person clears what was shown; the same person read again (contact details just arrived) keeps it
       until the new answer replaces it. */
    if (loadedFor.current !== id) { setDetail(null); loadedFor.current = null; }
    if (!LIVE || !inWorkspace || !UUID.test(id)) return;
    let gone = false;
    getCandidate(id).then((d) => { if (!gone) { loadedFor.current = id; setDetail(d); } }, () => {});
    return () => { gone = true; };
  }, [id, inWorkspace, refresh]);
  return detail;
}

export function ProfileSidebar({
  candidate, onClose, onPrev, onNext, position, verdict, onVerdict, scrim = true, criteria, canDecide = true, extra, campaignId = null, refresh = 0,
}: ProfileSidebarProps): JSX.Element | null {
  /* The last candidate stays rendered through the exit animation. */
  const [shown, setShown] = useState<Candidate | null>(candidate);
  const [leaving, setLeaving] = useState(false);
  const [dir, setDir] = useState<"fwd" | "back" | "none">("none");
  const lastIndex = useRef<number | null>(position?.index ?? null);
  const panelRef = useRef<HTMLElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (candidate) {
      if (!shown) {
        returnTo.current = openerNow();
        setDir("none");
      } else if (candidate.id !== shown.id) {
        const was = lastIndex.current;
        const now = position?.index ?? null;
        setDir(was !== null && now !== null && now < was ? "back" : "fwd");
      }
      lastIndex.current = position?.index ?? null;
      setShown(candidate);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const id = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
      restoreFocus(returnTo.current as HTMLElement | null);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate]);

  const open = shown !== null;
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!candidate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); e.stopImmediatePropagation(); onNext(); }
      if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); e.stopImmediatePropagation(); onPrev(); }
      /* A sheet with a scrim is modal: Tab goes round inside it, not into the page behind. */
      if (e.key === "Tab" && scrim && panelRef.current) trapTab(panelRef.current, e);
    };
    /* Capture phase: a list open behind this sheet listens for the same keys,
       and the sheet in front must get them first. */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [candidate, onClose, onNext, onPrev, scrim]);

  if (!shown) return null;

  return createPortal(
    <div className={`ps${leaving ? " is-leaving" : ""}${scrim ? " has-scrim" : ""}`}>
      {scrim && <div className="ps-scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={panelRef}
        className="ps-panel"
        role="dialog"
        aria-modal={scrim}
        aria-label={`${shown.name}, profile`}
        tabIndex={-1}
      >
        <div className="ps-bar">
          <div className="ps-bar-nav">
            {(onPrev || onNext || position) && (
              <>
                <IconBtn label="Previous profile (←)" onClick={onPrev} disabled={!onPrev}><CaretLeft size={16} weight="bold" /></IconBtn>
                <IconBtn label="Next profile (→)" onClick={onNext} disabled={!onNext}><CaretRight size={16} weight="bold" /></IconBtn>
                {position && <span className="ps-bar-pos">{position.index + 1} of {position.total}</span>}
              </>
            )}
          </div>
          <IconBtn label="Close (Esc)" onClick={onClose}><X size={16} weight="bold" /></IconBtn>
        </div>

        <Profile
          key={shown.id}
          c={shown}
          dir={dir}
          verdict={shown.id === candidate?.id ? verdict : undefined}
          onVerdict={(v) => onVerdict(shown.id, v)}
          criteria={criteria}
          canDecide={canDecide}
          extra={extra}
          campaignId={campaignId}
          refresh={refresh}
        />
      </aside>
    </div>,
    document.body,
  );
}

/* ── the profile ─────────────────────────────────────────────────────────── */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "match", label: "Match" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Profile({
  c: summary, dir, verdict, onVerdict, criteria, canDecide, extra, campaignId, refresh,
}: {
  campaignId: string | null;
  refresh: number;
  c: Candidate;
  dir: string;
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  criteria?: { text: readonly string[]; short: readonly string[] };
  canDecide: boolean;
  extra?: React.ReactNode;
}) {
  /* Whoever came as a summary (a list, a card, a search result) has their history read now; ghosts hold its place. */
  const { candidate: c, loading } = useFullCandidate(summary, campaignId);
  const bodyRef = useRef<HTMLDivElement>(null);
  const actsRef = useRef<HTMLDivElement>(null);
  const [fetched, setFetched] = useState(0);
  const row = useWorkspaceRow(c.id, c.inWorkspace === true, fetched + refresh);
  /* Their contact details can be asked for on the campaign they are on (not passed): the same figures the
     Shortlisted table shows. When something arrives, their own row is read again so the value appears. */
  const contactCampaign = row?.campaigns.find((x) => x.stage !== "passed")?.id ?? null;
  const contacts = useContacts(contactCampaign);
  const theirs = row ? contacts.ofCandidate(row.candidate.id) : undefined;
  const arrived = `${theirs?.email === "found"}-${theirs?.phone === "found"}`;
  const arrivedSeen = useRef(arrived);
  useEffect(() => {
    if (arrivedSeen.current === arrived) return;
    arrivedSeen.current = arrived;
    setFetched((n) => n + 1);
  }, [arrived]);
  /* Their details change for who can change a campaign they are on (or own them); anyone else reads them. */
  const mayEdit = row?.canEdit !== false;
  const email = row ? row.candidate.primaryEmail ?? row.candidate.workEmail ?? row.candidate.email2 : null;
  const phone = row ? row.candidate.primaryPhone ?? row.candidate.phone2 : null;
  const [active, setActive] = useState<SectionId>("overview");
  const [dock, setDock] = useState(false);
  /* Set while a tab press is scrolling, so the spy does not flicker through
     every section the scroll passes on its way. */
  const jumping = useRef<number | null>(null);

  /* The active tab is the last section whose top has passed the tab bar; the
     last section wins at the end of the scroll, or a short one never could. */
  const spy = useCallback(() => {
    const body = bodyRef.current;
    if (!body || jumping.current !== null) return;
    const line = body.getBoundingClientRect().top + 72;
    let hit: SectionId = "overview";
    for (const s of SECTIONS) {
      const el = body.querySelector<HTMLElement>(`[data-sec="${s.id}"]`);
      if (el && el.getBoundingClientRect().top <= line) hit = s.id;
    }
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) hit = "skills";
    setActive(hit);
  }, []);

  /* Once the header's actions scroll away, the same two buttons dock at the
     foot of the sheet. */
  useEffect(() => {
    const body = bodyRef.current;
    const acts = actsRef.current;
    if (!body || !acts) return;
    const io = new IntersectionObserver(([e]) => setDock(!e!.isIntersecting), { root: body, threshold: 0 });
    io.observe(acts);
    return () => io.disconnect();
  }, []);

  const jump = (id: SectionId) => {
    const body = bodyRef.current;
    const el = body?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (!body || !el) return;
    setActive(id);
    if (jumping.current) window.clearTimeout(jumping.current);
    body.scrollTo({ top: id === "overview" ? 0 : el.offsetTop - 52, behavior: "smooth" });
    jumping.current = window.setTimeout(() => { jumping.current = null; }, 600);
  };

  useEffect(() => () => { if (jumping.current) window.clearTimeout(jumping.current); }, []);

  return (
    <div className={`ps-view is-${dir}`}>
      <div className="ps-body" ref={bodyRef} onScroll={spy}>
        <header className="ps-who">
          <div className="ps-who-top">
            <Avatar name={c.name} hue={c.hue} size={52} />
            <div className="ps-who-id">
              <h2 className="ps-name">{plainText(c.name)}</h2>
              <p className="ps-headline">{c.headline}</p>
            </div>
            <div className="ps-socials">
              {c.linkedinUrl && (
                <a className="ps-li" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label={`${c.name} on LinkedIn`}>
                  <LinkedinLogo size={16} weight="fill" aria-hidden="true" />LinkedIn<ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
              {c.github && <span className="ps-social" title="GitHub"><GithubLogo size={18} weight="fill" aria-label="GitHub" /></span>}
            </div>
          </div>
          {(c.location || c.openToWork) && (
            <p className="ps-meta">
              {c.location && <span><MapPin size={14} aria-hidden="true" />{c.location}</span>}
              {c.openToWork && <span className="ps-otw">Open to work</span>}
            </p>
          )}
          <p className="ps-orgs">
            {c.current.name && <span><Logo name={c.current.name} hue={c.current.hue} />{c.current.name}</span>}
            {c.school.name && <span><Logo name={c.school.name} hue={c.school.hue} />{c.school.name}</span>}
          </p>
          <div ref={actsRef} className="ps-acts">
            {canDecide && <Verdicts verdict={verdict} onVerdict={onVerdict} name={c.name} />}
          </div>
          {extra && <div className="ps-extra">{extra}</div>}
        </header>

        <div className="ps-tabs-wrap">
          <Tabs
            tabs={SECTIONS.filter((s) => s.id === "overview" || (s.id === "match" ? !!c.result : s.id === "experience" ? c.jobs.length > 0 : s.id === "education" ? c.schools.length > 0 : Object.keys(c.skills).length > 0 || !!c.github))}
            active={active}
            onPick={jump}
            label="Profile sections"
          />
        </div>

        <section data-sec="overview" className="ps-sec">
          {c.summary && <Summary text={c.summary} marks={c.highlights} />}
          {(c.meets.length > 0 || c.jobs.length > 0) && (
            <div className="ps-glance">
              {c.meets.length > 0 && (
                <div>
                  <p className="ps-k">Fit</p>
                  <FitRow meets={c.meets} unscored={c.scored === false} checks={c.checks} {...(criteria ? { criteria: criteria.text, short: criteria.short } : {})} />
                </div>
              )}
              {c.jobs.length > 0 && (
                <div>
                  <p className="ps-k">Career <span>· {c.totalYears} yrs{c.avgTenure ? `, ${c.avgTenure} avg tenure` : ""}</span></p>
                  <Career c={c} labels />
                </div>
              )}
            </div>
          )}
          <dl className="ps-facts">
            {row ? (
              <div><dt>Status</dt><dd>{row.campaigns.length ? row.campaigns.map((x, i) => {
                const place = placeOf(x);
                return <span key={`${x.name}-${i}`}>{i > 0 && ", "}<span {...statusProps(place.tone)}>{place.word}</span> {place.own ? "for" : "in"} {x.name}</span>;
              }) : "Not in a campaign yet"}</dd></div>
            ) : (
              <div><dt>Status</dt><dd><span {...statusProps("Not contacted")} className="ps-status st">Not contacted</span></dd></div>
            )}
            <div><dt>Current</dt><dd>{c.headline}</dd></div>
            {row && <div><dt>Email</dt><dd>{mayEdit
              ? <ContactEditable candidateId={row.candidate.id} kind="email" value={email} onSaved={() => setFetched((n) => n + 1)}><ContactSideLine campaignId={contactCampaign} kind="email" candidateId={row.candidate.id} name={c.name} value={email} none="Not found yet" lookLabel="Look up" /></ContactEditable>
              : <ContactSideLine campaignId={contactCampaign} kind="email" candidateId={row.candidate.id} name={c.name} value={email} none="Not found yet" lookLabel="Look up" />}</dd></div>}
            {row && <div><dt>Phone</dt><dd>{mayEdit
              ? <ContactEditable candidateId={row.candidate.id} kind="phone" value={phone} onSaved={() => setFetched((n) => n + 1)}><ContactSideLine campaignId={contactCampaign} kind="phone" candidateId={row.candidate.id} name={c.name} value={phone} none="Not found yet" lookLabel="Look up" /></ContactEditable>
              : <ContactSideLine campaignId={contactCampaign} kind="phone" candidateId={row.candidate.id} name={c.name} value={phone} none="Not found yet" lookLabel="Look up" />}</dd></div>}
            {c.location && <div><dt>Location</dt><dd>{c.location}</dd></div>}
            {c.totalYears > 0 && <div><dt>Experience</dt><dd>{c.totalYears} years</dd></div>}
            <div><dt>Open to work</dt><dd>{c.openToWork ? "Yes, says so on the profile" : "Not stated"}</dd></div>
          </dl>
          {c.about && (
            <>
              <h3 className="ps-h">About</h3>
              <p className="ps-about">{c.about}</p>
            </>
          )}
          {row && row.notes.length > 0 && (
            <>
              <h3 className="ps-h">Notes <span>· {row.notes.length}</span></h3>
              {row.notes.map((n) => (
                <p key={n.id} className="ps-about">
                  {n.body}{n.authorName && <span className="ps-note-by"> {n.authorName}</span>}
                </p>
              ))}
            </>
          )}
        </section>

        {c.result && (
          <section data-sec="match" className="ps-sec" aria-label="How well they match">
            <MatchResult c={c} />
          </section>
        )}

        {/* Their history is on its way: ghosts the shape of what lands, so the sheet does not jump. */}
        {loading && (
          <ShimmerRegion as="section" label="Loading the profile" className="ps-sec">
            <ShimmerText lines={3} />
            <ShimmerText lines={4} />
          </ShimmerRegion>
        )}

        {c.jobs.length > 0 && (
          <section data-sec="experience" className="ps-sec">
            <h3 className="ps-h">Experience {c.totalYears > 0 && <span>· {c.totalYears} years total</span>}</h3>
            <ol className="ps-jobs">
              {c.jobs.map((j, i) => <JobBlock key={`${j.org.name}${i}`} job={j} />)}
            </ol>
          </section>
        )}

        {c.schools.length > 0 && (
          <section data-sec="education" className="ps-sec">
            <h3 className="ps-h">Education</h3>
            <ul className="ps-schools">
              {c.schools.map((s) => (
                <li key={s.org.name}>
                  <Logo name={s.org.name} hue={s.org.hue} size={40} />
                  <div>
                    <p className="ps-job-org">{s.org.name}</p>
                    {s.degree && <p className="ps-job-role">{s.degree}</p>}
                    {s.years && <p className="ps-job-d">{s.years}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section data-sec="skills" className={`ps-sec is-last${Object.keys(c.skills).length || c.github ? "" : " is-empty"}`}>
          {c.github && (
            <div className="ps-gh-card">
              <GithubLogo size={18} weight="fill" aria-hidden="true" />
              <span><b>{c.github.handle}</b> · {c.github.repos} public repos · since {c.github.since}</span>
              <ArrowUpRight size={15} aria-hidden="true" className="ps-gh-go" />
            </div>
          )}
          {Object.keys(c.skills).length > 0 && <h3 className="ps-h">Skill map</h3>}
          {Object.entries(c.skills).map(([group, list]) => (
            <div key={group} className="ps-skill-group">
              <p className="ps-k">{group}</p>
              <ul className="ps-skills">
                {list.map((s) => <li key={s} className={ASKED.test(s) ? "is-asked" : undefined}>{s}</li>)}
              </ul>
            </div>
          ))}
        </section>
      </div>

      <div className={`ps-dock${dock && canDecide ? " is-on" : ""}`}>
        <span className="ps-dock-who">
          <Avatar name={c.name} hue={c.hue} size={28} />
          <b>{plainText(c.name)}</b>
        </span>
        {canDecide && <Verdicts verdict={verdict} onVerdict={onVerdict} name={c.name} />}
      </div>
    </div>
  );
}

/** Skills the brief asked for, so they can be marked in the map. */
const ASKED = /postgres|^go$|rust|citus|patroni|pg_|logical replication|postgis|pgbouncer/i;

/**
 * One employer. A single role reads as a flat entry; several roles at the same
 * place hang off a spine, the way a promotion history actually reads.
 */
function JobBlock({ job }: { job: Job }) {
  const multi = job.roles.length > 1;
  const one = job.roles[0]!;
  return (
    <li className="ps-job">
      <Logo name={job.org.name} hue={job.org.hue} size={40} />
      <div className="ps-job-main">
        {multi ? (
          <>
            <p className="ps-job-org">{job.org.name}</p>
            <p className="ps-job-d">{job.span}</p>
            <ol className="ps-roles">
              {job.roles.map((r) => <li key={r.start} className="ps-role"><RoleBody role={r} /></li>)}
            </ol>
          </>
        ) : (
          <>
            <p className="ps-job-org">{one.title}</p>
            <p className="ps-job-role">{job.org.name}</p>
            <RoleBody role={one} bare />
          </>
        )}
      </div>
    </li>
  );
}

function RoleBody({ role, bare = false }: { role: Job["roles"][number]; bare?: boolean }) {
  const [more, setMore] = useState(false);
  /* Measured, not guessed from a character count: "Read more" appears only
     when the two-line clamp is actually hiding something at this width. */
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && !more) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [role.body, more]);

  return (
    <>
      {!bare && (
        <p className="ps-role-t">
          {role.title}
          {role.promotion && <span className="ps-promo">Promotion</span>}
        </p>
      )}
      <p className="ps-job-d">{role.start} – {role.end} · {role.span}</p>
      {role.body && (
        <>
          <p ref={bodyRef} className={`ps-role-body${more ? "" : " is-clamped"}`}>{role.body}</p>
          {long && (
            <button type="button" className="ps-more" onClick={() => setMore((m) => !m)}>
              {more ? "Show less" : "Read more"}
            </button>
          )}
        </>
      )}
      {role.skills && <p className="ps-role-skills"><b>Skills</b> {role.skills.join(" · ")}</p>}
    </>
  );
}

/* ── shared controls ─────────────────────────────────────────────────────── */

export function IconBtn({
  label, onClick, disabled, children,
}: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="ps-icon" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/**
 * Tabs with one underline that slides to the active tab, measured from the
 * active button so tab widths can be anything.
 */
function Tabs<T extends string>({
  tabs, active, onPick, label,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  active: T;
  onPick: (id: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
  }, [active]);

  return (
    <div className="ps-tabs" role="tablist" aria-label={label} ref={ref}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-tab={t.id}
          aria-selected={t.id === active}
          className={`ps-tab${t.id === active ? " is-on" : ""}`}
          onClick={() => onPick(t.id)}
        >
          {t.label}
        </button>
      ))}
      {bar && (
        <span className="ps-tab-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" />
      )}
    </div>
  );
}
