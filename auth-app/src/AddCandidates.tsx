import {
  DownloadSimple, FileCsv, Info, LinkedinLogo, Plus, UploadSimple, UserCheck, UserPlus, WarningCircle, X,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CandidateDraft, Channel, FieldKey, LinkVerdict, Match, RowVerdict } from "./candidateImport";
import {
  EMPTY_CANDIDATE, FIELDS, ID_LABEL, MAX_LINKS, TEMPLATE_CSV, autoMap, buildIndex, candidateProblems, classifyLinks,
  classifyRows, contactFromDraft, findExisting, listWords, looksBinary, mergeDraft, nameFromSlug, parseCsv, rowToDraft, splitSkills, tally,
} from "./candidateImport";
import * as cands from "./api/candidates";
import { LIVE, messageOf } from "./api/client";
import { memberIdOf, useCampaignRows, useTeam } from "./campaignStore";
import type { Contact } from "./contacts";
import { useSession, visibleCampaigns } from "./roleStore";
import { CHROME_STORE_URL } from "./config";
import { Dialog } from "./ui";
import "./addCandidates.css";
import { Loader } from "./components/Loader";

/**
 * Add candidates by hand, three ways: paste LinkedIn links, fill in one
 * person, or upload a CSV.
 *
 * Every way runs the same dedupe the backend's upsert does (LinkedIn, then
 * email, then phone, each normalised), so nobody is added twice: a match is
 * shown before anything is saved, with the choice to open that person or to
 * add the new details to them. With the API, the server makes the same
 * checks against the whole workspace and has the last word; without it,
 * nothing leaves the page.
 */

export type AddResult = {
  added: readonly Contact[];
  merged: readonly { id: string; patch: Partial<Contact> }[];
  /** Shortlist everyone here for this campaign, when one was picked. */
  campaign: string | null;
  message: string;
  /** With the API: who the server added or changed, to light up in the list. */
  touched?: readonly string[];
};

type Tab = "links" | "one" | "csv";

/* `short` is what a phone's strip says, so the three tabs sit in one row instead of the last one being cut. */
const TABS: readonly { id: Tab; label: string; short: string }[] = [
  { id: "links", label: "Paste LinkedIn links", short: "Paste links" },
  { id: "one", label: "Add one person", short: "Add one" },
  { id: "csv", label: "Upload a CSV", short: "Upload CSV" },
];

let seq = 0;
const newId = () => `mn-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function AddCandidatesDialog({
  open, onClose, existing, onDone, onOpenPerson,
}: {
  open: boolean;
  onClose: () => void;
  existing: readonly Contact[];
  onDone: (r: AddResult) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("links");
  const [campaign, setCampaign] = useState("");
  const session = useSession();
  const rows = useCampaignRows();
  /* Only campaigns this person may work on, and only ones still running:
     shortlisting into a closed search goes nowhere. */
  const campaigns = useMemo(
    () => visibleCampaigns(rows, session).filter((r) => r.status !== "closed"),
    [rows, session],
  );
  /* With the API, `existing` is only the page on screen, so it is a quick
     early warning; the server checks the whole workspace. */
  const index = useMemo(() => buildIndex(existing), [existing]);
  const byId = useMemo(() => new Map(existing.map((c) => [c.id, c])), [existing]);
  const ctx: TabCtx = {
    index, byId, me: session.name, campaign: campaign || null, onDone, onClose, onOpenPerson,
    picker: <CampaignPick value={campaign} onChange={setCampaign} options={campaigns} />,
  };

  return (
    <Dialog open={open} onClose={onClose} label="Add candidates" size="lg">
      <div className="ca">
        <header className="ca-head">
          <h2 className="ca-h t-title">Add candidates</h2>
          <p className="ca-sub t-body-sm">Everyone is checked against SuperHyre first, by LinkedIn, email and phone, so no one is added twice.</p>
          <div className="ca-tabs" role="tablist" aria-label="How to add">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`ca-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`ca-panel-${t.id}`}
                className={`ca-tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                <span className="ca-tab-full">{t.label}</span>
                <span className="ca-tab-short">{t.short}</span>
              </button>
            ))}
            {/* The one place the extension is mentioned: a small link in the way of adding people, not a promo on the page. */}
            <a className="ca-ext t-body-sm" href={CHROME_STORE_URL} target="_blank" rel="noreferrer noopener">Add the Chrome extension</a>
          </div>
        </header>
        <div className="ca-panel" role="tabpanel" id={`ca-panel-${tab}`} aria-labelledby={`ca-tab-${tab}`}>
          {tab === "links" && <LinksTab {...ctx} />}
          {tab === "one" && <OneTab {...ctx} />}
          {tab === "csv" && <CsvTab {...ctx} />}
        </div>
      </div>
    </Dialog>
  );
}

type TabCtx = {
  index: ReturnType<typeof buildIndex>;
  byId: ReadonlyMap<string, Contact>;
  me: string;
  campaign: string | null;
  picker: ReactNode;
  onDone: (r: AddResult) => void;
  onClose: () => void;
  onOpenPerson: (id: string) => void;
};

function CampaignPick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly { id: string; name: string }[] }) {
  return (
    <label className="ca-camp">
      <span className="ca-camp-l t-label">Add to campaign</span>
      <select className="ca-in ca-camp-s" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No campaign for now</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
}

function Foot({ picker, note, children }: { picker: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <footer className="ca-foot">
      {picker}
      <span className="ca-foot-note t-body-sm">{note}</span>
      <div className="ca-foot-act">{children}</div>
    </footer>
  );
}

/* ── paste LinkedIn links ── */

function LinksTab({ index, byId, me, campaign, picker, onDone, onClose, onOpenPerson }: TabCtx) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const verdicts = useMemo(() => classifyLinks(text, index), [text, index]);
  const fresh = verdicts.filter((v): v is Extract<LinkVerdict, { kind: "new" }> => v.kind === "new");
  const known = verdicts.filter((v) => v.kind === "existing").length;
  const bad = verdicts.filter((v) => v.kind === "invalid").length;
  const over = verdicts.filter((v) => v.kind === "over").length;
  const counts = [
    fresh.length && `${fresh.length} new`,
    known && `${known} already in SuperHyre`,
    bad && `${bad} to fix`,
  ].filter(Boolean) as string[];

  const add = () => {
    if (LIVE) { void addLive(); return; }
    const added = fresh.map((v) => contactFromDraft({ ...EMPTY_CANDIDATE, name: nameFromSlug(v.slug), linkedin: v.url }, { id: newId(), by: me, origin: "Manual", campaign: campaign ?? undefined }));
    const existingIds = verdicts.flatMap((v) => (v.kind === "existing" ? [v.match.id] : []));
    onDone({
      added,
      /* Links already here are not re-added, but they still go on the picked
         campaign's shortlist: that is usually why they were pasted. */
      merged: campaign ? existingIds.map((id) => ({ id, patch: {} })) : [],
      campaign,
      message: `${plural(added.length, "candidate")} added${known ? `. ${known} ${known === 1 ? "was" : "were"} already here` : ""}`,
    });
  };

  /* Links already here go along only to reach the picked campaign. */
  const addLive = async () => {
    const send = verdicts.flatMap((v) => (v.kind === "new" ? [{ url: v.url, name: v.name }]
      : v.kind === "existing" && campaign ? [{ url: `linkedin.com/in/${v.slug}`, name: v.match.name }] : []));
    setBusy(true);
    setFailed(null);
    try {
      const r = await cands.importCandidates(cands.linkRows(send), "skip", campaign);
      // A link the server left out is named by its row (the header is row 1), with the reason.
      onDone({ added: [], merged: [], campaign, touched: r.touched, message: cands.importMessage(r, (row) => send[row - 2]?.name) });
    } catch (err) {
      setFailed(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ca-body">
        <label className="ca-f is-wide">
          <span className="ca-l t-label">LinkedIn profile links</span>
          <textarea
            className="ca-in is-area is-mono"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"https://www.linkedin.com/in/asha-verma\nhttps://www.linkedin.com/in/rohan-iyer-4821\n\nOne per line, up to 50 at a time"}
            spellCheck={false}
            autoFocus
          />
        </label>
        <p className="ca-note t-body-sm">
          <Info size={16} aria-hidden="true" />
          <span>{LIVE
            ? "New links are saved straight away as basic entries, named from the link."
            : "New links are saved straight away as basic entries, named from the link. Their full profiles will be fetched in the background once enrichment is connected. It isn't yet, so for now they stay basic."}</span>
        </p>

        {verdicts.length > 0 && (
          <section className="ca-prev" aria-label="Preview">
            <h3 className="ca-prev-h t-label">{counts.join(", ") || "Nothing to add yet"}</h3>
            {over > 0 && <p className="ca-warn t-body-sm">Only {MAX_LINKS} are added at a time. The last {plural(over, "link")} will wait for the next batch.</p>}
            <ul className="ca-list">
              {verdicts.map((v) => <LinkLine key={v.n} v={v} onOpen={(id) => { onClose(); onOpenPerson(id); }} byId={byId} />)}
            </ul>
          </section>
        )}
      </div>
      <Foot picker={picker} note={failed ? <span className="ca-err">{failed}</span> : undefined}>
        <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ct-btn is-primary" onClick={add} disabled={busy || (!fresh.length && !(campaign && known))} aria-busy={busy || undefined}>
          {busy ? <><Loader size="sm" tone="inherit" />Adding</> : fresh.length ? `Add ${plural(fresh.length, "candidate")}` : campaign && known ? "Add to campaign" : "Add candidates"}
        </button>
      </Foot>
    </>
  );
}

function LinkLine({ v, onOpen, byId }: { v: LinkVerdict; onOpen: (id: string) => void; byId: ReadonlyMap<string, Contact> }) {
  if (v.kind === "new") {
    return (
      <li className="ca-li is-new">
        <span className="ca-li-ico" aria-hidden="true"><Plus size={14} weight="bold" /></span>
        <span className="ca-li-t"><span className="ca-li-main">{v.name}</span><span className="ca-li-sub">{v.url}</span></span>
        <span className="ca-li-tag">New</span>
      </li>
    );
  }
  if (v.kind === "existing") {
    const c = byId.get(v.match.id);
    return (
      <li className="ca-li is-known">
        <span className="ca-li-ico" aria-hidden="true"><UserCheck size={14} /></span>
        <span className="ca-li-t">
          <span className="ca-li-main">Already in SuperHyre as {v.match.name}</span>
          <span className="ca-li-sub">{c?.title && c.company ? `${c.title} at ${c.company}` : `linkedin.com/in/${v.slug}`}</span>
        </span>
        <button type="button" className="ca-link" onClick={() => onOpen(v.match.id)}>Open them</button>
      </li>
    );
  }
  if (v.kind === "repeat") {
    return (
      <li className="ca-li is-quiet">
        <span className="ca-li-ico" aria-hidden="true"><LinkedinLogo size={14} /></span>
        <span className="ca-li-t"><span className="ca-li-main">linkedin.com/in/{v.slug}</span><span className="ca-li-sub">Pasted twice, added once</span></span>
      </li>
    );
  }
  if (v.kind === "over") {
    return (
      <li className="ca-li is-quiet">
        <span className="ca-li-ico" aria-hidden="true"><LinkedinLogo size={14} /></span>
        <span className="ca-li-t"><span className="ca-li-main">linkedin.com/in/{v.slug}</span><span className="ca-li-sub">Past the {MAX_LINKS}-link limit, paste it in the next batch</span></span>
      </li>
    );
  }
  return (
    <li className="ca-li is-bad">
      <span className="ca-li-ico" aria-hidden="true"><WarningCircle size={14} /></span>
      <span className="ca-li-t"><span className="ca-li-main is-raw">{v.raw}</span><span className="ca-li-sub">{v.reason}</span></span>
    </li>
  );
}

/* ── one person ── */

const CHANNELS: readonly Channel[] = ["Referral", "Job board", "Event", "Other"];
/* The API keeps a referral apart from everything else typed in, and nothing finer. */
const LIVE_CHANNELS: readonly Channel[] = ["Referral"];

/** Who can own the people added: you first, then the team (live, only members the API can name). */
function useOwners(me: string): string[] {
  const team = useTeam();
  return [...new Set([me, ...(LIVE ? team.filter((n) => memberIdOf(n)) : team)])];
}

/** The owner as the API wants it; nothing for yourself, which is its default. */
const ownerIdOf = (owner: string, me: string) => (owner === me ? undefined : memberIdOf(owner));

function OwnerPick({ id, me, value, onChange, owners, hint }: { id: string; me: string; value: string; onChange: (v: string) => void; owners: readonly string[]; hint?: string }) {
  return (
    <>
      <label className="ca-l t-label" htmlFor={id}>Owner{hint && <span className="ca-hint">{hint}</span>}</label>
      <select id={id} className="ca-in" value={value} onChange={(e) => onChange(e.target.value)}>
        {owners.map((m) => <option key={m} value={m}>{m === me ? `${m} (you)` : m}</option>)}
      </select>
    </>
  );
}

type Dup = { id: string; name: string; detail: string };

function OneTab({ index, byId, me, campaign, picker, onDone, onClose, onOpenPerson }: TabCtx) {
  const [d, setDraft] = useState<CandidateDraft>({ ...EMPTY_CANDIDATE, skills: [] });
  /* Who the server says they already are, when the page didn't know. */
  const [conflict, setConflict] = useState<Dup | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const setD = (fn: (cur: CandidateDraft) => CandidateDraft) => { setDraft(fn); setConflict(null); setFailed(null); };
  const [channel, setChannel] = useState<Channel | null>(null);
  const [owner, setOwner] = useState(me);
  const owners = useOwners(me);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [tried, setTried] = useState(false);
  const problems = candidateProblems(d);
  const show = (k: keyof CandidateDraft) => (tried || touched.has(k) ? problems[k] : undefined);
  const set = (k: Exclude<keyof CandidateDraft, "skills">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((cur) => ({ ...cur, [k]: e.target.value }));
  const blur = (k: string) => () => setTouched((cur) => new Set(cur).add(k));
  /* Live: only identifiers that are already valid are looked up, so a
     half-typed email never flashes a false match. */
  const match: Match | null = useMemo(() => findExisting(index, d), [index, d]);
  const who = match ? byId.get(match.person.id) : undefined;
  const dup: Dup | null = match && who
    ? {
        id: who.id, name: who.name,
        detail: `Same ${ID_LABEL[match.by]}${who.title ? `, ${who.title}${who.company ? ` at ${who.company}` : ""}` : ""}.${who.capturedBy ? ` Saved by ${who.capturedBy}.` : ""}`,
      }
    : conflict;

  const submitLive = async () => {
    setBusy(true);
    try {
      const r = await cands.addCandidate(cands.fieldsFromDraft(d), campaign, {
        source: channel === "Referral" ? "referral" : "manual",
        ownerId: ownerIdOf(owner, me),
      });
      if (r.kind === "added") {
        onDone({ added: [], merged: [], campaign, touched: [r.id], message: `${d.name.trim()} added` });
        return;
      }
      const found = await cands.getCandidate(r.id).then((x) => x.candidate, () => null);
      const role = found ? [found.currentTitle, found.currentCompanyName].filter(Boolean).join(" at ") : "";
      const by = r.by === "linkedin" || r.by === "email" || r.by === "phone" ? ID_LABEL[r.by] : "profile";
      setConflict(found ? { id: r.id, name: found.fullName, detail: `Same ${by}${role ? `, ${role}` : ""}.` } : { id: r.id, name: "", detail: r.message });
    } catch (err) {
      setFailed(messageOf(err));
    }
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length || dup || busy) return;
    if (LIVE) { void submitLive(); return; }
    const c = contactFromDraft(d, { id: newId(), by: me, owner, origin: "Manual", campaign: campaign ?? undefined, channel: channel ?? undefined });
    onDone({ added: [c], merged: [], campaign, message: `${c.name} added` });
  };

  const addDetailsLive = async (to: Dup) => {
    setBusy(true);
    try {
      const { fullName: _name, ...fields } = cands.fieldsFromDraft(d);
      const r = await cands.addDetails(to.id, fields);
      if (campaign) await cands.addToCampaign(campaign, [to.id]);
      const name = to.name || "them";
      onDone({
        added: [], merged: [], campaign, touched: [to.id],
        message: r.changed.length ? `Added ${listWords(r.changed)} to ${name}` : `Nothing new to add to ${name}`,
      });
    } catch (err) {
      setFailed(messageOf(err));
      setBusy(false);
    }
  };

  const addDetails = () => {
    if (LIVE && dup) { void addDetailsLive(dup); return; }
    if (!who) return;
    const m = mergeDraft(who, d);
    if (!m.changed.length && !campaign) { onDone({ added: [], merged: [], campaign: null, message: `Nothing new to add to ${who.name}` }); return; }
    onDone({
      added: [], merged: [{ id: who.id, patch: m.patch }], campaign,
      message: m.changed.length ? `Added ${listWords(m.changed)} to ${who.name}` : `${who.name} is on the shortlist`,
    });
  };

  const F = (k: keyof CandidateDraft, label: string, input: ReactNode, wide = false, hint?: string) => (
    <div className={`ca-f${wide ? " is-wide" : ""}${show(k) ? " is-bad" : ""}`}>
      <label className="ca-l t-label" htmlFor={`ca-${k}`}>{label}{hint && <span className="ca-hint">{hint}</span>}</label>
      {input}
      {show(k) && <small className="ca-err t-caption">{show(k)}</small>}
    </div>
  );
  const input = (k: Exclude<keyof CandidateDraft, "skills" | "notes">, ph: string, type = "text", extra: object = {}) => (
    <input id={`ca-${k}`} className="ca-in" type={type} value={d[k]} onChange={set(k)} onBlur={blur(k)} placeholder={ph} aria-invalid={!!show(k)} {...extra} />
  );

  return (
    <form className="ca-form" onSubmit={submit} noValidate>
      <div className="ca-body">
        <div className="ca-grid">
          {F("name", "Full name", input("name", "e.g. Asha Verma", "text", { autoFocus: true, autoComplete: "off" }))}
          {F("linkedin", "LinkedIn", input("linkedin", "linkedin.com/in/…", "url", { spellCheck: false }), false, "Recommended, fills in skills")}
          {F("email", "Email", input("email", "name@company.com", "email", { spellCheck: false }))}
          {F("phone", "Phone", input("phone", "+91 98450 12345", "tel"))}

          {dup && (
            <div className="ca-dup is-wide" role="status">
              <span className="ca-dup-ico" aria-hidden="true"><UserCheck size={18} /></span>
              <div className="ca-dup-t">
                <p className="ca-dup-h t-body-strong">{dup.name ? `Already in SuperHyre as ${dup.name}` : "Already in SuperHyre"}</p>
                <p className="t-body-sm">{dup.detail}</p>
              </div>
              <div className="ca-dup-act">
                <button type="button" className="ct-btn" onClick={() => { onClose(); onOpenPerson(dup.id); }}>Open them</button>
                <button type="button" className="ct-btn is-dark" onClick={addDetails} disabled={busy}>Add details to them</button>
              </div>
            </div>
          )}

          {F("title", "Current title", input("title", "e.g. Senior Backend Engineer"))}
          {F("company", "Company", input("company", "e.g. Razorpay"))}
          {F("location", "Location", input("location", "e.g. Bangalore"))}
          {F("years", "Years of experience", input("years", "e.g. 6", "text", { inputMode: "decimal" }))}
          {F("skills", "Skills", <TagInput id="ca-skills" value={d.skills} onChange={(skills) => setD((cur) => ({ ...cur, skills }))} />, true, "Press Enter or a comma after each")}

          <div className="ca-f">
            <span className="ca-l t-label" id="ca-src-l">Source</span>
            <div className="ca-seg" role="radiogroup" aria-labelledby="ca-src-l">
              {(LIVE ? LIVE_CHANNELS : CHANNELS).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={channel === c} className={channel === c ? "is-on" : ""}
                  onClick={() => setChannel(channel === c ? null : c)}>{c}</button>
              ))}
            </div>
          </div>
          {owners.length > 1 && <div className="ca-f"><OwnerPick id="ca-owner" me={me} value={owner} onChange={setOwner} owners={owners} /></div>}
          {F("notes", "Notes", <textarea id="ca-notes" className="ca-in is-area" rows={3} value={d.notes} onChange={set("notes")} placeholder="How you met them, what they're looking for" />, true)}
        </div>
      </div>
      <Foot picker={picker} note={failed ? <span className="ca-err">{failed}</span> : tried && Object.keys(problems).length ? <span className="ca-err">Check the highlighted fields.</span> : dup ? "This person is already here." : undefined}>
        <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="ct-btn is-primary" disabled={!!dup || busy} aria-busy={busy || undefined}>{busy ? <><Loader size="sm" tone="inherit" />Adding</> : "Add candidate"}</button>
      </Foot>
    </form>
  );
}

function TagInput({ id, value, onChange }: { id: string; value: readonly string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = (raw: string) => {
    const next = [...value];
    for (const s of splitSkills(raw)) if (!next.some((x) => x.toLowerCase() === s.toLowerCase())) next.push(s);
    onChange(next);
    setDraft("");
  };
  return (
    <div className="ca-tags" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {value.map((s) => (
        <span key={s} className="ca-tag">
          {s}
          <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))}><X size={10} weight="bold" /></button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? "" : "e.g. Go, Postgres, Kafka"}
        onChange={(e) => (/[,;]/.test(e.target.value) ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) { e.preventDefault(); commit(draft); }
          else if (e.key === "Enter") e.preventDefault();
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />
    </div>
  );
}

/* ── CSV ── */

const MAX_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024;

type Sheet = { file: string; header: string[]; rows: string[][] };


function CsvTab({ index, byId, me, campaign, picker, onDone, onClose }: TabCtx) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<(FieldKey | null)[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [update, setUpdate] = useState(false);
  const [owner, setOwner] = useState(me);
  const owners = useOwners(me);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setProblem(null);
    if (!/\.(csv|txt|tsv)$/i.test(f.name) && !/csv|text\/plain/.test(f.type)) { setProblem(`${f.name} isn't a CSV. Save the sheet as CSV and try again.`); return; }
    if (f.size > MAX_BYTES) { setProblem("That file is over 5 MB. Split it into smaller files."); return; }
    const text = await f.text();
    if (looksBinary(text)) { setProblem(`${f.name} isn't readable as text. Save the sheet as CSV and try again.`); return; }
    const rows = parseCsv(text);
    if (rows.length < 2) { setProblem("That file has no rows under the header."); return; }
    if (rows.length - 1 > MAX_ROWS) { setProblem(`That file has ${rows.length - 1} rows. Up to ${MAX_ROWS.toLocaleString("en-IN")} at a time.`); return; }
    const [header, ...body] = rows;
    setSheet({ file: f.name, header: header!, rows: body });
    setMap(autoMap(header!));
  };

  /* With the API, `index` holds only the people on screen: an early warning, like
     pasted links. The whole workspace is checked on import, so nothing here
     promises that the rest are new. */
  const verdicts: RowVerdict[] = useMemo(
    () => (sheet && map.includes("name") ? classifyRows(sheet.rows.map((r) => rowToDraft(r, map)), index) : []),
    [sheet, map, index],
  );
  const t = tally(verdicts);
  const dupes = verdicts.filter((v): v is Extract<RowVerdict, { kind: "duplicate" | "repeat" }> => v.kind === "duplicate" || v.kind === "repeat");
  const errors = verdicts.filter((v): v is Extract<RowVerdict, { kind: "error" }> => v.kind === "error");
  const updatable = verdicts.filter((v): v is Extract<RowVerdict, { kind: "duplicate" }> => v.kind === "duplicate");

  const importLive = async () => {
    if (!sheet) return;
    setBusy(true);
    setFailed(null);
    try {
      const rows = sheet.rows.map((r) => cands.fieldsFromDraft(rowToDraft(r, map)));
      const r = await cands.importCandidates(rows, update ? "update" : "skip", campaign, ownerIdOf(owner, me));
      // A row the server left out is named by the person in that row of the file, with the reason.
      const nameOf = (row: number) => { const cells = sheet.rows[row - 2]; return cells ? rowToDraft(cells, map).name : undefined; };
      onDone({ added: [], merged: [], campaign, touched: r.touched, message: cands.importMessage(r, nameOf) });
    } catch (err) {
      setFailed(messageOf(err));
      setBusy(false);
    }
  };

  const doImport = () => {
    if (LIVE) { void importLive(); return; }
    const added = verdicts.filter((v) => v.kind === "new").map((v) => contactFromDraft(v.draft, { id: newId(), by: me, owner, origin: "Upload", campaign: campaign ?? undefined }));
    /* The same person on two rows of the file merges into one update. */
    const patches = new Map<string, Partial<Contact>>();
    let changed = 0;
    if (update) {
      for (const v of updatable) {
        const base = byId.get(v.match.id);
        if (!base) continue;
        const m = mergeDraft({ ...base, ...patches.get(base.id) }, v.draft, "Manual");
        if (m.changed.length) { patches.set(base.id, { ...patches.get(base.id), ...m.patch }); changed++; }
      }
    }
    const merged = [...patches].map(([id, patch]) => ({ id, patch }));
    if (campaign) for (const v of updatable) if (!patches.has(v.match.id)) merged.push({ id: v.match.id, patch: {} });
    const head = `${plural(added.length, "candidate")} added`;
    const message = update && changed ? `${head} and ${patches.size} updated`
      : t.duplicates ? `${head}. ${t.duplicates} already here, left as they were` : head;
    onDone({ added, merged, campaign, message });
  };

  if (!sheet) {
    return (
      <>
        <div className="ca-body">
          <label
            className={`ca-drop${over ? " is-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]); }}
          >
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="ca-sr" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="ca-drop-ico" aria-hidden="true"><UploadSimple size={22} /></span>
            <span className="ca-drop-h t-title-sm">Drop a CSV here, or <u>browse</u></span>
            <span className="ca-drop-s t-body-sm">Headers in the first row. Up to {MAX_ROWS.toLocaleString("en-IN")} people. Columns are matched by name, and you can change any of them next.</span>
          </label>
          {problem && <p className="ca-warn t-body-sm" role="alert"><WarningCircle size={15} aria-hidden="true" /> {problem}</p>}
          <p className="ca-tpl t-body-sm">
            Starting from scratch?{" "}
            <a className="ca-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`} download="superhyre-candidates.csv">
              <DownloadSimple size={13} aria-hidden="true" /> Get the template
            </a>
          </p>
        </div>
        <Foot picker={picker}>
          <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="ct-btn is-primary" disabled>Import</button>
        </Foot>
      </>
    );
  }

  const preview = sheet.rows.slice(0, 5);
  const setCol = (i: number, f: FieldKey | null) => setMap((cur) => cur.map((x, j) => (j === i ? f : f && x === f ? null : x)));
  const noName = !map.includes("name");
  const label = update && updatable.length
    ? `Import ${t.fresh} and update ${updatable.length}`
    : t.fresh ? LIVE ? `Check and import ${plural(t.fresh, "row")}` : `Import ${plural(t.fresh, "candidate")}` : "Import";

  return (
    <>
      <div className="ca-body">
        <div className="ca-file">
          <span className="ca-file-ico" aria-hidden="true"><FileCsv size={20} /></span>
          <span className="ca-file-t">
            <span className="t-body-strong">{sheet.file}</span>
            <span className="t-body-sm">{plural(sheet.rows.length, "row")} and {plural(sheet.header.length, "column")}</span>
          </span>
          <button type="button" className="ct-btn" onClick={() => { setSheet(null); setMap([]); }}>Choose another file</button>
        </div>

        <section className="ca-sec">
          <h3 className="ca-sec-h t-title-sm">Match the columns</h3>
          <p className="ca-sec-s t-body-sm">Matched by header name. Change any that are wrong, or leave a column out.</p>
          <div className="ca-map" role="region" aria-label="Column mapping and preview" tabIndex={0}>
            <table className="ca-map-t">
              <thead>
                <tr>
                  {sheet.header.map((h, i) => (
                    <th key={i} className={map[i] ? "" : "is-off"} scope="col">
                      <span className="ca-map-h">{h || `Column ${i + 1}`}</span>
                      <select className="ca-in is-sm" value={map[i] ?? ""} aria-label={`Field for ${h || `column ${i + 1}`}`}
                        onChange={(e) => setCol(i, (e.target.value || null) as FieldKey | null)}>
                        <option value="">Leave out</option>
                        {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri}>
                    {sheet.header.map((_, i) => <td key={i} className={map[i] ? "" : "is-off"}>{r[i] || <span className="ca-blank">Empty</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ca-sec-s t-caption">{sheet.rows.length > 5 ? `First 5 of ${sheet.rows.length} rows` : `All ${plural(sheet.rows.length, "row")}`}</p>
        </section>

        {noName ? (
          <p className="ca-warn t-body-sm" role="alert"><WarningCircle size={15} aria-hidden="true" /> Choose which column holds the full name. It's the one field every person needs.</p>
        ) : (
          <section className="ca-sec">
            <h3 className="ca-sec-h t-title-sm">Before you import</h3>
            <div className="ca-sum">
              <div className="ca-stat is-lead"><span className="t-num-lg">{t.fresh}</span><span className="t-body-sm">{LIVE ? "to check against SuperHyre" : "new to SuperHyre"}</span></div>
              <div className="ca-stat"><span className="t-num-md">{t.duplicates}</span><span className="t-body-sm">{LIVE ? "already here or repeated" : "already here"}</span></div>
              <div className="ca-stat"><span className="t-num-md">{t.errors}</span><span className="t-body-sm">{t.errors === 1 ? "row needs" : "rows need"} fixing</span></div>
            </div>
            {LIVE && t.fresh > 0 && <p className="ca-sec-s t-caption">Anyone you already have is found when you import, and skipped or updated as you choose below.</p>}

            {dupes.length > 0 && (
              <details className="ca-det" open={dupes.length <= 4}>
                <summary className="t-label">{LIVE ? "Already here or repeated" : "Already here"} ({dupes.length})</summary>
                <ul className="ca-rows">
                  {dupes.map((v) => (
                    <li key={v.row}>
                      <span className="ca-row-n t-caption">Row {v.row}</span>
                      <span className="t-body-sm">
                        {v.kind === "duplicate"
                          ? <><b>{v.draft.name}</b> matches {v.match.name} by {ID_LABEL[v.by]} <span className="ca-key">{v.value}</span></>
                          : <><b>{v.draft.name}</b> has the same {ID_LABEL[v.by]} as row {v.first} and is skipped</>}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {errors.length > 0 && (
              <details className="ca-det" open={errors.length <= 4}>
                <summary className="t-label">Need fixing ({errors.length})</summary>
                <ul className="ca-rows">
                  {errors.map((v) => (
                    <li key={v.row}>
                      <span className="ca-row-n t-caption">Row {v.row}</span>
                      <span className="t-body-sm">{v.draft.name ? <><b>{v.draft.name}</b>: </> : null}{v.reasons.join(". ")}.</span>
                    </li>
                  ))}
                </ul>
                <p className="ca-sec-s t-caption">These rows are left out. Fix them in the file and upload it again; people already added won't be added twice.</p>
              </details>
            )}

            {(LIVE ? t.fresh > 0 : updatable.length > 0) && (
              <div className="ca-f ca-choice">
                <span className="ca-l t-label" id="ca-dupe-l">{LIVE ? "If someone is already here" : "For people already here"}</span>
                <div className="ca-seg" role="radiogroup" aria-labelledby="ca-dupe-l">
                  <button type="button" role="radio" aria-checked={!update} className={!update ? "is-on" : ""} onClick={() => setUpdate(false)}>Skip duplicates</button>
                  <button type="button" role="radio" aria-checked={update} className={update ? "is-on" : ""} onClick={() => setUpdate(true)}>Update them with new details</button>
                </div>
                <span className="ca-hint t-caption">{update
                  ? LIVE ? "Filled-in cells fill gaps in their records. Nothing already there is changed." : "Filled-in cells are written to their records. Empty cells never erase anything."
                  : "Their records stay exactly as they are."}</span>
              </div>
            )}
            {owners.length > 1 && t.fresh > 0 && (
              <div className="ca-f ca-choice">
                <OwnerPick id="ca-csv-owner" me={me} value={owner} onChange={setOwner} owners={owners} hint="Owns everyone this file adds" />
              </div>
            )}
          </section>
        )}
      </div>
      <Foot picker={picker} note={failed ? <span className="ca-err">{failed}</span> : undefined}>
        <button type="button" className="ct-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ct-btn is-primary" onClick={doImport} disabled={busy || noName || (!t.fresh && !(update && updatable.length) && !(campaign && updatable.length))}>
          {busy ? <><Loader size="sm" tone="inherit" /> Importing</> : <><UserPlus size={14} weight="bold" /> {label}</>}
        </button>
      </Foot>
    </>
  );
}
