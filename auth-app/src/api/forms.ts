import type { Answer, Form, FormPage, FormResponse, Question, RoleDetails } from "../campaign";
import { hueFor } from "../candidateImport";
import { TINTS, tintKey } from "../formKit";
import { API_URL, ApiError, api } from "./client";

/**
 * Forms over the API: the builder's working copy, publishing, responses and
 * decisions, and the public page an applicant fills in (no sign-in there).
 * The console's Form keeps its own question ids; the server issues its own
 * on first save, so the store keeps a map between the two.
 */

export type FormStatus = "draft" | "live" | "closed";

export type ServerQuestion = Omit<Question, "knockout"> & { mapsTo?: string };

export type FormView = {
  id: string;
  campaignId: string;
  name: string;
  status: FormStatus;
  version: number;
  title: string | null;
  description: string | null;
  role: RoleDetails | null;
  theme: string | null;
  /** Older servers send only autoAddQualified. */
  settings?: { autoAddQualified?: boolean } & FormPage;
  questions: ServerQuestion[];
  publicLink: string | null;
  /** The link to hand out: the same form through a page chat apps can read. Older servers send none. */
  shareLink?: string | null;
  hasDraftChanges: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FormRow = {
  id: string;
  status: FormStatus;
  responses: number;
  newApplicants: number;
  publicLink: string | null;
};

/* ── adapters ── */

const ms = (iso: string) => Date.parse(iso);

/** The server's form as the console's. Status "closed" lives in the store's meta. */
export function formFromView(v: FormView): Form {
  const theme = tintKey(v.theme);
  return {
    id: v.id,
    campaign: v.campaignId,
    name: v.name,
    status: v.status === "live" ? "live" : "draft",
    sent: 0,
    questions: v.questions.map(({ mapsTo: _m, ...q }) => q),
    accent: TINTS[theme].fill,
    title: v.title ?? undefined,
    description: v.description ?? undefined,
    role: v.role ?? undefined,
    theme,
    page: pageOf(v.settings),
    origin: "template",
    createdAt: ms(v.createdAt),
    updatedAt: ms(v.updatedAt),
  };
}

/** The page settings a view carries, without the server's other switches. */
function pageOf(s: FormView["settings"]): FormPage {
  return {
    closesOn: s?.closesOn ?? null,
    successMessage: s?.successMessage ?? null,
    closedMessage: s?.closedMessage ?? null,
    promise: s?.promise ?? null,
  };
}

export type FormBody = {
  name: string;
  settings: { title?: string; description?: string } & FormPage;
  theme: string;
  role: RoleDetails | null;
  questions: Record<string, unknown>[];
};

/**
 * The whole working copy for a PATCH. Question ids go out as the server's
 * where known, so answers stay attached; `mapsTo` rides along untouched
 * because the builder doesn't edit it yet.
 */
export function bodyFromForm(f: Form, ids: ReadonlyMap<string, string>, mapsTo: ReadonlyMap<string, string>): FormBody {
  return {
    name: f.name.trim() || "Untitled form",
    settings: {
      title: f.title?.trim() ?? "",
      description: f.description?.trim() ?? "",
      ...(f.page
        ? {
            closesOn: f.page.closesOn || null,
            successMessage: f.page.successMessage?.trim() || null,
            closedMessage: f.page.closedMessage?.trim() || null,
            promise: f.page.promise?.trim() || null,
          }
        : {}),
    },
    theme: tintKey(f.theme),
    role: f.role ? { ...f.role, responsibilities: f.role.responsibilities.filter((x) => x.trim()), requirements: f.role.requirements.filter((x) => x.trim()) } : null,
    questions: f.questions.map((q) => {
      const id = ids.get(q.id) ?? q.id;
      const m = mapsTo.get(id);
      return {
        id, type: q.type, title: q.title, required: q.required,
        ...(q.help ? { help: q.help } : {}),
        ...(q.options ? { options: q.options.filter((o) => o.trim()) } : {}),
        ...(q.accept?.length ? { accept: q.accept } : q.knockout ? { knockout: q.knockout } : {}),
        ...(typeof q.atLeast === "number" ? { atLeast: q.atLeast } : {}),
        ...(q.placeholder ? { placeholder: q.placeholder } : {}),
        ...(q.unit ? { unit: q.unit } : {}),
        ...(q.scale ? { scale: q.scale } : {}),
        ...(q.allowOther ? { allowOther: true } : {}),
        ...(q.type === "section" && q.after === "submit" ? { after: "submit" as const } : {}),
        ...(m ? { mapsTo: m } : {}),
      };
    }),
  };
}

/** Local question id → the server's, by position: the server keeps the order it was sent. */
export function matchIds(local: readonly Question[], server: readonly ServerQuestion[]): Map<string, string> {
  const out = new Map<string, string>();
  if (local.length !== server.length) return out;
  local.forEach((q, i) => {
    const s = server[i];
    if (s && s.type === q.type) out.set(q.id, s.id);
  });
  return out;
}

/* ── the builder ── */

export const listForms = (campaignId: string) => api<{ forms: FormRow[] }>("GET", `/v1/campaigns/${campaignId}/forms`);
export const getForm = (id: string) => api<FormView>("GET", `/v1/forms/${id}`);
export const createForm = (campaignId: string, body: FormBody) => api<FormView>("POST", `/v1/campaigns/${campaignId}/forms`, body);
export const saveForm = (id: string, body: FormBody) => api<FormView>("PATCH", `/v1/forms/${id}`, body);
export const publishForm = (id: string) =>
  api<{ id: string; status: "live"; version: number; publicLink: string; shareLink?: string | null }>("POST", `/v1/forms/${id}/publish`);
export const closeForm = (id: string) => api<{ id: string; status: "closed" }>("POST", `/v1/forms/${id}/close`);

/** Why publishing was refused, as one sentence: the API lists every problem; the first is enough to act on. */
export function publishProblem(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const problems = err.details.problems;
  if (!Array.isArray(problems)) return null;
  const first: unknown = problems[0];
  return first && typeof first === "object" && "message" in first && typeof first.message === "string" ? first.message : null;
}

/* ── responses ── */

export type ServerResponse = {
  id: string;
  submittedAt: string;
  durationS: number | null;
  name: string | null;
  email: string | null;
  /** E.164; absent on responses from before phones were asked. */
  phone?: string | null;
  linkedinUrl: string | null;
  emailVerified?: boolean;
  consent?: boolean;
  source?: string | null;
  answers: Record<string, string | number | string[]>;
  mustHave: Record<string, "met" | "missed">;
  flagged: boolean;
  match: "email" | "linkedin" | "created" | "none";
  decision: "added" | "passed" | null;
  isNew: boolean;
  /** Someone already in the workspace with the email typed here. Never linked on its own:
      the email is unverified, so a recruiter confirms it's the same person. */
  possibleMatch?: PossibleMatch | null;
  candidate: {
    id: string;
    campaignCandidateId: string | null;
    fullName: string | null;
    currentTitle: string | null;
    currentCompanyName: string | null;
    stage: string | null;
  } | null;
};

export type PossibleMatch = {
  candidateId: string;
  name: string;
  campaignCandidateId: string | null;
  /** What they share; older servers only matched on email. */
  by?: "person" | "email" | "linkedin" | "phone";
  /** The applicant proved it's them (a confirmed email, or the same person in the pool). */
  proven?: boolean;
};

/** What a response says beyond its answers: who it was matched to and what was decided. */
export type ResponseMeta = {
  decision: "added" | "passed" | null;
  /** On this campaign's board, at this stage; null when they aren't on it. */
  stage: string | null;
  isNew: boolean;
  possibleMatch: PossibleMatch | null;
};

/** The line shown on a response that looks like someone already in your candidates, saying why. */
export function matchNote(m: PossibleMatch): string {
  const where = `already in your candidates${m.campaignCandidateId ? " and on this campaign" : ""}`;
  /* Nobody proves an address any more, so a match is always a likeness: said as one, and left to the recruiter. */
  switch (m.by) {
    case "person":
      return `This is ${m.name}, ${where}.`;
    case "linkedin":
      return `Looks like ${m.name}, ${where}. Same LinkedIn profile.`;
    case "phone":
      return `Looks like ${m.name}, ${where}. Same phone number.`;
    default:
      return m.proven
        ? `${m.name}'s email, confirmed by the applicant. ${m.name} is ${where}.`
        : `Looks like ${m.name}, ${where}. Same email.`;
  }
}

/**
 * What a decision on applicants says in the toast. Linking an applicant to someone already in the
 * workspace says who they were linked to, and that a person already on this campaign stays where they are:
 * it was "Added to the shortlist" for someone already in outreach.
 */
export function decidedLine(
  decision: "add" | "pass",
  ok: number,
  linked?: Pick<PossibleMatch, "name" | "campaignCandidateId"> | null,
): string {
  if (decision === "pass") return ok === 1 ? "Passed" : `Passed on ${ok}`;
  if (linked && ok === 1) {
    return linked.campaignCandidateId
      ? `Linked to ${linked.name}, who is already on this campaign`
      : `Linked to ${linked.name} and added to the shortlist`;
  }
  return `${ok === 1 ? "Added" : `${ok} added`} to the shortlist`;
}

export function responseFromServer(r: ServerResponse, formId: string, now = Date.now()): { response: FormResponse; meta: ResponseMeta } {
  const name = r.candidate?.fullName ?? r.name ?? r.email ?? "Applicant";
  const answers: Record<string, Answer> = r.answers;
  return {
    response: {
      id: r.id,
      form: formId,
      person: {
        id: r.candidate?.id ?? `applicant-${r.id}`,
        name,
        hue: hueFor(name),
        title: r.candidate?.currentTitle ?? "",
        company: r.candidate?.currentCompanyName ?? "",
      },
      at: Math.max(0, Math.round((now - ms(r.submittedAt)) / 60000)),
      took: r.durationS ?? Number.NaN,
      answers,
      flagged: r.flagged,
      email: r.email ?? undefined,
      linkedin: r.linkedinUrl ?? undefined,
      phone: r.phone ?? undefined,
      emailVerified: r.emailVerified ?? false,
      consent: r.consent ?? false,
      source: r.source ?? undefined,
    },
    meta: {
      decision: r.decision,
      stage: r.candidate?.campaignCandidateId ? r.candidate.stage : null,
      isNew: r.isNew,
      possibleMatch: r.possibleMatch ?? null,
    },
  };
}

const MAX_PAGES = 20;

/** Every response, newest first, a page at a time, up to 1,000; `more` says some were left out. */
export async function allResponses(formId: string): Promise<{ rows: ServerResponse[]; more: boolean }> {
  const rows: ServerResponse[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page: { responses: ServerResponse[]; nextCursor: string | null } = await api(
      "GET", `/v1/forms/${formId}/responses${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    rows.push(...page.responses);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { rows, more: cursor !== null };
}

/** How a form's link is doing: unique visitors a day, applications, and where both came from. */
export type Traffic = {
  views: number;
  applications: number;
  /** Percent of visitors who applied; null before anyone opened it. */
  conversion: number | null;
  sources: { source: string; views: number; applications: number }[];
};

export const getTraffic = (formId: string) =>
  api<{ traffic?: Traffic }>("GET", `/v1/forms/${formId}/summary`).then((r) => r.traffic ?? null);

/** `linkTo`: add the applicant as this existing candidate rather than as a new person. */
export const decide = (formId: string, responseId: string, decision: "add" | "pass", linkTo?: string) =>
  api<{ id: string; decision: "added" | "passed" | null; campaignCandidateId: string | null }>(
    "POST", `/v1/forms/${formId}/responses/${responseId}/decision`, linkTo ? { decision, linkTo } : { decision },
  );

/* ── the public page: no session ── */

async function publicApi<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError(0, "offline", "This form isn't available right now.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "network", "We couldn't reach the server. Check your connection and try again.");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Something went wrong. Try again in a moment.", err ?? {});
  }
  return data as T;
}

/** A workspace's look (the organisation's brand), as the server sends it; null means the default look. */
export type Brand = {
  logoUrl: string | null;
  primary: string;
  onPrimary: string;
  palette: string[];
  fontDisplay: string;
  fontBody: string;
  tone: "plain" | "warm" | "formal";
};

/** What the page shows around the questions. */
export type PublicPage = {
  company: string | null;
  brand: Brand | null;
  promise: string | null;
  /** YYYY-MM-DD: the last day applications are taken. */
  closesOn: string | null;
  successMessage: string | null;
  /** How many applied, only once it's reassuring (25 or more). */
  applied: number | null;
};

export type PublicForm =
  | { status: "closed"; message?: string | null; company?: string | null; brand?: Brand | null }
  | ({
      status: "live";
      version: number;
      title: string;
      description: string | null;
      role: RoleDetails | null;
      theme: string | null;
      questions: Question[];
    } & Partial<PublicPage>);

/** Opens the form; where the visitor came from (?src= on the link, the referring site) is counted once a day. */
export const getPublicForm = (key: string, from: { src?: string | null; ref?: string | null } = {}) => {
  const q = new URLSearchParams();
  if (from.src) q.set("src", from.src);
  if (from.ref) q.set("ref", from.ref);
  const query = q.toString();
  return publicApi<PublicForm>("GET", `/public/forms/${encodeURIComponent(key)}${query ? `?${query}` : ""}`);
};

/** The live form as the page's Form; the key stands in for an id. */
export function formFromPublic(key: string, f: Extract<PublicForm, { status: "live" }>): Form {
  const theme = tintKey(f.theme);
  return {
    id: key, campaign: "", name: f.title, title: f.title, description: f.description ?? undefined, role: f.role ?? undefined,
    status: "live", sent: 0, questions: f.questions, theme, accent: TINTS[theme].fill,
    page: { promise: f.promise ?? null, closesOn: f.closesOn ?? null, successMessage: f.successMessage ?? null },
  };
}

/** The page's surroundings from the public form, with safe defaults for an older server. */
export function pageFromPublic(f: PublicForm): PublicPage {
  const live = f.status === "live" ? f : null;
  return {
    company: f.company ?? null,
    brand: f.brand ?? null,
    promise: live?.promise ?? null,
    closesOn: live?.closesOn ?? null,
    successMessage: live?.successMessage ?? null,
    applied: live?.applied ?? null,
  };
}

export type Application = {
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  answers: Record<string, Answer>;
  startedAt: number;
  /** The honeypot. People never see it, so it goes out empty. */
  website: string;
  src?: string;
  utm?: Record<string, string>;
  referrer?: string;
};

export type SubmitOutcome =
  | { kind: "sent" }
  /** They had applied before (said only once they proved the address). */
  | { kind: "already"; at: string }
  /** A form that still asks for an emailed code (switched on by hand on the server): nothing stored yet. */
  | { kind: "verify"; email: string; resendIn: number; expiresIn: number }
  | { kind: "fix"; issues: Record<string, string> }
  /** `retry`: worth sending again later (too many tries, or the connection). Otherwise it won't go through. */
  | { kind: "stopped"; message: string; retry: boolean; retryAt?: number };

/** Sends an application. Field problems come back by question; anything else is a sentence to show. */
export async function submitApplication(key: string, a: Application): Promise<SubmitOutcome> {
  try {
    const r = await publicApi<{ ok?: true; alreadyAppliedAt?: string; verify?: { email: string; resendInSeconds: number; expiresInSeconds: number } }>(
      "POST", `/public/forms/${encodeURIComponent(key)}/responses`, a,
    );
    if (r?.verify) return { kind: "verify", email: r.verify.email, resendIn: r.verify.resendInSeconds, expiresIn: r.verify.expiresInSeconds };
    if (r?.alreadyAppliedAt) return { kind: "already", at: r.alreadyAppliedAt };
    return { kind: "sent" };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    const issues = err.details.issues;
    if (err.status === 400 && Array.isArray(issues) && issues.length) {
      const out: Record<string, string> = {};
      for (const i of issues as unknown[]) {
        if (i && typeof i === "object" && "path" in i && "message" in i && typeof i.path === "string" && typeof i.message === "string") {
          out[i.path === "linkedinUrl" ? "linkedin" : i.path] = i.message;
        }
      }
      return { kind: "fix", issues: out };
    }
    return {
      kind: "stopped", message: err.message, retry: err.status === 0 || err.status === 429 || err.status >= 500,
      ...(err.retryAt ? { retryAt: err.retryAt } : {}),
    };
  }
}
