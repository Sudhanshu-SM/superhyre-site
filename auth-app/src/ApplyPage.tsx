import { useEffect, useState } from "react";
import { ApiError, LIVE } from "./api/client";
import type { PublicPage } from "./api/forms";
import { formFromPublic, getPublicForm, pageFromPublic, submitApplication } from "./api/forms";
import type { Answer, Form } from "./campaign";
import { ApplyForm, lookVars, useBrandFonts } from "./ApplyForm";
import { findFormByKey } from "./formsStore";
import { EmptyArt } from "./EmptyArt";
import type { EmptyArtName } from "./EmptyArt";
import { Loader } from "./components/Loader";
import { errorCopy, errorKindOf } from "./ErrorStates";
import type { ErrorKind } from "./ErrorStates";

/**
 * The candidate's page, with no console around it: #/apply/<key>. Nobody signs in here.
 * With the API the key is the form's public key: the page shows the published version, in
 * the hiring team's look, and sends applications to it. Where the visitor came from (the
 * ?src= a recruiter put on the link, UTM tags, the referring site) goes along. Without the
 * API the key is a fixture form's slug and a submit only thanks the candidate.
 */
export function ApplyPage({ formKey }: { formKey: string }): JSX.Element {
  return LIVE ? <LiveApply formKey={formKey} /> : <FixtureApply formKey={formKey} />;
}

type Art = { name: EmptyArtName; size: number };
const MISSING_ART: Art = { name: "err-404", size: 200 };
const CLOSED_ART: Art = { name: "form-closed", size: 200 };

/** The quiet page for "not found", "closed", loading and a form that didn't come, in the team's look when we know it. */
function Notice({ text, title, page, form, art, retry, busy }: {
  text: string;
  /** Says it is on its way: the mark with its ring, as everywhere else, and the words for a screen reader. */
  busy?: boolean;
  /** A short headline over the sentence, for a failure. */
  title?: string;
  page?: PublicPage;
  form?: Pick<Form, "theme">;
  art?: Art;
  /** Asks for the form again. Offered only when asking again can help. */
  retry?: () => void;
}) {
  useBrandFonts(page?.brand);
  return (
    <main className="ap-page">
      <div className={`ap ap-notice${page?.brand ? " is-branded" : ""}`} style={lookVars(form ?? { theme: undefined }, page?.brand)}>
        <article className="ap-sheet ap-sheet-notice">
          {(page?.company || page?.brand?.logoUrl) && (
            <p className="ap-org">
              {page.brand?.logoUrl && <img className="ap-logo" src={page.brand.logoUrl} alt="" />}
              {page.company && <span className="ap-org-n">{page.company}</span>}
            </p>
          )}
          {art && <EmptyArt name={art.name} size={art.size} />}
          {title && <h1 className="ap-notice-t">{title}</h1>}
          {busy
            ? <Loader size="lg" label={text} block />
            : <p className={`ap-closed${title ? " is-under" : ""}`} role="status">{text}</p>}
          {retry && <button type="button" className="ap-quiet ap-retry" onClick={retry}>Try again</button>}
        </article>
      </div>
    </main>
  );
}

const MISSING = "This form isn't available. Check the link you were sent.";
const CLOSED = "This form is closed and no longer takes applications.";

type Loaded =
  | { kind: "loading" }
  | { kind: "notice"; text: string; page?: PublicPage; art?: Art }
  | { kind: "failed"; reason: Extract<ErrorKind, "network" | "rate-limit" | "server"> }
  | { kind: "live"; form: Form; page: PublicPage };

/**
 * Why a form didn't come, as far as a candidate needs to know: their connection, a pause, or ours.
 * Whatever else the server said (a session, a role) is none of their business and is "ours".
 */
export function applyFailure(err: unknown): "network" | "rate-limit" | "server" {
  const k = errorKindOf(err);
  return k === "network" || k === "rate-limit" ? k : "server";
}

/** The tab's title for the page in each state: the role and team when the form is there, "Apply" until then. */
export function applyTitle(s: Loaded): string {
  if (s.kind === "live") {
    const t = s.form.title || s.form.name;
    return s.page.company ? `${t} at ${s.page.company}` : t;
  }
  if (s.kind === "notice" && s.page?.company) return `Apply at ${s.page.company}`;
  return "Apply";
}

/** ?src= and UTM tags from the address. The page lives after the hash, so they do too. */
export function arrivalFrom(hash: string, search = ""): { src?: string; utm?: Record<string, string> } {
  const q = new URLSearchParams([search.replace(/^\?/, ""), hash.split("?")[1] ?? ""].filter(Boolean).join("&"));
  const src = q.get("src")?.trim().toLowerCase();
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = q.get(`utm_${k}`)?.trim();
    if (v) utm[k] = v.slice(0, 120);
  }
  return { ...(src ? { src: src.slice(0, 40) } : {}), ...(Object.keys(utm).length ? { utm } : {}) };
}

/** The site that sent them here, as a domain; never our own app. */
export function referrerDomain(ref: string, own: string): string | undefined {
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    return host && host !== own.replace(/^www\./, "") ? host : undefined;
  } catch {
    return undefined;
  }
}

function LiveApply({ formKey }: { formKey: string }) {
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [arrival] = useState(() => ({
    ...arrivalFrom(window.location.hash, window.location.search),
    ref: referrerDomain(document.referrer, window.location.hostname),
  }));
  useEffect(() => {
    let gone = false;
    setState({ kind: "loading" });
    getPublicForm(formKey, { src: arrival.src ?? arrival.utm?.source ?? null, ref: arrival.ref ?? null }).then(
      (f) => {
        if (gone) return;
        const page = pageFromPublic(f);
        if (f.status === "closed") setState({ kind: "notice", text: f.message?.trim() || CLOSED, page, art: CLOSED_ART });
        else setState({ kind: "live", form: formFromPublic(formKey, f), page });
      },
      (err: unknown) => {
        if (gone) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: "notice", text: MISSING, art: MISSING_ART });
        else setState({ kind: "failed", reason: applyFailure(err) });
      },
    );
    return () => { gone = true; };
  }, [formKey, arrival, attempt]);
  /* The tab says what the page is, not "Sign in": the role and team once the form is there. */
  useEffect(() => {
    const before = document.title;
    document.title = applyTitle(state);
    return () => { document.title = before; };
  }, [state]);
  if (state.kind === "loading") return <Notice text="Loading the form" busy />;
  if (state.kind === "notice") return <Notice text={state.text} page={state.page} art={state.art} />;
  if (state.kind === "failed") {
    const c = errorCopy(state.reason);
    return <Notice title={c.title} text={c.text} art={c.art} retry={() => setAttempt((n) => n + 1)} />;
  }
  return (
    <main className="ap-page">
      <ApplyForm form={state.form} page={state.page} mode="live" onSubmit={(answers, who, extra) => submitApplication(formKey, {
        name: who.name,
        email: who.email,
        phone: who.phone,
        ...(who.linkedin ? { linkedinUrl: who.linkedin } : {}),
        answers,
        startedAt: extra.startedAt,
        website: extra.website,
        ...(arrival.src ? { src: arrival.src } : {}),
        ...(arrival.utm ? { utm: arrival.utm } : {}),
        ...(arrival.ref ? { referrer: `https://${arrival.ref}` } : {}),
      })} />
    </main>
  );
}

function FixtureApply({ formKey }: { formKey: string }) {
  const [form] = useState(() => findFormByKey(formKey));
  useEffect(() => {
    document.title = form ? `${form.title || form.name}` : "Form not found";
  }, [form]);
  if (!form) return <Notice text={MISSING} art={MISSING_ART} />;
  return (
    <main className="ap-page">
      <ApplyForm form={form} mode="live" onSubmit={(_a: Record<string, Answer>) => { /* not stored yet */ }} />
    </main>
  );
}

export { applyKeyFrom } from "./applyKey";
