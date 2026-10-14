import {
  ArrowRight, ArrowSquareOut, Broadcast, CalendarBlank, CaretCircleDown, CaretDown, ChatCircleText, Check, CheckSquare, Copy, DotsSix, DotsSixVertical, Eye, Hash,
  Link as LinkIcon, LinkSimple, ListBullets, LockSimple, PaperPlaneTilt, Pause, PencilSimple, Plus,
  RadioButton, Rows, Sparkle, Star, TextAa, TextAlignLeft, ThumbsUp, Trash, X,
} from "@phosphor-icons/react";
import { Reorder, useDragControls } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LIVE, lastFailureKind, messageOf } from "./api/client";
import { EmptyArt } from "./EmptyArt";
import { ErrorState, kindOfLastFailure } from "./ErrorStates";
import { publishProblem } from "./api/forms";
import { ApplyForm, FormPreviewDialog, tintVars } from "./ApplyForm";
import type { Form, ItemType, Question, RoleDetails, WorkType } from "./campaign";
import { Q_TYPES, agoLabel, answerable, mustHaveOf, mustHaves, responsesFor } from "./campaign";
import { usePipeline } from "./campaignStore";
import { Avatar } from "./CandidateBits";
import type { Ctx } from "./CampaignWorkspace";
import { CampaignHeader } from "./CampaignWorkspace";
import { ConfirmDialog } from "./RoleBits";
import { Popover, useToast } from "./Contacts";
import type { MustFilter } from "./exportTable";
import { FormResponses } from "./FormResponses";
import { TEMPLATES, TINTS, defaultIntro, duplicateQuestion, estMinutes, formLink, minutesLabel, newId, newQuestion, tintKey, tintOf } from "./formKit";
import { plainText } from "./displayText";
import type { FormView } from "./formsStore";
import {
  addForm, campaignById, clearPendingForm, closeForm, createForm, defaultFormTitle, deleteDraftForm, peekPendingForm, publishForm, retryForms, saveNow, updateForm,
  useForm, useFormMeta, useForms, useFormsLoad, withVisibleTitle,
} from "./formsStore";
import { ActionButton, Dialog } from "./ui";
import "./forms.css";
import { Loader } from "./components/Loader";
import { DetailTitle } from "./components/DocTitle";
import { pageTitle } from "./pageTitle";

/**
 * Forms & responses: screening forms for one campaign.
 *
 * The builder works the way form makers do: the page header is one card,
 * every question is its own card with a number, and clicking a card opens it
 * for editing (type, required, must-have, duplicate, delete). A rail beside
 * the canvas adds a question, a section or a template's questions right
 * after the card you're on. Preview shows the candidate page as it goes out.
 * Must-haves flag a response for a person to look at; nobody is turned down
 * automatically.
 */

const TYPE_ICON: Readonly<Record<ItemType, ReactNode>> = {
  short: <TextAa size={16} />, long: <TextAlignLeft size={16} />, choice: <RadioButton size={16} />,
  multi: <CheckSquare size={16} />, dropdown: <CaretCircleDown size={16} />, number: <Hash size={16} />, yesno: <ThumbsUp size={16} />,
  scale: <Star size={16} />, link: <LinkIcon size={16} />, date: <CalendarBlank size={16} />, section: <Rows size={16} />,
};
/** Questions answered by picking from a list of options. */
const PICK = (t: ItemType) => t === "choice" || t === "multi" || t === "dropdown";
const TYPE_LABEL = (t: ItemType) => (t === "section" ? "Section" : Q_TYPES.find((x) => x.id === t)!.label);
const canMust = (t: ItemType) => t === "yesno" || t === "choice" || t === "dropdown";
const MUST_WHY = "Must-haves work on Yes/No, single choice and dropdown questions";
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const inField = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const minsAgo = (t?: number) => Math.max(0, Math.round((Date.now() - (t ?? Date.now())) / 60000));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* The chat banner shows once per form per session. */
const bannerSeen = new Set<string>();

/* ── the address: "#/campaign/forms/<id>/<tab>" ── */

type Tab = "build" | "responses" | "share";
const TABS: readonly Tab[] = ["build", "responses", "share"];
type Loc = { id: string; view: FormView };
const FORM_HASH = /^#?\/campaign\/forms\/([^/]+)(?:\/(build|preview|responses|share))?\/?$/;
function readHash(): Loc | null {
  const m = FORM_HASH.exec(window.location.hash);
  return m ? { id: decodeURIComponent(m[1]!), view: (m[2] as FormView | undefined) ?? "build" } : null;
}
const hashFor = (l: Loc | null) => (l ? `#/campaign/forms/${encodeURIComponent(l.id)}/${l.view}` : "#/campaign/forms");
/** Replace the address without a history entry (switching tabs). */
const replaceHash = (l: Loc | null) => {
  const next = hashFor(l);
  if (window.location.hash !== next) window.history.replaceState(window.history.state, "", next);
};

export function CampaignForms({ ctx }: { ctx: Ctx }) {
  const forms = useForms(ctx.campaignId);
  const [loc, setLoc] = useState<Loc | null>(() => {
    const p = peekPendingForm();
    return p ? { id: p.formId, view: p.view } : readHash();
  });
  useEffect(() => {
    clearPendingForm();
    replaceHash(loc);
    const on = () => setLoc(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
    // Once: the address is read here and kept in step by `go`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (l: Loc | null) => { window.location.hash = hashFor(l).slice(1); setLoc(l); };
  const [creating, setCreating] = useState(false);
  const [making, setMaking] = useState(false);
  const load = useFormsLoad(ctx.campaignId);
  const toast = useToast();
  const camp = campaignById(ctx.campaignId);
  const campaignName = camp?.name ?? "this campaign";
  const open = useForm(loc?.id ?? null);

  if (open && loc) {
    return <Studio key={open.id} ctx={ctx} form={open} view0={loc.view} onBack={() => go(null)}
      onView={(view) => replaceHash({ id: open.id, view })} />;
  }

  const create = (make: (role: string) => Question[], label: string) => {
    const now = Date.now();
    const f: Form = {
      id: newId(`${ctx.campaignId}-f`), campaign: ctx.campaignId, name: `${camp?.name ?? "Campaign"} ${label.toLowerCase()}`,
      title: camp?.name, status: "draft", sent: 0, questions: make(camp?.department ?? "relevant"), accent: TINTS.ember.fill,
      theme: "ember", origin: "template", createdAt: now, updatedAt: now,
      /* The department and place are real values from the start, so the
         header never shows a fallback that looks like something typed. */
      role: { about: "", responsibilities: [], requirements: [], team: camp?.department || undefined, location: camp?.location || undefined, workType: "Full-time" },
    };
    if (!LIVE) {
      addForm(f);
      setCreating(false);
      go({ id: f.id, view: "build" });
      return;
    }
    setMaking(true);
    createForm(f).then(
      (made) => { setMaking(false); setCreating(false); go({ id: made.id, view: "build" }); },
      (err: unknown) => { setMaking(false); toast(messageOf(err), "error"); },
    );
  };
  const askAgent = () => { setCreating(false); ctx.onAgent(`Create a screening form for ${campaignName}`, { send: true }); };

  return (
    <div className="cw">
      <CampaignHeader ctx={ctx} title="Forms & responses">
        <button type="button" className="cw-btn is-primary" onClick={() => setCreating(true)}><Plus size={14} weight="bold" /> New form</button>
      </CampaignHeader>

      {load !== "ready" ? (
        load === "loading" ? <Loader size="lg" label="Loading forms" block /> : (
          <ErrorState kind={kindOfLastFailure(lastFailureKind())} title={null} text={load} action={{ label: "Try again", onClick: () => retryForms(ctx.campaignId) }} />
        )
      ) : forms.length === 0 ? (
        <div className="cw-empty">
          <EmptyArt name="empty-forms" size={180} />
          <h2>No forms yet</h2>
          <p>A short screening form saves a call per candidate. Start from a template and send it with your outreach.</p>
          <button type="button" className="cw-btn is-primary" onClick={() => setCreating(true)}><Plus size={14} weight="bold" /> Create a form</button>
        </div>
      ) : (
        <div className="fm-index">
          <div className="fm-table">
            <div className="fm-list-h t-caption" aria-hidden="true">
              <span>Form</span><span className="fm-c-q">Questions</span><span className="fm-c-m">Must-haves</span><span className="fm-c-r">Responses</span><span className="fm-c-u">Updated</span><span />
            </div>
            <ul className="fm-list">
              {forms.map((f) => <FormRow key={f.id} f={f} onOpen={() => go({ id: f.id, view: "build" })} />)}
            </ul>
          </div>
          <button type="button" className="fm-agent-row" onClick={askAgent}>
            <Sparkle size={15} weight="fill" aria-hidden="true" />
            <span>Draft one with the agent</span>
            <small>Answer three quick questions and get a form tailored to the role</small>
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} label="New form" size="md">
        <div className="fm-new">
          <h2>New form</h2>
          <p>Pick a starting point. Everything is editable.</p>
          <div className="fm-tpls">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className="fm-tpl" disabled={making} onClick={() => create(t.make, t.id === "blank" ? "form" : t.name)}>
                <strong>{t.name}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
            <button type="button" className="fm-tpl is-agent" onClick={askAgent}>
              <strong><Sparkle size={14} weight="fill" /> Ask the agent</strong>
              <span>Describe the role, get a tailored draft</span>
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Puts a link on the clipboard: the modern way, then the old one for a page that may not use it. */
export function copyText(text: string): void {
  const old = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* nothing more to try */ }
    ta.remove();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(old);
  else old();
}

/** The address without its scheme: `localhost:8090/share/Ab3…`, what a person would recognise. */
const bareLink = (link: string) => link.replace(/^https?:\/\//, "");

/** One tap to copy a published form's link; the button says "Link copied" for two seconds, then is ready again. */
function CopyLink({ link, className = "fm-btn32" }: { link: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button" className={`cw-btn ${className} fm-copy${done ? " is-done" : ""}`} aria-live="polite"
      onClick={() => {
        copyText(link);
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <Check size={14} weight="bold" aria-hidden="true" /> : <LinkSimple size={14} aria-hidden="true" />}
      {" "}<span className="fm-copy-t">{done ? "Link copied" : "Copy link"}</span>
    </button>
  );
}

function FormRow({ f, onOpen }: { f: Form; onOpen: () => void }) {
  const meta = useFormMeta(f.id);
  const rs = LIVE ? meta.responses : responsesFor(f).length;
  const rate = f.sent ? Math.round((rs / f.sent) * 100) : 0;
  const status = LIVE ? meta.status : f.status;
  const t = tintOf(f);
  const link = status === "live" ? (LIVE ? meta.publicLink : formLink(f)) : null;
  return (
    <li className="fm-li">
      {/* One grid: the name and what it is, four figures, then the actions. The name is the button; its
          ::after stretches over the whole row, so a click anywhere on the row opens the form. */}
      <div className="fm-row-n">
        <span className="fm-row-mark" aria-hidden="true" style={{ background: t.wash, color: t.fill }}><ListBullets size={16} weight="bold" /></span>
        <span className="fm-row-t">
          <button type="button" className="fm-row" onClick={onOpen}>{plainText(f.name)}</button>
          <small>
            <span className="fm-status">{status === "live" ? "Live" : status === "closed" ? "Closed" : "Draft"}</span>
            <span aria-hidden="true">·</span>
            {f.origin === "chat" ? "Drafted in chat" : `About ${estMinutes(f)} min for candidates`}
          </small>
        </span>
      </div>
      <span className="fm-row-c fm-c-q"><span className="sr-only">Questions: </span>{answerable(f).length}</span>
      <span className="fm-row-c fm-c-m"><span className="sr-only">Must-haves: </span>{mustHaves(f).length}</span>
      <span className="fm-row-c fm-c-r">
        <span className="sr-only">Responses: </span>{rs}
        {LIVE ? meta.newApplicants > 0 && <small> · {meta.newApplicants} new</small> : f.sent > 0 && <small> of {f.sent}, {rate}%</small>}
      </span>
      <span className="fm-row-c fm-c-u is-muted"><span className="sr-only">Updated: </span>{agoLabel(minsAgo(f.updatedAt))}</span>
      <span className="fm-li-actions">
        {link && <CopyLink link={link} />}
        <ArrowRight size={16} weight="bold" className="fm-row-go" aria-hidden="true" />
      </span>
    </li>
  );
}

/* ── the studio ── */

function Studio({ ctx, form, view0, onBack, onView }: { ctx: Ctx; form: Form; view0: FormView; onBack: () => void; onView: (v: FormView) => void }) {
  const [tab, setTabRaw] = useState<Tab>(view0 === "responses" ? "responses" : view0 === "share" ? "share" : "build");
  const [mode, setModeRaw] = useState<"edit" | "preview">(view0 === "preview" ? "preview" : "edit");
  const setTab = (t: Tab) => { setTabRaw(t); onView(t === "build" && mode === "preview" ? "preview" : t); };
  const setMode = (m: "edit" | "preview" | ((m: "edit" | "preview") => "edit" | "preview")) => {
    setModeRaw((cur) => {
      const next = typeof m === "function" ? m(cur) : m;
      onView(next === "preview" ? "preview" : "build");
      return next;
    });
  };
  /* Back and forward (or an edited address) move between tabs too. */
  useEffect(() => {
    setTabRaw(view0 === "responses" ? "responses" : view0 === "share" ? "share" : "build");
    if (view0 === "preview" || view0 === "build") setModeRaw(view0 === "preview" ? "preview" : "edit");
  }, [view0]);
  const [must, setMust] = useState<MustFilter>("all");
  const [edited, setEdited] = useState(false);
  const [flash, setFlash] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [banner, setBanner] = useState(() => form.origin === "chat" && !bannerSeen.has(form.id));
  useEffect(() => { if (banner) bannerSeen.add(form.id); }, [banner, form.id]);
  const statusBtn = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sentinel = useRef<HTMLSpanElement>(null);
  const toast = useToast();
  const meta = useFormMeta(form.id);
  const fixtureResponses = useMemo(() => (LIVE ? [] : responsesFor(form)), [form]);
  const nResponses = LIVE ? meta.responses : fixtureResponses.length;
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const flashT = useRef(0);
  const camp = campaignById(form.campaign);

  const patch = useCallback((next: (f: Form) => Form) => {
    updateForm(form.id, next);
    setEdited(true);
    setFlash(true);
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(false), 1200);
  }, [form.id]);
  useEffect(() => () => window.clearTimeout(flashT.current), []);

  /* The bar gets its shadow only once content scrolls under it. */
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* P toggles Edit / Preview when focus is not in a field. */
  useEffect(() => {
    if (tab !== "build") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && !inField(e.target) && !document.querySelector(".dg")) {
        e.preventDefault();
        setMode((m) => (m === "edit" ? "preview" : "edit"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // setMode is stable in effect: it only reads its argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const status = LIVE ? meta.status : form.status;
  const live = status === "live";
  /* Once it is published the link is on the page itself, not only under Share. */
  const link = live ? (LIVE ? meta.publicLink : formLink(form)) : null;
  const setLive = (on: boolean) => {
    setStatusOpen(false);
    if (!LIVE) {
      patch((f) => ({ ...f, status: on ? "live" : "draft" }));
      toast(on ? "Form is live. The link now works." : "Responses paused. The link shows 'not open yet'.");
      return;
    }
    /* Publishing and closing wait for the server: the link changes only when it says so. */
    setBusy(true);
    (on ? publishForm(form.id) : closeForm(form.id)).then(
      () => toast(on ? (live ? "Changes published. Applicants see them now." : "Form is live. The link now works.") : "Form closed. The link says it's no longer taking applications."),
      (err: unknown) => toast(publishProblem(err) ?? messageOf(err), "error"),
    ).finally(() => setBusy(false));
  };
  const tabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const j = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : d ? (i + d + TABS.length) % TABS.length : -1;
    if (j < 0) return;
    e.preventDefault();
    setTab(TABS[j]!);
    tabRefs.current[j]?.focus();
  };
  const modeKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = mode === "edit" ? "preview" : "edit";
    setMode(next);
    window.requestAnimationFrame(() => document.getElementById(`fm-mode-${next}`)?.focus());
  };

  return (
    <div className="cw is-wide fm" data-tint={tintKey(form.theme)} style={tintVars(form)}>
      {/* The tab names the form and its campaign; closing the form puts the page's own title back. */}
      <DetailTitle
        title={pageTitle({ route: "campaign-forms", campaign: camp?.name ?? null, detail: plainText(form.name || form.title || "") || null })}
        fallback={pageTitle({ route: "campaign-forms", campaign: camp?.name ?? null })}
      />
      <p className="cw-crumb">
        <a href="#/campaigns" onClick={(e) => { e.preventDefault(); ctx.go("campaigns"); }}>Campaigns</a>
        <span aria-hidden="true">/</span>
        <a href="#/campaign" onClick={(e) => { e.preventDefault(); ctx.go("campaign-overview"); }}>{camp?.name ?? "Campaign"}</a>
        <span aria-hidden="true">/</span>
        <a href="#/campaign/forms" onClick={(e) => { e.preventDefault(); onBack(); }}>Forms</a>
      </p>

      <span ref={sentinel} className="fm-sentinel" aria-hidden="true" />
      <header className={`fm-top${stuck ? " is-stuck" : ""}`}>
        <div className="fm-top-1">
          <div className="fm-name-w">
            <label className="fm-name-ed" data-tag="Internal name">
              <span className="sr-only">Internal name (only your team sees it)</span>
              <span className="fm-name-box">
                <span className="fm-name-mirror" aria-hidden="true">{form.name || "Name this form"}</span>
                <input size={1} className="fm-name" value={form.name} placeholder="Name this form" title="Only your team sees this name"
                  onChange={(e) => { const v = e.target.value; patch((f) => ({ ...f, name: v })); }} />
              </span>
              <PencilSimple size={14} className="fm-name-pen" aria-hidden="true" />
            </label>
            {LIVE && meta.save === "error" ? (
              <span className="fm-saved t-caption" aria-live="polite">
                Not saved. {meta.error}
                <button type="button" className="fm-link-btn is-accent" onClick={() => { void saveNow(form.id).catch(() => {}); }}>Try again</button>
              </span>
            ) : (
              <span className={`fm-saved t-caption${flash && meta.save !== "saving" ? " is-flash" : ""}`} aria-live="polite">
                {LIVE && meta.save === "saving" ? <><Loader size="sm" tone="inherit" />Saving</> : <>{flash && <Check size={12} weight="bold" aria-hidden="true" />}{edited ? "Saved" : "All changes saved"}</>}
              </span>
            )}
          </div>
          <div className="fm-top-r">
            {live ? (
              <>
                {LIVE && meta.hasDraftChanges && (
                  <button type="button" className="cw-btn is-primary fm-publish" onClick={() => setLive(true)} disabled={busy}
                    title="Applicants see the last published version until you publish again">
                    {busy ? <><Loader size="sm" tone="inherit" />Publishing</> : "Publish changes"}
                  </button>
                )}
                {link && (
                  <div className="fm-linkbar">
                    <span className="fm-linkbar-url t-caption" title={link}>{bareLink(link)}</span>
                    <CopyLink link={link} />
                    <a className="cw-btn fm-btn32 fm-open" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open the link in a new tab" title="Open the link in a new tab">
                      <ArrowSquareOut size={14} aria-hidden="true" /> <span className="fm-copy-t">Open</span>
                    </a>
                  </div>
                )}
                <button ref={statusBtn} type="button" className="fm-status-btn is-live" aria-haspopup="menu" aria-expanded={statusOpen} onClick={() => setStatusOpen((o) => !o)}>
                  <Broadcast size={14} weight="bold" aria-hidden="true" /> Live <CaretDown size={12} weight="bold" aria-hidden="true" />
                </button>
                <Popover anchor={statusBtn} open={statusOpen} onClose={() => setStatusOpen(false)} align="end" width={264}>
                  <div className="ct-menu fm-menu" role="menu">
                    <p className="t-caption fm-menu-h">Accepting responses since it went live</p>
                    <button type="button" role="menuitem" className="ct-menu-i" onClick={() => setLive(false)} disabled={busy}>
                      <Pause size={16} aria-hidden="true" />
                      {LIVE
                        ? <span className="ct-menu-t"><strong>Close the form</strong><small>The link says it's no longer taking applications</small></span>
                        : <span className="ct-menu-t"><strong>Pause responses</strong><small>The link shows a "not open yet" page</small></span>}
                    </button>
                    <button type="button" role="menuitem" className="ct-menu-i" onClick={() => { setStatusOpen(false); setPreviewOpen(true); }}>
                      <Eye size={16} aria-hidden="true" />
                      <span className="ct-menu-t"><strong>Open candidate preview</strong><small>See the page exactly as it goes out</small></span>
                    </button>
                  </div>
                </Popover>
              </>
            ) : (
              <>
                <span className="fm-draft t-label">{status === "closed" ? "Closed" : "Draft"}</span>
                {LIVE && status === "draft" && (
                  <button type="button" className="cw-btn" disabled={busy} onClick={() => setDeleting(true)}>Delete draft</button>
                )}
                <button type="button" className="cw-btn is-primary fm-publish" onClick={() => setLive(true)} disabled={busy}>
                  {busy ? <><Loader size="sm" tone="inherit" />Publishing</> : status === "closed" ? "Reopen" : "Publish"}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="fm-top-2">
          <div className="fm-tabs" role="tablist" aria-label="Form">
            {TABS.map((t, i) => (
              <button key={t} ref={(el) => { tabRefs.current[i] = el; }} id={`fm-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls={`fm-panel-${t}`}
                tabIndex={tab === t ? 0 : -1} className={tab === t ? "is-on" : ""} onClick={() => setTab(t)} onKeyDown={(e) => tabKey(e, i)}>
                {t === "build" ? "Questions" : t === "responses" ? <>Responses <span className="fm-tab-n">{nResponses}</span></> : "Share"}
              </button>
            ))}
          </div>
          {tab === "build" && (
            <div className="fm-mode" role="radiogroup" aria-label="Builder mode" onKeyDown={modeKey}>
              {(["edit", "preview"] as const).map((m) => (
                <button key={m} id={`fm-mode-${m}`} type="button" role="radio" aria-checked={mode === m} tabIndex={mode === m ? 0 : -1}
                  aria-controls="fm-canvas" className={mode === m ? "is-on" : ""} onClick={() => setMode(m)} title={`${m === "edit" ? "Edit" : "Preview"} (P)`}>
                  {m === "edit" ? <PencilSimple size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} {m === "edit" ? "Edit" : "Preview"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div role="tabpanel" id={`fm-panel-${tab}`} aria-labelledby={`fm-tab-${tab}`} className="fm-panel">
        {tab === "build" && (
          <div className={`fm-canvas-wrap${mode === "preview" ? " is-preview" : ""}`} id="fm-canvas">
            {banner && mode === "edit" && (
              <div className="fm-banner" role="status">
                <Sparkle size={15} weight="fill" aria-hidden="true" />
                <p className="t-body-sm">Drafted from your chat. Everything here is editable, and nothing is sent until you publish.</p>
                <button type="button" aria-label="Dismiss" onClick={() => setBanner(false)}><X size={14} weight="bold" /></button>
              </div>
            )}
            {mode === "edit" ? (
              <Canvas form={form} patch={patch} onAgent={() => ctx.onAgent(`Create a screening form for ${camp?.name ?? "this campaign"}`, { send: true })} />
            ) : (
              <div className="fm-preview">
                <p className="fm-preview-bar t-caption"><Eye size={13} aria-hidden="true" /> Preview. This is the page candidates see. Nothing you enter here is saved.</p>
                <ApplyForm form={withVisibleTitle(form)} mode="preview" />
              </div>
            )}
          </div>
        )}
        {tab === "responses" && (
          <FormResponses form={form} must={must} onMust={setMust} onBuild={() => { setTab("build"); setMode("edit"); }} onShare={() => setTab("share")} />
        )}
        {tab === "share" && <Share form={form} link={LIVE ? meta.publicLink : formLink(form)} draft={!live} onLive={() => setLive(true)} onPreview={() => setPreviewOpen(true)} patch={patch} />}
      </div>
      <FormPreviewDialog form={withVisibleTitle(form)} open={previewOpen} onClose={() => setPreviewOpen(false)} link={LIVE ? meta.publicLink : undefined} />
      <ConfirmDialog
        open={deleting} title="Delete this draft?" confirm="Delete draft" danger
        body="It has never been published, so nobody has the link. This can't be undone."
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          setBusy(true);
          deleteDraftForm(form.id).then(
            () => { setBusy(false); toast(`${form.name} deleted`); onBack(); },
            (err: unknown) => { setBusy(false); toast(messageOf(err), "error"); },
          );
        }}
      />
    </div>
  );
}

/* ── the canvas: a header card, then one card per question ── */

type Ghost = { q: Question; after: string | null; key: string };

function Canvas({ form, patch, onAgent }: { form: Form; patch: (fn: (f: Form) => Form) => void; onAgent: () => void }) {
  const [active, setActive] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [said, setSaid] = useState("");
  const [focusNew, setFocusNew] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => { if (focusNew) setFresh(focusNew); }, [focusNew]);
  const [tplOpen, setTplOpen] = useState(false);
  const toast = useToast();
  const qs = form.questions;
  const m = estMinutes(form);

  const setQs = useCallback((fn: (qs: Question[]) => Question[]) => patch((f) => ({ ...f, questions: fn(f.questions) })), [patch]);
  const setQ = (q: Question) => setQs((all) => all.map((x) => (x.id === q.id ? q : x)));

  /** Insert after `after` (an item id), after the active item, or at the end. */
  const insert = (items: Question[], after?: string | null) => {
    if (!items.length) return;
    /* With the header open, "after this one" is the top of the questions. */
    const anchor = after === undefined ? active : after;
    setQs((all) => {
      const i = anchor && anchor !== "header" ? all.findIndex((x) => x.id === anchor) : -1;
      const at = anchor === "header" ? 0 : i < 0 ? all.length : i + 1;
      return [...all.slice(0, at), ...items, ...all.slice(at)];
    });
    setActive(items[0]!.id);
    setFocusNew(items[0]!.id);
  };
  const add = (type: ItemType, after?: string | null) => insert([newQuestion(type)], after);
  const dup = (id: string) => {
    const q = qs.find((x) => x.id === id);
    if (!q) return;
    insert([duplicateQuestion(q)], id);
  };
  const del = (id: string) => {
    const i = qs.findIndex((x) => x.id === id);
    if (i < 0) return;
    const g: Ghost = { q: qs[i]!, after: qs[i - 1]?.id ?? null, key: newId("ghost") };
    setGhosts((cur) => [...cur, g]);
    setQs((all) => all.filter((x) => x.id !== id));
    if (active === id) setActive(null);
    /* Focus goes to the Undo that replaces the card, so a keyboard user
       keeps their place and can take it back at once. */
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-ghost="${g.key}"] .fm-undo`)?.focus());
    window.setTimeout(() => setGhosts((cur) => cur.filter((x) => x.key !== g.key)), 6000);
  };
  const undo = (g: Ghost) => {
    setGhosts((cur) => cur.filter((x) => x.key !== g.key));
    setQs((all) => {
      const i = g.after ? all.findIndex((x) => x.id === g.after) : -1;
      const at = g.after && i < 0 ? all.length : i + 1;
      return [...all.slice(0, at), g.q, ...all.slice(at)];
    });
    setActive(g.q.id);
    setFocusNew(g.q.id);
  };
  const move = (id: string, d: number) => {
    const i = qs.findIndex((x) => x.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= qs.length) return;
    setQs((all) => { const n = [...all]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
    setSaid(`Moved to position ${j + 1} of ${qs.length}`);
  };

  /* Focus and centre a freshly added item's title. */
  useLayoutEffect(() => {
    if (!focusNew) return;
    const el = document.querySelector<HTMLElement>(`[data-qid="${focusNew}"]`);
    el?.querySelector<HTMLElement>(".fm-q-title, .fm-sec-title")?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    setFocusNew(null);
  }, [focusNew, qs]);

  const deactivate = (id: string) => {
    setActive(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-qid="${id}"] .fm-q-view`)?.focus());
  };

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape" && active && active !== "header") { e.preventDefault(); deactivate(active); return; }
    if (!mod) return;
    if (e.key === "Enter") { e.preventDefault(); add("choice"); return; }
    if (!active || active === "header") return;
    if (e.key === "d" || e.key === "D") { e.preventDefault(); dup(active); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active, -1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(active, 1); }
  };

  const nAns = answerable(form).length;
  /* Questions before the first divider are page one, so the first divider is then "section 2". */
  const lead = qs.length > 0 && qs[0]!.type !== "section" ? 1 : 0;
  const nSec = qs.filter((q) => q.type === "section").length + lead;
  let qNo = 0;
  let sNo = 0;

  return (
    <div className="fm-build" onKeyDown={onKey}
      onMouseDown={(e) => { if (!(e.target as HTMLElement).closest(".fm-card, .fm-ghost, .fm-banner, .fm-add, .fm-gap, .fm-rail, .ct-menu, .fm-strip")) setActive(null); }}>
      <div className="fm-col">
        <div className="fm-strip">
          <p className="t-body-sm fm-strip-note">{plural(nAns, "question")} · {plural(mustHaves(form).length, "must-have")}</p>
        </div>

        <HeaderCard form={form} minutes={m} patch={patch} active={active === "header"} onFocus={() => setActive("header")} />

        <section className="fm-card fm-appcard" aria-labelledby="fm-app-h">
          <div className="fm-app-h">
            <h2 id="fm-app-h">Your application</h2>
            <p>Questions marked * are required.</p>
          </div>
          <div className="fm-locked">
            <div className="ap-who">
              <LockedField label="Full name" required />
              <LockedField label="Email" required />
              <LockedField label="Phone" required placeholder="98450 12345" />
              <LockedField label="LinkedIn profile" placeholder="linkedin.com/in/…" />
            </div>
          </div>
        </section>

        <Reorder.Group as="ol" axis="y" values={qs} onReorder={(next) => setQs(() => next)} className="fm-items" aria-label="Questions">
          {ghosts.filter((g) => g.after === null).map((g) => <GhostRow key={g.key} g={g} onUndo={() => undo(g)} />)}
          {qs.map((q, i) => {
            if (q.type === "section") sNo += 1; else qNo += 1;
            const secNo = sNo + lead;
            const after = ghosts.filter((g) => g.after === q.id);
            return [
              <Item key={q.id} fresh={fresh === q.id} q={q} index={i} count={qs.length} n={q.type === "section" ? secNo : qNo} sections={nSec}
                active={active === q.id} onActivate={() => setActive(q.id)} onDeactivate={() => deactivate(q.id)}
                onChange={setQ} onDup={() => dup(q.id)} onDel={() => del(q.id)} onMove={(d) => move(q.id, d)} onAdd={(t) => add(t, q.id)}
                onMustDrop={() => toast("Must-have removed: it only works on Yes/No and single choice")} />,
              ...after.map((g) => <GhostRow key={g.key} g={g} onUndo={() => undo(g)} />),
            ];
          })}
          {ghosts.filter((g) => g.after !== null && !qs.some((q) => q.id === g.after)).map((g) => <GhostRow key={g.key} g={g} onUndo={() => undo(g)} />)}
        </Reorder.Group>

        {nAns === 0 && <p className="fm-empty t-body-sm">No questions yet. Add the first one below, or from the rail on the right.</p>}
        <div className="fm-sheet-f">
          <AddRow label="Add question" onPick={(t) => add(t, qs[qs.length - 1]?.id ?? null)} />
          <button type="button" className="fm-link-btn" onClick={() => add("section", qs[qs.length - 1]?.id ?? null)}><Rows size={14} aria-hidden="true" /> Add section</button>
          <button type="button" className="fm-link-btn" onClick={() => setTplOpen(true)}><Copy size={14} aria-hidden="true" /> Add from a template</button>
        </div>
        <p className="sr-only" aria-live="polite">{said}</p>
      </div>

      <Rail active={active} onAdd={(t) => add(t)} onTemplate={() => setTplOpen(true)} onAgent={onAgent} />

      <Dialog open={tplOpen} onClose={() => setTplOpen(false)} label="Add questions from a template" size="md">
        <div className="fm-new">
          <h2>Add these questions</h2>
          <p>They go in after the question you have open, or at the end.</p>
          <div className="fm-tpls">
            {TEMPLATES.filter((t) => t.id !== "blank").map((t) => (
              <button key={t.id} type="button" className="fm-tpl" onClick={() => { insert(t.make(campaignById(form.campaign)?.department ?? "relevant")); setTplOpen(false); }}>
                <strong>{t.name}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Name, email, phone and LinkedIn: asked on every form, shown as they appear, locked. */
function LockedField({ label, required, wide, placeholder }: { label: string; required?: boolean; wide?: boolean; placeholder?: string }) {
  return (
    <div className={`ap-field fm-lockf${wide ? " is-wide" : ""}`}>
      <span className="ap-label">
        {label}{required && <span className="ap-req" aria-hidden="true"> *</span>}
        <span className="fm-lock" tabIndex={0} role="img" aria-label="Asked on every form"
          title="Asked on every form, so each response maps to a person in your pipeline. It can't be removed.">
          <LockSimple size={13} aria-hidden="true" />
        </span>
      </span>
      <span className="ap-input fm-mock is-locked" aria-hidden="true">{placeholder && <span className="fm-mock-ph">{placeholder}</span>}</span>
    </div>
  );
}

/** The floating rail: adds after the card you're on, like a form maker's
    side toolbar. It sits level with the open card and glides with it, kept
    inside the window; with nothing open it waits under the sticky bar. */
function Rail({ active, onAdd, onTemplate, onAgent }: { active: string | null; onAdd: (t: ItemType) => void; onTemplate: () => void; onAgent: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useLayoutEffect(() => {
    const c = col.current, r = rail.current;
    if (!c || !r) return;
    if (!wide) { r.style.transform = ""; return; }
    let raf = 0;
    const place = () => {
      raf = 0;
      const cr = c.getBoundingClientRect();
      const h = r.offsetHeight;
      const bar = document.querySelector(".fm-top")?.getBoundingClientRect().bottom ?? 0;
      const lo = Math.max(0, bar + 16 - cr.top);
      const hi = Math.min(cr.height - h, window.innerHeight - h - 16 - cr.top);
      const card = active ? document.querySelector<HTMLElement>(`[data-qid="${active}"] > .fm-card, .fm-hcard[data-qid="${active}"]`) : null;
      const want = card ? card.getBoundingClientRect().top - cr.top : lo;
      const y = Math.max(0, Math.min(Math.max(want, lo), Math.max(lo, hi)));
      r.style.transform = `translateY(${Math.round(y)}px)`;
    };
    const ask = () => { if (!raf) raf = window.requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", ask, true);
    window.addEventListener("resize", ask);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ask) : null;
    ro?.observe(c);
    return () => { window.removeEventListener("scroll", ask, true); window.removeEventListener("resize", ask); ro?.disconnect(); if (raf) window.cancelAnimationFrame(raf); };
  }, [active, wide]);
  const here = !!active;
  return (
    <div ref={col} className="fm-rail-col">
      <nav ref={rail} className="fm-rail" aria-label="Add to form">
        <button ref={ref} type="button" className="fm-rail-b" aria-label={here ? "Add question after this one" : "Add question at the end"} title={here ? "Add question after this one" : "Add question at the end"}
          aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Plus size={18} weight="bold" aria-hidden="true" />
        </button>
        <TypeMenu anchor={ref} open={open} onClose={close} align="start" side={wide ? "left" : "below"} withSection={false} onPick={(t) => { close(); onAdd(t); }} />
        <button type="button" className="fm-rail-b" aria-label={here ? "Add section after this one" : "Add section at the end"} title={here ? "Add section after this one" : "Add section at the end"} onClick={() => onAdd("section")}>
          <Rows size={18} aria-hidden="true" />
        </button>
        <button type="button" className="fm-rail-b" aria-label="Add questions from a template" title="Add questions from a template" onClick={onTemplate}>
          <Copy size={18} aria-hidden="true" />
        </button>
        <span className="fm-rail-sep" aria-hidden="true" />
        <button type="button" className="fm-rail-b" aria-label="Draft with the agent" title="Draft with the agent" onClick={onAgent}>
          <ChatCircleText size={18} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

function GhostRow({ g, onUndo }: { g: Ghost; onUndo: () => void }) {
  return (
    <li className="fm-ghost" role="status" data-ghost={g.key}>
      <span className="t-body-sm">{g.q.type === "section" ? "Section deleted." : "Question deleted."}</span>
      <button type="button" className="fm-undo" onClick={onUndo}>Undo</button>
    </li>
  );
}

/** "+ Add question", opening the type menu (sections at the end). */
function AddRow({ label, onPick, compact }: { label: string; onPick: (t: ItemType) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className={`fm-add${compact ? " is-compact" : ""}`}>
      <button ref={ref} type="button" className="fm-add-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus size={14} weight="bold" aria-hidden="true" /> {label}
      </button>
      <TypeMenu anchor={ref} open={open} onClose={close} align="start" withSection onPick={(t) => { close(); onPick(t); }} />
    </div>
  );
}

/** The thin target between two cards: a "+" on hover that adds right there. */
function InsertGap({ onPick, label }: { onPick: (t: ItemType) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className={`fm-gap${open ? " is-open" : ""}`}>
      <button ref={ref} type="button" className="fm-gap-b" aria-label={label} title="Add a question here" aria-haspopup="menu" aria-expanded={open} tabIndex={-1}
        onClick={() => setOpen((o) => !o)}>
        <Plus size={12} weight="bold" aria-hidden="true" />
      </button>
      <TypeMenu anchor={ref} open={open} onClose={close} align="start" withSection onPick={(t) => { close(); onPick(t); }} />
    </div>
  );
}

function TypeMenu({ anchor, open, onClose, onPick, align, current, withSection = true, side = "below" }: {
  anchor: React.RefObject<HTMLElement>; open: boolean; onClose: () => void; onPick: (t: ItemType) => void; align: "start" | "end";
  current?: ItemType; withSection?: boolean; side?: "below" | "left";
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => (menu.current?.querySelector<HTMLElement>(".is-on") ?? menu.current?.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(id);
  }, [open]);
  const key = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} width={256} side={side}>
      <div ref={menu} className="ct-menu fm-menu is-types" role="menu" onKeyDown={key}>
        {Q_TYPES.map((t) => (
          <button key={t.id} type="button" role="menuitem" className={`ct-menu-i fm-add-i${current === t.id ? " is-on" : ""}`} onClick={() => onPick(t.id)}>
            <span className="fm-add-ico" aria-hidden="true">{TYPE_ICON[t.id]}</span>
            <span className="ct-menu-t"><strong>{t.label}</strong><small>{t.hint}</small></span>
          </button>
        ))}
        {withSection && (
          <>
            <span className="fm-menu-sep" role="separator" />
            <button type="button" role="menuitem" className="ct-menu-i fm-add-i" onClick={() => onPick("section")}>
              <span className="fm-add-ico" aria-hidden="true">{TYPE_ICON.section}</span>
              <span className="ct-menu-t"><strong>Section</strong><small>A heading that groups the questions after it</small></span>
            </button>
          </>
        )}
      </div>
    </Popover>
  );
}

/* ── the header card: every field the candidate reads, edited where it sits ── */

function AutoArea({ value, onChange, className, placeholder, label, onKeyDown, id, onFocus }: {
  value: string; onChange: (v: string) => void; className: string; placeholder?: string; label: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; id?: string; onFocus?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} id={id} rows={1} className={className} value={value} placeholder={placeholder} aria-label={label} onKeyDown={onKeyDown} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />;
}

/** An editable spot: quiet at rest (it reads as the finished page), a soft
    fill and a pen on hover, a ring on focus. Only an empty field shows a
    dashed rule, under its placeholder, so a gap in the page is easy to see. */
function Ed({ children, className = "", hint, icon = "pen" }: { children: ReactNode; className?: string; hint?: string; icon?: "pen" | "caret" | "none" }) {
  return (
    <span className={`fm-ed ${className}`} title={hint}>
      {children}
      {icon === "pen" && <PencilSimple size={13} className="fm-ed-pen" aria-hidden="true" />}
      {icon === "caret" && <CaretDown size={12} weight="bold" className="fm-ed-caret" aria-hidden="true" />}
    </span>
  );
}

const WORK_TYPES: readonly WorkType[] = ["Full-time", "Part-time", "Contract", "Internship"];
const EMPTY_ROLE: RoleDetails = { about: "", responsibilities: [], requirements: [] };
const ROLE_LABEL = { about: "About the role", doing: "What you'll do", wanted: "What we're looking for" } as const;
type RoleKey = keyof typeof ROLE_LABEL;
type Gone = { k: RoleKey; about?: string; items?: string[]; label?: string; key: string };

function HeaderCard({ form, minutes, patch, active, onFocus }: {
  form: Form; minutes: number; patch: (fn: (f: Form) => Form) => void; active: boolean; onFocus: () => void;
}) {
  const role: RoleDetails = form.role ?? EMPTY_ROLE;
  const setRole = (r: Partial<RoleDetails>) => patch((f) => ({ ...f, role: { ...(f.role ?? EMPTY_ROLE), ...r } }));
  const setLabel = (k: RoleKey, v: string) => setRole({ labels: { ...(role.labels ?? {}), [k]: v || undefined } });
  const drafted = defaultIntro(form.campaign);
  const minsId = `fm-mins-${form.id}`;
  /* Sections opened with "+ Add …" stay on the card while still empty. */
  const [opened, setOpened] = useState<ReadonlySet<RoleKey>>(() => new Set());
  const [focusBlock, setFocusBlock] = useState<RoleKey | null>(null);
  /* A removed block leaves an Undo row in its place for a few seconds. */
  const [gone, setGone] = useState<Gone[]>([]);
  useEffect(() => {
    if (!focusBlock) return;
    document.querySelector<HTMLElement>(`[data-role-block="${focusBlock}"] textarea, [data-role-block="${focusBlock}"] .fm-list-ed input`)?.focus();
    setFocusBlock(null);
  }, [focusBlock]);

  const has: Record<RoleKey, boolean> = {
    about: !!role.about.trim() || opened.has("about"),
    doing: role.responsibilities.length > 0 || opened.has("doing"),
    wanted: role.requirements.length > 0 || opened.has("wanted"),
  };
  const nameOf = (k: RoleKey) => role.labels?.[k] || ROLE_LABEL[k];
  const clear = (k: RoleKey) => {
    const g: Gone = {
      k, key: newId("gone"), label: role.labels?.[k],
      ...(k === "about" ? { about: role.about } : { items: [...(k === "doing" ? role.responsibilities : role.requirements)] }),
    };
    setGone((cur) => [...cur.filter((x) => x.k !== k), g]);
    setOpened((o) => { const n = new Set(o); n.delete(k); return n; });
    setRole(k === "about" ? { about: "" } : k === "doing" ? { responsibilities: [] } : { requirements: [] });
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-gone="${g.key}"] .fm-undo`)?.focus());
    window.setTimeout(() => setGone((cur) => cur.filter((x) => x.key !== g.key)), 6000);
  };
  const undo = (g: Gone) => {
    setGone((cur) => cur.filter((x) => x.key !== g.key));
    patch((f) => {
      const r = f.role ?? EMPTY_ROLE;
      const back: Partial<RoleDetails> = g.k === "about" ? { about: g.about ?? "" } : g.k === "doing" ? { responsibilities: g.items ?? [] } : { requirements: g.items ?? [] };
      return { ...f, role: { ...r, ...back, labels: { ...(r.labels ?? {}), [g.k]: g.label } } };
    });
    if ((g.k === "about" && !g.about?.trim()) || (g.k !== "about" && !g.items?.length)) setOpened((o) => new Set(o).add(g.k));
    setFocusBlock(g.k);
  };
  const start = (k: RoleKey) => {
    setOpened((o) => new Set(o).add(k));
    if (k === "doing" && !role.responsibilities.length) setRole({ responsibilities: [""] });
    if (k === "wanted" && !role.requirements.length) setRole({ requirements: [""] });
    setFocusBlock(k);
  };

  const block = (k: RoleKey, body: ReactNode) => (
    <section key={k} className="fm-role" data-role-block={k} aria-label={nameOf(k)}>
      <div className="fm-role-h">
        <Ed className="fm-role-ed">
          <input value={role.labels?.[k] ?? ""} placeholder={ROLE_LABEL[k]} aria-label={`Heading for ${ROLE_LABEL[k]}`} onChange={(e) => setLabel(k, e.target.value)} />
        </Ed>
        <button type="button" className="fm-role-x" aria-label={`Remove ${nameOf(k)}`} title="Remove this section from the page" onClick={() => clear(k)}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {body}
    </section>
  );
  const ghost = (k: RoleKey) => gone.filter((g) => g.k === k).map((g) => (
    <div key={g.key} className="fm-role-gone" role="status" data-gone={g.key}>
      <span className="t-body-sm">{g.label || ROLE_LABEL[k]} removed.</span>
      <button type="button" className="fm-undo" onClick={() => undo(g)}>Undo</button>
    </div>
  ));
  const missing = (Object.keys(ROLE_LABEL) as RoleKey[]).filter((k) => !has[k] && !gone.some((g) => g.k === k));

  return (
    <header className={`fm-card fm-hcard${active ? " is-active" : ""}`} data-qid="header" onFocusCapture={onFocus}>
      <div className="fm-hcard-in">
        <div className="fm-hband">
        <Ed className="fm-title-ed" hint="Job title">
          <AutoArea className="fm-h-title" value={form.title ?? ""} placeholder={defaultFormTitle(form.campaign) ?? "Role title candidates will see"} label="Job title" onChange={(v) => patch((f) => ({ ...f, title: v }))} />
        </Ed>
        <div className="fm-meta">
          <Ed className="fm-chip-ed" hint="Department or team">
            <span className="fm-fit">
              <span className="fm-fit-mirror" aria-hidden="true">{role.team || "Department"}</span>
              <input size={1} value={role.team ?? ""} placeholder="Department" aria-label="Department" onChange={(e) => setRole({ team: e.target.value || undefined })} />
            </span>
          </Ed>
          <span className="fm-meta-sep" aria-hidden="true">·</span>
          <Ed className="fm-chip-ed" hint="Location">
            <span className="fm-fit">
              <span className="fm-fit-mirror" aria-hidden="true">{role.location || "Add location"}</span>
              <input size={1} value={role.location ?? ""} placeholder="Add location" aria-label="Location" onChange={(e) => setRole({ location: e.target.value || undefined })} />
            </span>
          </Ed>
          <span className="fm-meta-sep" aria-hidden="true">·</span>
          <Ed className="fm-chip-ed is-select" hint="Work type" icon="caret">
            <select value={role.workType ?? "Full-time"} aria-label="Work type" onChange={(e) => setRole({ workType: e.target.value as WorkType })}>
              {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
            </select>
          </Ed>
          <span className="fm-meta-sep" aria-hidden="true">·</span>
          <span className="fm-chip-ro" aria-describedby={minsId} title="Worked out from the questions below">
            {minutesLabel(minutes)}
            <span id={minsId} className="sr-only">Worked out from the questions below, so it updates as you add or remove them.</span>
          </span>
        </div>
        <EmptyArt name="form-clipboard" size={172} className="ap-band-art" />
        </div>
        <Ed className="fm-intro-ed" hint="Intro">
          <AutoArea className="fm-h-desc" value={form.description ?? ""} placeholder="A short intro: what the team does and why this role matters" label="Intro"
            onChange={(v) => patch((f) => ({ ...f, description: v }))} />
        </Ed>
        {!form.description?.trim() && (
          <button type="button" className="fm-link-btn is-accent fm-suggest" onClick={() => patch((f) => ({ ...f, description: drafted }))}>
            <Sparkle size={13} weight="fill" aria-hidden="true" /> Draft it from the campaign brief
          </button>
        )}

        {has.about ? block("about", (
          <Ed className="fm-para-ed">
            <AutoArea className="fm-h-para" value={role.about} placeholder="Where the role sits, who they'll work with, what the first months look like" label={nameOf("about")}
              onChange={(v) => setRole({ about: v })} />
          </Ed>
        )) : ghost("about")}
        {has.doing ? block("doing", (
          <ListEditor key={`${form.id}-do`} label={nameOf("doing")} items={role.responsibilities} placeholder="e.g. Own services end to end" addLabel="Add a line"
            onChange={(responsibilities) => setRole({ responsibilities })} />
        )) : ghost("doing")}
        {has.wanted ? block("wanted", (
          <ListEditor key={`${form.id}-want`} label={nameOf("wanted")} items={role.requirements} placeholder="e.g. 5+ years building backend systems" addLabel="Add a line"
            onChange={(requirements) => setRole({ requirements })} />
        )) : ghost("wanted")}
        {missing.length > 0 && (
          <div className="fm-role-add">
            {missing.map((k) => (
              <button key={k} type="button" className="fm-role-ghost" onClick={() => start(k)}>
                <Plus size={13} weight="bold" aria-hidden="true" /> Add {nameOf(k)}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/** A bullet list where each item is its own field. Enter adds the next
    item, Backspace on an empty one removes it, arrows move between them. */
function ListEditor({ items, onChange, placeholder, addLabel, label }: {
  items: readonly string[]; onChange: (next: string[]) => void; placeholder: string; addLabel: string; label: string;
}) {
  const [keys, setKeys] = useState<string[]>(() => items.map(() => newId("li")));
  const ks = keys.length === items.length ? keys : items.map((_, i) => keys[i] ?? newId("li"));
  useEffect(() => { if (ks !== keys) setKeys(ks); }, [ks, keys]);
  const focusAt = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusAt.current == null) return;
    const el = list.current?.querySelectorAll<HTMLInputElement>("input")[focusAt.current];
    el?.focus();
    focusAt.current = null;
  });
  const addAt = (i: number) => {
    setKeys([...ks.slice(0, i), newId("li"), ...ks.slice(i)]);
    onChange([...items.slice(0, i), "", ...items.slice(i)]);
    focusAt.current = i;
  };
  const removeAt = (i: number) => {
    setKeys(ks.filter((_, k) => k !== i));
    onChange(items.filter((_, k) => k !== i));
    focusAt.current = Math.max(0, i - 1);
  };
  return (
    <>
      <ul ref={list} className="fm-list-ed" aria-label={label}>
        {items.map((it, i) => (
          <li key={ks[i]}>
            <Ed>
              <input value={it} placeholder={placeholder} aria-label={`${label}, item ${i + 1}`} aria-keyshortcuts="Backspace"
                onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  const inputs = list.current?.querySelectorAll<HTMLInputElement>("input");
                  if (e.key === "Enter") { e.preventDefault(); addAt(i + 1); }
                  else if (e.key === "Backspace" && !it) { e.preventDefault(); removeAt(i); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); inputs?.[i + 1]?.focus(); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); inputs?.[i - 1]?.focus(); }
                }} />
            </Ed>
            {/* Out of the tab order: Backspace on an empty line removes it. */}
            <button type="button" className="fm-li-x" tabIndex={-1} aria-label={`Remove ${label} item ${i + 1}`} title="Remove" onClick={() => removeAt(i)}><X size={13} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="fm-link-btn fm-li-add" onClick={() => addAt(items.length)}><Plus size={13} weight="bold" aria-hidden="true" /> {addLabel}</button>
    </>
  );
}

/* ── a question card ── */

function Item(props: {
  fresh?: boolean; q: Question; index: number; count: number; n: number; sections: number; active: boolean;
  onActivate: () => void; onDeactivate: () => void; onChange: (q: Question) => void;
  onDup: () => void; onDel: () => void; onMove: (d: number) => void; onMustDrop: () => void; onAdd: (t: ItemType) => void;
}) {
  const { q, active, onActivate } = props;
  const controls = useDragControls();
  const isSec = q.type === "section";
  const label = q.title || (isSec ? "Untitled section" : "Untitled question");
  const ref = useRef<HTMLLIElement>(null);
  /* Opening a card by click or key moves focus into its title, so nobody
     loses their place when the read-only view is swapped for the editor. */
  const focusTitle = useRef(false);
  useLayoutEffect(() => {
    if (!active || !focusTitle.current) return;
    focusTitle.current = false;
    ref.current?.querySelector<HTMLElement>(".fm-q-title, .fm-sec-title")?.focus({ preventScroll: true });
  }, [active]);
  const activate = () => { focusTitle.current = true; onActivate(); };
  const acc = mustHaveOf(q);

  return (
    <Reorder.Item ref={ref} value={q} dragListener={false} dragControls={controls} as="li" data-qid={q.id}
      className={`fm-q${props.fresh ? " is-new" : ""}`}
      whileDrag={{ scale: 1.01, zIndex: 5 }}>
      <div className={`fm-card fm-qcard${active ? " is-active" : ""}${isSec ? " is-section" : ""}`}>
        <button type="button" className="fm-grip" aria-label="Drag to reorder" title="Drag to reorder, or Ctrl/⌘ + arrow keys" tabIndex={active ? 0 : -1}
          onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              props.onMove(e.key === "ArrowUp" ? -1 : 1);
              const el = e.currentTarget;
              window.requestAnimationFrame(() => el.focus());
            }
          }}>
          <DotsSix size={16} weight="bold" />
        </button>
        {active ? (
          isSec ? <SectionEditor {...props} /> : <QuestionEditor {...props} />
        ) : (
          <div className="fm-q-view" role="button" tabIndex={0} aria-label={`Edit ${isSec ? "section" : "question"} ${props.n}: ${label}`}
            onClick={activate} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}>
            {isSec ? (
              <div className="fm-sec-v">
                <span className="fm-q-cap">Section {props.n} of {props.sections}</span>
                <h3 className={q.title ? "" : "is-empty"}>{label}</h3>
                {q.help && <p>{q.help}</p>}
                {props.n < props.sections && q.after === "submit" && <p className="fm-sec-after">The form is submitted after this section. The sections below are not shown.</p>}
              </div>
            ) : (
              <>
                <div className="fm-q-caprow">
                  <span className="fm-q-cap">Q{props.n}</span>
                  <span className="fm-q-type"><span aria-hidden="true">{TYPE_ICON[q.type]}</span>{TYPE_LABEL(q.type)}</span>
                  {acc && <span className="fm-must-chip">Must-have</span>}
                </div>
                <p className="ap-label">{q.title || <em className="fm-untitled">Untitled question</em>}{q.required && <span className="ap-req" aria-hidden="true"> *</span>}</p>
                {q.help && <p className="ap-help">{q.help}</p>}
                <Mock q={q} />
              </>
            )}
          </div>
        )}
      </div>
      <InsertGap label={`Add a question after ${isSec ? "section" : "question"} ${props.n}`} onPick={props.onAdd} />
    </Reorder.Item>
  );
}

/** The question's control in its real candidate styling, inert. */
function Mock({ q }: { q: Question }) {
  if (q.type === "dropdown") {
    return (
      <span className="ap-ctl" aria-hidden="true">
        <span className="ap-input fm-mock fm-mock-select"><span className="fm-mock-ph">Choose one</span><CaretDown size={14} /></span>
      </span>
    );
  }
  if (q.type === "date") {
    return (
      <span className="ap-ctl ap-date" aria-hidden="true">
        <span className="ap-input fm-mock fm-mock-select"><span className="fm-mock-ph">dd / mm / yyyy</span><CalendarBlank size={14} /></span>
      </span>
    );
  }
  if (q.type === "choice" || q.type === "multi" || q.type === "yesno") {
    const opts = q.type === "yesno" ? ["Yes", "No"] : q.options ?? [];
    const acc = mustHaveOf(q);
    return (
      <div className="ap-opts fm-mock-opts" aria-hidden="true">
        {opts.map((o, i) => (
          <span key={i} className="ap-opt">
            <span className={`ap-dot${q.type === "multi" ? " is-box" : ""}`} />
            <span className="ap-opt-t">{o || <em className="fm-untitled">Empty option</em>}</span>
            {acc?.includes(o) && <span className="fm-acc-mark"><Check size={11} weight="bold" /> Accepted</span>}
          </span>
        ))}
        {q.allowOther && q.type !== "yesno" && (
          <span className="ap-opt">
            <span className={`ap-dot${q.type === "multi" ? " is-box" : ""}`} />
            <span className="ap-opt-t fm-other-mock">Other, in their own words</span>
          </span>
        )}
      </div>
    );
  }
  if (q.type === "scale") {
    const s = q.scale ?? { low: "Not at all", high: "Very" };
    return (
      <div className="ap-scale-w" aria-hidden="true">
        <div className="ap-scale">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="ap-scale-o">{n}</span>)}</div>
        <div className="ap-scale-ends"><span>{s.low}</span><span>{s.high}</span></div>
      </div>
    );
  }
  if (q.type === "number") {
    return (
      <span className="ap-ctl ap-num" aria-hidden="true">
        <span className="ap-input fm-mock">{q.placeholder && <span className="fm-mock-ph">{q.placeholder}</span>}</span>
        {q.unit && <span className="ap-unit">{q.unit}</span>}
      </span>
    );
  }
  const ph = q.type === "link" && (!q.placeholder || q.placeholder === "https://") ? "github.com/you" : q.placeholder;
  return (
    <span className="ap-ctl" aria-hidden="true">
      <span className={`ap-input fm-mock${q.type === "long" ? " is-long" : ""}`}>{ph && <span className="fm-mock-ph">{ph}</span>}</span>
    </span>
  );
}

function SectionEditor({ q, n, sections, onChange, onDup, onDel }: { q: Question; n: number; sections: number; onChange: (q: Question) => void; onDup: () => void; onDel: () => void }) {
  return (
    <div className="fm-edit">
      <span className="fm-q-cap">Section {n} of {sections}</span>
      <input className="fm-sec-title" value={q.title} placeholder="Section title" aria-label="Section title" onChange={(e) => onChange({ ...q, title: e.target.value })} />
      <input className="fm-hint-in" value={q.help ?? ""} placeholder="A line under the heading (optional)" aria-label="Section description" onChange={(e) => onChange({ ...q, help: e.target.value || undefined })} />
      {n < sections && (
        <label className="fm-after">
          <span className="t-label">After this section</span>
          <select className="fm-small-in" value={q.after === "submit" ? "submit" : "next"}
            onChange={(e) => { const { after: _a, ...rest } = q; onChange(e.target.value === "submit" ? { ...rest, after: "submit" } : rest); }}>
            <option value="next">Continue to the next section</option>
            <option value="submit">Submit form</option>
          </select>
        </label>
      )}
      <div className="fm-card-f">
        <span className="fm-bar-sp" />
        <button type="button" className="fm-ibtn" aria-label="Duplicate section" title="Duplicate (Ctrl/⌘ D)" onClick={onDup}><Copy size={18} /></button>
        <button type="button" className="fm-ibtn" aria-label="Delete section" title="Delete" onClick={onDel}><Trash size={18} /></button>
      </div>
    </div>
  );
}

/** An on/off switch with its label. */
function Switch({ on, label, onToggle, disabled, describedBy, title }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean; describedBy?: string; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`fm-switch${on ? " is-on" : ""}`} onClick={onToggle} aria-disabled={disabled || undefined}
      aria-describedby={describedBy} title={title}>
      <span className="fm-switch-l">{label}</span>
      <span className="fm-switch-t" aria-hidden="true"><span /></span>
    </button>
  );
}

function QuestionEditor({ q, n, onChange, onDup, onDel, onMustDrop }: {
  q: Question; n: number; onChange: (q: Question) => void; onDup: () => void; onDel: () => void; onMustDrop: () => void;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const typeBtn = useRef<HTMLButtonElement>(null);
  const accepted = mustHaveOf(q);
  const isMust = !!accepted;
  const mustNote = `fm-must-note-${q.id}`;
  const pool = q.type === "yesno" ? ["Yes", "No"] : q.options ?? [];
  /* A number holds a must-have as its lowest accepted answer ("at least 5"), set under the field. */
  const mustOk = q.type === "number" || (canMust(q.type) && pool.length >= 2);
  const toast = useToast();

  const setType = (t: ItemType) => {
    setTypeOpen(false);
    if (t === q.type) return;
    const keepOpts = PICK(q.type) && PICK(t);
    const next: Question = { id: q.id, type: t, title: q.title, help: q.help, required: q.required };
    if (PICK(t)) next.options = keepOpts && q.options?.length ? [...q.options] : ["Option 1", "Option 2"];
    if (PICK(t) && keepOpts && q.allowOther) next.allowOther = true;
    if (t === "scale") next.scale = q.scale ?? { low: "Not at all", high: "Very" };
    if (t === "number") next.unit = q.unit;
    if (t === "short" || t === "long" || t === "link" || t === "number") next.placeholder = q.placeholder;
    /* A must-have survives only between the two types that can hold one,
       and only if some of its answers still exist (and not all of them). */
    if (accepted && canMust(t)) {
      const nextPool = t === "yesno" ? ["Yes", "No"] : next.options ?? [];
      const kept = accepted.filter((a) => nextPool.includes(a));
      if (kept.length && kept.length < nextPool.length) next.accept = kept;
      else onMustDrop();
    } else if (accepted) onMustDrop();
    onChange(next);
  };
  const toggleMust = () => {
    if (q.type === "number") {
      if (isMust) onChange({ ...q, atLeast: undefined });
      else toast("Type the lowest number you would accept, under the field");
      return;
    }
    if (!mustOk) { toast(canMust(q.type) ? "Add a second option first: a must-have needs an answer outside it" : MUST_WHY); return; }
    if (isMust) onChange({ ...q, accept: undefined, knockout: undefined });
    else onChange({ ...q, knockout: undefined, accept: q.type === "yesno" ? ["Yes"] : [q.options?.[0] ?? "Option 1"] });
  };
  /* A must-have that accepts every answer could never flag anyone, so the
     last answer outside it can't be switched to accepted. */
  const toggleAccept = (o: string) => {
    const cur = accepted ?? [];
    const next = cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o];
    if (!next.length || next.length >= pool.length) return;
    onChange({ ...q, knockout: undefined, accept: next });
  };
  const lastOut = (o: string) => !!accepted && !accepted.includes(o) && accepted.length >= pool.length - 1;

  return (
    <div className="fm-edit">
      <span className="fm-q-cap">Q{n}</span>
      <div className="fm-edit-top">
        <AutoArea className="fm-q-title" value={q.title} placeholder="Question" label="Question" onChange={(v) => onChange({ ...q, title: v })} />
        <button ref={typeBtn} type="button" className="fm-type-btn" aria-haspopup="menu" aria-expanded={typeOpen} aria-label={`Answer type: ${TYPE_LABEL(q.type)}`} onClick={() => setTypeOpen((o) => !o)}>
          <span className="fm-type-ico" aria-hidden="true">{TYPE_ICON[q.type]}</span>
          <span className="fm-type-l">{TYPE_LABEL(q.type)}</span>
          <CaretDown size={12} weight="bold" aria-hidden="true" />
        </button>
        <TypeMenu anchor={typeBtn} open={typeOpen} onClose={() => setTypeOpen(false)} onPick={setType} align="end" current={q.type} withSection={false} />
      </div>
      <input className="fm-hint-in" value={q.help ?? ""} placeholder="Hint for candidates (optional)" aria-label="Hint for candidates" onChange={(e) => onChange({ ...q, help: e.target.value || undefined })} />

      <div className="fm-body">
        {PICK(q.type) && (
          <OptionsEditor q={q} onChange={onChange} accepted={accepted} onAccept={toggleAccept} lastOut={lastOut} />
        )}
        {q.type === "date" && (
          <div className="fm-line-body">
            <span className="ap-input fm-mock fm-mock-select fm-date-mock" aria-hidden="true"><span className="fm-mock-ph">dd / mm / yyyy</span><CalendarBlank size={14} /></span>
            <p className="t-caption fm-muted">Applicants pick a date from a calendar.</p>
          </div>
        )}
        {q.type === "yesno" && (
          <ol className="fm-opts">
            {["Yes", "No"].map((o) => (
              <li key={o} className="fm-opt is-fixed">
                <span />
                <span className="ap-dot" aria-hidden="true" />
                <span className="fm-opt-fixed">{o}</span>
                {isMust ? <AcceptPill on={accepted!.includes(o)} label={o} onToggle={() => toggleAccept(o)} locked={lastOut(o)} /> : <span />}
                <span />
              </li>
            ))}
          </ol>
        )}
        {(q.type === "short" || q.type === "long" || q.type === "link") && (
          <div className="fm-line-body">
            <span className={`ap-input fm-mock${q.type === "long" ? " is-long" : ""}`} aria-hidden="true"><span className="fm-mock-ph">{q.placeholder || (q.type === "long" ? "Long answer" : q.type === "link" ? "github.com/you" : "Short answer")}</span></span>
            <label className="fm-small-l"><span className="t-caption">Placeholder</span>
              <input className="fm-small-in" value={q.placeholder ?? ""} placeholder={q.type === "link" ? "github.com/you" : "Optional example answer"} onChange={(e) => onChange({ ...q, placeholder: e.target.value || undefined })} />
            </label>
          </div>
        )}
        {q.type === "number" && (
          <div className="fm-line-body">
            <span className="ap-ctl ap-num fm-num-mock" aria-hidden="true"><span className="ap-input fm-mock"><span className="fm-mock-ph">{q.placeholder || "0"}</span></span>{q.unit && <span className="ap-unit">{q.unit}</span>}</span>
            <label className="fm-small-l"><span className="t-caption">Unit</span>
              <input className="fm-small-in is-unit" value={q.unit ?? ""} placeholder="years" onChange={(e) => onChange({ ...q, unit: e.target.value || undefined })} />
            </label>
            <label className="fm-small-l"><span className="t-caption">At least</span>
              <input
                className="fm-small-in is-unit"
                inputMode="decimal"
                value={q.atLeast ?? ""}
                placeholder="no minimum"
                aria-label="Lowest answer you would accept"
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = Number(v);
                  onChange({ ...q, atLeast: v !== "" && Number.isFinite(n) && n >= 0 ? n : undefined });
                }}
              />
            </label>
          </div>
        )}
        {q.type === "scale" && (
          <div className="fm-scale-body">
            <div className="ap-scale" aria-hidden="true">{[1, 2, 3, 4, 5].map((k) => <span key={k} className="ap-scale-o">{k}</span>)}</div>
            <div className="fm-scale-labels">
              <label className="fm-small-l"><span className="t-caption">Label for 1</span>
                <input className="fm-small-in" value={q.scale?.low ?? ""} placeholder="Not at all" onChange={(e) => onChange({ ...q, scale: { low: e.target.value, high: q.scale?.high ?? "" } })} /></label>
              <label className="fm-small-l"><span className="t-caption">Label for 5</span>
                <input className="fm-small-in" value={q.scale?.high ?? ""} placeholder="Very" onChange={(e) => onChange({ ...q, scale: { low: q.scale?.low ?? "", high: e.target.value } })} /></label>
            </div>
          </div>
        )}
      </div>

      {isMust && (
        <p className="fm-must-call t-body-sm">
          Anyone who answers something other than <strong>{accepted!.join(" or ")}</strong> is flagged for you to look at. No one is turned down automatically.
        </p>
      )}

      <div className="fm-card-f">
        <button type="button" role="checkbox" aria-checked={isMust} className={`fm-must-tog${isMust ? " is-on" : ""}`} onClick={toggleMust}
          aria-disabled={!mustOk || undefined} aria-describedby={!mustOk ? mustNote : undefined} title={!mustOk ? MUST_WHY : "Flag anyone who answers outside what you accept"}>
          <span className="fm-must-box" aria-hidden="true">{isMust && <Check size={11} weight="bold" />}</span>
          Must-have answer
        </button>
        {!mustOk && <span id={mustNote} className="fm-must-why t-caption">{canMust(q.type) ? "Needs two or more options" : "Works on Yes/No, single choice and dropdown"}</span>}
        <span className="fm-bar-sp" />
        <button type="button" className="fm-ibtn" aria-label="Duplicate question" title="Duplicate (Ctrl/⌘ D)" onClick={onDup}><Copy size={18} /></button>
        <button type="button" className="fm-ibtn" aria-label="Delete question" title="Delete" onClick={onDel}><Trash size={18} /></button>
        <span className="fm-card-f-div" aria-hidden="true" />
        <Switch on={q.required} label="Required" onToggle={() => onChange({ ...q, required: !q.required })} />
      </div>
    </div>
  );
}

function AcceptPill({ on, label, onToggle, locked }: { on: boolean; label: string; onToggle: () => void; locked?: boolean }) {
  return (
    <button type="button" className={`fm-accept${on ? " is-on" : ""}`} aria-pressed={on} aria-label={`${label}: ${on ? "accepted" : "not accepted"}`}
      onClick={onToggle} disabled={locked} title={locked ? "At least one answer has to be outside the must-have" : undefined}>
      {on ? <><Check size={11} weight="bold" aria-hidden="true" /> Accepted</> : "Not accepted"}
    </button>
  );
}

/** Choice options. Keys are local and stable, so typing never remounts an input. */
function OptionsEditor({ q, onChange, accepted, onAccept, lastOut }: {
  q: Question; onChange: (q: Question) => void; accepted: string[] | null; onAccept: (o: string) => void; lastOut: (o: string) => boolean;
}) {
  const opts = q.options ?? [];
  const [keys, setKeys] = useState<string[]>(() => opts.map(() => newId("o")));
  const focusAt = useRef<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  /* Reconcile if the count changed from outside (type switch, undo). */
  const ks = keys.length === opts.length ? keys : opts.map((_, i) => keys[i] ?? newId("o"));
  useEffect(() => { if (ks !== keys) setKeys(ks); }, [ks, keys]);
  useEffect(() => {
    if (focusAt.current == null) return;
    list.current?.querySelectorAll<HTMLInputElement>(".fm-opt-in")[focusAt.current]?.focus();
    focusAt.current = null;
  });

  const setOpts = (next: string[], nextKeys: string[], acc?: string[] | undefined) => {
    setKeys(nextKeys);
    const out: Question = { ...q, options: next };
    if (accepted) {
      let a = (acc ?? accepted).filter((x) => next.includes(x));
      if (!a.length && next[0]) a = [next[0]];
      /* Never accept every option: that must-have could flag no one. */
      if (a.length >= next.length) a = a.slice(0, Math.max(0, next.length - 1));
      out.accept = a.length ? a : undefined;
      out.knockout = undefined;
    }
    onChange(out);
  };
  const rename = (i: number, v: string) => {
    const old = opts[i]!;
    const next = opts.map((o, k) => (k === i ? v : o));
    setOpts(next, ks, accepted?.map((a) => (a === old ? v : a)));
  };
  const addAt = (i: number, label?: string) => {
    const next = [...opts.slice(0, i), label ?? `Option ${opts.length + 1}`, ...opts.slice(i)];
    setOpts(next, [...ks.slice(0, i), newId("o"), ...ks.slice(i)]);
    focusAt.current = i;
  };
  const remove = (i: number) => {
    if (opts.length <= 1) return;
    setOpts(opts.filter((_, k) => k !== i), ks.filter((_, k) => k !== i));
    focusAt.current = Math.max(0, i - 1);
  };
  /* An "Other" typed as an option gives no room to say what; the write-in answer does. */
  const hasOther = q.allowOther || opts.includes("Other");

  return (
    <>
      <Reorder.Group as="ol" axis="y" values={ks} ref={list}
        onReorder={(next: string[]) => setOpts(next.map((k) => opts[ks.indexOf(k)]!), next)} className="fm-opts">
        {ks.map((k, i) => (
          <OptionRow key={k} k={k} label={opts[i] ?? ""} multi={q.type === "multi"} accepted={accepted}
            onRename={(v) => rename(i, v)} onEnter={() => addAt(i + 1)} onRemoveEmpty={() => remove(i)} onRemove={() => remove(i)}
            onAccept={() => onAccept(opts[i]!)} locked={lastOut(opts[i] ?? "")} canRemove={opts.length > 1} />
        ))}
      </Reorder.Group>
      {q.allowOther && (
        <ol className="fm-opts fm-opts-other">
          <li className="fm-opt fm-opt-other">
            <span />
            <span className={`ap-dot${q.type === "multi" ? " is-box" : ""}`} aria-hidden="true" />
            <span className="fm-opt-fixed">Other <span className="fm-muted">(they write their own answer)</span></span>
            <span />
            <button type="button" className="fm-opt-x" aria-label="Remove Other" onClick={() => onChange({ ...q, allowOther: undefined })}><X size={14} /></button>
          </li>
        </ol>
      )}
      <div className="fm-opt-add">
        <span className={`ap-dot${q.type === "multi" ? " is-box" : ""}`} aria-hidden="true" />
        <button type="button" className="fm-link-btn" onClick={() => addAt(opts.length)}>Add option</button>
        {!hasOther && <span className="t-body-sm fm-or">or <button type="button" className="fm-link-btn is-accent" onClick={() => onChange({ ...q, allowOther: true })}>add "Other"</button></span>}
      </div>
    </>
  );
}

function OptionRow({ k, label, multi, accepted, onRename, onEnter, onRemoveEmpty, onRemove, onAccept, canRemove, locked }: {
  k: string; label: string; multi: boolean; accepted: string[] | null; onRename: (v: string) => void; onEnter: () => void;
  onRemoveEmpty: () => void; onRemove: () => void; onAccept: () => void; canRemove: boolean; locked: boolean;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={k} as="li" dragListener={false} dragControls={controls} className="fm-opt" whileDrag={{ scale: 1.01, zIndex: 3 }}>
      <span className="fm-opt-grip" aria-hidden="true" onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}><DotsSixVertical size={14} weight="bold" /></span>
      <span className={`ap-dot${multi ? " is-box" : ""}`} aria-hidden="true" />
      <input className="fm-opt-in" value={label} aria-label="Option" placeholder="Option"
        /* A default label ("Option 2") is replaced when typed over, not appended to. */
        onFocus={(e) => { if (/^Option \d+$/.test(e.currentTarget.value)) e.currentTarget.select(); }}
        onChange={(e) => onRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onEnter(); }
          else if (e.key === "Backspace" && !label && canRemove) { e.preventDefault(); onRemoveEmpty(); }
        }} />
      {accepted ? <AcceptPill on={accepted.includes(label)} label={label} onToggle={onAccept} locked={locked} /> : <span />}
      <button type="button" className="fm-opt-x" aria-label={`Remove option ${label}`} onClick={onRemove} disabled={!canRemove}><X size={14} /></button>
    </Reorder.Item>
  );
}

/* ── share ── */

/** Where a shared link is posted; each copy carries ?src= so Responses can say what worked. */
const CHANNELS: readonly { id: string; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "careers", label: "Careers page" },
];
/** The link with where it was shared; the source goes after the hash route, where the page reads it. */
export const linkFor = (link: string, src: string) => `${link}${link.includes("?") ? "&" : "?"}src=${encodeURIComponent(src)}`;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Share({ form, link, draft, onLive, onPreview, patch }: {
  form: Form; link: string | null; draft: boolean; onLive: () => void; onPreview: () => void; patch: (fn: (f: Form) => Form) => void;
}) {
  const people = usePipeline(form.campaign).filter((p) => p.stage === "outreach");
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const shown = people.slice(0, 7);
  const page = form.page ?? {};
  const setPage = (next: Partial<NonNullable<Form["page"]>>) => patch((f) => ({ ...f, page: { ...f.page, ...next } }));
  const uid = form.id.replace(/[^a-z0-9]/gi, "");
  return (
    <div className="fm-share">
      <section className="cw-card">
        <header className="cw-card-h">
          <h2>Link</h2>
          {draft && <span className="cw-card-sub">{LIVE ? link ? "Closed: the link says it's no longer taking applications" : "The link appears once you publish" : "Draft: the link shows a \"not open yet\" page until you publish"}</span>}
        </header>
        {link ? (
          <div className="fm-linkrow">
            <input readOnly value={link} aria-label="Form link" onFocus={(e) => e.currentTarget.select()} />
            <ActionButton tone="quiet" className="fm-btn36" done="Link copied" ms={250} onRun={() => { void navigator.clipboard?.writeText(link).catch(() => {}); }}>
              <LinkSimple size={14} /> Copy link
            </ActionButton>
            <button type="button" className="cw-btn fm-btn36" onClick={onPreview}><Eye size={14} /> Open preview</button>
          </div>
        ) : (
          <div className="fm-linkrow">
            <button type="button" className="cw-btn is-primary fm-btn36" onClick={onLive}>Publish</button>
            <button type="button" className="cw-btn fm-btn36" onClick={onPreview}><Eye size={14} /> Open preview</button>
          </div>
        )}
        {link && (
          <div className="fm-channels">
            <span className="t-body-sm fm-muted">Copy it for</span>
            {CHANNELS.map((c) => (
              <ActionButton key={c.id} tone="quiet" className="fm-btn32" done="Copied" ms={200}
                onRun={() => { void navigator.clipboard?.writeText(linkFor(link, c.id)).catch(() => {}); }}>
                {c.label}
              </ActionButton>
            ))}
          </div>
        )}
        <p className="fm-note">Anyone with the link can apply. Each copy above counts its own visits and applications, so Responses can show which one worked. If an applicant looks like someone already in your candidates, you decide whether it's the same person.</p>
      </section>

      <section className="cw-card fm-settings" aria-labelledby={`fm-before-${uid}`}>
        <header className="cw-card-h"><h2 id={`fm-before-${uid}`}>Before people apply</h2></header>
        <div className="fm-set-row">
          <label className="fm-set-l" htmlFor={`fm-close-${uid}`}>Stop taking applications after</label>
          <div className="fm-set-ctl">
            <input id={`fm-close-${uid}`} type="date" className="fm-small-in fm-date-in" min={todayIso()} value={page.closesOn ?? ""}
              onChange={(e) => setPage({ closesOn: e.target.value || null })} />
            {page.closesOn && <button type="button" className="fm-link-btn" onClick={() => setPage({ closesOn: null })}>No closing date</button>}
          </div>
          <p className="fm-set-note">The form closes at the end of that day, India time, and the page says "Apply by" that date until then.</p>
        </div>
      </section>

      <section className="cw-card fm-settings" aria-labelledby={`fm-words-${uid}`}>
        <header className="cw-card-h"><h2 id={`fm-words-${uid}`}>What applicants read</h2></header>
        <div className="fm-set-row">
          <label className="fm-set-l" htmlFor={`fm-promise-${uid}`}>A line under the title</label>
          <input id={`fm-promise-${uid}`} className="fm-small-in fm-set-wide" maxLength={160} value={page.promise ?? ""}
            placeholder="We reply to everyone within 72 hours." onChange={(e) => setPage({ promise: e.target.value || null })} />
          <p className="fm-set-note">Optional. Only promise what the team will keep.</p>
        </div>
        <div className="fm-set-row">
          <label className="fm-set-l" htmlFor={`fm-success-${uid}`}>Once they've applied</label>
          <textarea id={`fm-success-${uid}`} className="fm-small-in fm-set-wide fm-set-ta" maxLength={500} rows={3} value={page.successMessage ?? ""}
            placeholder="The hiring team will read your application and get back to you by email." onChange={(e) => setPage({ successMessage: e.target.value || null })} />
        </div>
        <div className="fm-set-row">
          <label className="fm-set-l" htmlFor={`fm-closed-${uid}`}>When the form has closed</label>
          <textarea id={`fm-closed-${uid}`} className="fm-small-in fm-set-wide fm-set-ta" maxLength={500} rows={2} value={page.closedMessage ?? ""}
            placeholder="This role isn't taking applications any more." onChange={(e) => setPage({ closedMessage: e.target.value || null })} />
        </div>
      </section>

      {!LIVE && <section className="cw-card">
        <header className="cw-card-h"><h2>Send with outreach</h2><span className="cw-card-sub">{people.length === 1 ? "1 person" : `${people.length} people`} in outreach</span></header>
        {sent ? (
          <p className="cw-win"><Check size={14} weight="bold" /> Sent to {people.length}. Their answers land in Responses.</p>
        ) : (
          <>
            <div className="fm-faces" aria-label={`${people.length} people in outreach`}>
              {shown.map((p) => <span key={p.id} className="fm-face" title={p.name}><Avatar name={p.name} hue={p.hue} size={28} /></span>)}
              {people.length > shown.length && <span className="fm-faces-more">+{people.length - shown.length}</span>}
            </div>
            <footer className="fm-send">
              {draft ? <span className="t-body-sm fm-muted">Publishing opens the link, then it goes out.</span> : <span />}
              <button type="button" className="cw-btn is-primary fm-btn36" disabled={!people.length}
                onClick={() => { if (draft) onLive(); setSent(true); toast(`Form sent to ${people.length}`); }}>
                <PaperPlaneTilt size={14} weight="fill" /> {draft ? `Publish and send to ${people.length}` : `Send to ${people.length}`}
              </button>
            </footer>
          </>
        )}
      </section>}

      {(!LIVE || mustHaves(form).length > 0) && (
        <section className="cw-card">
          <header className="cw-card-h"><h2>{LIVE ? "When answers come in" : "When it goes out"}</h2></header>
          {!LIVE && <p className="fm-note"><CalendarBlank size={15} className="fm-note-ico" /> Attached to the first outreach message for everyone newly contacted in this campaign. Change this in the outreach sequence.</p>}
          {mustHaves(form).length > 0 && <p className="fm-note">Responses that missed a must-have are marked "Missed a must-have" for you to look at. Nobody is turned down automatically.</p>}
        </section>
      )}
    </div>
  );
}
