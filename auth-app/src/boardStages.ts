import "./stageHues.css";
import type { ClientVerdict, StageColor, StageDef, StagesBody, StageInput, WorkingKind } from "./api/stages";
import { WORKING_KINDS } from "./api/stages";
import type { MoveTo, PipelinePerson, StageId, Step } from "./campaign";
import type { CampaignStage, StageKind } from "./campaignsData";
import { STAGE_HUES, stageHue } from "./stageDonut";
import type { StatusTone } from "./statusTones";

/**
 * A campaign's own board: its stages (the columns), where a card sits among them, and the editor's model for
 * changing them. Plain functions, so every rule is checked without a browser.
 *
 * The idea in one line: a stage has a name the campaign chose and a KIND the numbers go by. A card's `stage` stays
 * the kind (every count and analytic reads it); its `stageId` says which column it is in.
 */

export type { StageDef, StageColor, WorkingKind } from "./api/stages";

/** The longest a stage's name may be, and how many working stages a board holds besides Hired and Rejected. */
export const NAME_MAX = 24;
export const MAX_WORKING = 6;

/* ── the stages a board has ── */

/** A stage that is the console's own guess (an older server, a fixture): its id says so. */
export const DEFAULT_PREFIX = "default:";
export const isDefaultId = (id: string): boolean => id.startsWith(DEFAULT_PREFIX);

const LABEL: Readonly<Record<StageKind, string>> = {
  shortlisted: "Shortlisted", outreach: "In outreach", interviewing: "Interviewing", hired: "Hired", passed: "Rejected",
};

/** What each kind is called when the campaign has not named it: the console's own five. */
export const kindLabel = (kind: StageKind): string => LABEL[kind];

/** The five stages every campaign had before it could name its own. */
export const DEFAULT_STAGES: readonly StageDef[] = (["shortlisted", "outreach", "interviewing", "hired", "passed"] as const).map((kind, position) => ({
  id: `${DEFAULT_PREFIX}${kind}`, name: LABEL[kind], kind, position, color: null, clientView: false, locked: kind === "hired" || kind === "passed",
}));

const isHue = (k: unknown): k is StageColor => typeof k === "string" && (STAGE_HUES as readonly string[]).includes(k);
const isKind = (k: unknown): k is StageKind => k === "shortlisted" || k === "outreach" || k === "interviewing" || k === "hired" || k === "passed";
const lockedKind = (kind: StageKind): boolean => kind === "hired" || kind === "passed";

/**
 * The stages as the server sent them, in column order, with Hired and Rejected kept at the end whatever came. Anything
 * that is not a stage is dropped; a list with nothing in it is the console's own five.
 */
export function stagesFrom(raw: readonly unknown[] | null | undefined): readonly StageDef[] {
  const out: StageDef[] = [];
  for (const s of raw ?? []) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string" || !o.name.trim() || !isKind(o.kind)) continue;
    out.push({
      id: o.id, name: o.name.trim(), kind: o.kind, position: typeof o.position === "number" ? o.position : out.length,
      color: isHue(o.color) ? o.color : null, clientView: o.clientView === true, locked: o.locked === true || lockedKind(o.kind),
      ...(typeof o.count === "number" ? { count: Math.max(0, Math.round(o.count)) } : {}),
    });
  }
  if (!out.length) return DEFAULT_STAGES;
  const working = out.filter((s) => !lockedKind(s.kind)).sort((a, b) => a.position - b.position);
  const hired = out.find((s) => s.kind === "hired") ?? DEFAULT_STAGES[3]!;
  const passed = out.find((s) => s.kind === "passed") ?? DEFAULT_STAGES[4]!;
  return [...working, hired, passed].map((s, position) => ({ ...s, position }));
}

/** The list's own summary of a campaign's stages (name, kind, colour, headcount) as stages, for the moments the board has not loaded. */
export const stagesFromSummary = (list: readonly CampaignStage[]): readonly StageDef[] =>
  stagesFrom(list.map((s, position) => ({ ...s, position, clientView: false })));

/** The columns the board draws: every stage but Passed, which is the bin and its dialog. */
export const columnsOf = (stages: readonly StageDef[]): readonly StageDef[] => stages.filter((s) => s.kind !== "passed");
/** The stages a person chose (not Hired, not Passed). */
export const workingOf = (stages: readonly StageDef[]): readonly StageDef[] => stages.filter((s) => !lockedKind(s.kind));
export const firstOfKind = (stages: readonly StageDef[], kind: StageKind): StageDef | undefined => stages.find((s) => s.kind === kind);
/** The stage the client is shown, when there is one. */
export const clientStageOf = (stages: readonly StageDef[]): StageDef | undefined => stages.find((s) => s.clientView);

/** The id of the column a person is in: their own `stageId` when the board has it, else the first stage of their kind. */
export function stageIdOf(p: Pick<PipelinePerson, "stage" | "stageId">, stages: readonly StageDef[]): string {
  if (p.stageId && stages.some((s) => s.id === p.stageId)) return p.stageId;
  return firstOfKind(stages, p.stage)?.id ?? p.stageId ?? `${DEFAULT_PREFIX}${p.stage}`;
}

export const stageOf = (p: Pick<PipelinePerson, "stage" | "stageId">, stages: readonly StageDef[]): StageDef | undefined => {
  const id = stageIdOf(p, stages);
  return stages.find((s) => s.id === id);
};

/** People by column, in the order they came. A person whose stage is unknown sits in the first stage of their kind. */
export function groupByStage<P extends Pick<PipelinePerson, "stage" | "stageId">>(people: readonly P[], stages: readonly StageDef[]): Map<string, P[]> {
  const by = new Map<string, P[]>(stages.map((s) => [s.id, []]));
  for (const p of people) {
    const id = stageIdOf(p, stages);
    (by.get(id) ?? by.set(id, []).get(id)!).push(p);
  }
  return by;
}

/* ── moving ── */

const STEP_OF: Readonly<Record<StageId, Step>> = { shortlisted: null, outreach: "waiting", interviewing: "loop", hired: null, passed: null };

/** Where a move to one of the campaign's stages puts a person: the kind follows, and the step is kept inside the same kind. */
export function landing(p: Pick<PipelinePerson, "stage" | "step">, to: StageDef): { stage: StageId; step: Step; stageId: string } {
  return { stage: to.kind, step: to.kind === p.stage ? p.step : STEP_OF[to.kind], stageId: to.id };
}

/** Whether a move by stage would change anything. */
export const wouldMoveToStage = (p: Pick<PipelinePerson, "stage" | "stageId">, to: StageDef, stages: readonly StageDef[]): boolean =>
  stageIdOf(p, stages) !== to.id;

export const isStageMove = (to: MoveTo): to is { stageId: string } => typeof to === "object";

/** The stage a "move by stage" names, if the board has it. */
export const stageNamed = (stages: readonly StageDef[], id: string): StageDef | undefined => stages.find((s) => s.id === id);

/* ── how a stage's name is coloured ── */

export type StageText = { className: "sc"; "data-sc": StageColor };

/**
 * The attributes that colour a stage's name as TEXT (never a dot, never a pill). The colour is stageDonut's `stageHue`,
 * the one place that says what colour a stage is: the campaign's own colour when it chose one, else the colour of its
 * kind. Hired and Rejected are always the same colour, whatever they were given. So the board's column titles, its
 * strip, the stage donut and its tooltip all draw a stage in one colour.
 */
export function stageText(s: Pick<StageDef, "kind" | "color">, position?: number): StageText {
  return { className: "sc", "data-sc": stageHue(s, position) };
}

/** What a client's word is called on a card, and the tone it is coloured in (the same greens and red-browns the statuses use). */
export const verdictLabel = (v: ClientVerdict["verdict"]): string => (v === "approved" ? "Client approved" : "Client rejected");
export const verdictTone = (v: ClientVerdict["verdict"]): StatusTone => (v === "approved" ? "replied" : "passed");

/* ── the editor: the working stages as rows ── */

export type StageRow = {
  /** Stable while editing; a new row has no `id` until the server makes it. */
  key: string;
  id?: string;
  name: string;
  kind: WorkingKind;
  color: StageColor | null;
  clientView: boolean;
  /** People in it now, so removing it can ask where they go. */
  count: number;
};

let seq = 0;
const nextKey = (): string => `row-${++seq}`;

const asWorking = (kind: StageKind): WorkingKind => (WORKING_KINDS as readonly string[]).includes(kind) ? (kind as WorkingKind) : "shortlisted";

/** The working stages of a board as editor rows. `counts` is the people in each, by stage id. */
export function rowsFrom(stages: readonly StageDef[], counts: Readonly<Record<string, number>> = {}): StageRow[] {
  return workingOf(stages).map((s) => ({
    key: nextKey(),
    id: s.id,
    name: s.name, kind: asWorking(s.kind), color: s.color, clientView: s.clientView,
    count: counts[s.id] ?? s.count ?? 0,
  }));
}

/** What the Counts-as choice starts at for the row after `rows[i - 1]`: the kind of the stage above it. */
export const kindAbove = (rows: readonly StageRow[], index: number): WorkingKind => rows[index - 1]?.kind ?? rows[0]?.kind ?? "shortlisted";

const RESERVED = ["hired", "rejected"];

/** A name for a new stage that no other row has. */
function freshName(rows: readonly StageRow[]): string {
  const taken = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? "New stage" : `New stage ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** A new stage at the end of the working stages; it counts as whatever the stage above it counts as. */
export function addRow(rows: readonly StageRow[], name?: string): StageRow[] {
  if (rows.length >= MAX_WORKING) return [...rows];
  return [...rows, { key: nextKey(), name: name ?? freshName(rows), kind: kindAbove(rows, rows.length), color: null, clientView: false, count: 0 }];
}

export const removeRow = (rows: readonly StageRow[], key: string): StageRow[] => rows.filter((r) => r.key !== key);

/** One place up or down, or the same list when there is nowhere to go. */
export function moveRow(rows: readonly StageRow[], key: string, by: -1 | 1): StageRow[] {
  const i = rows.findIndex((r) => r.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= rows.length) return [...rows];
  const next = [...rows];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * Whether what a stage counts as is fixed for now: a stage that already has people in it keeps its kind (the numbers
 * they are in would change under them). Move them out first, or into another stage, and it can change.
 */
export const kindLocked = (r: Pick<StageRow, "id" | "count">): boolean => !!r.id && !isDefaultId(r.id) && r.count > 0;

/** Changes one row. Showing a stage to the client takes it off any other: only one is ever shown. */
export function patchRow(rows: readonly StageRow[], key: string, patch: Partial<Pick<StageRow, "name" | "kind" | "color" | "clientView">>): StageRow[] {
  return rows.map((r) => {
    if (r.key === key) {
      const { kind, ...rest } = patch;
      return { ...r, ...rest, ...(kind && !kindLocked(r) ? { kind } : {}) };
    }
    return patch.clientView === true && r.clientView ? { ...r, clientView: false } : r;
  });
}

export type PresetId = "standard" | "client";
export const PRESETS: readonly { id: PresetId; label: string; hint: string }[] = [
  { id: "standard", label: "Standard", hint: "Shortlisted, Outreach, Interviewing" },
  { id: "client", label: "With client review", hint: "A stage your client sees and answers" },
];

const PRESET_ROWS: Readonly<Record<PresetId, readonly { name: string; kind: WorkingKind; clientView?: boolean }[]>> = {
  standard: [
    { name: "Shortlisted", kind: "shortlisted" },
    { name: "Outreach", kind: "outreach" },
    { name: "Interviewing", kind: "interviewing" },
  ],
  client: [
    { name: "Shortlisted", kind: "shortlisted" },
    { name: "Outreach", kind: "outreach" },
    { name: "Client review", kind: "interviewing", clientView: true },
    { name: "Interviewing", kind: "interviewing" },
  ],
};

/**
 * A preset's stages. A stage the board already has under the same name keeps its place in the board (its id, its
 * colour, its people); the rest are new, and whatever the preset leaves out is removed.
 */
export function presetRows(preset: PresetId, current: readonly StageRow[] = []): StageRow[] {
  const pool = [...current];
  return PRESET_ROWS[preset].map((p) => {
    const at = pool.findIndex((r) => r.name.trim().toLowerCase() === p.name.toLowerCase());
    const kept = at >= 0 ? pool.splice(at, 1)[0] : undefined;
    return kept
      ? { ...kept, kind: kindLocked(kept) ? kept.kind : p.kind, clientView: p.clientView === true }
      : { key: nextKey(), name: p.name, kind: p.kind, color: null, clientView: p.clientView === true, count: 0 };
  });
}

/** Which preset the rows are exactly (by name, kind and the client's stage), if any. */
export function presetOf(rows: readonly StageRow[]): PresetId | null {
  const same = (id: PresetId) => PRESET_ROWS[id].length === rows.length
    && PRESET_ROWS[id].every((p, i) => rows[i]!.name.trim().toLowerCase() === p.name.toLowerCase() && rows[i]!.kind === p.kind && rows[i]!.clientView === (p.clientView === true));
  return same("standard") ? "standard" : same("client") ? "client" : null;
}

/** What is wrong with a row, in the words the editor shows under it; none for a row that is fine. */
export function rowProblems(rows: readonly StageRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = r.name.trim().toLowerCase();
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) out[r.key] = "Give this stage a name.";
    else if (name.length > NAME_MAX) out[r.key] = `Keep it to ${NAME_MAX} letters or fewer.`;
    else if (RESERVED.includes(name.toLowerCase())) out[r.key] = `${name} is always there at the end.`;
    else if ((seen.get(name.toLowerCase()) ?? 0) > 1) out[r.key] = "Another stage has this name.";
  }
  return out;
}

/** Whether the rows may be saved: at least one stage, none too many, every name fine. */
export const canSaveRows = (rows: readonly StageRow[]): boolean =>
  rows.length >= 1 && rows.length <= MAX_WORKING && Object.keys(rowProblems(rows)).length === 0;

/** Stages that were on the board, are gone from the rows, and had people in them. */
export function removedWithPeople(before: readonly StageDef[], rows: readonly StageRow[], counts: Readonly<Record<string, number>> = {}): StageDef[] {
  const kept = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  return workingOf(before).filter((s) => !kept.has(s.id) && (counts[s.id] ?? s.count ?? 0) > 0);
}

/**
 * Where the people of a removed stage go by default: the nearest stage left that counts as the same kind, else the
 * nearest stage left at all ("nearest" by where the stages sat on the board, the one above winning a tie). Only a
 * stage the board already has can be named (a new one has no id yet); null when there is none.
 */
export function defaultMoveTo(removed: Pick<StageDef, "kind" | "position">, rows: readonly StageRow[], before: readonly StageDef[]): string | null {
  const have = rows.flatMap((r) => {
    const was = r.id ? before.find((s) => s.id === r.id) : undefined;
    return r.id && was ? [{ id: r.id, kind: r.kind, at: was.position }] : [];
  });
  if (!have.length) return null;
  const same = have.filter((h) => h.kind === removed.kind);
  const pool = same.length ? same : have;
  const near = [...pool].sort((a, b) => Math.abs(a.at - removed.position) - Math.abs(b.at - removed.position) || a.at - b.at);
  return near[0]!.id;
}

/** The wire body for a save. `moveTo` names where each removed stage's people go (only stages the server knows). */
export function bodyOf(rows: readonly StageRow[], moveTo: Readonly<Record<string, string>> = {}): StagesBody {
  const stages: StageInput[] = rows.map((r) => ({
    /* A stage the console only guessed at (default:…) is not one the server knows. */
    ...(r.id && !isDefaultId(r.id) ? { id: r.id } : {}),
    name: r.name.trim(), kind: r.kind, color: r.color, clientView: r.clientView,
  }));
  const known = Object.entries(moveTo).filter(([from, to]) => !isDefaultId(from) && !isDefaultId(to));
  return { stages, ...(known.length ? { moveTo: Object.fromEntries(known) } : {}) };
}

/**
 * Rows chosen before a campaign existed, given the ids of the stages it was made with where the names match, so
 * saving them renames and reorders the stages it has instead of dropping and making them again.
 */
export function adoptIds(rows: readonly StageRow[], existing: readonly StageDef[]): StageRow[] {
  const pool = workingOf(existing).filter((s) => !isDefaultId(s.id));
  return rows.map((r) => {
    if (r.id) return r;
    const at = pool.findIndex((s) => s.name.trim().toLowerCase() === r.name.trim().toLowerCase());
    const hit = at >= 0 ? pool.splice(at, 1)[0] : undefined;
    return hit ? { ...r, id: hit.id } : r;
  });
}

/** Whether the rows are the board as it is: nothing to save. */
export function sameAsBoard(rows: readonly StageRow[], stages: readonly StageDef[]): boolean {
  const had = workingOf(stages);
  return had.length === rows.length && had.every((s, i) => {
    const r = rows[i]!;
    return r.id === s.id && r.name.trim() === s.name && r.kind === s.kind && r.color === s.color && r.clientView === s.clientView;
  });
}

/* ── the same, without a server (fixtures) ── */

let localSeq = 0;

/** The board's stages after a save, made here: new rows get an id, Hired and Rejected stay as they were. */
export function stagesFromRows(rows: readonly StageRow[], before: readonly StageDef[]): readonly StageDef[] {
  const hired = before.find((s) => s.kind === "hired") ?? DEFAULT_STAGES[3]!;
  const passed = before.find((s) => s.kind === "passed") ?? DEFAULT_STAGES[4]!;
  const working: StageDef[] = rows.map((r, position) => ({
    id: r.id ?? `local-${++localSeq}`, name: r.name.trim(), kind: r.kind, position, color: r.color, clientView: r.clientView, locked: false,
  }));
  return [...working, hired, passed].map((s, position) => ({ ...s, position }));
}

/** The people of removed stages move to `moveTo[id]`, else where `defaultMoveTo` says, else the first working stage left. */
export function destinationFor(
  removed: StageDef, rows: readonly StageRow[], moveTo: Readonly<Record<string, string>>, before: readonly StageDef[], after: readonly StageDef[],
): StageDef | undefined {
  const named = moveTo[removed.id];
  if (named) return after.find((s) => s.id === named);
  const byDefault = defaultMoveTo(removed, rows, before);
  return after.find((s) => s.id === byDefault) ?? workingOf(after)[0];
}


/**
 * The word for where someone is within their stage, in the tone of its chip: Replied, Waiting, Offer out, In loop.
 * Once the client has answered about a person, "Waiting" is no longer true of them (it was the client's answer being
 * waited for), so it is left off; the client's word is on the card instead.
 */
export function stepChip(p: Pick<PipelinePerson, "step" | "clientVerdict">): { text: string; tone: "good" | "quiet" | "warm" } | null {
  if (p.step === "replied") return { text: "Replied", tone: "good" };
  if (p.step === "waiting") return p.clientVerdict ? null : { text: "Waiting", tone: "quiet" };
  if (p.step === "offer") return { text: "Offer out", tone: "warm" };
  if (p.step === "loop") return { text: "In loop", tone: "quiet" };
  return null;
}

/** One bar of the Overview's funnel: a stage of the campaign (or Found), how many are in it now, and the hue it is drawn in. */
export type FunnelBar = {
  key: string;
  label: string;
  n: number;
  /** What the stage counts as; "found" for the pool the search has seen. */
  kind: StageKind | "found";
  /** The stage's colour (stageText), null for Found. */
  hue: StageColor | null;
  /** The stage's id; absent for Found. */
  stageId?: string;
  /** The first stage of its kind: the step-to-step figures sit on it. */
  first: boolean;
};

/**
 * The Overview's funnel: one bar per stage in board order (Hired last, Passed left out) under its own name and colour,
 * counting the people in it now. Found leads only while it says something (the search has found people).
 *
 * Given `reach` (the server's cumulative counts, the same numbers as the Analytics funnel) the bars are the steps
 * people got to, one per kind, each counting everyone who got that far or further: "Shortlisted (ever)" is everyone
 * who made the shortlist, rejected included, not the ones still sitting in its column. A bar means one thing here.
 */
export function funnelBars(
  stages: readonly StageDef[],
  people: readonly Pick<PipelinePerson, "stage" | "stageId">[],
  found: number,
  reach?: Readonly<Record<"shortlisted" | "outreach" | "interviewing" | "hired", number>>,
): FunnelBar[] {
  const cols = columnsOf(stages);
  if (reach) {
    const steps: FunnelBar[] = [];
    for (const [kind, label] of [["shortlisted", "Shortlisted (ever)"], ["outreach", "Contacted"], ["interviewing", "Interviewing"], ["hired", "Hired"]] as const) {
      const at = cols.findIndex((s) => s.kind === kind);
      const s = cols[at];
      if (s) steps.push({ key: s.id, label, n: reach[kind], kind, hue: stageText(s, at)["data-sc"], stageId: s.id, first: true });
    }
    return found > 0 ? [{ key: "found", label: "Found", n: found, kind: "found", hue: null, first: true }, ...steps] : steps;
  }
  const by = groupByStage(people, stages);
  const seen = new Set<StageKind>();
  const bars: FunnelBar[] = cols.map((s, i) => {
    const first = !seen.has(s.kind);
    seen.add(s.kind);
    return { key: s.id, label: s.name, n: by.get(s.id)?.length ?? 0, kind: s.kind, hue: stageText(s, i)["data-sc"], stageId: s.id, first };
  });
  return found > 0 ? [{ key: "found", label: "Found", n: found, kind: "found", hue: null, first: true }, ...bars] : bars;
}

/** One stretch of the slim bar over the board: a stage, how many are in it, and the hue it is drawn in. */
export type StripSegment = { id: string; name: string; n: number; hue: StageColor };

/**
 * The slim bar over the board and the one line beside it: a segment per column (Hired last, Passed left out) sized by
 * who is in it, and how many are in the pipeline, hired and passed. Nothing is said of an empty pipeline but a calm line.
 */
export function pipelineStrip(stages: readonly StageDef[], people: readonly Pick<PipelinePerson, "stage" | "stageId">[], hires?: { count: number; target: number | null }): {
  segments: StripSegment[]; inPipeline: number; hired: number; passed: number; line: string;
} {
  const by = groupByStage(people, stages);
  const segments = columnsOf(stages).map((s, i) => ({ id: s.id, name: s.name, n: by.get(s.id)?.length ?? 0, hue: stageText(s, i)["data-sc"] }));
  const inPipeline = segments.reduce((a, g) => a + g.n, 0);
  const hired = people.filter((p) => p.stage === "hired").length;
  const passed = people.filter((p) => p.stage === "passed").length;
  /* "2 of 3 hired" from the campaign's own count and target when it has them; else how many on the board are hired. */
  const said = hires ? (hires.target ? `${hires.count} of ${hires.target} hired` : hires.count ? `${hires.count} hired` : "") : hired ? `${hired} hired` : "";
  const line = inPipeline === 0 ? "Nobody in the pipeline yet" : `${inPipeline} in the pipeline${said ? ` · ${said}` : ""}`;
  return { segments, inPipeline, hired, passed, line };
}

/* ── custom stages, in words ── */

/** Whether a name is one the console already says for that kind (the defaults). */
export function isStandardName(kind: StageKind, name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === LABEL[kind].toLowerCase() || (kind === "outreach" && n === "outreach");
}

/** Whether a campaign's stages are the default set (Shortlisted, Outreach, Interviewing, one each, under their own names). */
export function isDefaultSet(stages: readonly { name: string; kind: StageKind }[] | undefined): boolean {
  const working = (stages ?? []).filter((s) => s.kind !== "hired" && s.kind !== "passed");
  if (!working.length) return true;
  const kinds = working.map((s) => s.kind);
  return working.length === 3 && kinds.join() === "shortlisted,outreach,interviewing" && working.every((s) => isStandardName(s.kind, s.name));
}

/** What a figure that counts by kind is called on a page that cannot name every stage: "Interviewing" for the default set, "In progress" once the campaign has stages of its own. */
export const interviewWord = (stages: readonly { name: string; kind: StageKind }[] | undefined): string => (isDefaultSet(stages) ? "Interviewing" : "In progress");

/** The small line under a column's title. Kind-specific words (new, replied, offers) are only said of the default columns; a stage the campaign made just says how many are in it. */
export function columnNote(
  s: Pick<StageDef, "kind" | "name" | "clientView">,
  all: readonly Pick<PipelinePerson, "step" | "inStage" | "clientVerdict">[],
  hiredAll = 0,
): string {
  if (s.clientView) return `${all.filter((p) => !p.clientVerdict).length} waiting on the client`;
  if (s.kind === "hired") return all.length || hiredAll ? "Offers accepted" : "First hire lands here";
  if (s.kind === "outreach" && isStandardName("outreach", s.name)) return `${all.filter((p) => p.step === "replied").length} replied`;
  if (s.kind === "interviewing" && isStandardName("interviewing", s.name)) return `${all.filter((p) => p.step === "offer").length} with an offer`;
  if (s.kind === "shortlisted" && isStandardName("shortlisted", s.name)) return `${all.filter((p) => p.inStage <= 2).length} new`;
  return `${all.length} ${all.length === 1 ? "person" : "people"}`;
}

/** What a person's place on the campaign is called: its own name for the stage; Replied and Offer out only under the default columns, where those steps are stages' words. */
export function placeLabel(p: Pick<PipelinePerson, "stage" | "stageId" | "step">, stages: readonly StageDef[]): string {
  const at = stageOf(p, stages);
  if (!at) return kindLabel(p.stage);
  if (at.kind === "outreach" && p.step === "replied" && isStandardName("outreach", at.name)) return "Replied";
  if (at.kind === "interviewing" && p.step === "offer" && isStandardName("interviewing", at.name)) return "Offer out";
  return at.name;
}

/** First names for a short list, but the full name for any whose first name another in the list shares ("Ananya Rao, Ananya Das"). */
export function firstNamesOrFull(fullNames: readonly string[]): string[] {
  const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;
  const seen = new Map<string, number>();
  for (const n of fullNames) seen.set(first(n).toLowerCase(), (seen.get(first(n).toLowerCase()) ?? 0) + 1);
  return fullNames.map((n) => ((seen.get(first(n).toLowerCase()) ?? 0) > 1 ? n.trim() : first(n)));
}
