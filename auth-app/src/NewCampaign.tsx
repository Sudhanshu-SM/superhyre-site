import { Check, Minus, Plus, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FACET_LABEL, read } from "./brief";
import type { AgentName, CampaignDraft, DraftProblems } from "./campaignDraft";
import {
  AGENTS, CHANNEL_LABEL, EMPLOYMENT_LABEL, NOTICE_OPTIONS, PRIORITY_LABEL, SENIORITIES, VISIBILITY_HELP, VISIBILITY_LABEL, WORK_MODE_LABEL,
  addTag, blankDraft, draftProblems, ownCampaign, prefillFromClient, rowFromDraft, withNewClient,
} from "./campaignDraft";
import type { CampaignRow, Channel, Employment, Priority, Visibility, WorkMode } from "./campaignsData";
import { DEPARTMENTS } from "./campaignsData";
import { attachmentApi } from "./api/agent";
import { api, LIVE } from "./api/client";
import { addCampaignRow, clientById, ensureClientDetail, memberName, resolveCampaignId, resolveClientId, saveClient, saveStages, setCampaignClient, useClients, useTeam } from "./campaignStore";
import { getStages } from "./api/stages";
import type { PresetId, StageRow } from "./boardStages";
import { DEFAULT_STAGES, PRESETS, adoptIds, presetOf, presetRows, stagesFrom, stagesFromRows } from "./boardStages";
import { StagesDialog } from "./StagesDialog";
import { can, standingOf } from "./can";
import { onWorkspaceChange } from "./api/identity";
import { INDUSTRIES, clientFromDraft, clientProblems, EMPTY_DRAFT } from "./clients";
import { liveForms } from "./formsStore";
import { reportProblem } from "./problems";
import { useSession } from "./roleStore";
import { Avatar } from "./CandidateBits";
import { ClientLogo } from "./ClientLogo";
import { ClientNameAdd } from "./ClientPicker";
import { Dialog, useBackCloses } from "./ui";
import { ConfirmDialog } from "./RoleBits";
import "./newcampaign.css";

/**
 * New campaign — everything a search needs, in the order an admin is asked
 * it on an intake call: who it's for, what the role is, what it pays, what
 * a good candidate has, the brief, who works it, and the fee.
 *
 * One scrolling form with a section index on the left, rather than a wizard:
 * an admin often has half the answers and wants to see the rest at a glance.
 * Only the role's name is needed to save a draft; starting a search also
 * needs a location (or remote) and at least one agent. A campaign is always
 * for a client, picked or added here. Picking a client fills its hiring
 * manager, fee and city.
 */

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "role", label: "Role" },
  { id: "comp", label: "Compensation" },
  { id: "req", label: "Requirements" },
  { id: "brief", label: "Brief" },
  { id: "team", label: "Team and setup" },
  { id: "pipeline", label: "Pipeline" },
  { id: "fee", label: "Fee" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const SECTION_OF: Partial<Record<keyof CampaignDraft, SectionId>> = {
  name: "basics", clientId: "basics", openings: "role", officeDays: "role", locations: "role", targetDate: "role",
  compMin: "comp", compMax: "comp", expMin: "req", expMax: "req", agents: "team", channels: "team",
};

/**
 * What to say once a new campaign is saved. A started campaign has no role spec yet,
 * so the search waits for one; saying "sourcing has started" would be untrue.
 */
export function createdMessage(row: Pick<CampaignRow, "name">): string {
  return `${row.name} created. Approve its requirements and the search starts.`;
}

/**
 * The draft with a client picked (none for ""), the client read from the store as it is now. The dialog's own
 * list of clients is the one it drew last: a client added a moment ago (the inline "Add client") is not in it
 * yet, so looking it up there picked nothing and the select went back to asking for a client.
 * An id nobody knows leaves the draft as it was.
 */
export function pickClient(cur: CampaignDraft, id: string): CampaignDraft {
  if (!id) return prefillFromClient(cur, undefined);
  const found = clientById(id);
  return found ? prefillFromClient(cur, found) : cur;
}

/* ── a draft that survives the dialog being torn down ── */

/*
 * Switching workspace (here or in another tab) rebuilds the console, which closes this
 * dialog without anyone choosing to. What was typed is kept for this browser tab and
 * offered again the next time the dialog opens; closing it on purpose forgets it.
 *
 * It is offered only after a real switch of workspace (the console says so: `onWorkspaceChange`). A dialog that
 * was merely left (a click on another page, the browser's Back) is not "the campaign you were writing when you
 * switched": its draft is forgotten the next time the dialog opens, which then starts blank.
 */
const KEPT = "superhyre:new-campaign-draft";
const SWITCHED = "superhyre:new-campaign-draft:switched";
export function keepDraft(d: CampaignDraft | null): void {
  try {
    if (d) window.sessionStorage.setItem(KEPT, JSON.stringify(d));
    else { window.sessionStorage.removeItem(KEPT); window.sessionStorage.removeItem(SWITCHED); }
  } catch {
    /* storage can be off; the draft is then simply not kept */
  }
}
export function keptDraft(): CampaignDraft | null {
  try {
    const raw = window.sessionStorage.getItem(KEPT);
    if (!raw) return null;
    const kept = JSON.parse(raw) as Partial<CampaignDraft>;
    /* A draft kept before a company could be named for the campaign has no such field. */
    return { ...(kept as CampaignDraft), newClient: kept.newClient ?? "", clientId: "" };
  } catch {
    return null;
  }
}

/** The workspace changed while a draft was kept: that draft is the one worth offering again. */
export function markDraftSwitched(): void {
  try {
    if (window.sessionStorage.getItem(KEPT)) window.sessionStorage.setItem(SWITCHED, "1");
  } catch {
    /* nothing to mark */
  }
}
onWorkspaceChange(markDraftSwitched);

/**
 * The draft to offer when the dialog opens: the kept one after a real switch of workspace, once. Any other kept
 * draft is stale (the dialog was only left) and is forgotten, so nothing old is ever mixed into a new campaign.
 */
export function draftToOffer(): CampaignDraft | null {
  let switched = false;
  try { switched = window.sessionStorage.getItem(SWITCHED) === "1"; } catch { /* no storage, no draft */ }
  const kept = switched ? keptDraft() : null;
  keepDraft(null);
  return kept;
}

export function NewCampaignDialog({ open, onClose: close, onCreated, clientId }: {
  open: boolean;
  onClose: () => void;
  /** `saved` resolves true once the server has the campaign, false if it refused it. */
  onCreated: (row: CampaignRow, saved: Promise<boolean>) => void;
  /** Opens with this client picked, as from a client's page. */
  clientId?: string;
}) {
  const session = useSession();
  const { clients } = useClients();
  const team = useTeam();
  /* A recruiter's campaign is theirs alone: who owns it and who is on it are an admin's to decide, and a client
     is one they can already see (adding one is an admin's). */
  const own = standingOf(session) === "recruiter";
  const mayAddClient = can(standingOf(session), "client.manage");
  const me = memberName(session.userId) ?? session.name;
  const [d, setD] = useState<CampaignDraft>(() => blankDraft(session.name));
  const [tried, setTried] = useState(false);
  const [at, setAt] = useState<SectionId>("basics");
  const body = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /* A second click before the dialog closes must not create a second campaign. */
  const sent = useRef(false);
  const [sending, setSending] = useState(false);
  /* What the draft looked like when it opened: anything else is typing worth keeping. */
  const opened = useRef("");
  const [discarding, setDiscarding] = useState(false);
  const [restored, setRestored] = useState(false);
  /* The pipeline is optional: it starts as the standard one and is only sent when it was changed. */
  const [pipeline, setPipeline] = useState<StageRow[]>(() => presetRows("standard"));
  const [stagesOpen, setStagesOpen] = useState(false);
  const draftStages = useMemo(() => stagesFromRows(pipeline, DEFAULT_STAGES), [pipeline]);
  const chosen = presetOf(pipeline);
  const pipeOptions = { ...(Object.fromEntries(PRESETS.map((p) => [p.id, p.label])) as Record<PresetId, string>), ...(chosen ? {} : { custom: "Your own" }) } as Record<PresetId | "custom", string>;
  /* Closing on purpose forgets the kept draft; being torn down doesn't. */
  const onClose = () => {
    keepDraft(null);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const base = blankDraft(own ? me : team.includes(session.name) ? session.name : team[0] ?? session.name);
    const first = clientId ? prefillFromClient(base, clients.find((c) => c.id === clientId)) : base;
    const kept = draftToOffer();
    const start = kept ?? first;
    setD(own ? ownCampaign(start, me) : start);
    setRestored(!!kept);
    opened.current = JSON.stringify(first);
    setDiscarding(false);
    setTried(false);
    setPipeline(presetRows("standard"));
    setStagesOpen(false);
    setAt("basics");
    sent.current = false;
    setSending(false);
    /* A restored name is selected, so typing over it replaces it instead of adding to it. */
    const t = window.setTimeout(() => { nameRef.current?.focus(); if (kept) nameRef.current?.select(); }, 60);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !sent.current) keepDraft(JSON.stringify(d) === opened.current ? null : d);
  }, [open, d]);

  // Back closes the dialog; with something typed, it asks first instead of losing it.
  useBackCloses(open, () => {
    if (sent.current || JSON.stringify(d) === opened.current) return onClose();
    setDiscarding(true);
    return false;
  });

  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const problems: DraftProblems = tried ? draftProblems(d, undefined, { agents: !LIVE }) : {};
  const client = clients.find((c) => c.id === resolveClientId(d.clientId));
  /* The client list carries only each client's primary contact; picking one loads them all,
     so the hiring manager can be anyone at that client. */
  useEffect(() => { if (d.clientId) ensureClientDetail(d.clientId); }, [d.clientId]);

  /* The index follows the scroll. */
  const onScroll = () => {
    const el = body.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + 40;
    let hit: SectionId = "basics";
    for (const s of SECTIONS) {
      const sec = el.querySelector<HTMLElement>(`[data-sec="${s.id}"]`);
      if (sec && sec.getBoundingClientRect().top <= top) hit = s.id;
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) hit = "fee";
    setAt(hit);
  };
  const jump = (id: SectionId) => {
    const el = body.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (el && body.current) body.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  };

  const submit = () => {
    if (sent.current) return;
    const p = draftProblems(d, undefined, { agents: !LIVE });
    setTried(true);
    const first = (Object.keys(p) as (keyof CampaignDraft)[])[0];
    if (first) { jump(SECTION_OF[first] ?? "basics"); return; }
    sent.current = true;
    keepDraft(null);
    setSending(true);
    const draft = own ? ownCampaign(d, me) : d;
    const row = rowFromDraft(draft, team);
    const saved = addCampaignRow(row);
    if (draft.clientId) setCampaignClient(row.id, draft.clientId);
    // The screening form the brief asked for, once the campaign exists on the server.
    if (LIVE && d.screening !== "none") {
      const name = `${d.name.trim()} screening`;
      void saved.then((ok) => {
        if (!ok) return;
        const body = d.screening === "generate"
          ? { name, template: "screening", addMustHaves: true }
          : { name, copyFrom: d.screening };
        return api("POST", `/v1/campaigns/${resolveCampaignId(row.id)}/forms`, body);
      }).catch(() => reportProblem("The campaign was created, but its screening form wasn't. Add one from Forms."));
    }
    // The stages the form chose, once the campaign exists on the server; the standard ones are what it starts with.
    if (chosen !== "standard") {
      void saved.then(async (ok) => {
        if (!ok) return;
        const have = LIVE ? await getStages(resolveCampaignId(row.id)).then((l) => stagesFrom(l), () => DEFAULT_STAGES) : DEFAULT_STAGES;
        await saveStages(row.id, adoptIds(pipeline, have));
      });
    }
    onCreated(row, saved);
  };

  const where = d.workMode === "remote" ? "remote" : d.locations[0];
  const summary = d.name.trim()
    ? <><strong>{d.name.trim()}</strong>{client ? <> for {client.name}</> : d.newClient.trim() ? <> for {d.newClient.trim()}</> : null}{where ? <>, {where}</> : null}, {d.openings} {d.openings === 1 ? "opening" : "openings"}</>
    : "Name the role and its client to create it.";
  const errCount = Object.keys(problems).length;

  return (
    <>
    <StagesDialog
      open={stagesOpen} onClose={() => setStagesOpen(false)} stages={draftStages} title="Pipeline stages" save="Use these stages"
      onSave={(rows) => { setPipeline(rows); return Promise.resolve(true); }}
    />
    <Dialog open={open} onClose={onClose} label="New campaign" size="lg">
      <form className="ncx" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <header className="ncx-head">
          <h2 className="t-title">New campaign</h2>
          <p className="t-body-sm">
            {restored
              ? "Here's the campaign you were writing when you switched organisation."
              : "The role and its client are needed. The more you add here, the less the agent has to ask later."}
          </p>
        </header>

        <div className="ncx-main">
          <nav className="ncx-index" aria-label="Sections">
            {SECTIONS.map((s) => {
              const bad = (Object.keys(problems) as (keyof CampaignDraft)[]).some((k) => SECTION_OF[k] === s.id);
              return (
                <button key={s.id} type="button" className={`ncx-index-i${at === s.id ? " is-on" : ""}${bad ? " is-bad" : ""}`} onClick={() => jump(s.id)} aria-current={at === s.id ? "true" : undefined}>
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="ncx-body" ref={body} onScroll={onScroll}>
            {/* ── basics ── */}
            <Section id="basics" title="Basics">
              <Field label="Role" error={problems.name} wide>
                <input ref={nameRef} className="ncx-in is-big" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Senior Backend Engineer" autoComplete="off" spellCheck={false} />
              </Field>
              <ClientField d={d} onPick={(id) => setD((cur) => pickClient(cur, id))} onName={(name) => setD((cur) => withNewClient(cur, name))} mayAdd={mayAddClient} error={problems.clientId} />
              <Field label="Department">
                <select className="ncx-in" value={d.department} onChange={(e) => set("department", e.target.value)}>
                  {DEPARTMENTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Hiring manager" hint={client ? (client.contacts?.length ? `From ${client.name}'s contacts` : `${client.name} has no contacts yet`) : "Pick a client to choose from their contacts"}>
                {client?.contacts?.length ? (
                  <select className="ncx-in" value={d.hiringManager} onChange={(e) => set("hiringManager", e.target.value)}>
                    <option value="">Not decided yet</option>
                    {client.contacts.map((c) => <option key={c.id} value={c.name}>{c.name}{c.title ? `, ${c.title}` : ""}</option>)}
                  </select>
                ) : (
                  <input className="ncx-in" value={d.hiringManager} onChange={(e) => set("hiringManager", e.target.value)} placeholder="Full name" />
                )}
              </Field>
            </Section>

            {/* ── role ── */}
            <Section id="role" title="Role">
              <Field label="Seniority">
                <select className="ncx-in" value={d.seniority} onChange={(e) => set("seniority", e.target.value)}>
                  {SENIORITIES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Employment">
                <Seg<Employment> value={d.employment} options={EMPLOYMENT_LABEL} onChange={(v) => set("employment", v)} />
              </Field>
              <Field label="Work mode" error={problems.officeDays}>
                <div className="ncx-inline">
                  <Seg<WorkMode> value={d.workMode} options={WORK_MODE_LABEL} onChange={(v) => set("workMode", v)} />
                  {d.workMode === "hybrid" && (
                    <Stepper value={d.officeDays} min={1} max={5} onChange={(v) => set("officeDays", v)} unit={d.officeDays === 1 ? "day in office" : "days in office"} />
                  )}
                </div>
              </Field>
              <Field label="Openings" error={problems.openings}>
                <Stepper value={d.openings} min={1} max={50} onChange={(v) => set("openings", v)} unit={d.openings === 1 ? "hire" : "hires"} />
              </Field>
              <Field label={d.workMode === "remote" ? "Locations (optional)" : "Locations"} error={problems.locations} hint={d.workMode === "remote" ? "Where candidates may live, if it matters" : "Press Enter after each city"} wide>
                <Tags value={d.locations} onChange={(v) => set("locations", v)} placeholder="e.g. Bengaluru" />
              </Field>
              <Field label="Target date" error={problems.targetDate} hint="Optional">
                <div className="ncx-inline">
                  <Seg<"start" | "close"> value={d.dateKind} options={{ start: "Start by", close: "Close by" }} onChange={(v) => set("dateKind", v)} />
                  <input className="ncx-in is-date" type="date" value={d.targetDate} onChange={(e) => set("targetDate", e.target.value)} aria-label="Target date" />
                </div>
              </Field>
            </Section>

            {/* ── compensation ── */}
            <Section id="comp" title="Compensation">
              <Field label="CTC range, in lakhs per year" error={problems.compMin ?? problems.compMax} wide>
                <div className="ncx-inline">
                  <select className="ncx-in is-cur" value={d.currency} onChange={(e) => set("currency", e.target.value)} aria-label="Currency">
                    {["INR", "USD", "EUR", "GBP", "SGD", "AED"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <input className="ncx-in is-num" inputMode="decimal" value={d.compMin} onChange={(e) => set("compMin", e.target.value)} placeholder="Min" aria-label="Minimum CTC in LPA" aria-invalid={!!problems.compMin} />
                  <span className="ncx-to" aria-hidden="true">to</span>
                  <input className="ncx-in is-num" inputMode="decimal" value={d.compMax} onChange={(e) => set("compMax", e.target.value)} placeholder="Max" aria-label="Maximum CTC in LPA" aria-invalid={!!problems.compMax} />
                  <span className="ncx-unit t-body-sm">LPA</span>
                </div>
              </Field>
              <Field label="Variable or equity" hint="Optional" wide>
                <input className="ncx-in" value={d.variable} onChange={(e) => set("variable", e.target.value)} placeholder="e.g. 10% variable, ESOPs vesting over 4 years" />
              </Field>
              <Toggle on={d.compShown} onChange={(v) => set("compShown", v)} title="Show the range to candidates" sub="Outreach and the screening form mention it. Off keeps it between you and the client." />
            </Section>

            {/* ── requirements ── */}
            <Section id="req" title="Requirements">
              <Field label="Experience, in years" error={problems.expMin ?? problems.expMax}>
                <div className="ncx-inline">
                  <input className="ncx-in is-num" inputMode="numeric" value={d.expMin} onChange={(e) => set("expMin", e.target.value)} placeholder="Least" aria-label="Least years of experience" />
                  <span className="ncx-to" aria-hidden="true">to</span>
                  <input className="ncx-in is-num" inputMode="numeric" value={d.expMax} onChange={(e) => set("expMax", e.target.value)} placeholder="Most" aria-label="Most years of experience" />
                </div>
              </Field>
              <Field label="Notice period">
                <select className="ncx-in" value={d.notice} onChange={(e) => set("notice", e.target.value)}>
                  {NOTICE_OPTIONS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Must-have skills" hint="Candidates without these rank lower" wide>
                <Tags value={d.mustHave} onChange={(v) => set("mustHave", v)} placeholder="e.g. Go, Postgres at scale" />
              </Field>
              <Field label="Nice to have" wide>
                <Tags value={d.niceToHave} onChange={(v) => set("niceToHave", v)} placeholder="e.g. Kafka, fintech" />
              </Field>
              <Field label="Education" hint="Optional">
                <input className="ncx-in" value={d.education} onChange={(e) => set("education", e.target.value)} placeholder="e.g. Any engineering degree" />
              </Field>
              <Field label="Dealbreakers" hint="Optional">
                <input className="ncx-in" value={d.dealbreakers} onChange={(e) => set("dealbreakers", e.target.value)} placeholder="e.g. Only services companies" />
              </Field>
            </Section>

            {/* ── brief ── */}
            <Section id="brief" title="Brief">
              <JdField value={d.jd} onChange={(v) => set("jd", v)} onSkills={(xs) => set("mustHave", addTag(d.mustHave, xs.join(",")))} />
              <Field label="Intake notes" hint="What the hiring manager said, in any order" wide>
                <textarea className="ncx-in is-area" rows={3} value={d.intake} onChange={(e) => set("intake", e.target.value)} placeholder="e.g. Team of 6 on the ledger. Wants someone who has carried a pager." />
              </Field>
            </Section>

            {/* ── team and setup ── */}
            <Section id="team" title="Team and setup">
              {own ? (
                <Field label="Owner" hint="You own it and you're the only one on it. Your admins see it, and can add teammates later." wide>
                  <div className="ncx-chips">
                    <span className="ncx-chip has-face is-on"><Avatar name={me} hue="brand" size={20} />{me}</span>
                  </div>
                </Field>
              ) : (
                <>
                  <Field label="Owner" wide>
                    <div className="ncx-chips" role="radiogroup" aria-label="Owner">
                      {team.map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={d.owner === m} className={`ncx-chip has-face${d.owner === m ? " is-on" : ""}`} onClick={() => setD((cur) => ({ ...cur, owner: m, recruiters: cur.recruiters.filter((r) => r !== m) }))}>
                          <Avatar name={m} hue="brand" size={20} />{m}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Recruiters" hint="The owner is always on it" wide>
                    <div className="ncx-chips" role="group" aria-label="Recruiters">
                      {team.filter((m) => m !== d.owner).map((m) => {
                        const on = d.recruiters.includes(m);
                        return (
                          <button key={m} type="button" aria-pressed={on} className={`ncx-chip has-face${on ? " is-on" : ""}`} onClick={() => set("recruiters", on ? d.recruiters.filter((x) => x !== m) : [...d.recruiters, m])}>
                            <Avatar name={m} hue="brand" size={20} />{m}{on && <Check size={12} weight="bold" />}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </>
              )}
              {/* With real data nothing starts these agents or sends on these channels yet; the
                  search starts once the role spec is approved and outreach goes through Gmail. */}
              {!LIVE && (
                <>
                  <Field label="Agents to start" error={problems.agents} hint="They begin when you press Create and start" wide>
                    <Multi<AgentName> value={d.agents} options={AGENTS} onChange={(v) => set("agents", v)} />
                  </Field>
                  <Field label="Outreach channels" error={problems.channels} wide>
                    <Multi<Channel> value={d.channels} options={["email", "whatsapp", "linkedin"]} label={(c) => CHANNEL_LABEL[c]} onChange={(v) => set("channels", v)} />
                  </Field>
                </>
              )}
              <ScreeningField value={d.screening} onChange={(v) => set("screening", v)} />
              <Field label="Priority">
                <Seg<Priority> value={d.priority} options={PRIORITY_LABEL} onChange={(v) => set("priority", v)} />
              </Field>
              {/* Personal is one person's alone: who can see a campaign is not a question there. */}
              {session.standing !== "personal" && (
                <Field label="Who can see it" hint={VISIBILITY_HELP}>
                  <select className="ncx-in" value={d.visibility} onChange={(e) => set("visibility", e.target.value as Visibility)}>
                    {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                  </select>
                </Field>
              )}
            </Section>

            {/* ── pipeline ── */}
            <Section id="pipeline" title="Pipeline">
              <Field label="Stages" hint="Optional. These are the columns of the board; you can change them any time from the board." wide>
                <div className="ncx-inline">
                  <Seg<PresetId | "custom"> value={chosen ?? "custom"} options={pipeOptions} onChange={(v) => { if (v !== "custom") setPipeline((cur) => presetRows(v, cur)); }} />
                  <button type="button" className="ct-btn" onClick={() => setStagesOpen(true)}>Edit stages</button>
                </div>
                <p className="ncx-pipe t-body-sm">
                  {[...pipeline.map((r) => r.name.trim() || "New stage"), "Hired"].join("  ›  ")}
                  {pipeline.some((r) => r.clientView) && <> · your client sees {pipeline.find((r) => r.clientView)?.name.trim()}</>}
                </p>
              </Field>
            </Section>

            {/* ── fee ── */}
            <Section id="fee" title="Fee">
              <Field label="Fee terms" hint={client?.fee && client.fee === d.fee ? `From ${client.name}'s terms. Change it for this campaign only.` : client ? `${client.name} has no agreed terms yet` : "Usually a share of first-year CTC"} wide>
                <input className="ncx-in" value={d.fee} onChange={(e) => set("fee", e.target.value)} placeholder="e.g. 18% of first-year CTC" />
              </Field>
            </Section>
          </div>
        </div>

        <footer className="ncx-foot">
          <p className="ncx-sum t-body-sm" aria-live="polite">
            {errCount ? <span className="ncx-sum-bad">{errCount === 1 ? "One thing needs a look" : `${errCount} things need a look`} before it can be created.</span> : summary}
          </p>
          <button type="button" className="ncx-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="ncx-btn is-primary" disabled={sending}>Create campaign</button>
        </footer>
      </form>
    </Dialog>
    <ConfirmDialog
      open={open && discarding}
      title="Leave this campaign unsaved?"
      body="What you've filled in so far won't be kept."
      confirm="Leave without saving"
      onConfirm={() => { setDiscarding(false); onClose(); }}
      onClose={() => setDiscarding(false)}
    />
    </>
  );
}

/* ── the client, with an inline add ── */

/** The select's value for a company named for this campaign that is not a client yet. */
const NAMED = "named";

export function ClientField({ d, onPick, onName, mayAdd, error }: {
  d: CampaignDraft;
  onPick: (id: string) => void;
  /** A company that is not a client yet was named: the server adds it with the campaign. */
  onName: (name: string) => void;
  /** An admin adds a client with its details; anyone else names the company and the server adds it. */
  mayAdd: boolean;
  /** A campaign is always for a client: said under the field until one is picked or named. */
  error?: string | undefined;
}) {
  const { clients } = useClients();
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ ...EMPTY_DRAFT });
  const [tried, setTried] = useState(false);
  const errs = tried ? clientProblems(v, clients) : {};
  const shown = clients.filter((c) => c.status !== "inactive" || c.id === resolveClientId(d.clientId));
  const add = () => {
    setTried(true);
    if (Object.keys(clientProblems(v, clients)).length) return;
    const made = saveClient(clientFromDraft(v, `cl-${Date.now().toString(36)}`));
    // Picked at once under its working id. The select and the create read it through `resolveClientId`, so the
    // id the server gives it a moment later is the same client, and nobody's later choice is overwritten.
    onPick(made.id);
    setAdding(false);
    setV({ ...EMPTY_DRAFT });
    setTried(false);
  };
  const picked = clients.find((c) => c.id === resolveClientId(d.clientId));
  const named = d.newClient.trim();
  return (
    <div className={`ncx-f${error ? " is-bad" : ""}`}>
      <span className="ncx-l">Client</span>
      {!adding ? (
        <div className="ncx-inline">
          {picked && <ClientLogo client={picked} size={28} />}
          <select
            className="ncx-in is-grow"
            value={named ? NAMED : picked ? resolveClientId(d.clientId) : ""}
            onChange={(e) => (e.target.value === "+" ? setAdding(true) : onPick(e.target.value))}
            aria-label="Client"
            aria-invalid={error ? true : undefined}
          >
            {!picked && !named && <option value="" disabled>Choose a client</option>}
            {shown.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === "prospect" ? " (prospect)" : ""}</option>)}
            {named && <option value={NAMED}>{named} (new)</option>}
            <option value="+">Add a new client…</option>
          </select>
        </div>
      ) : !mayAdd ? (
        <ClientNameAdd
          clients={clients}
          onCancel={() => setAdding(false)}
          onDone={(made) => { if (made.kind === "pick") onPick(made.id); else onName(made.name); setAdding(false); }}
        />
      ) : (
        <div className="ncx-add">
          <div className="ncx-add-g">
            <label className="ncx-f"><span className="ncx-l">Company</span><input className="ncx-in" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Acme Fintech" aria-invalid={!!errs.name} />{errs.name && <small className="ncx-err">{errs.name}</small>}</label>
            <label className="ncx-f"><span className="ncx-l">Website</span><input className="ncx-in" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} placeholder="acme.in" aria-invalid={!!errs.website} />{errs.website && <small className="ncx-err">{errs.website}</small>}</label>
            <label className="ncx-f"><span className="ncx-l">Industry</span>
              <select className="ncx-in" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })}><option value="">Choose</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="ncx-f"><span className="ncx-l">Hiring manager</span><input className="ncx-in" value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} placeholder="Full name" aria-invalid={!!errs.contactName} />{errs.contactName && <small className="ncx-err">{errs.contactName}</small>}</label>
            <label className="ncx-f"><span className="ncx-l">Their email</span><input className="ncx-in" type="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} placeholder="name@acme.in" aria-invalid={!!errs.contactEmail} />{errs.contactEmail && <small className="ncx-err">{errs.contactEmail}</small>}</label>
            <label className="ncx-f"><span className="ncx-l">Fee terms</span><input className="ncx-in" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} placeholder="e.g. 18% of first-year CTC" /></label>
          </div>
          <div className="ncx-add-act">
            <button type="button" className="ncx-btn is-sm" onClick={() => { setAdding(false); setTried(false); }}>Cancel</button>
            <button type="button" className="ncx-btn is-sm is-dark" onClick={add}>Add client</button>
          </div>
        </div>
      )}
      {error && <small className="ncx-err">{error}</small>}
    </div>
  );
}

/* ── the job description ── */

function JdField({ value, onChange, onSkills }: { value: string; onChange: (v: string) => void; onSkills: (xs: string[]) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const facets = useMemo(() => {
    const seen = new Set<string>();
    return read(value).filter((m) => (seen.has(m.means) ? false : (seen.add(m.means), true))).slice(0, 8);
  }, [value]);
  const skills = facets.filter((f) => f.facet === "skill").map((f) => f.text);
  const load = (f: File) => {
    setName(f.name);
    if (/\.(txt|md)$/i.test(f.name)) { void f.text().then((t) => onChange(t.trim())); return; }
    if (!LIVE) {
      onChange(value || `${f.name} attached. The agent reads it when the campaign starts.`);
      return;
    }
    /* A PDF, a Word file or an image is read on the server, as the Agent page's job description is: what it says
       becomes the description, and says so in the box, not a line that the file was attached. */
    setReading(true);
    attachmentApi.read(f, f.type || "application/octet-stream").then(
      (r) => { setReading(false); onChange(r.text.trim() || value); },
      () => { setReading(false); setName(null); onChange(value); },
    );
  };
  return (
    <div className="ncx-f is-wide">
      <span className="ncx-l">
        Job description
        <button type="button" className="ncx-link" onClick={() => file.current?.click()}><UploadSimple size={13} aria-hidden="true" />Upload a file</button>
        <input ref={file} type="file" accept=".pdf,.doc,.docx,.txt,.md" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
      </span>
      <textarea className="ncx-in is-area" rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste the JD, or upload it" />
      {name && <small className="ncx-hint">{reading ? `Reading ${name}` : `From ${name}`}</small>}
      {facets.length > 0 && (
        <div className="ncx-read">
          <span className="t-caption">The agent reads:</span>
          {facets.map((f) => <span key={`${f.facet}-${f.means}`} className="ncx-read-i t-caption" title={FACET_LABEL[f.facet]}>{f.means}</span>)}
          {skills.length > 0 && <button type="button" className="ncx-link" onClick={() => onSkills(skills)}>Add skills to must-haves</button>}
        </div>
      )}
    </div>
  );
}

type ReusableForm = { id: string; name: string; campaignName?: string };

/** Forms to reuse: every campaign's forms from the server; this session's forms without one. */
function useReusableForms(): readonly ReusableForm[] {
  const local = useMemo(() => liveForms(), []);
  const [remote, setRemote] = useState<readonly ReusableForm[]>([]);
  useEffect(() => {
    if (!LIVE) return;
    let current = true;
    api<{ forms: Array<{ id: string; name: string; campaignName: string }> }>("GET", "/v1/forms").then(
      (r) => current && setRemote(r.forms),
      () => {},
    );
    return () => { current = false; };
  }, []);
  return LIVE ? remote : local;
}

function ScreeningField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const forms = useReusableForms();
  const kind = value === "none" || value === "generate" ? value : "reuse";
  return (
    <Field label="Screening form" wide>
      <div className="ncx-inline">
        <Seg<"none" | "generate" | "reuse"> value={kind}
          options={(forms.length ? { none: "None", generate: "Draft one for me", reuse: "Reuse a form" } : { none: "None", generate: "Draft one for me" }) as Record<"none" | "generate" | "reuse", string>}
          onChange={(v) => onChange(v === "reuse" ? forms[0]?.id ?? "none" : v)} />
        {kind === "reuse" && (
          <select className="ncx-in is-grow" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Form to reuse">
            {forms.map((f) => <option key={f.id} value={f.id}>{f.campaignName ? `${f.name} (${f.campaignName})` : f.name}</option>)}
          </select>
        )}
      </div>
    </Field>
  );
}

/* ── small parts ── */

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section className="ncx-sec" data-sec={id} aria-labelledby={`ncx-${id}`}>
      <h3 className="ncx-sec-h t-title-sm" id={`ncx-${id}`}>{title}</h3>
      <div className="ncx-grid">{children}</div>
    </section>
  );
}

function Field({ label, hint, error, wide, children }: { label: string; hint?: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`ncx-f${wide ? " is-wide" : ""}${error ? " is-bad" : ""}`}>
      <span className="ncx-l">{label}</span>
      {children}
      {error ? <small className="ncx-err">{error}</small> : hint ? <small className="ncx-hint">{hint}</small> : null}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Readonly<Record<T, string>>; onChange: (v: T) => void }) {
  return (
    <div className="ncx-seg" role="radiogroup">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? "is-on" : ""} onClick={() => onChange(k)}>{options[k]}</button>
      ))}
    </div>
  );
}

function Multi<T extends string>({ value, options, onChange, label = (x) => x }: { value: readonly T[]; options: readonly T[]; onChange: (v: T[]) => void; label?: (x: T) => string }) {
  return (
    <div className="ncx-chips" role="group">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} className={`ncx-chip${on ? " is-on" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {on && <Check size={12} weight="bold" aria-hidden="true" />}{label(o)}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (v: number) => void; unit: string }) {
  return (
    <span className="ncx-step">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer"><Minus size={12} weight="bold" /></button>
      <span className="ncx-step-v">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More"><Plus size={12} weight="bold" /></button>
      <span className="ncx-step-u t-body-sm">{unit}</span>
    </span>
  );
}

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`ncx-toggle is-wide${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span className="ncx-toggle-t"><strong className="t-body-strong">{title}</strong><span className="t-body-sm">{sub}</span></span>
      <span className="ncx-switch" aria-hidden="true"><span /></span>
    </button>
  );
}

export function Tags({ value, onChange, placeholder }: { value: readonly string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState("");
  const commit = () => { if (t.trim()) { onChange(addTag(value, t)); setT(""); } };
  return (
    <div className="ncx-tags" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {value.map((x) => (
        <span key={x} className="ncx-tag">{x}<button type="button" onClick={() => onChange(value.filter((y) => y !== x))} aria-label={`Remove ${x}`}><X size={10} weight="bold" /></button></span>
      ))}
      <input
        value={t}
        onChange={(e) => (e.target.value.includes(",") ? (onChange(addTag(value, e.target.value)), setT("")) : setT(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Backspace" && !t && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length ? "" : placeholder}
      />
    </div>
  );
}
