import { useEffect, useSyncExternalStore } from "react";
import type { FormStatus, ResponseMeta } from "./api/forms";
import * as formsApi from "./api/forms";
import { ApiError, api, LIVE, messageOf } from "./api/client";
import { onWorkspaceChange } from "./api/identity";
import type { Form, FormResponse } from "./campaign";
import { formsFor } from "./campaign";
import { CAMPAIGN_ROWS } from "./campaignsData";
import type { CampaignLite } from "./formKit";
import { STUBS, TINTS, campaignById, defaultIntro, defaultRole, formSlug, newId, roleTitle, tintKey } from "./formKit";

/**
 * Forms as live state, one store for the whole app (same shape as
 * campaignStore). The chat drafts into it, the builder edits it, and both
 * read it back, so a question added in the builder is counted on the chat's
 * card when you go back. Responses are not stored: every view calls
 * responsesFor(form). Forms and chat-made campaigns are kept in
 * localStorage, so a draft survives a reload and a builder link still opens.
 *
 * With the API the server holds the forms: a campaign's forms load on first
 * use, edits show at once and save shortly after (the working copy; people
 * applying keep seeing the published version until the next publish), and
 * responses load per form. Nothing goes to localStorage then.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const state = new Map<string, Form[]>();
/* ── persistence: best effort, never in tests ── */
const KEY = "sh.forms.v1";
const persist = !LIVE && !(import.meta.env?.MODE === "test") && typeof window !== "undefined";
function save() {
  if (!persist) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ forms: [...state.entries()], stubs: STUBS, drafts: [...drafts.entries()] }));
  } catch { /* storage full or blocked: the session still works */ }
}
const emit = () => { save(); for (const l of listeners) l(); };
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

const NONE: Form[] = [];

function seed(campaignId: string): Form[] {
  let list = state.get(campaignId);
  if (LIVE) return list ?? NONE;
  if (!list) {
    const c = campaignById(campaignId);
    const now = Date.now();
    list = formsFor(campaignId).map((f) => {
      const copy = JSON.parse(JSON.stringify(f)) as Form;
      const theme = tintKey(copy.theme);
      const single = c ? roleTitle(c.name) : undefined;
      return {
        ...copy,
        /* A job page is for one hire: "Senior Backend Engineer", not "…Engineers". */
        name: c && single && copy.name === `${c.name} screening` ? `${single} screening` : copy.name,
        title: copy.title ?? single,
        description: copy.description ?? defaultIntro(campaignId),
        theme,
        accent: TINTS[theme].fill,
        role: copy.role ?? defaultRole(campaignId),
        origin: copy.origin ?? "seed",
        createdAt: copy.createdAt ?? now - 6 * 864e5,
        updatedAt: copy.updatedAt ?? now - 2 * 864e5,
      };
    });
    state.set(campaignId, list);
  }
  return list;
}

function find(formId: string): { campaignId: string; form: Form } | null {
  for (const [campaignId, list] of state) {
    const form = list.find((f) => f.id === formId);
    if (form) return { campaignId, form };
  }
  return null;
}

/**
 * The title candidates see when none was typed: the campaign's own name. The form's name is
 * internal ("Backend Engineer screening") and must never stand in as the page's heading or the
 * subject of the code email.
 */
export function defaultFormTitle(campaignId: string): string | undefined {
  const name = campaignById(campaignId)?.name?.trim();
  return name || undefined;
}

/** The form as candidates will see it: with a title, the campaign's name when none was typed. */
export function withVisibleTitle<T extends { campaign: string; title?: string | undefined }>(f: T): T {
  if (f.title?.trim()) return f;
  const title = defaultFormTitle(f.campaign);
  return title ? { ...f, title } : f;
}

/** Seeds every campaign, so a form id from a link resolves wherever it lives. */
function seedAll() {
  if (LIVE) return;
  for (const r of CAMPAIGN_ROWS) seed(r.id);
  for (const c of STUBS) seed(c.id);
}

export function useForms(campaignId: string): readonly Form[] {
  useEffect(() => { if (LIVE) void loadForms(campaignId); }, [campaignId]);
  return useSyncExternalStore(subscribe, () => seed(campaignId));
}

/** Every live form across the campaigns that aren't closed, newest first. */
export function liveForms(): Form[] {
  if (LIVE) return [...state.values()].flat().filter((f) => f.status === "live");
  return CAMPAIGN_ROWS.filter((r) => r.status !== "closed")
    .flatMap((r) => seed(r.id))
    .concat(STUBS.flatMap((c) => seed(c.id)))
    .filter((f) => f.status === "live");
}

/** A form by its id or its link slug, for the candidate route. Seeds every
    campaign first, so a link works before anyone has opened the builder. */
export function findFormByKey(key: string): Form | null {
  seedAll();
  const k = decodeURIComponent(key).toLowerCase();
  for (const list of state.values()) {
    const f = list.find((x) => x.id.toLowerCase() === k || formSlug(x) === k || x.id.slice(-6).toLowerCase() === k);
    if (f) return f;
  }
  return null;
}

export function getForm(formId: string): Form | null {
  const hit = find(formId);
  if (hit) return hit.form;
  seedAll();
  return find(formId)?.form ?? null;
}

export function useForm(formId: string | null): Form | null {
  useEffect(() => { if (LIVE && formId) void loadForm(formId); }, [formId]);
  return useSyncExternalStore(subscribe, () => (formId ? getForm(formId) : null));
}

/** A name no other form in the campaign has. When `name` is taken, the
    alternatives are tried first (a sub-type the campaign name doesn't
    already say), then "…, second draft": never a date, never "(2)". */
export function uniqueName(name: string, taken: readonly string[], alts: readonly string[] = []): string {
  const have = new Set(taken.map((t) => t.trim().toLowerCase()));
  const free = (n: string) => !have.has(n.trim().toLowerCase());
  if (free(name)) return name;
  const hit = alts.find(free);
  if (hit) return hit;
  const nth = ["second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
  for (const w of nth) if (free(`${name}, ${w} draft`)) return `${name}, ${w} draft`;
  let k = 10;
  while (!free(`${name}, draft ${k}`)) k += 1;
  return `${name}, draft ${k}`;
}

export function addForm(form: Form, alts: readonly string[] = []): void {
  const list = seed(form.campaign);
  const now = Date.now();
  const theme = tintKey(form.theme);
  const name = uniqueName(form.name, list.map((f) => f.name), alts);
  const made: Form = withVisibleTitle({ ...form, name, theme, accent: TINTS[theme].fill, createdAt: form.createdAt ?? now, updatedAt: now });
  state.set(form.campaign, [made, ...list]);
  emit();
  /* Made somewhere that can't wait (the chat): it stays under its own id
     here and is created on the server behind it. */
  if (LIVE) serverIds.set(made.id, createBehind(made));
}

/** How many times each form's working copy has been written here: a read that began before one must not write over it. */
const touched = new Map<string, number>();

function writeLocal(formId: string, next: Form | ((f: Form) => Form)): void {
  const hit = find(formId);
  if (!hit) return;
  touched.set(formId, (touched.get(formId) ?? 0) + 1);
  const f = typeof next === "function" ? next(hit.form) : next;
  const theme = tintKey(f.theme);
  const done: Form = { ...f, theme, accent: TINTS[theme].fill, updatedAt: Date.now() };
  state.set(hit.campaignId, (state.get(hit.campaignId) ?? []).map((x) => (x.id === formId ? done : x)));
  emit();
}

export function updateForm(formId: string, next: Form | ((f: Form) => Form)): void {
  writeLocal(formId, next);
  if (LIVE) scheduleSave(formId);
}

/** Deletes a never-published form on the server, then here. The server refuses anything else. */
export async function deleteDraftForm(formId: string): Promise<void> {
  if (LIVE) await api<null>("DELETE", `/v1/forms/${await idOf(formId)}`);
  removeForm(formId);
}

export function removeForm(formId: string): void {
  const hit = find(formId);
  if (!hit) return;
  state.set(hit.campaignId, (state.get(hit.campaignId) ?? []).filter((x) => x.id !== formId));
  emit();
}

/* ── with the API ── */

export type SaveState = "saved" | "saving" | "error";
export type FormMeta = {
  status: FormStatus;
  publicLink: string | null;
  /** Edits since the last publish, which applicants don't see yet. */
  hasDraftChanges: boolean;
  responses: number;
  newApplicants: number;
  save: SaveState;
  error: string | null;
  /** The last save was refused for good (403: not allowed): trying again cannot help, so the card offers nothing to retry. */
  refused: boolean;
};
const NO_META: FormMeta = { status: "draft", publicLink: null, hasDraftChanges: false, responses: 0, newApplicants: 0, save: "saved", error: null, refused: false };

/** Whether a failure is a permanent refusal (the person may not do this), which no retry changes. */
export const isRefusal = (err: unknown): boolean => err instanceof ApiError && err.status === 403;
const metas = new Map<string, FormMeta>();
/** Local question id → the server's, learned on each save. */
const questionIds = new Map<string, string>();
/** Server question id → the candidate field it fills; the builder doesn't edit this yet, so it is carried. */
const mapsTo = new Map<string, string>();
/** Forms made here before the server knew them: local id → server id. */
const serverIds = new Map<string, Promise<string>>();
/** The other way round, once the server has them: server id → the local id the form lives under in this session. */
const localIds = new Map<string, string>();
const madeHere = new Set<string>();
const requested = new Set<string>();
const loadErrors = new Map<string, string>();
const timers = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();

function setMeta(id: string, patch: Partial<FormMeta>) {
  metas.set(id, { ...(metas.get(id) ?? NO_META), ...patch });
  emit();
}

export function getFormMeta(id: string): FormMeta { return metas.get(id) ?? NO_META; }
export function useFormMeta(id: string): FormMeta {
  return useSyncExternalStore(subscribe, () => getFormMeta(id));
}

const idOf = (formId: string): Promise<string> => serverIds.get(formId) ?? Promise.resolve(formId);

/** Where a server id's form lives in this session's store: under the local id it was made with, else its own. */
const storeIdOf = (serverId: string): string => localIds.get(serverId) ?? serverId;

/**
 * The server's id for a form, once it has one (a form made in the chat is created behind the card). Rejects
 * when the server refused it; the form is then only a working copy here, with nothing to find it by later.
 */
export const serverIdOf = (formId: string): Promise<string> => idOf(formId);

/** Forms shown with the campaign's name as their title that the server has not been told about yet. */
const unsavedTitles = new Set<string>();

function absorb(v: formsApi.FormView, localId = v.id) {
  for (const q of v.questions) if (q.mapsTo) mapsTo.set(q.id, q.mapsTo);
  /* The server's copy has no title: what is shown is a default, so it still counts as an unpublished change. */
  if (!v.title?.trim() && defaultFormTitle(v.campaignId)) unsavedTitles.add(localId); else unsavedTitles.delete(localId);
  /* The link to hand out is the share link (what a chat app reads); the in-app one is where it ends up. */
  setMeta(localId, { status: v.status, publicLink: v.shareLink ?? v.publicLink, hasDraftChanges: v.hasDraftChanges || unsavedTitles.has(localId) });
}

/** A form from the server, titled for the page. */
const fromView = (v: formsApi.FormView): Form => withVisibleTitle(formsApi.formFromView(v));

async function createBehind(f: Form): Promise<string> {
  try {
    const v = await formsApi.createForm(f.campaign, formsApi.bodyFromForm(f, questionIds, mapsTo));
    madeHere.add(v.id);
    localIds.set(v.id, f.id);
    for (const [local, server] of formsApi.matchIds(f.questions, v.questions)) questionIds.set(local, server);
    absorb(v, f.id);
    return v.id;
  } catch (err) {
    setMeta(f.id, { save: "error", error: messageOf(err), refused: isRefusal(err) });
    throw err;
  }
}

const loads = new Map<string, Promise<void>>();

/** A campaign's forms, in full: the index counts questions and must-haves. Resolves when they have arrived (or failed). */
export function loadForms(campaignId: string): Promise<void> {
  // No campaign yet (the list is still arriving): nothing to ask the server about.
  if (!campaignId) return Promise.resolve();
  if (requested.has(campaignId)) return loads.get(campaignId) ?? Promise.resolve();
  requested.add(campaignId);
  const run = (async () => {
    try {
      const { forms } = await formsApi.listForms(campaignId);
      const views = await Promise.all(forms.filter((f) => !madeHere.has(f.id)).map((f) => formsApi.getForm(f.id)));
      for (const v of views) absorb(v);
      for (const f of forms) setMeta(storeIdOf(f.id), { responses: f.responses, newApplicants: f.newApplicants });
      const here = (state.get(campaignId) ?? []).filter((f) => !views.some((v) => v.id === f.id));
      state.set(campaignId, [...here, ...views.map(fromView)]);
      loadErrors.delete(campaignId);
      emit();
    } catch (err) {
      requested.delete(campaignId);
      loadErrors.set(campaignId, messageOf(err));
      emit();
    }
  })();
  loads.set(campaignId, run);
  return run;
}

/** Whether a form's working copy holds edits the server has not seen yet: a read must leave them alone. */
const hasUnsavedEdits = (formId: string): boolean => timers.has(formId) || inflight.has(formId) || getFormMeta(formId).save !== "saved";

/**
 * The server's copy of a form, taken in quietly: its status and link, what applicants see, its questions.
 * A working copy with edits that have not saved, or that was written while this was being read (`since` is
 * how often it had been written when the read began), keeps them: it takes only the server's status and link,
 * and the next read finds the edits saved.
 */
function takeInView(v: formsApi.FormView, since: number | undefined): void {
  const id = storeIdOf(v.id);
  const hit = find(id);
  if (hit && (touched.get(id) ?? 0) !== (since ?? 0)) return;
  if (hit && hasUnsavedEdits(id)) {
    setMeta(id, { status: v.status, publicLink: v.shareLink ?? v.publicLink });
    const status = v.status === "live" ? "live" : "draft";
    if (hit.form.status !== status) {
      state.set(hit.campaignId, (state.get(hit.campaignId) ?? []).map((f) => (f.id === id ? { ...f, status } : f)));
    }
    return;
  }
  absorb(v, id);
  /* Questions the session already knows keep the ids they have here, so the builder's open question stays open. */
  const mine = new Map([...questionIds].map(([local, server]) => [server, local]));
  const read = fromView(v);
  const next: Form = {
    ...read,
    id,
    origin: hit?.form.origin ?? read.origin,
    questions: read.questions.map((q) => ({ ...q, id: mine.get(q.id) ?? q.id })),
  };
  const list = state.get(v.campaignId) ?? [];
  if (!hit) {
    state.set(v.campaignId, [next, ...list]);
  } else if (JSON.stringify({ ...hit.form, updatedAt: 0 }) !== JSON.stringify({ ...next, updatedAt: 0 })) {
    state.set(hit.campaignId, list.map((f) => (f.id === id ? next : f)));
  }
}

const rereads = new Map<string, Promise<void>>();

async function readAgain(campaignId: string): Promise<void> {
  try {
    const since = new Map(touched);
    const { forms } = await formsApi.listForms(campaignId);
    const views = await Promise.all(forms.map((f) => formsApi.getForm(f.id)));
    for (const v of views) takeInView(v, since.get(storeIdOf(v.id)));
    for (const f of forms) setMeta(storeIdOf(f.id), { responses: f.responses, newApplicants: f.newApplicants });
    emit();
  } catch {
    /* what is shown stays; the next read tries again */
  }
}

/**
 * A campaign's forms again, quietly: their status and link, their questions and who has answered. Applicants
 * arrive, and the agent publishes, closes and changes forms, from outside this page; a card that shows one
 * says what the server says without a reload. Without a campaign, every campaign whose forms were read is
 * read again. Reads of one campaign run one after another, so the last answer is the one that stays.
 */
export function refreshFormCounts(campaignId: string | null): Promise<void> {
  if (!LIVE) return Promise.resolve();
  if (campaignId === null) return Promise.all([...state.keys()].map((id) => refreshFormCounts(id))).then(() => {});
  if (!state.has(campaignId)) return Promise.resolve();
  const run = (rereads.get(campaignId) ?? Promise.resolve()).then(() => readAgain(campaignId));
  rereads.set(campaignId, run);
  void run.then(() => { if (rereads.get(campaignId) === run) rereads.delete(campaignId); });
  return run;
}

/** One form again, quietly (a card that names it): its status and link, and who has answered it. */
export async function refreshFormCount(formId: string): Promise<void> {
  if (!LIVE) return;
  const hit = find(formId);
  if (!hit) return;
  try {
    const since = touched.get(formId);
    const sid = await idOf(formId);
    const [{ forms }, v] = await Promise.all([formsApi.listForms(hit.campaignId), formsApi.getForm(sid)]);
    takeInView(v, since);
    const row = forms.find((f) => f.id === sid);
    if (row) setMeta(formId, { responses: row.responses, newApplicants: row.newApplicants });
  } catch {
    /* what is shown stays */
  }
}

/** "loading", "ready", or why a campaign's forms couldn't load. */
export function useFormsLoad(campaignId: string): string {
  return useSyncExternalStore(subscribe, () => (!LIVE || state.has(campaignId) ? "ready" : loadErrors.get(campaignId) ?? "loading"));
}

export function retryForms(campaignId: string): void {
  loadErrors.delete(campaignId);
  void loadForms(campaignId);
}

const oneLoads = new Map<string, Promise<void>>();

/** One form, for a link straight to the builder. Asking again while it is on its way waits for the same read. */
function loadForm(formId: string): Promise<void> {
  if (find(formId) || !/^[0-9a-f-]{36}$/i.test(formId)) return Promise.resolve();
  const going = oneLoads.get(formId);
  if (going) return going;
  if (requested.has(formId)) return Promise.resolve();
  requested.add(formId);
  const run = (async () => {
    try {
      const v = await formsApi.getForm(formId);
      absorb(v);
      if (!find(formId)) state.set(v.campaignId, [fromView(v), ...(state.get(v.campaignId) ?? [])]);
      emit();
    } catch {
      requested.delete(formId);
    } finally {
      oneLoads.delete(formId);
    }
  })();
  oneLoads.set(formId, run);
  return run;
}

/**
 * A form a chat card made, found again by its server id: the one in this session's store, else read from the
 * server. Null when it is gone (deleted since), which is when the card asks again.
 */
export async function recallForm(serverId: string): Promise<Form | null> {
  const id = storeIdOf(serverId);
  await loadForm(id);
  return getForm(id);
}

/** For the builder's "New form": waits for the server so the form opens under its real id. */
export async function createForm(form: Form): Promise<Form> {
  const list = seed(form.campaign);
  const named = { ...form, name: uniqueName(form.name, list.map((f) => f.name)) };
  const v = await formsApi.createForm(form.campaign, formsApi.bodyFromForm(named, questionIds, mapsTo));
  absorb(v);
  const made = fromView(v);
  state.set(form.campaign, [made, ...(state.get(form.campaign) ?? [])]);
  emit();
  return made;
}

const SAVE_AFTER_MS = 700;

function scheduleSave(formId: string) {
  window.clearTimeout(timers.get(formId));
  setMeta(formId, { save: "saving", error: null, refused: false });
  timers.set(formId, window.setTimeout(() => { void flush(formId).catch(() => {}); }, SAVE_AFTER_MS));
}

/** Saves the working copy now. Saves of one form run one after another. */
async function flush(formId: string): Promise<void> {
  window.clearTimeout(timers.get(formId));
  timers.delete(formId);
  await inflight.get(formId)?.catch(() => {});
  const run = (async () => {
    const f = getForm(formId);
    if (!f) return;
    const v = await formsApi.saveForm(await idOf(formId), formsApi.bodyFromForm(f, questionIds, mapsTo));
    for (const [local, server] of formsApi.matchIds(f.questions, v.questions)) questionIds.set(local, server);
    absorb(v, formId);
    unsavedTitles.delete(formId);
    if (!timers.has(formId)) setMeta(formId, { save: "saved" });
  })();
  inflight.set(formId, run);
  try {
    await run;
  } catch (err) {
    setMeta(formId, { save: "error", error: messageOf(err), refused: isRefusal(err) });
    throw err;
  } finally {
    if (inflight.get(formId) === run) inflight.delete(formId);
  }
}

/** Retries a save that didn't go through. */
export const saveNow = (formId: string): Promise<void> => flush(formId);

/** Publishes the working copy: it becomes what applicants see, and the link opens. */
export async function publishForm(formId: string): Promise<void> {
  if (!LIVE) { writeLocal(formId, (f) => ({ ...withVisibleTitle(f), status: "live" })); return; }
  /* The page needs a title of its own: without one it would carry the internal name. A title that
     is only a default here is saved with the publish. */
  const f = getForm(formId);
  const fallback = f && !f.title?.trim() ? defaultFormTitle(f.campaign) : undefined;
  if (fallback) writeLocal(formId, (x) => ({ ...x, title: fallback }));
  if (f && (fallback || unsavedTitles.has(formId))) scheduleSave(formId);
  if (timers.has(formId) || inflight.has(formId) || getFormMeta(formId).save === "error") await flush(formId);
  const r = await formsApi.publishForm(await idOf(formId));
  setMeta(formId, { status: "live", publicLink: r.shareLink ?? r.publicLink, hasDraftChanges: false });
  writeLocal(formId, (f) => ({ ...f, status: "live" }));
}

/** Stops new applications. The link then says the form is closed. */
export async function closeForm(formId: string): Promise<void> {
  if (!LIVE) { writeLocal(formId, (f) => ({ ...f, status: "draft" })); return; }
  await formsApi.closeForm(await idOf(formId));
  setMeta(formId, { status: "closed" });
  writeLocal(formId, (f) => ({ ...f, status: "draft" }));
}

/* ── responses, with the API ── */

export type LiveResponses = {
  loading: boolean;
  error: string | null;
  list: readonly FormResponse[];
  meta: ReadonlyMap<string, ResponseMeta>;
  /** More responses exist than the newest 1,000 shown. */
  more?: boolean;
};
const NO_RESPONSES: LiveResponses = { loading: true, error: null, list: [], meta: new Map() };
const responses = new Map<string, LiveResponses>();

function setResponses(formId: string, next: LiveResponses) {
  responses.set(formId, next);
  const meta = [...next.meta.values()];
  setMeta(formId, { responses: next.list.length, newApplicants: meta.filter((m) => m.isNew).length });
}

/** How often an open Responses page asks again: an application that arrives shows up without a reload. */
export const RESPONSES_POLL_MS = 12_000;

/** `quiet`: a read in the background, which shows no loader and says nothing when it fails. */
export async function loadResponses(formId: string, opts: { quiet?: boolean } = {}): Promise<void> {
  const had = responses.get(formId);
  if (!opts.quiet) {
    responses.set(formId, { ...(had ?? NO_RESPONSES), loading: true, error: null });
    emit();
  }
  try {
    const { rows, more } = await formsApi.allResponses(await idOf(formId));
    const now = Date.now();
    const parsed = rows.map((r) => formsApi.responseFromServer(r, formId, now));
    setResponses(formId, {
      loading: false, error: null, more,
      list: parsed.map((p) => p.response),
      meta: new Map(parsed.map((p) => [p.response.id, p.meta])),
    });
  } catch (err) {
    if (opts.quiet) return;
    responses.set(formId, { ...(had ?? NO_RESPONSES), loading: false, error: messageOf(err) });
    emit();
  }
}

/** `enabled` false reads nothing: a caller that may have no form yet asks with the hook, never conditionally. */
export function useResponses(formId: string, enabled = true): LiveResponses {
  useEffect(() => {
    if (!LIVE || !enabled || !formId) return;
    void loadResponses(formId);
    /* While the page is open and in view, new applications are read in; a hidden tab asks again when shown. */
    const again = () => { if (!document.hidden) void loadResponses(formId, { quiet: true }); };
    const timer = window.setInterval(again, RESPONSES_POLL_MS);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", again);
    };
  }, [formId, enabled]);
  return useSyncExternalStore(subscribe, () => (enabled ? responses.get(formId) ?? NO_RESPONSES : NO_RESPONSES));
}

/**
 * Adds an applicant to the shortlist, or passes on them. Shown at once and
 * put back if the server says no; the error comes back as a sentence.
 */
export async function decideResponse(
  formId: string,
  responseId: string,
  decision: "add" | "pass",
  linkTo?: string,
  reason?: string,
): Promise<string | null> {
  const cur = responses.get(formId);
  const before = cur?.meta.get(responseId);
  if (!cur || !before) return null;
  const optimistic: ResponseMeta = decision === "add"
    ? { ...before, decision: "added", stage: "shortlisted", isNew: false }
    : { ...before, decision: "passed", isNew: false };
  const put = (m: ResponseMeta) => {
    const now = responses.get(formId) ?? cur;
    setResponses(formId, { ...now, meta: new Map(now.meta).set(responseId, m) });
  };
  put(optimistic);
  try {
    await formsApi.decide(await idOf(formId), responseId, decision, linkTo, reason);
    // Added as someone already on the board: their real stage comes from the server.
    if (linkTo) void loadResponses(formId);
    return null;
  } catch (err) {
    put(before);
    return messageOf(err);
  }
}

/**
 * Keeps an applicant in Candidates without shortlisting them or deciding anything about them. Once the
 * server has them the response names them as the workspace's own person (so the page says they are there);
 * a refusal comes back as a sentence, and nothing changes.
 */
export async function saveResponse(formId: string, responseId: string): Promise<string | null> {
  const cur = responses.get(formId);
  if (!cur?.list.some((r) => r.id === responseId)) return null;
  try {
    const saved = await formsApi.decide(await idOf(formId), responseId, "save");
    const candidateId = saved.candidateId;
    if (candidateId) {
      const now = responses.get(formId) ?? cur;
      setResponses(formId, {
        ...now,
        list: now.list.map((r) => (r.id === responseId ? { ...r, person: { ...r.person, id: candidateId } } : r)),
      });
    }
    return null;
  } catch (err) {
    return messageOf(err);
  }
}

const drafts = new Map<string, string>();
/** Idempotent create, for StrictMode-safe drafting in chat: same key → same form. */
export function ensureDraft(key: string, make: () => Form, alts: readonly string[] = []): Form {
  const id = drafts.get(key);
  const have = id ? getForm(id) : null;
  if (have) return have;
  const f = make();
  drafts.set(key, f.id);
  addForm(f, alts);
  return getForm(f.id) ?? f;
}

/* ── a draft made in chat, with the API ──
   The chat replays itself after a reload, and a draft made on every replay would fill the
   campaign with copies. So the server's id for a chat draft is kept in this browser, by the
   same key `ensureDraft` uses, and found again instead of made again. */

const CHAT_DRAFTS_KEY = "sh.forms.chat-drafts.v1";

function rememberedDrafts(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CHAT_DRAFTS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch { return {}; }
}
function rememberDraft(key: string, serverId: string) {
  try {
    window.localStorage.setItem(CHAT_DRAFTS_KEY, JSON.stringify({ ...rememberedDrafts(), [key]: serverId }));
  } catch { /* blocked storage: a reload may make another draft, nothing worse */ }
}

/* The last draft the chat made for each campaign, and when, so asking for a form again reuses it. */
const CHAT_DRAFT_OF_KEY = "sh.forms.chat-draft-of.v2";
/** How long after the chat last wrote a draft it still counts as untouched: past this, someone has been editing it. */
const UNTOUCHED_MS = 90_000;
type ChatDraft = { id: string; at: number };

function lastChatDrafts(): Record<string, ChatDraft> {
  try {
    const raw = window.localStorage.getItem(CHAT_DRAFT_OF_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" ? (v as Record<string, ChatDraft>) : {};
  } catch { return {}; }
}
function rememberLastChatDraft(campaignId: string, id: string) {
  try {
    window.localStorage.setItem(CHAT_DRAFT_OF_KEY, JSON.stringify({ ...lastChatDrafts(), [campaignId]: { id, at: Date.now() } }));
  } catch { /* blocked storage: the next request makes another draft, nothing worse */ }
}

/**
 * Whether a form the chat made can be written over by the next request: still a draft, nobody has
 * answered it, and it has not been edited since the chat last wrote it (a form someone has worked on
 * is theirs). `wroteAt` is when the chat last wrote it.
 */
export function reusableDraft(
  f: Pick<Form, "updatedAt">,
  meta: Pick<FormMeta, "status" | "responses">,
  wroteAt: number,
): boolean {
  if (meta.status !== "draft" || meta.responses > 0) return false;
  if (typeof f.updatedAt !== "number") return false;
  return f.updatedAt <= wroteAt + UNTOUCHED_MS;
}

/**
 * With the API: the draft for this key. A reload finds the form it made before; otherwise it
 * is made now, shown at once, and created on the server. Resolves once the server has it (or
 * has said why not: the form stays here as a working copy and its meta carries the error).
 *
 * With `campaignId`, a draft this chat made for the campaign earlier that has not been published,
 * answered or edited is written over with the new one instead of leaving a copy beside it.
 */
export async function ensureLiveDraft(
  key: string,
  make: () => Form,
  alts: readonly string[] = [],
  campaignId?: string,
): Promise<Form> {
  /* Made earlier in this session: the same form, whatever has been saved of it. */
  const here = drafts.get(key);
  const mine = here ? getForm(here) : null;
  if (mine) {
    await idOf(mine.id).catch(() => "");
    return mine;
  }
  const known = rememberedDrafts()[key];
  if (known) {
    await loadForm(known);
    const f = getForm(known);
    if (f) return f;
  }
  const prior = campaignId ? lastChatDrafts()[campaignId] : undefined;
  if (campaignId && prior) {
    await loadForm(prior.id);
    const have = getForm(prior.id);
    if (have && reusableDraft(have, getFormMeta(have.id), prior.at)) {
      const fresh = make();
      /* Its name, place and history stay; what the request asked for is what it holds now. */
      updateForm(have.id, {
        ...fresh,
        id: have.id,
        name: have.name,
        campaign: have.campaign,
        status: have.status,
        ...(have.createdAt !== undefined ? { createdAt: have.createdAt } : {}),
      });
      drafts.set(key, have.id);
      rememberDraft(key, prior.id);
      if (campaignId) rememberLastChatDraft(campaignId, prior.id);
      return getForm(have.id) ?? have;
    }
  }
  const f = ensureDraft(key, make, alts);
  try {
    const serverId = await idOf(f.id);
    rememberDraft(key, serverId);
    if (campaignId) rememberLastChatDraft(campaignId, serverId);
  } catch { /* the meta already says it didn't save */ }
  return f;
}

/** Saves a working copy that didn't reach the server, and says so if it still can't. */
export const retryDraft = (formId: string): Promise<void> => flush(formId).catch(() => {});

/* ── chat → builder handoff (read-then-clear, like CampaignWorkspace's pendingStage) ── */

export type FormView = "build" | "preview" | "responses" | "share";
let pending: { formId: string; view: FormView } | null = null;
export function requestOpenForm(formId: string, view: FormView): void { pending = { formId, view }; }
export function peekPendingForm(): { formId: string; view: FormView } | null { return pending; }
export function clearPendingForm(): void { pending = null; }

/* ── campaigns created from chat ── */

export type { CampaignLite } from "./formKit";
export { campaignById } from "./formKit";

const stubByName = new Map<string, CampaignLite>();
/** Memoised by name, so a re-render in chat never makes two. */
export function addCampaignStub(i: { name: string; department: string; location?: string }): CampaignLite {
  const key = i.name.trim().toLowerCase();
  const had = stubByName.get(key);
  if (had) return had;
  const c: CampaignLite = {
    id: `c-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`,
    name: i.name.trim(),
    department: i.department,
    location: i.location || "Remote",
    status: "active",
  };
  stubByName.set(key, c);
  STUBS.push(c);
  options = null;
  emit();
  return c;
}

export function listCampaignStubs(): readonly CampaignLite[] { return STUBS; }

let options: CampaignLite[] | null = null;
function campaignOptions(): readonly CampaignLite[] {
  if (!options) {
    options = [
      ...CAMPAIGN_ROWS.filter((r) => r.status !== "closed").map((r) => ({ id: r.id, name: r.name, department: r.department, location: r.location, status: r.status })),
      ...STUBS,
    ];
  }
  return options;
}
export function useCampaignOptions(): readonly CampaignLite[] {
  return useSyncExternalStore(subscribe, campaignOptions);
}

/* Restore what the last session left, once, at load. */
(function restore() {
  if (!persist) return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { forms?: [string, Form[]][]; stubs?: CampaignLite[]; drafts?: [string, string][] };
    for (const c of v.stubs ?? []) if (!STUBS.some((x) => x.id === c.id)) { STUBS.push(c); stubByName.set(c.name.trim().toLowerCase(), c); }
    for (const [cid, list] of v.forms ?? []) if (Array.isArray(list)) state.set(cid, list.map((f) => (f.theme === tintKey(f.theme) ? f : { ...f, theme: tintKey(f.theme), accent: TINTS[tintKey(f.theme)].fill })));
    for (const [k, id] of v.drafts ?? []) drafts.set(k, id);
  } catch { /* a bad or blocked store starts fresh */ }
})();

/**
 * The workspace changed: the forms, responses and failures read for the last one's campaigns are not this one's.
 * Nothing carries over (a form half-saved for the old workspace would only be refused by the new one).
 */
export function forgetLoadedForms(): void {
  if (!LIVE) return;
  for (const t of timers.values()) window.clearTimeout(t);
  timers.clear();
  inflight.clear();
  state.clear();
  loads.clear();
  requested.clear();
  loadErrors.clear();
  metas.clear();
  madeHere.clear();
  serverIds.clear();
  localIds.clear();
  oneLoads.clear();
  questionIds.clear();
  mapsTo.clear();
  unsavedTitles.clear();
  touched.clear();
  rereads.clear();
  responses.clear();
  emit();
}
onWorkspaceChange(forgetLoadedForms);

export function __resetFormsStore(): void {
  state.clear();
  drafts.clear();
  stubByName.clear();
  STUBS.length = 0;
  options = null;
  pending = null;
  emit();
}

export { newId };
