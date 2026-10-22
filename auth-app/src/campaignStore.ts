import { useEffect, useState, useSyncExternalStore } from "react";
import { onDecision } from "./api/agent";
import type { ApiActivity, ApiBoardRow, ApiCampaign, ApiCampaignAgents, ApiMember, ApiOverview } from "./api/campaigns";
import * as campaignsApi from "./api/campaigns";
import { ApiError, LIVE, messageOf } from "./api/client";
import type { ApiClientDetail, ApiClientRow } from "./api/clients";
import * as clientsApi from "./api/clients";
import { onWorkspaceChange } from "./api/identity";
import * as stagesApi from "./api/stages";
import type { StageDef } from "./api/stages";
import { moveTarget, wouldMove } from "./campaign";
import type { MoveTo, PipelinePerson, StageId, StatusId, Step } from "./campaign";
import {
  DEFAULT_STAGES, bodyOf, destinationFor, firstOfKind, isDefaultId, isStageMove, landing, stageIdOf, stageNamed, stagesFrom, stagesFromRows, stagesFromSummary,
  wouldMoveToStage, workingOf,
} from "./boardStages";
import type { StageRow } from "./boardStages";
import { pipelineFor } from "./campaign";
import type { CampaignRow, CampaignStatus } from "./campaignsData";
import { CAMPAIGN_ROWS, TEAM } from "./campaignsData";
import type { Client, ClientContact, ClientEvent, ClientStatus } from "./clients";
import { CLIENT_SEED, CLIENT_STATUS_LABEL, SEED_CLIENT_OF, makePrimary, normaliseClient } from "./clients";
import { reportProblem } from "./problems";

/**
 * The pipeline as live state, one store for the whole app.
 *
 * The board, the overview and the shortlist all read the same people, so a
 * card dragged to Interviewing on the board is already counted on the
 * overview when you go back to it. Fixture data seeds it; nothing persists
 * across reloads, which matches every other page in the console today.
 *
 * With the API connected (LIVE) the same functions load from it and write to
 * it: the screen changes at once, the server's answer replaces the guess, and
 * a refused change is put back with one short line saying why.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const state = new Map<string, PipelinePerson[]>();
const NO_PEOPLE: PipelinePerson[] = [];

function get(campaignId: string): PipelinePerson[] {
  if (LIVE) return state.get(resolveCampaignId(campaignId)) ?? NO_PEOPLE;
  let list = state.get(campaignId);
  if (!list) {
    list = pipelineFor(campaignId).map((p) => ({ ...p }));
    state.set(campaignId, list);
  }
  return list;
}

function emit() { for (const l of listeners) l(); }

/** Subscribes, first starting whatever load the reader depends on. */
const subscribe = (ensure?: () => void) => (l: Listener) => {
  ensure?.();
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const plain = subscribe();

const firstOf = (name: string) => name.split(" ")[0] ?? name;

/**
 * `to`: a status (a stage's kind, or Replied: In outreach at its replied step), or one of the campaign's own
 * stages by id. `reason`: why, when passing on someone; it goes on the move.
 */
export function movePerson(campaignId: string, id: string, to: MoveTo, reason?: string) {
  if (LIVE) { moveLive(resolveCampaignId(campaignId), id, to, reason); return; }
  const list = get(campaignId);
  /* The moved person goes to the FRONT, so they land at the top of their new
     column: exactly where the board's landing slot opened. */
  const hit = list.find((p) => p.id === id);
  if (!hit) return;
  const stages = stagesNow(campaignId);
  const { stageId: was, ...rest } = hit;
  let next: PipelinePerson;
  if (isStageMove(to)) {
    const st = stageNamed(stages, to.stageId);
    if (!st || !wouldMoveToStage(hit, st, stages)) return;
    const l = landing(hit, st);
    next = {
      ...rest, stage: l.stage, step: l.step, stageId: l.stageId, inStage: 0, last: lastFor(l.stage),
      ...(l.step === "replied" ? { replied: true } : {}),
    };
  } else {
    if (!wouldMove(hit, to)) return;
    const t = moveTarget(to);
    const sameStage = hit.stage === t.stage;
    const column = sameStage ? was : firstOfKind(stages, t.stage)?.id;
    next = {
      ...rest, stage: t.stage, step: t.step !== undefined ? t.step : stepFor(t.stage),
      ...(column ? { stageId: column } : {}),
      inStage: sameStage ? hit.inStage : 0, last: lastFor(to),
      ...(t.step === "replied" ? { replied: true } : {}),
    };
  }
  state.set(campaignId, [next, ...list.filter((p) => p.id !== id)]);
  log.set(campaignId, [{ id: `mv-${Date.now()}-${id}`, person: hit, to: next.stage, at: Date.now() }, ...logFor(campaignId)]);
  emit();
}

/** Moves several people at once: the shortlist's Reach out and Pass. */
export function movePeople(campaignId: string, ids: readonly string[], to: StatusId, reason?: string) {
  if (!LIVE || ids.length < 2) { for (const id of ids) movePerson(campaignId, id, to, reason); return; }
  bulkMoveLive(resolveCampaignId(campaignId), ids, to, reason);
}

/* ── this session's moves, newest first, for the Overview's activity feed ── */

/** `to` is the stage they went to: a move to Replied is a move within In outreach. */
export type Move = { id: string; person: PipelinePerson; to: StageId; at: number };
const log = new Map<string, Move[]>();
const NONE: Move[] = [];
const logFor = (id: string): Move[] => log.get(id) ?? NONE;

export function useMoves(campaignId: string): Move[] {
  return useSyncExternalStore(plain, () => logFor(LIVE ? resolveCampaignId(campaignId) : campaignId));
}

function stepFor(stage: StageId): Step {
  return stage === "outreach" ? "waiting" : stage === "interviewing" ? "loop" : null;
}

function lastFor(to: StatusId): string {
  return {
    shortlisted: "Moved back to shortlist",
    outreach: "In outreach",
    replied: "Replied",
    interviewing: "Moved to interviews",
    hired: "Hired",
    passed: "Rejected",
  }[to];
}

/** The people in a campaign right now, outside React. */
export const pipelineNow = (campaignId: string): PipelinePerson[] => get(campaignId);

export function usePipeline(campaignId: string): PipelinePerson[] {
  return useSyncExternalStore(subscribe(() => ensureBoard(campaignId)), () => get(campaignId));
}

/** Whether a campaign's people have arrived. Always true on fixtures. */
export function usePipelineReady(campaignId: string): boolean {
  return useSyncExternalStore(subscribe(() => ensureBoard(campaignId)), () => {
    const id = resolveCampaignId(campaignId);
    const s = boardState.get(id);
    return !LIVE || !id || s === "ready" || s === "failed" || pendingRows.some((r) => r.id === id);
  });
}

/* ── the campaign's own stages: the board's columns ── */

const fromSummary = new WeakMap<object, readonly StageDef[]>();

/**
 * The stages of a campaign right now, outside React: what the board read or a save said, else what the campaign
 * list says of them (name, kind, colour), else the console's own five. The same array until something changes.
 */
export function stagesNow(campaignId: string): readonly StageDef[] {
  const id = LIVE ? resolveCampaignId(campaignId) : campaignId;
  const own = stageMap.get(id);
  if (own) return own;
  const listed = campaignRow(id)?.stages;
  if (listed?.length) {
    let made = fromSummary.get(listed);
    if (!made) { made = stagesFromSummary(listed); fromSummary.set(listed, made); }
    return made;
  }
  return DEFAULT_STAGES;
}

/** A campaign's stages, in column order, Hired and Rejected last. Loading the board is what brings them. */
export function useCampaignStages(campaignId: string): readonly StageDef[] {
  return useSyncExternalStore(subscribe(() => ensureBoard(campaignId)), () => stagesNow(campaignId));
}

/** The first stage a person is put in when they land on a board by kind: where the server puts them too. */
const columnFor = (campaignId: string, from: StageId, to: StageId): string | undefined =>
  from === to ? undefined : firstOfKind(stagesNow(campaignId), to)?.id;

/**
 * Changes a campaign's working stages (Hired and Rejected stay last). `moveTo` says where the people of a removed
 * stage go. Resolves true once it is saved; on a refusal the board is as it was and the reason is said once.
 */
export function saveStages(campaignId: string, rows: readonly StageRow[], moveTo: Readonly<Record<string, string>> = {}): Promise<boolean> {
  if (!LIVE) {
    const before = stagesNow(campaignId);
    const after = stagesFromRows(rows, before);
    const keep = new Set(after.map((s) => s.id));
    state.set(campaignId, get(campaignId).map((p) => {
      const at = stageIdOf(p, before);
      if (keep.has(at)) return p.stageId === at ? p : { ...p, stageId: at };
      const gone = before.find((s) => s.id === at);
      const to = gone ? destinationFor(gone, rows, moveTo, before, after) : workingOf(after)[0];
      if (!to) return p;
      const l = landing(p, to);
      return { ...p, stage: l.stage, step: l.step, stageId: l.stageId, inStage: 0 };
    }));
    stageMap.set(campaignId, after);
    emit();
    return Promise.resolve(true);
  }
  const id = resolveCampaignId(campaignId);
  const asked = epoch;
  return stagesApi.putStages(id, bodyOf(rows, moveTo)).then(async (list) => {
    if (asked !== epoch) return true;
    stageMap.set(id, stagesFrom(list));
    // People of removed stages moved on the server: the board is read again, and the list's figures with it.
    try {
      const read = await campaignsApi.boardRead(id);
      if (asked === epoch) { setBoard(id, read.candidates); if (read.stages) stageMap.set(id, stagesFrom(read.stages)); }
    } catch { /* the stages are saved; the board catches up on its next read */ }
    if (asked === epoch) { emit(); refreshSoon(id); }
    return true;
  }, (err: unknown) => {
    reportProblem(`The stages weren't saved. ${messageOf(err)}`);
    return false;
  });
}

/* (The seeded "momentum" points, streak and WEEK_GOAL were removed: they
   were invented numbers. The Overview derives "moved forward this week"
   from days-in-stage plus this session's moves instead.) */

/* ── clients: who a campaign is hiring for ──
   Agencies hire on behalf of client companies; one client can own many
   campaigns. Seeded from clients.ts; local state, nothing persists. The
   Clients page, the campaign Overview's client card and its picker, and the
   agent's add-client moment all read and write this one list. */

export type { Client, ClientContact, ClientStatus } from "./clients";

let clients: Client[] = LIVE ? [] : [...CLIENT_SEED];
let clientOf: Record<string, string> = LIVE ? {} : { ...SEED_CLIENT_OF };
type ClientState = { clients: Client[]; clientOf: Record<string, string> };
let clientSnap: ClientState = { clients, clientOf };
const bump = () => { clientSnap = { clients, clientOf }; emit(); };

export function useClients(): ClientState {
  return useSyncExternalStore(subscribe(ensureClientsAndCampaigns), () => clientSnap);
}

/** Whether the clients (and the campaigns their figures come from) have arrived. Always true on fixtures. */
export function useClientsReady(): boolean {
  return useSyncExternalStore(subscribe(ensureClientsAndCampaigns), () => !LIVE
    || ((clientsState === "ready" || clientsState === "denied" || clientsState === "failed") && campaignsState !== "idle" && campaignsState !== "loading"));
}

export function getClients(): ClientState { return clientSnap; }
export function clientById(id: string): Client | undefined { return clients.find((c) => c.id === resolveClientId(id)); }

const event = (text: string): ClientEvent => ({ id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), text });

function patchClient(id: string, fn: (c: Client) => Client, note?: string) {
  clients = clients.map((c) => (c.id === id ? normaliseClient({ ...fn(c), history: note ? [event(note), ...(c.history ?? [])] : c.history }) : c));
  holdForLive(id);
  bump();
}

/* Live: a client changed here stays as shown until the API answers, whatever else reloads meanwhile. */
function holdForLive(id: string) {
  const c = LIVE ? clients.find((x) => x.id === id) : undefined;
  if (c) overlay.set(id, c);
}

/** Adds a client, or replaces one with the same id. Contacts and the flat
    manager/email/phone fields are made to agree either way. */
export function saveClient(c: Omit<Client, "id"> & { id?: string }): Client {
  const id = c.id ?? `cl-${Date.now().toString(36)}`;
  const was = clients.find((x) => x.id === id);
  const next = normaliseClient({
    createdAt: new Date().toISOString().slice(0, 10),
    ...c, id,
    history: [event(was ? "Details updated" : "Added as a client"), ...(was?.history ?? c.history ?? [])],
  });
  clients = was ? clients.map((x) => (x.id === id ? next : x)) : [...clients, next];
  bump();
  if (LIVE) {
    overlay.set(id, next);
    if (was && apiClients.some((r) => r.id === id)) saveClientLive(was, next); else createClientLive(next);
  }
  return next;
}

/** Resolves true once the client is set (at once on fixtures), false when the API refused and it was put back. */
export function setCampaignClient(campaignId: string, clientId: string | null): Promise<boolean> {
  if (LIVE) return linkClientLive(resolveCampaignId(campaignId), clientId);
  const prev = clientOf[campaignId];
  const { [campaignId]: _, ...rest } = clientOf;
  clientOf = clientId ? { ...rest, [campaignId]: clientId } : rest;
  const name = campaignRow(campaignId)?.name ?? "A campaign";
  if (prev && prev !== clientId) clients = clients.map((c) => (c.id === prev ? { ...c, history: [event(`${name} moved to another client`), ...(c.history ?? [])] } : c));
  if (clientId && prev !== clientId) clients = clients.map((c) => (c.id === clientId ? { ...c, history: [event(`${name} linked`), ...(c.history ?? [])] } : c));
  bump();
  return Promise.resolve(true);
}

export function setClientStatus(id: string, status: ClientStatus) {
  patchClient(id, (c) => ({ ...c, status }), `Marked ${CLIENT_STATUS_LABEL[status].toLowerCase()}`);
  if (LIVE) clientWrite(id, () => clientsApi.updateClient(id, { status }), "That status change wasn't saved.");
}

/** Adds a contact; a new primary takes the flag from whoever had it. */
export function addClientContact(id: string, contact: Omit<ClientContact, "id">): ClientContact {
  const made: ClientContact = { ...contact, id: `ct-${Date.now().toString(36)}` };
  patchClient(id, (c) => {
    const list = [...(c.contacts ?? []), made];
    return { ...c, contacts: made.primary || list.length === 1 ? makePrimary(list, made.id) : list };
  }, `Added ${made.name} as a contact`);
  if (LIVE) clientWrite(id, () => clientsApi.addContact(id, clientsApi.contactBody(contact)), `${made.name} wasn't added.`);
  return made;
}

export function setPrimaryContact(id: string, contactId: string) {
  const who = clientById(id)?.contacts?.find((x) => x.id === contactId)?.name;
  patchClient(id, (c) => ({ ...c, contacts: makePrimary(c.contacts ?? [], contactId) }), who ? `${who} is now the primary contact` : undefined);
  if (LIVE) clientWrite(id, () => clientsApi.updateContact(id, contactId, { primary: true }), "The primary contact wasn't changed.");
}

/** Edits a contact's details. */
export function updateClientContact(id: string, contactId: string, fields: Omit<ClientContact, "id" | "primary">) {
  patchClient(id, (c) => ({ ...c, contacts: (c.contacts ?? []).map((x) => (x.id === contactId ? { ...x, ...fields } : x)) }), `Updated ${fields.name}`);
  if (LIVE) {
    const { primary: _, ...body } = clientsApi.contactBody({ ...fields, primary: false });
    clientWrite(id, () => clientsApi.updateContact(id, contactId, body), `Changes to ${fields.name} weren't saved.`);
  }
}

/** Removes a contact; if they were primary, the next one takes the flag. */
export function removeClientContact(id: string, contactId: string) {
  const who = clientById(id)?.contacts?.find((x) => x.id === contactId);
  patchClient(id, (c) => {
    const rest = (c.contacts ?? []).filter((x) => x.id !== contactId);
    return { ...c, contacts: who?.primary && rest[0] ? makePrimary(rest, rest[0].id) : rest };
  }, who ? `Removed ${who.name}` : undefined);
  if (LIVE) clientWrite(id, () => clientsApi.deleteContact(id, contactId), `${who?.name ?? "That contact"} wasn't removed.`);
}

/**
 * Deletes a client with no open campaigns (the API refuses otherwise). Resolves true
 * once it's gone, so "deleted" is only said when it is.
 */
export function deleteClient(id: string): Promise<boolean> {
  const real = resolveClientId(id);
  const was = { clients, clientOf };
  clients = clients.filter((c) => c.id !== id && c.id !== real);
  clientOf = Object.fromEntries(Object.entries(clientOf).filter(([, c]) => c !== id && c !== real));
  bump();
  if (!LIVE) return Promise.resolve(true);
  return clientsApi.deleteClient(real).then(() => {
    apiClients = apiClients.filter((r) => r.id !== real);
    clientDetails.delete(real);
    overlay.delete(id);
    apiCampaigns = apiCampaigns.map((c) => (c.client?.id === real ? { ...c, client: null } : c));
    rebuild();
    return true;
  }, (err: unknown) => {
    ({ clients, clientOf } = was);
    bump();
    reportProblem(`That client wasn't deleted. ${messageOf(err)}`);
    return false;
  });
}

export function addClientNote(id: string, text: string) {
  const t = text.trim();
  if (!t) return;
  clients = clients.map((c) => (c.id === id ? { ...c, history: [{ ...event(t), note: true }, ...(c.history ?? [])] } : c));
  holdForLive(id);
  bump();
  if (LIVE) clientWrite(id, () => clientsApi.addNote(id, t), "That note wasn't saved.");
}

/** Test-only: back to the seeded clients. */
export function resetClients() {
  clients = [...CLIENT_SEED];
  clientOf = { ...SEED_CLIENT_OF };
  bump();
}

/* ── campaigns as live state: who is on each one, and its status ──
   Seeded from CAMPAIGN_ROWS. The Campaigns page, the sidebar's switcher,
   Home and a campaign's own pages all read this, so assigning a recruiter or
   closing a campaign shows up everywhere at once. Nothing persists across a
   reload, like the rest of the console. */

let rows: readonly CampaignRow[] = LIVE ? [] : CAMPAIGN_ROWS;

/* Archived campaigns are not in the list the rest of the console reads (the server leaves them out): the Campaigns
   page's Archived tab asks for them, and they are kept here so putting one away or bringing one back is seen at once. */
let archivedList: ApiCampaign[] = [];
let archivedRows: readonly CampaignRow[] = [];
let archivedState: "idle" | "loading" | "ready" | "failed" = "idle";

/** The campaigns as they are now, outside React (the chat moving to one reads them when it happens). */
export const campaignRowsNow = (): readonly CampaignRow[] => rows;

export function useCampaignRows(): readonly CampaignRow[] {
  return useSyncExternalStore(subscribe(ensureCampaigns), () => rows, () => rows);
}

/** The archived campaigns, read when first asked for; `ready` once they have arrived (or failed: then there are none to show). */
export function useArchivedRows(): { rows: readonly CampaignRow[]; ready: boolean } {
  const snapshot = useSyncExternalStore(subscribe(ensureArchived), () => archivedRows, () => archivedRows);
  const state = useSyncExternalStore(subscribe(ensureArchived), () => archivedState, () => archivedState);
  return { rows: snapshot, ready: !LIVE || state === "ready" || state === "failed" };
}

function ensureArchived(): void {
  if (!LIVE || archivedState === "loading" || archivedState === "ready") return;
  archivedState = "loading";
  const asked = epoch;
  campaignsApi.listCampaigns("only").then((list) => {
    if (asked !== epoch) return;
    archivedList = list;
    archivedState = "ready";
    rebuild();
  }, () => {
    if (asked !== epoch) return;
    archivedState = "failed";
    emit();
  });
}

/** Puts a closed campaign away, or brings it back. Resolves true once the server has done it, false when it refused (and said why). */
export function archiveCampaign(id: string, archived: boolean): Promise<boolean> {
  const real = resolveCampaignId(id);
  if (!LIVE) {
    const row = [...rows, ...archivedRows].find((r) => r.id === real);
    if (!row) return Promise.resolve(false);
    rows = rows.filter((r) => r.id !== real);
    archivedRows = archivedRows.filter((r) => r.id !== real);
    if (archived) archivedRows = [{ ...row, archived: true, status: "closed", updatedAgo: "Just now" }, ...archivedRows];
    else rows = [{ ...row, archived: false, updatedAgo: "Just now" }, ...rows];
    emit();
    return Promise.resolve(true);
  }
  const name = [...apiCampaigns, ...archivedList].find((c) => c.id === real)?.name ?? "The campaign";
  const before = [...apiCampaigns, ...archivedList].find((c) => c.id === real);
  return campaignsApi.archiveCampaign(real, archived).then((made) => {
    // The answer is the campaign alone; the list's figures (found, replied) are kept from the row it was.
    const c: ApiCampaign = { ...made, summary: made.summary ?? before?.summary ?? NEW_SUMMARY };
    if (archived) {
      apiCampaigns = apiCampaigns.filter((x) => x.id !== real);
      archivedList = [c, ...archivedList.filter((x) => x.id !== real)];
    } else {
      archivedList = archivedList.filter((x) => x.id !== real);
      apiCampaigns = [c, ...apiCampaigns.filter((x) => x.id !== real)];
    }
    rebuild();
    refreshCampaignAgents(real);
    return true;
  }, (err: unknown) => {
    reportProblem(`${name} wasn't ${archived ? "archived" : "brought back"}. ${messageOf(err)}`);
    return false;
  });
}

/** Deletes a closed campaign for good. Resolves true once the server has done it, false when it refused (and said why). */
export function deleteCampaign(id: string): Promise<boolean> {
  const real = resolveCampaignId(id);
  if (!LIVE) {
    rows = rows.filter((r) => r.id !== real);
    archivedRows = archivedRows.filter((r) => r.id !== real);
    emit();
    return Promise.resolve(true);
  }
  const name = [...apiCampaigns, ...archivedList].find((c) => c.id === real)?.name ?? "The campaign";
  return campaignsApi.deleteCampaign(real).then(() => {
    apiCampaigns = apiCampaigns.filter((x) => x.id !== real);
    archivedList = archivedList.filter((x) => x.id !== real);
    rebuild();
    return true;
  }, (err: unknown) => {
    reportProblem(`${name} wasn't deleted. ${messageOf(err)}`);
    return false;
  });
}

/** Whether the campaign list has arrived (or failed). Always true on fixtures. */
export function useCampaignsReady(): boolean {
  return useSyncExternalStore(subscribe(ensureCampaigns), () => !LIVE || (campaignsState !== "idle" && campaignsState !== "loading"));
}

export function campaignRow(id: string): CampaignRow | undefined {
  const real = resolveCampaignId(id);
  return rows.find((r) => r.id === real);
}

export function useCampaignRow(id: string): CampaignRow | undefined {
  const real = resolveCampaignId(id);
  return useCampaignRows().find((r) => r.id === real);
}

function patchRow(id: string, fn: (r: CampaignRow) => CampaignRow) {
  rows = rows.map((r) => (r.id === id ? fn(r) : r));
  emit();
}

export function setCampaignTeam(id: string, team: readonly string[]) {
  if (LIVE) { setTeamLive(resolveCampaignId(id), team); return; }
  patchRow(id, (r) => ({ ...r, team: [...team], updatedAgo: "Just now" }));
}

/** Resolves true once the status is set (at once on fixtures), false when the API refused and it was put back. */
export function setCampaignStatus(id: string, status: CampaignStatus, opts: { closeForms?: boolean } = {}): Promise<boolean> {
  if (LIVE) return setStatusLive(resolveCampaignId(id), status, opts.closeForms === true);
  patchRow(id, (r) => ({
    ...r, status, updatedAgo: "Just now",
    agents: status === "active" ? (r.agents.length ? r.agents : ["Sourcing"]) : [],
  }));
  return Promise.resolve(true);
}

/** Adds a campaign; resolves true once it's saved (at once on fixtures), false if it wasn't. */
export function addCampaignRow(row: CampaignRow): Promise<boolean> {
  if (LIVE) return createCampaignLive(row);
  rows = [row, ...rows];
  emit();
  return Promise.resolve(true);
}

/** A copy of a campaign, switched on, with the same brief and team and an empty pipeline. */
export function duplicateCampaign(id: string): CampaignRow | undefined {
  const r = campaignRow(id);
  if (!r) return undefined;
  const copy: CampaignRow = {
    ...r, id: `${r.id}-copy-${Date.now().toString(36)}`, name: `${r.name} (copy)`, status: "active",
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: r.trend.map(() => 0), agents: [], needs: "Role spec not approved", updatedAgo: "Just now", createdAgo: "Just now",
  };
  if (!LIVE) { rows = [copy, ...rows]; emit(); return copy; }
  const { needs: _, ...shown } = copy;
  void track(shown, campaignsApi.duplicateCampaign(r.id), `${r.name} wasn't duplicated.`);
  return shown;
}

/** Test-only: back to the seeded rows. */
export function resetCampaignRows() {
  rows = CAMPAIGN_ROWS;
  archivedRows = [];
  emit();
}

/* ── the team: who can be put on a campaign or own a client ── */

/* Fixtures demo with the seeded team; connected, nobody until the member list arrives. */
let team: readonly string[] = LIVE ? [] : TEAM;

/** Everyone in the organisation who can be given work, by name. */
export function useTeam(): readonly string[] {
  return useSyncExternalStore(subscribe(ensureMembers), () => team, () => team);
}

/**
 * The organisation's members as the API listed them, and whether the list has arrived. Connected
 * only; the fixtures' team is just names (`useTeam`). Read by whatever describes the workspace
 * itself, so it shares the one request the campaign list already makes.
 */
export function useMemberList(): { ready: boolean; members: readonly ApiMember[] } {
  const list = useSyncExternalStore(subscribe(ensureMembers), () => members);
  const ready = useSyncExternalStore(subscribe(ensureMembers), () => membersState === "ready");
  return { ready, members: list };
}

/**
 * A person's id from the name the pickers show, as the API wants it. Names are unique labels
 * (see `labelMembers`), so this can't pick the wrong one of two people called the same.
 */
export function memberIdOf(name: string): string | undefined {
  for (const [id, n] of people) if (n === name) return id;
  return undefined;
}

/** Names the pickers can show and map back: two members with one name get their email too. */
export function labelMembers(list: readonly { userId: string; fullName: string | null; email: string | null }[]) {
  /* A recruiter is not given a teammate's address: one with no name reads "A teammate". */
  const baseOf = (m: { fullName: string | null; email: string | null }) => m.fullName?.trim() || m.email || "A teammate";
  const counts = new Map<string, number>();
  for (const m of list) {
    const base = baseOf(m);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return list.map((m) => {
    const base = baseOf(m);
    return { userId: m.userId, label: (counts.get(base) ?? 0) > 1 && m.email ? `${base} (${m.email})` : base };
  });
}

/** Ids for names, and the names that no longer match anyone (removed since the picker opened). */
function idsFor(names: readonly string[]): { ids: string[]; missing: string[] } {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const n of names) {
    const id = memberIdOf(n);
    if (id) ids.push(id);
    else missing.push(n);
  }
  return { ids, missing };
}

function reportMissing(missing: readonly string[]) {
  if (!missing.length) return;
  reportProblem(
    `${missing.join(", ")} ${missing.length === 1 ? "isn't a member any more, so wasn't" : "aren't members any more, so weren't"} added.`,
  );
}

/* ═══════════════════════════ live: loading and reconciling ═══════════════════════════ */

/* Bumped when the workspace changes: an answer to a question asked in the last one is dropped. */
let epoch = 0;

let apiCampaigns: readonly ApiCampaign[] = [];
const overviews = new Map<string, ApiOverview>();
const activity = new Map<string, readonly ApiActivity[]>();
/* Campaigns made here that the API hasn't confirmed yet, and the ids they got. */
let pendingRows: readonly CampaignRow[] = [];
const pendingClientOf = new Map<string, string>();
const aliases = new Map<string, string>();
let campaignsState: "idle" | "loading" | "ready" | "failed" = "idle";

const boards = new Map<string, readonly ApiBoardRow[]>();
const boardState = new Map<string, "loading" | "ready" | "failed">();
/* A campaign's own stages (the board's columns): the server's, from the board read or a save; on fixtures, as edited here. */
const stageMap = new Map<string, readonly StageDef[]>();

let apiClients: readonly ApiClientRow[] = [];
const clientDetails = new Map<string, ApiClientDetail>();
const clientAliases = new Map<string, string>();
/* Clients as changed here, shown until the API's version replaces them. */
const overlay = new Map<string, Client>();
let clientsState: "idle" | "loading" | "ready" | "denied" | "failed" = "idle";

/** id → name for everyone the console has seen: members, owners, teams. */
const people = new Map<string, string>();
let members: readonly ApiMember[] = [];
let membersState: "idle" | "loading" | "ready" = "idle";
let me: string | null = null;

/** The id the API gave something this console created under a temporary one. */
export function resolveCampaignId(id: string): string { return aliases.get(id) ?? id; }
export function resolveClientId(id: string): string { return clientAliases.get(id) ?? id; }

const nameOfUser = (id: string | null): string => (id ? people.get(id) ?? "Unassigned" : "Unassigned");

/** A member's name by user id, once the member list or a campaign has named them. */
export const memberName = (id: string | null | undefined): string | undefined => (id ? people.get(id) : undefined);

function rebuildRows() {
  const now = Date.now();
  archivedRows = archivedList.map((c) => campaignsApi.rowFromApi(c, undefined, now));
  for (const c of apiCampaigns) {
    if (c.owner?.name) people.set(c.owner.id, c.owner.name);
    for (const p of c.team) if (p.name) people.set(p.id, p.name);
  }
  rows = [...pendingRows, ...apiCampaigns.map((c) => campaignsApi.rowFromApi(c, overviews.get(c.id), now))];
  rebuildClients();
}

function rebuildClients() {
  const listed = apiClients.map((r) => overlay.get(r.id) ?? clientsApi.clientFromApi(r, clientDetails.get(r.id)));
  const known = new Set(listed.map((c) => c.id));
  /* A client the list did not bring (it failed or was refused) is still named by the campaigns that have it. */
  const named = new Map<string, Client>();
  for (const c of apiCampaigns) {
    if (c.client && !known.has(c.client.id)) {
      named.set(c.client.id, normaliseClient({ id: c.client.id, name: c.client.name ?? "Client", manager: "", email: "", phone: "", notes: "" }));
    }
  }
  const creating = [...overlay.values()].filter((c) => !known.has(c.id) && !named.has(c.id));
  clients = [...listed, ...named.values(), ...creating];
  clientOf = {
    ...Object.fromEntries(apiCampaigns.flatMap((c) => (c.client ? [[c.id, c.client.id]] : []))),
    ...Object.fromEntries(pendingClientOf),
  };
  clientSnap = { clients, clientOf };
}

function rebuildTeam() {
  const labelled = labelMembers(members.filter((m) => m.status === "active"));
  for (const m of labelled) people.set(m.userId, m.label);
  team = labelled.length ? labelled.map((m) => m.label) : [...new Set(people.values())];
}

function rebuild() { rebuildRows(); rebuildTeam(); emit(); }

export function ensureCampaigns() {
  if (!LIVE || campaignsState !== "idle") return;
  campaignsState = "loading";
  ensureMembers();
  const asked = epoch;
  campaignsApi.listCampaigns().then((list) => {
    if (asked !== epoch) return;
    apiCampaigns = list;
    campaignsState = "ready";
    rebuild();
  }, (err: unknown) => {
    if (asked !== epoch) return;
    campaignsState = "failed";
    rebuild();
    reportProblem(`Campaigns didn't load. ${messageOf(err)}`);
  });
}

/** Asks for the campaign list again without clearing it: figures that moved elsewhere (a shortlist made in chat) catch up. */
let listedAt = 0;
export function refreshCampaignList(): void {
  if (!LIVE || campaignsState !== "ready" || Date.now() - listedAt < 4000) return;
  listedAt = Date.now();
  const asked = epoch;
  campaignsApi.listCampaigns().then((list) => {
    if (asked !== epoch) return;
    // A campaign being made keeps its own row; the list is the API's word for the rest.
    apiCampaigns = list.map((c) => {
      const setup = apiCampaigns.find((x) => x.id === c.id)?.setup;
      return setup && !c.setup ? { ...c, setup } : c;
    });
    rebuild();
  }, () => {});
}

/**
 * Something changed this campaign outside the store (people shortlisted from the chat, a role
 * spec that landed): its counts, its log and its board are read again.
 */
export function refreshCampaign(campaignId: string): void {
  const id = resolveCampaignId(campaignId);
  if (!LIVE || !id || pendingRows.some((r) => r.id === id)) return;
  refreshSoon(id);
  if (boardState.get(id) !== "ready") return;
  const asked = epoch;
  campaignsApi.boardRead(id).then((read) => {
    if (asked !== epoch) return;
    setBoard(id, read.candidates);
    if (read.stages) stageMap.set(id, stagesFrom(read.stages));
    emit();
  }, () => {});
}

/* A shortlist or a pass made in the chat or the ranked list changes the counts the list and the sidebar show. */
onDecision((campaignId) => refreshCampaign(campaignId));

function ensureMembers() {
  if (!LIVE || membersState !== "idle") return;
  membersState = "loading";
  const asked = epoch;
  campaignsApi.whoAmI().then((id) => { if (asked === epoch) me = id; }, () => {});
  /* A personal workspace has no member list; its people come from the campaigns. */
  campaignsApi.listMembers().then((list) => {
    if (asked !== epoch) return;
    members = list;
    for (const m of labelMembers(list)) people.set(m.userId, m.label);
    membersState = "ready";
    rebuild();
  }, () => { if (asked !== epoch) return; membersState = "ready"; rebuild(); });
}

/** The signed-in user's id, once known, so the log can say "You". */
export const currentUserId = () => me;

/* A single-campaign read carries setup but no summary, the list the reverse: keep what each lacks. */
function replaceCampaign(c: ApiCampaign) {
  const was = apiCampaigns.find((x) => x.id === c.id);
  const summary = c.summary ?? was?.summary ?? NEW_SUMMARY;
  const next = { ...c, summary, ...(c.setup || !was?.setup ? {} : { setup: was.setup }) };
  apiCampaigns = was ? apiCampaigns.map((x) => (x.id === c.id ? next : x)) : [next, ...apiCampaigns];
}

const NEW_SUMMARY: NonNullable<ApiCampaign["summary"]> = {
  found: 0,
  foundThisWeek: 0,
  sourcedPerDay: new Array<number>(14).fill(0),
  replied: 0,
  openTasks: 0,
};

function editCampaign(id: string, fn: (c: ApiCampaign) => ApiCampaign): ApiCampaign | undefined {
  const was = apiCampaigns.find((c) => c.id === id);
  if (!was) return undefined;
  apiCampaigns = apiCampaigns.map((c) => (c.id === id ? fn(c) : c));
  return was;
}

/** Shows a campaign that is being created, then swaps in the API's version under its real id. */
/**
 * Shows a campaign that is being created, then swaps in the API's version under its real id.
 * Resolves true once the server has it, so success is only ever said after it's true.
 */
function track(row: CampaignRow, made: Promise<ApiCampaign>, failure: string): Promise<boolean> {
  pendingRows = [{ ...row, loading: true }, ...pendingRows];
  rebuild();
  return made.then((c) => {
    aliases.set(row.id, c.id);
    pendingClientOf.delete(row.id);
    pendingRows = pendingRows.filter((r) => r.id !== row.id);
    replaceCampaign(c);
    rebuild();
    return true;
  }, (err: unknown) => {
    pendingRows = pendingRows.filter((r) => r.id !== row.id);
    pendingClientOf.delete(row.id);
    rebuild();
    reportProblem(`${failure} ${messageOf(err)}`);
    return false;
  });
}

function createCampaignLive(row: CampaignRow): Promise<boolean> {
  const clientId = row.setup?.clientId;
  if (clientId) pendingClientOf.set(row.id, clientId);
  reportMissing(idsFor(row.team).missing);
  const body = campaignsApi.createBodyFrom(row, memberIdOf);
  /* A client still being created is linked once it has its id. */
  const made = (clientId ? clientReady(clientId) : Promise.resolve(null))
    .then((real) => campaignsApi.createCampaign({ ...body, clientId: real }))
    /* A campaign opening for a client that was a prospect makes it an active one, on the server: read again. */
    .then((c) => { if (c.client) refreshClients(); return c; });
  return track(row, made, `${row.name} wasn't created.`);
}

const STATUS_VERB: Readonly<Record<CampaignStatus, string>> = { active: "reopened", closed: "closed" };

function setStatusLive(id: string, status: CampaignStatus, closeForms = false): Promise<boolean> {
  const was = editCampaign(id, (c) => ({ ...c, status, updatedAt: new Date().toISOString() }));
  if (!was) return Promise.resolve(false);
  rebuild();
  return campaignsApi.setCampaignStatus(id, status, closeForms).then((c) => { replaceCampaign(c); rebuild(); refreshCampaignAgents(id); return true; }, (err: unknown) => {
    editCampaign(id, () => was);
    rebuild();
    reportProblem(`${was.name} wasn't ${STATUS_VERB[status]}. ${messageOf(err)}`);
    return false;
  });
}

function setTeamLive(id: string, names: readonly string[]) {
  const { ids, missing } = idsFor(names);
  reportMissing(missing);
  const was = editCampaign(id, (c) => ({
    ...c,
    team: [
      ...c.team.filter((p) => p.role === "owner"),
      ...ids.filter((x) => x !== c.owner?.id).map((x) => ({ id: x, name: nameOfUser(x), role: "member" as const })),
    ],
  }));
  if (!was) return;
  rebuild();
  campaignsApi.setCampaignMembers(id, ids).then((c) => { replaceCampaign(c); rebuild(); }, (err: unknown) => {
    editCampaign(id, () => was);
    rebuild();
    reportProblem(`The recruiters on ${was.name} weren't changed. ${messageOf(err)}`);
  });
}

function linkClientLive(campaignId: string, clientId: string | null): Promise<boolean> {
  if (pendingRows.some((r) => r.id === campaignId)) {
    if (clientId) pendingClientOf.set(campaignId, clientId); else pendingClientOf.delete(campaignId);
    rebuild();
    return Promise.resolve(true);
  }
  const real = clientId ? resolveClientId(clientId) : null;
  const name = real ? clientById(real)?.name ?? null : null;
  const was = editCampaign(campaignId, (c) => ({ ...c, client: real ? { id: real, name } : null }));
  if (!was) return Promise.resolve(false);
  rebuild();
  return (clientId ? clientReady(clientId) : Promise.resolve(null)).then((id) => campaignsApi.patchCampaign(campaignId, { clientId: id })).then((c) => { replaceCampaign(c); rebuild(); if (c.client) refreshClients(); return true; }, (err: unknown) => {
    editCampaign(campaignId, () => was);
    rebuild();
    reportProblem(`The client on ${was.name} wasn't changed. ${messageOf(err)}`);
    return false;
  });
}

/* ── the board ── */

/* A move into or out of Hired changes who else shows them: other boards ("Hired at …"), the campaigns' hire counts,
   Candidates and Home. The store only says it happened (it cannot import the views); invalidate.ts reads them again. */
const hiredListeners = new Set<() => void>();
export function onHiredChange(fn: () => void): () => void {
  hiredListeners.add(fn);
  return () => { hiredListeners.delete(fn); };
}
const hiredChanged = () => { for (const fn of hiredListeners) fn(); };

/**
 * Passes everyone still open on a campaign (not hired, not passed): the rest, once its roles are filled. Only ever
 * asked for by a person. Answers how many were passed, or null when it was refused (the reason has been said).
 */
export async function passOpenPeople(campaignId: string, reason?: string): Promise<number | null> {
  if (!LIVE) {
    const open = get(campaignId).filter((p) => p.stage !== "hired" && p.stage !== "passed");
    for (const p of open) movePerson(campaignId, p.id, "passed", reason);
    return open.length;
  }
  const id = resolveCampaignId(campaignId);
  try {
    const { passed } = await campaignsApi.passOpen(id, reason);
    refreshCampaign(id);
    refreshCampaignsNow();
    return passed;
  } catch (err) {
    reportProblem(`Those people weren't rejected. ${messageOf(err)}`);
    return null;
  }
}

function setBoard(id: string, rows: readonly ApiBoardRow[]) {
  /* Newest arrival in a stage first, in every column and in the list: someone just added or moved is at the top. */
  const list = campaignsApi.orderBoard(rows);
  boards.set(id, list);
  state.set(id, list.map((r) => campaignsApi.personFromBoard(r, id, nameOfUser)));
}

export function ensureBoard(campaignId: string) {
  const id = resolveCampaignId(campaignId);
  if (!LIVE || !id || boardState.has(id) || pendingRows.some((r) => r.id === id)) return;
  boardState.set(id, "loading");
  ensureMembers();
  const asked = epoch;
  campaignsApi.boardRead(id).then((read) => {
    if (asked !== epoch) return;
    setBoard(id, read.candidates);
    if (read.stages) stageMap.set(id, stagesFrom(read.stages));
    boardState.set(id, "ready");
    emit();
  }, (err: unknown) => {
    if (asked !== epoch) return;
    boardState.set(id, "failed");
    emit();
    reportProblem(`This pipeline didn't load. ${messageOf(err)}`);
  });
}

/* ── hiring someone ──
   Moving a person into Hired takes them off every other shortlist, so it is never guessed at: the card stays where it is
   until the server says yes. When they are on other campaigns the server asks first (409 needs_confirm_hired, naming
   them); the store keeps that question for the dialog (HiredConfirm.tsx), and a yes tries again with removeFromOthers. */

/** The question waiting to be answered: who is being hired, and which other campaigns they would be removed from. */
export type HiredAsk = { campaignId: string; ccId: string; name: string; campaigns: { id: string; name: string }[]; to: MoveTo; reason?: string };
let hiredAsk: HiredAsk | null = null;
const setHiredAsk = (a: HiredAsk | null) => { hiredAsk = a; emit(); };
export function useHiredAsk(): HiredAsk | null {
  return useSyncExternalStore(plain, () => hiredAsk, () => hiredAsk);
}
/** The question waiting, outside React. */
export const hiredAskNow = (): HiredAsk | null => hiredAsk;
/** A "no": the card is where it was, nothing was changed. */
export function cancelHiredAsk(): void { if (hiredAsk) setHiredAsk(null); }
/** A "yes": hire them and take them off the other shortlists. */
export function confirmHiredAsk(): void {
  const a = hiredAsk;
  if (!a) return;
  setHiredAsk(null);
  moveLive(a.campaignId, a.ccId, a.to, a.reason, { removeFromOthers: true });
}

/** Told when someone has really been hired on a campaign (the server said yes), so its page can celebrate. */
const hiredLandedListeners = new Set<(e: { campaignId: string; ccId: string }) => void>();
export function onHiredLanded(fn: (e: { campaignId: string; ccId: string }) => void): () => void {
  hiredLandedListeners.add(fn);
  return () => { hiredLandedListeners.delete(fn); };
}

const hiring = new Set<string>();

/**
 * The campaigns the server named in its question, read tolerantly. `active`: the person is really on that campaign's
 * board (not rejected there), which is the only kind hiring takes them off in a way worth saying.
 */
export function askedCampaigns(details: Record<string, unknown> | undefined): { id: string; name: string; active: boolean }[] {
  const raw = Array.isArray(details?.campaigns) ? (details!.campaigns as unknown[]) : [];
  return raw.flatMap((c) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    if (typeof o.id !== "string") return [];
    const stage = typeof o.stage === "string" ? o.stage.toLowerCase() : "";
    const active = o.rejected !== true && o.active !== false && stage !== "passed" && stage !== "rejected";
    return [{ id: o.id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "another campaign", active }];
  });
}

/** Whether anyone has been hired in the organisation on a campaign other than this one: the first hire is the organisation's, not one campaign's. */
export function orgHasEarlierHire(campaignId: string): boolean {
  const id = resolveCampaignId(campaignId);
  return rows.some((r) => r.id !== id && (r.hires?.count ?? r.funnel.hired) > 0);
}

function moveLive(id: string, ccId: string, to: MoveTo, reason?: string, opts: { removeFromOthers?: boolean } = {}) {
  const list = boards.get(id);
  const before = list?.find((r) => r.campaignCandidateId === ccId);
  const person = state.get(id)?.find((p) => p.id === ccId);
  if (!list || !before || !person) return;
  const stages = stagesNow(id);
  /* By stage: the kind follows the column, and a step is kept inside the same kind. By status: the first stage of that kind. */
  const target = isStageMove(to) ? stageNamed(stages, to.stageId) : undefined;
  if (isStageMove(to) && (!target || !wouldMoveToStage(before, target, stages))) return;
  if (!isStageMove(to) && !wouldMove(before, to)) return;
  const { stage, step, column } = target
    ? (() => { const l = landing(before, target); return { stage: l.stage, step: l.step, column: l.stageId }; })()
    : { ...moveTarget(to as StatusId), column: columnFor(id, before.stage, moveTarget(to as StatusId).stage) };
  const remove = opts.removeFromOthers === true;
  /* A stage the server made is moved to by id; a guess of ours (default:…) can only be moved to by kind. */
  const send = () => (target && !isDefaultId(target.id)
    ? campaignsApi.moveCandidateToStage(id, ccId, target.id, reason, remove)
    : campaignsApi.moveCandidate(id, ccId, stage, reason, step, remove));
  const mv: Move = { id: `mv-${Date.now()}-${ccId}`, person, to: stage, at: Date.now() };
  if (stage === "hired" && before.stage !== "hired") {
    /* Into Hired: nothing is shown until the server agrees (no card flies, no count moves). */
    if (hiring.has(ccId)) return;
    hiring.add(ccId);
    send().then((row) => {
      hiring.delete(ccId);
      setBoard(id, campaignsApi.movedOnBoard(boards.get(id) ?? [], ccId, stage, step, column).map((r) => (r.campaignCandidateId === ccId ? row : r)));
      log.set(id, [mv, ...logFor(id)]);
      editCampaign(id, (c) => campaignsApi.shiftFunnel(c, before.stage, stage));
      rebuild();
      refreshSoon(id);
      hiredChanged();
      for (const fn of hiredLandedListeners) fn({ campaignId: id, ccId });
    }, (err: unknown) => {
      hiring.delete(ccId);
      if (err instanceof ApiError && err.code === "needs_confirm_hired") {
        const named = askedCampaigns(err.details);
        const active = named.filter((c) => c.active);
        /* Only campaigns they were already rejected from: nothing to say they lose, so there is nothing to ask. */
        if (named.length > 0 && active.length === 0) { moveLive(id, ccId, to, reason, { removeFromOthers: true }); return; }
        setHiredAsk({ campaignId: id, ccId, name: person.name, campaigns: active.map(({ id: cid, name }) => ({ id: cid, name })), to, ...(reason ? { reason } : {}) });
        return;
      }
      reportProblem(`${firstOf(person.name)} wasn't moved. ${messageOf(err)}`);
    });
    return;
  }
  setBoard(id, campaignsApi.movedOnBoard(list, ccId, stage, step, column));
  log.set(id, [mv, ...logFor(id)]);
  editCampaign(id, (c) => campaignsApi.shiftFunnel(c, before.stage, stage));
  rebuild();
  const sent = send();
  sent.then((row) => {
    setBoard(id, (boards.get(id) ?? []).map((r) => (r.campaignCandidateId === ccId ? row : r)));
    emit();
    refreshSoon(id);
    if (before.stage === "hired" || stage === "hired") hiredChanged();
  }, (err: unknown) => {
    setBoard(id, (boards.get(id) ?? []).map((r) => (r.campaignCandidateId === ccId ? before : r)));
    log.set(id, logFor(id).filter((m) => m !== mv));
    editCampaign(id, (c) => campaignsApi.shiftFunnel(c, stage, before.stage));
    rebuild();
    reportProblem(`${firstOf(person.name)} wasn't moved. ${messageOf(err)}`);
  });
}

function bulkMoveLive(id: string, ids: readonly string[], to: StatusId, reason?: string) {
  const list = boards.get(id);
  if (!list) return;
  const { stage, step } = moveTarget(to);
  const moving = list.filter((r) => ids.includes(r.campaignCandidateId) && wouldMove(r, to));
  if (!moving.length) return;
  setBoard(id, moving.reduce((acc, r) => campaignsApi.movedOnBoard(acc, r.campaignCandidateId, stage, step, columnFor(id, r.stage, stage)), list));
  editCampaign(id, (c) => moving.reduce((acc, r) => campaignsApi.shiftFunnel(acc, r.stage, stage), c));
  rebuild();
  campaignsApi.bulkMove(id, moving.map((r) => r.campaignCandidateId), stage, reason, step)
    .then(() => campaignsApi.boardRows(id))
    .then((fresh) => { setBoard(id, fresh); emit(); refreshSoon(id); if (stage === "hired" || moving.some((r) => r.stage === "hired")) hiredChanged(); }, (err: unknown) => {
      const before = new Map(moving.map((r) => [r.campaignCandidateId, r]));
      setBoard(id, (boards.get(id) ?? []).map((r) => before.get(r.campaignCandidateId) ?? r));
      editCampaign(id, (c) => moving.reduce((acc, r) => campaignsApi.shiftFunnel(acc, stage, r.stage), c));
      rebuild();
      reportProblem(`${moving.length} ${moving.length === 1 ? "person wasn't" : "people weren't"} moved. ${messageOf(err)}`);
    });
}

/**
 * Takes people off the campaign's board; they stay in Candidates. Only people still at the shortlist
 * stage go, and the answer is how many did.
 */
export function removeFromShortlist(campaignId: string, ids: readonly string[]): Promise<number> {
  if (!LIVE) {
    const list = get(campaignId);
    const gone = list.filter((p) => ids.includes(p.id) && p.stage === "shortlisted");
    if (gone.length) { state.set(campaignId, list.filter((p) => !gone.includes(p))); emit(); }
    return Promise.resolve(gone.length);
  }
  const id = resolveCampaignId(campaignId);
  const list = boards.get(id);
  const going = list?.filter((r) => ids.includes(r.campaignCandidateId) && r.stage === "shortlisted") ?? [];
  if (!list || !going.length) return Promise.resolve(0);
  setBoard(id, list.filter((r) => !going.includes(r)));
  editCampaign(id, (c) => ({ ...c, funnel: { ...c.funnel, shortlisted: Math.max(0, c.funnel.shortlisted - going.length) } }));
  rebuild();
  return campaignsApi.unshortlist(id, going.map((r) => r.campaignCandidateId)).then(({ removed }) => {
    // The server's board is the truth: someone moved a moment ago is still on it.
    void campaignsApi.boardRows(id).then((fresh) => { setBoard(id, fresh); emit(); refreshSoon(id); }, () => {});
    return removed;
  }, (err: unknown) => {
    setBoard(id, [...going, ...(boards.get(id) ?? [])]);
    editCampaign(id, (c) => ({ ...c, funnel: { ...c.funnel, shortlisted: c.funnel.shortlisted + going.length } }));
    rebuild();
    reportProblem(`${going.length === 1 ? "That person wasn't" : "Those people weren't"} taken off the shortlist. ${messageOf(err)}`);
    return 0;
  });
}

/* After a move, the overview, the log and the list's figures catch up in one go. */
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
function refreshSoon(id: string) {
  clearTimeout(refreshTimers.get(id));
  const asked = epoch;
  refreshTimers.set(id, setTimeout(() => {
    refreshTimers.delete(id);
    if (asked !== epoch) return;
    void Promise.all([
      campaignsApi.getCampaign(id).then(replaceCampaign),
      campaignsApi.campaignOverview(id).then((ov) => { overviews.set(id, ov); }),
      campaignsApi.campaignActivityPage(id).then((page) => { keepFirstPage(id, page); }),
    ]).then(() => { if (asked === epoch) rebuild(); }, () => {});
  }, 900));
}

/* ── the overview and the log ── */

const overviewState = new Map<string, "loading" | "ready" | "failed">();
function ensureOverview(campaignId: string) {
  const id = resolveCampaignId(campaignId);
  if (!LIVE || !id || overviewState.has(id) || pendingRows.some((r) => r.id === id)) return;
  overviewState.set(id, "loading");
  const asked = epoch;
  void Promise.all([
    overviews.has(id) ? null : campaignsApi.campaignOverview(id).then((ov) => { if (asked === epoch) overviews.set(id, ov); }),
    campaignsApi.campaignActivityPage(id).then((page) => { if (asked === epoch) keepFirstPage(id, page); }),
  ]).then(() => { if (asked !== epoch) return; overviewState.set(id, "ready"); rebuild(); }, () => {
    // Said in place on the page (useOverviewFailed), not as a toast that vanishes.
    if (asked !== epoch) return;
    overviewState.set(id, "failed");
    rebuild();
  });
}

/** True when the overview or its log couldn't be loaded. */
export function useOverviewFailed(campaignId: string): boolean {
  return useSyncExternalStore(subscribe(() => ensureOverview(campaignId)), () =>
    overviewState.get(resolveCampaignId(campaignId)) === "failed");
}

export function retryOverview(campaignId: string) {
  const id = resolveCampaignId(campaignId);
  overviewState.delete(id);
  ensureOverview(id);
  rebuild();
}

/** The campaign's overview from the API; undefined on fixtures or until it arrives. */
export function useCampaignOverview(campaignId: string): ApiOverview | undefined {
  return useSyncExternalStore(subscribe(() => ensureOverview(campaignId)), () => overviews.get(resolveCampaignId(campaignId)));
}

/* Where the log continues past what is loaded; null when nothing older is left. */
const olderFrom = new Map<string, string | null>();

/* A refreshed first page replaces the newest entries but keeps older pages already loaded. */
function keepFirstPage(id: string, page: { items: readonly ApiActivity[]; nextBefore: string | null }) {
  const loaded = activity.get(id) ?? [];
  const fresh = new Set(page.items.map((a) => a.id));
  const oldest = page.items.at(-1)?.id;
  const older = oldest ? loaded.filter((a) => !fresh.has(a.id) && BigInt(a.id) < BigInt(oldest)) : [];
  activity.set(id, [...page.items, ...older]);
  if (!older.length) olderFrom.set(id, page.nextBefore);
}

/** Whether the log has older entries than those loaded. */
export function useActivityHasOlder(campaignId: string): boolean {
  return useSyncExternalStore(subscribe(() => ensureOverview(campaignId)), () => !!olderFrom.get(resolveCampaignId(campaignId)));
}

/** Loads the next page of older entries onto the log. */
export async function loadOlderActivity(campaignId: string): Promise<void> {
  const id = resolveCampaignId(campaignId);
  const before = olderFrom.get(id);
  if (!before) return;
  const asked = epoch;
  try {
    const page = await campaignsApi.campaignActivityPage(id, before);
    if (asked !== epoch) return;
    const loaded = activity.get(id) ?? [];
    const known = new Set(loaded.map((a) => a.id));
    activity.set(id, [...loaded, ...page.items.filter((a) => !known.has(a.id))]);
    olderFrom.set(id, page.nextBefore);
    rebuild();
  } catch (err) {
    reportProblem(`Older activity didn't load. ${messageOf(err)}`);
  }
}

/** The campaign's activity log, newest first; undefined on fixtures or until it arrives. */
export function useCampaignActivity(campaignId: string): readonly ApiActivity[] | undefined {
  return useSyncExternalStore(subscribe(() => ensureOverview(campaignId)), () => activity.get(resolveCampaignId(campaignId)));
}

/* ── the campaign's agents ── */

const agentReaders = new Map<string, Set<() => void>>();
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How often the panel looks again: quickly while a search runs, in the background otherwise. */
const AGENTS_BUSY_MS = 3_000;
const AGENTS_QUIET_MS = 15_000;

/**
 * What the campaign's agents are doing (the Overview's panel), read from the server while the panel is
 * on screen. Null until it arrives, and always null on fixtures, which have no agents to ask.
 */
export function useCampaignAgents(campaignId: string): ApiCampaignAgents | null {
  const id = resolveCampaignId(campaignId);
  const [agents, setAgents] = useState<ApiCampaignAgents | null>(null);
  useEffect(() => {
    if (!LIVE || !UUID_ID.test(id)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const asked = epoch;
    const load = () => {
      clearTimeout(timer);
      campaignsApi.campaignAgents(id).then((a) => {
        if (stopped || asked !== epoch) return;
        setAgents(a);
        timer = setTimeout(load, a.sourcing.state === "working" ? AGENTS_BUSY_MS : AGENTS_QUIET_MS);
      }, () => {
        if (!stopped) timer = setTimeout(load, AGENTS_QUIET_MS * 2);
      });
    };
    load();
    const readers = agentReaders.get(id) ?? new Set<() => void>();
    readers.add(load);
    agentReaders.set(id, readers);
    return () => {
      stopped = true;
      clearTimeout(timer);
      readers.delete(load);
    };
  }, [id]);
  return LIVE ? agents : null;
}

/** Something the panel shows has changed (a search started, a message approved): read it again now. */
export function refreshCampaignAgents(campaignId: string): void {
  for (const load of agentReaders.get(resolveCampaignId(campaignId)) ?? []) load();
}

/* ── clients ── */

/** Starts reading the campaigns and the clients (once); what a page does by drawing, for code outside React. */
export function ensureClients(): void { ensureClientsAndCampaigns(); }

function ensureClientsAndCampaigns() {
  ensureCampaigns();
  if (!LIVE || clientsState !== "idle") return;
  // A recruiter reads the clients of the campaigns they can see (the API leaves out the fee, notes and activity
  // for them): their industry, owner and contact are real, so they are asked for like anyone's.
  clientsState = "loading";
  const asked = epoch;
  clientsApi.listClients().then((list) => {
    if (asked !== epoch) return;
    apiClients = list;
    clientsState = "ready";
    rebuild();
  }, (err: unknown) => {
    if (asked !== epoch) return;
    // A refusal means "not for you"; anything else is a load to try again.
    clientsState = err instanceof ApiError && err.status === 403 ? "denied" : "failed";
    rebuild();
  });
}

/** Loads a client's contacts, notes and log, for its page. */
export function ensureClientDetail(id: string) {
  const real = resolveClientId(id);
  if (!LIVE || clientDetails.has(real) || !apiClients.some((c) => c.id === real)) return;
  const asked = epoch;
  clientsApi.getClient(real).then((d) => { if (asked === epoch) storeDetail(d); }, () => {});
}

function storeDetail(d: ApiClientDetail) {
  clientDetails.set(d.client.id, d);
  apiClients = apiClients.some((r) => r.id === d.client.id)
    ? apiClients.map((r) => (r.id === d.client.id ? d.client : r))
    : [...apiClients, d.client];
  rebuild();
}

/* Resolves to a client's real id once a create in flight lands. */
const clientMade = new Map<string, Promise<string>>();
export function clientReady(id: string): Promise<string> {
  return clientMade.get(id) ?? Promise.resolve(resolveClientId(id));
}

function createClientLive(c: Client) {
  const ownerId = c.owner ? memberIdOf(c.owner) : undefined;
  const made = clientsApi.createClient({
    ...clientsApi.clientBody(c),
    ...(ownerId ? { ownerId } : {}),
    contacts: (c.contacts ?? []).map(({ id: __, ...x }) => clientsApi.contactBody(x)),
  }).then((d) => {
    clientAliases.set(c.id, d.client.id);
    overlay.delete(c.id);
    storeDetail(d);
    if (typeof window !== "undefined" && window.location.hash.includes(c.id)) {
      history.replaceState(null, "", window.location.hash.replace(c.id, d.client.id));
    }
    return d.client.id;
  });
  clientMade.set(c.id, made);
  made.catch((err: unknown) => {
    overlay.delete(c.id);
    rebuild();
    reportProblem(`${c.name} wasn't added. ${messageOf(err)}`);
  });
}

/* An edit from the client form: the client's own fields, then the primary contact it shows. */
function saveClientLive(was: Client, next: Client) {
  const owner = next.owner === was.owner ? {} : { ownerId: next.owner ? memberIdOf(next.owner) ?? null : null };
  const wasPrimary = was.contacts?.find((x) => x.primary);
  const typed = next.contacts?.find((x) => x.primary);
  const contactChanged = typed && (!wasPrimary || typed.name !== wasPrimary.name || typed.title !== wasPrimary.title
    || typed.email !== wasPrimary.email || typed.phone !== wasPrimary.phone);
  clientWrite(was.id, async () => {
    await clientsApi.updateClient(was.id, { ...clientsApi.clientBody(next), ...owner });
    if (!contactChanged || !typed) return;
    /* Edit the contact the API knows as primary; a list row's stand-in id is not one. */
    const real = clientDetails.get(was.id)?.contacts.find((x) => x.primary) ?? (await clientsApi.getClient(was.id)).contacts.find((x) => x.primary);
    const { id: _, ...fields } = typed;
    await (real ? clientsApi.updateContact(was.id, real.id, clientsApi.contactBody(fields)) : clientsApi.addContact(was.id, clientsApi.contactBody(fields)));
  }, `Changes to ${was.name} weren't saved.`);
}

/** Runs a client write; then the API's version of the client replaces the guess, or the guess is dropped. */
function clientWrite(id: string, write: () => Promise<unknown>, failure: string) {
  const real = resolveClientId(id);
  write().then(() => clientsApi.getClient(real)).then((d) => { overlay.delete(id); storeDetail(d); }, (err: unknown) => {
    overlay.delete(id);
    rebuild();
    reportProblem(`${failure} ${messageOf(err)}`);
  });
}

/* ── loads that failed, and trying again ── */

/** Whether the campaign list failed to load, so a page can say so instead of showing "none". */
export function useCampaignsFailed(): boolean {
  return useSyncExternalStore(subscribe(ensureCampaigns), () => LIVE && campaignsState === "failed");
}

export function retryCampaigns() {
  if (campaignsState !== "failed") return;
  campaignsState = "idle";
  ensureCampaigns();
  emit();
}

/** Whether the clients list (or the campaigns its figures come from) failed to load. */
export function useClientsFailed(): boolean {
  return useSyncExternalStore(subscribe(ensureClientsAndCampaigns), () => LIVE && (clientsState === "failed" || campaignsState === "failed"));
}

export function retryClients() {
  if (clientsState === "failed") clientsState = "idle";
  if (campaignsState === "failed") campaignsState = "idle";
  ensureClientsAndCampaigns();
  emit();
}

/** Whether a campaign's pipeline failed to load. */
export function usePipelineFailed(campaignId: string): boolean {
  return useSyncExternalStore(subscribe(() => ensureBoard(campaignId)), () => LIVE && boardState.get(resolveCampaignId(campaignId)) === "failed");
}

export function retryPipeline(campaignId: string) {
  const id = resolveCampaignId(campaignId);
  if (boardState.get(id) !== "failed") return;
  boardState.delete(id);
  ensureBoard(id);
  emit();
}

/* ── a new workspace: nothing carries over from the last one ── */

/**
 * Forgets everything loaded for the workspace that was showing, so the next one starts clean:
 * its campaigns, clients, people, boards, logs and anything still on its way. Readers that are
 * mounted ask again as they re-render. Also for tests.
 */
export function resetCampaignStore(): void {
  epoch += 1;
  hiredAsk = null;
  hiring.clear();
  for (const t of refreshTimers.values()) clearTimeout(t);
  refreshTimers.clear();
  state.clear();
  log.clear();
  boards.clear();
  boardState.clear();
  stageMap.clear();
  overviews.clear();
  activity.clear();
  overviewState.clear();
  olderFrom.clear();
  apiCampaigns = [];
  archivedList = [];
  archivedRows = [];
  archivedState = "idle";
  pendingRows = [];
  pendingClientOf.clear();
  aliases.clear();
  campaignsState = "idle";
  listedAt = 0;
  apiClients = [];
  clientDetails.clear();
  clientAliases.clear();
  clientMade.clear();
  overlay.clear();
  clientsState = "idle";
  people.clear();
  members = [];
  membersState = "idle";
  me = null;
  team = LIVE ? [] : TEAM;
  rows = LIVE ? [] : CAMPAIGN_ROWS;
  clients = LIVE ? [] : [...CLIENT_SEED];
  clientOf = LIVE ? {} : { ...SEED_CLIENT_OF };
  clientSnap = { clients, clientOf };
  emit();
}
onWorkspaceChange(resetCampaignStore);

/* ── asked again from outside (invalidate.ts: the agent changed something, or a page is looked at again) ── */

/** Every campaign this console has opened is read again, quietly: its counts, board and log. */
export function refreshOpenCampaigns(): void {
  for (const id of new Set([...boards.keys(), ...overviews.keys()])) refreshCampaign(id);
}

/** The campaign list again now, whatever the age of the last read: the counts on a row can have moved. */
export function refreshCampaignsNow(): void {
  listedAt = 0;
  refreshCampaignList();
}

/** The clients again, and the detail of any that has been opened. */
export function refreshClients(): void {
  if (!LIVE || clientsState === "idle" || clientsState === "denied") return;
  const asked = epoch;
  clientsApi.listClients().then((list) => {
    if (asked !== epoch) return;
    apiClients = list;
    clientsState = "ready";
    rebuild();
    for (const id of [...clientDetails.keys()]) {
      clientsApi.getClient(id).then((d) => { if (asked === epoch) storeDetail(d); }, () => {});
    }
  }, () => {});
}

/** The member list again (someone joined, or a role changed). */
export function refreshMembers(): void {
  if (!LIVE || membersState === "idle") return;
  membersState = "idle";
  ensureMembers();
}
