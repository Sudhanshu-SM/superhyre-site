import { CaretDown, Check, LinkSimple, WarningCircle } from "@phosphor-icons/react";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Brand, PublicPage, SubmitOutcome } from "./api/forms";
import type { Answer, Form, Question } from "./campaign";
import { Loader } from "./components/Loader";
import { EmptyArt } from "./EmptyArt";
import { campaignById, estMinutes, formLink, minutesLabel, tintOf } from "./formKit";
import { pagesOf, reachablePages } from "./formPages";
import type { Page } from "./formPages";
import { parsePhone, phoneProblemText, tidyPhone } from "./phone";
import { ActionButton, Dialog } from "./ui";
import "./apply.css";

/**
 * The page a candidate sees. Calm and editorial: the hiring team's look (their logo, colour
 * and fonts when the workspace has a brand, else a tint), the role first (title, where, how
 * long this takes, what the job is), then the application. Name, email and phone come first
 * so every response maps to a person. "Send application" sends it at once and the page thanks them:
 * there is no code to enter. Preview mode never saves.
 */

export type Who = { name: string; email: string; phone: string; linkedin?: string };
/** Everything a live send carries besides the answers. */
export type Extra = { startedAt: number; website: string };
export type ApplyOnSubmit = (answers: Record<string, Answer>, who: Who, extra: Extra) => Promise<SubmitOutcome> | void;

/* ── the look ── */

const hexRgb = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
/** `a` moved toward `b` by `t` (0 to 1), as hex. */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The page's colours and fonts: the organisation's brand, or the form's tint. */
export function lookVars(form: Pick<Form, "theme">, brand: Brand | null | undefined): CSSProperties {
  if (!brand) return tintVars(form);
  const fill = brand.primary;
  const lightText = brand.onPrimary.toLowerCase() === "#ffffff";
  return {
    ["--fm-fill" as string]: fill,
    ["--fm-on-fill" as string]: brand.onPrimary,
    /* Text in the brand colour on white: the colour itself when white reads on it, darker when it's light. */
    ["--fm-text" as string]: lightText ? fill : mixHex(fill, "#000000", 0.55),
    ["--fm-wash" as string]: mixHex(fill, "#ffffff", 0.9),
    ["--fm-bg" as string]: mixHex(fill, "#faf9f7", 0.96),
    ["--fm-band" as string]: mixHex(fill, "#ffffff", 0.8),
    ["--fm-line" as string]: mixHex(fill, "#ffffff", 0.68),
    ["--ap-font-display" as string]: `"${brand.fontDisplay}", var(--word)`,
    ["--ap-font-body" as string]: `"${brand.fontBody}", var(--ui)`,
  };
}

export const tintVars = (form: Pick<Form, "theme">): CSSProperties => {
  const t = tintOf(form);
  return {
    ["--fm-fill" as string]: t.fill, ["--fm-text" as string]: t.text, ["--fm-wash" as string]: t.wash,
    ["--fm-bg" as string]: t.bg, ["--fm-band" as string]: t.band, ["--fm-line" as string]: t.line,
  };
};

/** The brand's two fonts, from Google Fonts (they are always open fonts), once per page. */
export function useBrandFonts(brand: Brand | null | undefined) {
  useEffect(() => {
    if (!brand || typeof document === "undefined") return;
    const families = [...new Set([brand.fontDisplay, brand.fontBody])]
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
      .join("&");
    const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    if (document.querySelector(`link[data-ap-fonts="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.apFonts = href;
    document.head.appendChild(link);
  }, [brand]);
}

/* ── rules ── */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* A scheme is optional: people type "github.com/you", and that is a link. */
const URL_RE = /^(https?:\/\/)?[^\s.]+\.[^\s]+$/i;
const LINKEDIN = /^(https?:\/\/)?([a-z0-9-]+\.)?linkedin\.com\/in\/[^/?#\s]+/i;
const withScheme = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const empty = (a: Answer | undefined) => a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const OTHER_MAX = 200;

/** "Acme's", "Quill Partners'": a name in the possessive, the way people write it. */
export const possessive = (name: string) => (/s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`);

/** "30 Nov", the way the closing day reads in a sentence. */
export const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** An answer of their own to a question that offers "Other", and whether it's chosen. */
type Others = Record<string, { on: boolean; text: string }>;

/** The answers as they go out: an "Other" choice becomes what they wrote. */
export function resolveAnswers(qs: readonly Question[], answers: Record<string, Answer>, others: Others): Record<string, Answer> {
  const out: Record<string, Answer> = { ...answers };
  for (const q of qs) {
    const o = others[q.id];
    if (!q.allowOther || !o?.on) continue;
    const text = o.text.trim().replace(/\s+/g, " ");
    if (q.type === "multi") out[q.id] = [...(Array.isArray(out[q.id]) ? (out[q.id] as string[]) : []), ...(text ? [text] : [])];
    else out[q.id] = text;
  }
  for (const q of qs) if (q.type === "link" && typeof out[q.id] === "string" && String(out[q.id]).trim()) out[q.id] = withScheme(String(out[q.id]).trim());
  return out;
}

/**
 * What needs another look, by key (name, email, phone, linkedin, or a question id): on one page (`only`, 0 being the
 * first, which carries the contact details) or on every page an applicant reaches. Required answers and formats;
 * the server checks all of it again.
 */
export function pageProblems(pages: readonly Page[], w: Who, a: Record<string, Answer>, o: Others, only?: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (only === undefined || only === 0) {
    if (!w.name.trim()) e.name = "Add your name";
    if (!w.email.trim()) e.email = "Add an email we can reach you on";
    else if (!EMAIL.test(w.email.trim())) e.email = "That email doesn't look right";
    const ph = parsePhone(w.phone);
    if (!ph.ok) e.phone = phoneProblemText(ph.problem).replace(/\.$/, "");
    if (w.linkedin?.trim() && !LINKEDIN.test(w.linkedin.trim())) e.linkedin = "Use a LinkedIn profile link, like linkedin.com/in/your-name";
  }
  const qs = only === undefined ? pages.flatMap((p) => p.items) : pages[only]?.items ?? [];
  for (const q of qs) {
    const v = a[q.id];
    const other = q.allowOther ? o[q.id] : undefined;
    const otherOn = !!other?.on;
    if (otherOn && !other!.text.trim()) e[q.id] = "Write your answer next to Other";
    else if (otherOn && other!.text.trim().length > OTHER_MAX) e[q.id] = `Keep it under ${OTHER_MAX} characters`;
    else if (q.required && empty(v) && !otherOn) e[q.id] = "This one's required";
    else if (q.type === "link" && !empty(v) && !URL_RE.test(String(v).trim())) e[q.id] = "That doesn't look like a link. Try something like github.com/you";
  }
  return e;
}

type Step =
  | { s: "form" }
  | { s: "done"; who: Who }
  | { s: "already"; at: string; who: Who }
  | { s: "stopped"; message: string };

export function ApplyForm({ form, mode, page, onSubmit }: {
  form: Form;
  mode: "preview" | "live";
  /** Live: the company, its look, the trust line. The builder's preview passes none. */
  page?: PublicPage;
  /** Live only. Returning an outcome means the server decides what happens next. */
  onSubmit?: ApplyOnSubmit;
}): JSX.Element {
  const uid = useId().replace(/:/g, "");
  const fid = (k: string) => `ap-${uid}-${k}`;
  const camp = campaignById(form.campaign);
  const role = form.role;
  const m = estMinutes(form);
  const brand = page?.brand ?? null;
  useBrandFonts(brand);
  const [who, setWho] = useState<Who>({ name: "", email: "", phone: "", linkedin: "" });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [others, setOthers] = useState<Others>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ s: "form" });
  const [notSent, setNotSent] = useState<string | null>(null);
  /* Hidden from people; only a bot fills it in. */
  const [trap, setTrap] = useState("");
  const startedAt = useRef(Date.now());
  const doneRef = useRef<HTMLHeadingElement>(null);
  /* Pages: a section divider starts one. A form without dividers is one page and looks as it always did. */
  const pages = useMemo(() => reachablePages(pagesOf(form.questions)), [form.questions]);
  const [pageNo, setPageNo] = useState(0);
  const at = Math.min(pageNo, pages.length - 1);
  const paged = pages.length > 1;
  const last = at >= pages.length - 1;
  const cur = pages[at]!;
  const items = useMemo(() => pages.flatMap((p) => p.items), [pages]);
  const settings = form.page ?? {};
  const promise = page?.promise ?? settings.promise ?? null;
  const closesOn = page?.closesOn ?? settings.closesOn ?? null;
  const successMessage = page?.successMessage ?? settings.successMessage ?? null;
  const company = page?.company ?? null;

  useEffect(() => {
    if (step.s === "done" || step.s === "already") doneRef.current?.focus();
  }, [step.s]);

  /** What needs a look: on one page (`only`), or on every page an applicant reaches. */
  const validate = (w: Who, a: Record<string, Answer>, o: Others, only?: number) => pageProblems(pages, w, a, o, only);

  const recheck = (id: string, w: Who, a: Record<string, Answer>, o: Others) => {
    if (!tried && !errors[id]) return;
    setErrors((cur) => {
      const e = validate(w, a, o);
      const c = { ...cur };
      if (e[id]) c[id] = e[id]!;
      else delete c[id];
      return c;
    });
  };
  const setA = (id: string, v: Answer) => {
    const next = { ...answers, [id]: v };
    setAnswers(next);
    recheck(id, who, next, others);
  };
  const setO = (id: string, v: { on: boolean; text: string }) => {
    const next = { ...others, [id]: v };
    setOthers(next);
    recheck(id, who, answers, next);
  };
  const setW = (k: keyof Who, v: string) => {
    const next = { ...who, [k]: v };
    setWho(next);
    if (errors[k]) recheck(k, next, answers, others);
  };

  const focusFirst = (e: Record<string, string>) => {
    const order = ["name", "email", "phone", "linkedin", ...items.map((q) => q.id)];
    const first = order.find((k) => e[k]);
    if (!first) return false;
    const go = () => {
      const el = document.getElementById(fid(first));
      const target = (el?.matches("input,textarea,select") ? el : el?.querySelector<HTMLElement>("input,textarea,select,button")) ?? el;
      target?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    };
    /* A problem on another page: go there first, then focus it once it is drawn. */
    const where = ["name", "email", "phone", "linkedin"].includes(first) ? 0 : pages.findIndex((p) => p.items.some((q) => q.id === first));
    if (where >= 0 && where !== at) {
      setPageNo(where);
      window.setTimeout(go, 60);
    } else go();
    return true;
  };

  /** Moves to another page: the top of the card, focus on it, so a keyboard or screen-reader user starts there. */
  const goTo = (n: number) => {
    setErrors({});
    setTried(false);
    setNotSent(null);
    setPageNo(n);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(fid("top"));
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    });
  };
  /** Next: this page's required answers and formats first; the first problem takes the focus. */
  const next = () => {
    const e = validate(who, answers, others, at);
    setErrors(e);
    if (focusFirst(e)) { setTried(true); return; }
    goTo(at + 1);
  };

  /** One send: the application, and then the thank-you. */
  const send = () => {
    const w: Who = {
      name: who.name.trim(),
      email: who.email.trim(),
      phone: who.phone.trim(),
      linkedin: who.linkedin?.trim() ? withScheme(who.linkedin.trim()) : undefined,
    };
    const out = resolveAnswers(form.questions, answers, others);
    const sent = mode === "live" ? onSubmit?.(out, w, { startedAt: startedAt.current, website: trap }) : undefined;
    if (!sent) {
      /* Preview, or a fixture page: what an applicant would see, nothing stored. */
      window.setTimeout(() => { setBusy(false); setStep({ s: "done", who: w }); }, 700);
      return;
    }
    void sent.then((r) => {
      setBusy(false);
      switch (r.kind) {
        case "sent":
          setStep({ s: "done", who: w });
          break;
        case "already":
          setStep({ s: "already", at: r.at, who: w });
          break;
        case "verify":
          /* A form set up to ask for an emailed code, which this page doesn't do: say so plainly. */
          setStep({ s: "stopped", message: "This form can't take applications from this page just now. Please try again a little later." });
          break;
        case "fix":
          setStep({ s: "form" });
          setErrors(r.issues);
          setTried(true);
          focusFirst(r.issues);
          break;
        case "stopped":
          if (r.retry) setNotSent(r.message);
          else setStep({ s: "stopped", message: r.message });
          break;
      }
    }, () => {
      setBusy(false);
      setNotSent("That didn't go through. Check your connection and try again.");
    });
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    /* Enter on a page that isn't the last one goes on to the next page. */
    if (paged && !last) { next(); return; }
    const e = validate(who, answers, others);
    setErrors(e);
    setTried(true);
    setNotSent(null);
    if (focusFirst(e)) return;
    setBusy(true);
    send();
  };

  const reset = () => {
    setWho({ name: "", email: "", phone: "", linkedin: "" });
    setAnswers({});
    setOthers({});
    setErrors({});
    setTried(false);
    setPageNo(0);
    setStep({ s: "form" });
  };
  const nErr = Object.keys(errors).length;
  const team = role?.team ?? camp?.department;
  const location = role?.location ?? camp?.location;
  const closed = mode === "live" && form.status === "draft";
  const doing = (role?.responsibilities ?? []).map((x) => x.trim()).filter(Boolean);
  const wanted = (role?.requirements ?? []).map((x) => x.trim()).filter(Boolean);
  const meta = [
    team,
    location,
    role?.workType,
    minutesLabel(m),
    closesOn ? `Apply by ${dayLabel(closesOn)}` : null,
    page?.applied ? `${page.applied.toLocaleString("en-IN")} applied` : null,
  ].filter(Boolean) as string[];

  return (
    <div className={`ap${brand ? " is-branded" : ""}`} style={lookVars(form, brand)}>
      <article className="ap-sheet" id={fid("top")} tabIndex={-1}>
        {/* The first block: the orange band, the team's words and the role. Everything after it is its own block. */}
        <div className={`ap-lead${at === 0 && (promise || form.description || role?.about || doing.length || wanted.length) ? "" : " is-bare"}`}>
        <header className="ap-head">
          {/* The heading: a band of the brand orange across the card, with the clipboard at its right. */}
          <div className={`ap-band${paged ? " has-progress" : ""}`}>
            <OrgLine company={company} logo={brand?.logoUrl ?? null} />
            <h1 className="ap-h1">{form.title || form.name}</h1>
            {/* One line of plain facts: team, place, work type, time it takes, closing day, how many applied. */}
            <p className="ap-meta">
              {meta.map((x, i) => (
                <Fragment key={i}>{i > 0 && <span className="ap-sep" aria-hidden="true">·</span>}<span>{x}</span></Fragment>
              ))}
            </p>
            <EmptyArt name="form-clipboard" size={172} className="ap-band-art" />
          </div>
          {paged && (
            <div className="ap-progress" role="progressbar" aria-label="How far through the form" aria-valuemin={1} aria-valuemax={pages.length} aria-valuenow={at + 1}
              aria-valuetext={`Page ${at + 1} of ${pages.length}`}>
              <span style={{ width: `${((at + 1) / pages.length) * 100}%` }} />
            </div>
          )}
          {at === 0 && promise && <p className="ap-promise">{promise}</p>}
          {at === 0 && form.description && <p className="ap-intro">{form.description}</p>}
        </header>

        {at === 0 && role?.about && role.about.trim() !== (form.description ?? "").trim() && (
          <section className="ap-role"><h2>{role.labels?.about || "About the role"}</h2><p>{role.about}</p></section>
        )}
        {at === 0 && doing.length > 0 && (
          <section className="ap-role"><h2>{role?.labels?.doing || "What you'll do"}</h2><ul>{doing.map((r, i) => <li key={i}>{r}</li>)}</ul></section>
        )}
        {at === 0 && wanted.length > 0 && (
          <section className="ap-role"><h2>{role?.labels?.wanted || "What we're looking for"}</h2><ul>{wanted.map((r, i) => <li key={i}>{r}</li>)}</ul></section>
        )}

        </div>

        {closed ? (
          <div className="ap-block is-note">
            <EmptyArt name="form-closed" size={200} />
            <p className="ap-closed">This form isn't open yet. Check back soon.</p>
          </div>
        ) : step.s === "stopped" ? (
          <div className="ap-block is-note">
            <EmptyArt name="form-closed" size={200} />
            <p className="ap-closed" role="status">{step.message}</p>
          </div>
        ) : step.s === "done" || step.s === "already" ? (
          <div className="ap-block is-note">
            <Done
              refEl={doneRef}
              who={step.who}
              already={step.s === "already" ? step.at : null}
              message={successMessage}
              company={company}
              preview={mode === "preview"}
              onReset={reset}
            />
          </div>
        ) : (
          <form className="ap-form" onSubmit={submit} noValidate>
            <fieldset className="ap-lock">
              <legend className="sr-only">Your details and answers</legend>
              <div className="ap-fields">
                {at === 0 && (
                  <section className="ap-block ap-who-block" aria-labelledby={fid("app-h")}>
                    <div className="ap-form-h">
                      <h2 id={fid("app-h")}>Your application</h2>
                      <p>Questions marked * are required.</p>
                    </div>
                    <div className="ap-who">
                      <TextField id={fid("name")} label="Full name" required value={who.name} error={errors.name} autoComplete="name" onChange={(v) => setW("name", v)} />
                      <TextField id={fid("email")} label="Email" required type="email" value={who.email} error={errors.email} autoComplete="email" inputMode="email"
                        onChange={(v) => setW("email", v)}
                        onBlur={() => { if (who.email.trim() && !EMAIL.test(who.email.trim())) setErrors((c) => ({ ...c, email: "That email doesn't look right" })); }} />
                      <PhoneField id={fid("phone")} value={who.phone} error={errors.phone}
                        onChange={(v) => setW("phone", v)}
                        onBlur={() => {
                          if (!who.phone.trim()) return;
                          const r = parsePhone(who.phone);
                          if (r.ok) setW("phone", tidyPhone(who.phone));
                          else setErrors((c) => ({ ...c, phone: phoneProblemText(r.problem).replace(/\.$/, "") }));
                        }} />
                      <TextField id={fid("linkedin")} label="LinkedIn profile" type="url" value={who.linkedin ?? ""} placeholder="linkedin.com/in/…" autoComplete="url" error={errors.linkedin} onChange={(v) => setW("linkedin", v)} />
                      <div className="ap-trap" aria-hidden="true">
                        <label htmlFor={fid("website")}>Website</label>
                        <input id={fid("website")} name="website" type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
                      </div>
                    </div>
                  </section>
                )}
                {/* A section is a block of its own (its title and what it says); each question under it is one more. */}
                {cur.section && (
                  <section className="ap-block is-section" aria-labelledby={fid(`${cur.section.id}-h`)}>
                    <div className="ap-section-h">
                      <h3 id={fid(`${cur.section.id}-h`)}>{cur.section.title || "Untitled section"}</h3>
                      {cur.section.help && <p>{cur.section.help}</p>}
                    </div>
                  </section>
                )}
                {cur.items.map((q) => (
                  <div key={q.id} className="ap-block">
                    <QuestionField id={fid(q.id)} q={q} value={answers[q.id]} other={others[q.id]} error={errors[q.id]}
                      onChange={(v) => setA(q.id, v)} onOther={(v) => setO(q.id, v)} />
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="ap-submit-row">
              {tried && nErr > 0 && <p className="ap-sum" role="alert">{nErr} answer{nErr === 1 ? " needs" : "s need"} a look</p>}
              {notSent && <p className="ap-sum is-calm" role="alert">{notSent}</p>}
              {paged ? (
                <div className="ap-nav">
                  {at > 0 && <button type="button" className="ap-back" disabled={busy} onClick={() => goTo(at - 1)}>Back</button>}
                  <button type="submit" className="ap-submit" aria-busy={busy || undefined}>
                    {last
                      ? (busy ? <><Loader size="sm" tone="inherit" />Sending</> : "Send application")
                      : "Next"}
                  </button>
                  <span className="ap-pageof" aria-live="polite">Page {at + 1} of {pages.length}</span>
                </div>
              ) : (
                <button type="submit" className="ap-submit" aria-busy={busy || undefined}>
                  {busy ? <><Loader size="sm" tone="inherit" />Sending</> : "Send application"}
                </button>
              )}
            </div>
          </form>
        )}
      </article>
      <footer className="ap-foot">
        <p>Your answers go only to {company ? possessive(company) : "the"} hiring team.</p>
        <p className="ap-made">Hiring on <a href="https://superhyre.com" target="_blank" rel="noopener noreferrer">SuperHyre</a></p>
      </footer>
    </div>
  );
}

/* ── header ── */

function OrgLine({ company, logo }: { company: string | null; logo: string | null }) {
  const [broken, setBroken] = useState(false);
  if (!company && (!logo || broken)) return null;
  return (
    <p className="ap-org">
      {logo && !broken && <img className="ap-logo" src={logo} alt={company ? "" : "Company logo"} onError={() => setBroken(true)} />}
      {company && <span className="ap-org-n">{company}</span>}
    </p>
  );
}

/* ── done ── */

export function Done({ refEl, who, already, message, company, preview, onReset }: {
  refEl: React.RefObject<HTMLHeadingElement>;
  who: Who;
  already: string | null;
  message: string | null;
  company: string | null;
  preview: boolean;
  onReset: () => void;
}) {
  const first = who.name.split(/\s+/)[0] || "there";
  const team = company ? `${possessive(company)} hiring team` : "The hiring team";
  return (
    <div className="ap-done" role="status">
      <svg className="ap-done-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle className="ap-done-ring" cx="32" cy="32" r="30" />
        <path className="ap-done-tick" d="M20 33.5l8.5 8.5L44.5 24" />
      </svg>
      {already ? (
        <>
          <h2 ref={refEl} tabIndex={-1}>You've already applied, {first}.</h2>
          <p>You sent this application on {new Date(already).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}. It's with the team, so there's nothing more to do.</p>
        </>
      ) : (
        <>
          <h2 ref={refEl} tabIndex={-1}>Thanks, {first}. Your application is in.</h2>
          <p>{message?.trim() || `${team} will read it and get back to you at ${who.email}.`}</p>
        </>
      )}
      {preview && (
        <>
          <p className="ap-done-note">This was a preview, so nothing was sent.</p>
          <button type="button" className="ap-quiet" onClick={onReset}>Start over</button>
        </>
      )}
    </div>
  );
}

/* ── fields ── */

function Label({ htmlFor, id, children, required, as = "label" }: { htmlFor?: string; id?: string; children: ReactNode; required?: boolean; as?: "label" | "legend" }) {
  const inner = <>{children}{required && <><span className="ap-req" aria-hidden="true"> *</span><span className="sr-only"> (required)</span></>}</>;
  return as === "legend" ? <legend className="ap-label" id={id}>{inner}</legend> : <label className="ap-label" htmlFor={htmlFor} id={id}>{inner}</label>;
}

function Err({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return <p className="ap-err" id={id}><WarningCircle size={14} aria-hidden="true" /> {text}</p>;
}

function TextField({ id, label, value, onChange, onBlur, error, required, type = "text", placeholder, autoComplete, wide, inputMode }: {
  id: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string; required?: boolean;
  type?: string; placeholder?: string; autoComplete?: string; wide?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={`ap-field${wide ? " is-wide" : ""}`}>
      <Label htmlFor={id} required={required}>{label}</Label>
      <div className="ap-ctl">
        <input id={id} className={`ap-input${error ? " is-bad" : ""}`} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} inputMode={inputMode}
          aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined} aria-required={required || undefined}
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </div>
      <Err id={`${id}-err`} text={error} />
    </div>
  );
}

/** Phone, read as Indian unless it starts with + (or 00): the code shows until they type their own. */
function PhoneField({ id, value, error, onChange, onBlur }: { id: string; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const own = /^\s*(\+|00)/.test(value);
  return (
    <div className="ap-field">
      <Label htmlFor={id} required>Phone</Label>
      <div className={`ap-ctl ap-phone${own ? " is-own" : ""}${value.trim() ? " has-value" : ""}`}>
        {!own && <span className="ap-cc" aria-hidden="true">+91</span>}
        <input id={id} className={`ap-input${error ? " is-bad" : ""}`} type="tel" inputMode="tel" autoComplete="tel" value={value} placeholder="98450 12345"
          aria-invalid={!!error || undefined} aria-describedby={`${id}-help${error ? ` ${id}-err` : ""}`} aria-required
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      </div>
      <p className="ap-help ap-help-under" id={`${id}-help`}>Outside India? Start with + and your country code.</p>
      <Err id={`${id}-err`} text={error} />
    </div>
  );
}

function AutoText({ id, value, onChange, describedBy, bad, placeholder, required }: { id: string; value: string; onChange: (v: string) => void; describedBy?: string; bad: boolean; placeholder?: string; required?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(420, Math.max(36, el.scrollHeight))}px`;
  }, [value]);
  return (
    <div className="ap-ta">
      <textarea ref={ref} id={id} className={`ap-input is-long${bad ? " is-bad" : ""}`} value={value} maxLength={2000} placeholder={placeholder}
        aria-invalid={bad || undefined} aria-describedby={describedBy} aria-required={required || undefined} onChange={(e) => onChange(e.target.value)} />
      {value.length > 1600 && <span className="ap-count" aria-live="polite">{value.length} / 2000</span>}
    </div>
  );
}

function QuestionField({ id, q, value, other, error, onChange, onOther }: {
  id: string; q: Question; value: Answer | undefined; other?: { on: boolean; text: string }; error?: string;
  onChange: (v: Answer) => void; onOther: (v: { on: boolean; text: string }) => void;
}) {
  const helpId = q.help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [helpId, errId].filter(Boolean).join(" ") || undefined;
  const help = q.help ? <p className="ap-help" id={helpId}>{q.help}</p> : null;
  const title = q.title || "Untitled question";
  const o = other ?? { on: false, text: "" };

  if (q.type === "choice" || q.type === "multi" || q.type === "yesno") {
    const opts = q.type === "yesno" ? ["Yes", "No"] : q.options ?? [];
    const multi = q.type === "multi";
    const cur = Array.isArray(value) ? value : [];
    const legendId = `${id}-legend`;
    const withOther = q.allowOther && q.type !== "yesno";
    return (
      /* The fieldset and its legend name the group once; help and errors hang
         off the fieldset, not off a second radiogroup inside it. */
      <fieldset className="ap-field" id={id} aria-describedby={describedBy} aria-invalid={!!error || undefined}>
        <Label as="legend" id={legendId} required={q.required}>{title}</Label>
        {help}
        <div className={`ap-opts${error ? " is-bad" : ""}`}>
          {opts.map((opt, i) => {
            const on = multi ? cur.includes(opt) : value === opt && !o.on;
            return (
              <label key={`${opt}-${i}`} className={`ap-opt${on ? " is-on" : ""}`}>
                <input type={multi ? "checkbox" : "radio"} name={id} value={opt} checked={on} className="sr-only"
                  onChange={() => {
                    if (multi) onChange(on ? cur.filter((x) => x !== opt) : [...cur, opt]);
                    else { onChange(opt); if (o.on) onOther({ ...o, on: false }); }
                  }} />
                <span className={`ap-dot${multi ? " is-box" : ""}`} aria-hidden="true">{multi && on && <Check size={12} weight="bold" />}</span>
                <span className="ap-opt-t">{opt}</span>
              </label>
            );
          })}
          {withOther && (
            <div className={`ap-opt ap-other${o.on ? " is-on" : ""}`}>
              <label className="ap-other-l">
                <input type={multi ? "checkbox" : "radio"} name={id} value="__other" checked={o.on} className="sr-only"
                  onChange={() => {
                    const on = multi ? !o.on : true;
                    onOther({ ...o, on });
                    if (!multi && on) onChange("");
                  }} />
                <span className={`ap-dot${multi ? " is-box" : ""}`} aria-hidden="true">{multi && o.on && <Check size={12} weight="bold" />}</span>
                <span className="ap-opt-t">Other</span>
              </label>
              {o.on && (
                <input className="ap-input ap-other-in" value={o.text} maxLength={OTHER_MAX} placeholder="Your answer" aria-label={`${title}: your answer`}
                  autoFocus onChange={(e) => onOther({ on: true, text: e.target.value })} />
              )}
            </div>
          )}
        </div>
        <Err id={`${id}-err`} text={error} />
      </fieldset>
    );
  }

  if (q.type === "dropdown") {
    const opts = q.options ?? [];
    const selected = o.on ? "__other" : typeof value === "string" ? value : "";
    return (
      <div className="ap-field">
        <Label htmlFor={id} required={q.required}>{title}</Label>
        {help}
        <div className="ap-ctl ap-select">
          <select id={id} className={`ap-input${error ? " is-bad" : ""}${selected ? "" : " is-empty"}`} value={selected}
            aria-invalid={!!error || undefined} aria-describedby={describedBy} aria-required={q.required || undefined}
            onChange={(e) => {
              if (e.target.value === "__other") { onOther({ ...o, on: true }); onChange(""); }
              else { onChange(e.target.value); if (o.on) onOther({ ...o, on: false }); }
            }}>
            <option value="" disabled>Choose one</option>
            {opts.map((opt, i) => <option key={`${opt}-${i}`} value={opt}>{opt}</option>)}
            {q.allowOther && <option value="__other">Other</option>}
          </select>
          <CaretDown className="ap-select-caret" size={14} aria-hidden="true" />
        </div>
        {o.on && (
          <input className="ap-input ap-other-in is-below" value={o.text} maxLength={OTHER_MAX} placeholder="Your answer" aria-label={`${title}: your answer`}
            autoFocus onChange={(e) => onOther({ on: true, text: e.target.value })} />
        )}
        <Err id={`${id}-err`} text={error} />
      </div>
    );
  }

  if (q.type === "scale") {
    const s = q.scale ?? { low: "Not at all", high: "Very" };
    const legendId = `${id}-legend`;
    return (
      <fieldset className="ap-field" id={id} aria-describedby={describedBy} aria-invalid={!!error || undefined}>
        <Label as="legend" id={legendId} required={q.required}>{title}</Label>
        {help}
        <div className="ap-scale-w">
          <div className="ap-scale">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={`ap-scale-o${value === n ? " is-on" : ""}${error ? " is-bad" : ""}`}>
                <input type="radio" name={id} value={n} checked={value === n} className="sr-only" onChange={() => onChange(n)}
                  aria-label={n === 1 ? `1, ${s.low}` : n === 5 ? `5, ${s.high}` : String(n)} />
                <span aria-hidden="true">{n}</span>
              </label>
            ))}
          </div>
          <div className="ap-scale-ends" aria-hidden="true"><span>{s.low}</span><span>{s.high}</span></div>
        </div>
        <Err id={`${id}-err`} text={error} />
      </fieldset>
    );
  }

  const v = value === undefined ? "" : String(value);
  return (
    <div className="ap-field">
      <Label htmlFor={id} required={q.required}>{title}</Label>
      {help}
      <div className="ap-ctl">
        {q.type === "long" ? (
          <AutoText id={id} value={v} onChange={onChange} describedBy={describedBy} bad={!!error} placeholder={q.placeholder} required={q.required} />
        ) : q.type === "number" ? (
          <span className="ap-num">
            <input id={id} className={`ap-input${error ? " is-bad" : ""}`} type="number" inputMode="numeric" min={0} value={v} placeholder={q.placeholder}
              aria-invalid={!!error || undefined} aria-describedby={describedBy} aria-required={q.required || undefined}
              onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
            {q.unit && <span className="ap-unit" aria-hidden="true">{q.unit}</span>}
          </span>
        ) : q.type === "date" ? (
          <span className="ap-date">
            <input id={id} className={`ap-input${error ? " is-bad" : ""}`} type="date" value={v} min="1900-01-01" max="2100-12-31"
              aria-invalid={!!error || undefined} aria-describedby={describedBy} aria-required={q.required || undefined}
              onChange={(e) => onChange(e.target.value)} />
          </span>
        ) : (
          <input id={id} className={`ap-input${error ? " is-bad" : ""}`} type={q.type === "link" ? "url" : "text"} value={v}
            placeholder={q.type === "link" && (!q.placeholder || q.placeholder === "https://") ? "github.com/you" : q.placeholder}
            aria-invalid={!!error || undefined} aria-describedby={describedBy} aria-required={q.required || undefined}
            onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
      <Err id={`${id}-err`} text={error} />
    </div>
  );
}

/* ── preview dialog ── */

export function FormPreviewDialog({ form, open, onClose, link }: {
  form: Form | null; open: boolean; onClose: () => void;
  /** The link to copy; null when there is none yet (not published). Defaults to the prototype's link. */
  link?: string | null;
}): JSX.Element | null {
  const last = useRef<Form | null>(null);
  if (form) last.current = form;
  const f = form ?? last.current;
  if (!f) return null;
  return (
    <Dialog open={open && !!form} onClose={onClose} label={`Preview: ${f.title || f.name}`} size="xl">
      <div className="ap-dlg">
        <div className="ap-dlg-bar">
          <span className="t-caption">Candidate preview</span>
          {link !== null && (
            <ActionButton tone="quiet" done="Link copied" ms={300} onRun={() => { void navigator.clipboard?.writeText(link ?? formLink(f)).catch(() => {}); }}>
              <LinkSimple size={14} /> Copy link
            </ActionButton>
          )}
        </div>
        <div className="ap-dlg-scroll">
          <ApplyForm form={f} mode="preview" />
        </div>
      </div>
    </Dialog>
  );
}
