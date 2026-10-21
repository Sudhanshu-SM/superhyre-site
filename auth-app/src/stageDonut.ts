import type { CampaignRow, CampaignStage, StageKind } from "./campaignsData";

/**
 * What the stage donut (StageDonut.tsx) draws, and how it says it: the stages of a campaign in order, a colour for
 * each, the arcs they make, and the one line a screen reader gets. Plain functions, so they are checked without a
 * browser.
 *
 * Colour. A stage may carry one of eight palette keys from the server; each key is a set of `--stage-<key>` tokens
 * (access.css for light, theme/theme.css for dark: mark, -text, -soft, -line), so light and dark follow the theme.
 * A stage without one (or with a key this build does not know) takes the colour of its kind: shortlisted violet,
 * outreach blue, interviewing amber, hired green, passed a soft rose, quieter. Hired is always green: it is the win,
 * and it reads the same in every campaign whatever the stages are called.
 *
 * People. The ring and every count beside it are the people ON THE BOARD: not rejected, hired included (server:
 * modules/pipeline/counts.ts, `board`). The rejected are never inside the ring or its total; they are said apart
 * ("5 rejected"), here by `rejectedOf`.
 */

export type StageHue = "slate" | "blue" | "teal" | "green" | "amber" | "orange" | "rose" | "violet";

/** The palette keys a stage's `color` may be, in the order the server offers them (slate stays valid for old data; nothing draws it). */
export const STAGE_HUES: readonly StageHue[] = ["slate", "blue", "teal", "green", "amber", "orange", "rose", "violet"];

/** The colours a person may pick: no grey. */
export const PICKABLE_HUES: readonly StageHue[] = STAGE_HUES.filter((h) => h !== "slate");

/** The CSS variable of a palette key's token: the mark by default, or its `text`, `soft` wash or `line`. The one place that names them. */
export const stageVar = (hue: StageHue, part: "text" | "soft" | "line" | "" = ""): string => `var(--stage-${hue}${part ? `-${part}` : ""})`;

const KIND_HUE: Readonly<Record<StageKind, StageHue>> = {
  shortlisted: "violet", outreach: "blue", interviewing: "amber", hired: "green", passed: "rose",
};

const isHue = (k: string | undefined): k is StageHue => !!k && (STAGE_HUES as readonly string[]).includes(k);

/**
 * The hue a stage is drawn in, the one answer for every page. The first stage of a campaign (`position` 0) is always
 * violet; Hired is always green and Passed a soft rose, whatever they were given. Any other stage takes the colour
 * it was given, else its kind's. Nothing is ever drawn grey: an old "slate" is drawn blue.
 */
export function stageHue(s: Pick<CampaignStage, "kind" | "color">, position?: number): StageHue {
  if (s.kind === "hired") return "green";
  if (s.kind === "passed") return "rose";
  if (position === 0) return "violet";
  const key = s.color?.trim().toLowerCase();
  return isHue(key) ? (key === "slate" ? "blue" : key) : KIND_HUE[s.kind];
}

/** Whether a stage is drawn quietly: people who were passed on are in the picture, but not shouting. */
export const stageMuted = (s: Pick<CampaignStage, "kind">): boolean => s.kind === "passed";

/**
 * The five default stages, from the headcounts a row has without the server's `stages` (fixtures, an older server).
 * In outreach is everyone contacted who is not yet interviewing. Nobody is known to have been passed on.
 */
export function defaultStages(f: CampaignRow["funnel"]): CampaignStage[] {
  return [
    { id: "shortlisted", name: "Shortlisted", kind: "shortlisted", color: null, count: Math.max(0, f.shortlisted) },
    { id: "outreach", name: "In outreach", kind: "outreach", color: null, count: Math.max(0, f.contacted - f.interviews) },
    { id: "interviewing", name: "Interviewing", kind: "interviewing", color: null, count: Math.max(0, f.interviews) },
    { id: "hired", name: "Hired", kind: "hired", color: null, count: Math.max(0, f.hired) },
    { id: "passed", name: "Rejected", kind: "passed", color: null, count: 0 },
  ];
}

/** A campaign's stages: the server's when it sent them, otherwise the default five from its headcounts. */
export const stagesOf = (row: Pick<CampaignRow, "stages" | "funnel">): readonly CampaignStage[] =>
  row.stages?.length ? row.stages : defaultStages(row.funnel);

type Counted = Pick<CampaignStage, "count" | "kind">;

/** The stages people are on the board in: everything but the rejected. */
const onBoardStages = <S extends Pick<CampaignStage, "kind">>(stages: readonly S[]): S[] => stages.filter((s) => s.kind !== "passed");

/** The people on the board now: not rejected, hired included. The number in the middle of the ring. */
export const totalOf = (stages: readonly Counted[]): number => onBoardStages(stages).reduce((a, s) => a + s.count, 0);

/** The people who were rejected, counted apart from the board. */
export const rejectedOf = (stages: readonly Counted[]): number => stages.filter((s) => s.kind === "passed").reduce((a, s) => a + s.count, 0);

/** The people still moving: on the board and not yet hired. */
export const inProgressOf = (stages: readonly Counted[]): number => onBoardStages(stages).filter((s) => s.kind !== "hired").reduce((a, s) => a + s.count, 0);

/** The people in the stages of one kind now (the interviewing kind covers every stage of its own the campaign added). */
export const inKind = (stages: readonly Counted[], kind: StageKind): number => stages.filter((s) => s.kind === kind).reduce((a, s) => a + s.count, 0);

/** Nobody on the board yet. */
export const isEmpty = (stages: readonly Counted[]): boolean => totalOf(stages) === 0;

/**
 * The line under a campaign whose roles are all filled: "Filled · 2 hired". Null while any place is open, or when the
 * campaign has no target to fill.
 */
export function filledLine(hires: { count: number; target: number | null } | undefined): string | null {
  if (!hires || !hires.target || hires.count < hires.target) return null;
  return `Filled · ${hires.count} hired`;
}

/**
 * The one quiet line under a campaign whose pipeline has nobody in it yet, from how far sourcing has got: "Needs a
 * role spec" until the spec is approved; then, if people have been found but none shortlisted, how many ("30 found,
 * none shortlisted"); "Finding people" while a search is running; "Ready to start" otherwise.
 */
export function startLine(r: Pick<CampaignRow, "needs" | "agents" | "funnel">): string {
  if (r.needs && /spec|brief/i.test(r.needs)) return "Needs a role spec";
  if (r.funnel.sourced > 0) return `${r.funnel.sourced} found, none shortlisted`;
  return r.agents.length ? "Finding people" : "Ready to start";
}

/** What to say after a number of people in a stage of this kind: "3 shortlisted", "2 in outreach", "1 interviewing", "4 hired". */
const KIND_PHRASE: Readonly<Record<StageKind, string>> = {
  shortlisted: "shortlisted", outreach: "in outreach", interviewing: "interviewing", hired: "hired", passed: "rejected",
};

/**
 * The one quiet line under a ring that has people in it, so a number never stands alone: where most of them are ("1
 * shortlisted", "3 in outreach"). Of equal stages the one furthest along speaks. Null when nobody is on the board.
 */
export function peopleLine(stages: readonly CampaignStage[]): string | null {
  const onBoard = onBoardStages(stages).filter((s) => s.count > 0);
  if (!onBoard.length) return null;
  const by = new Map<StageKind, number>();
  for (const s of onBoard) by.set(s.kind, (by.get(s.kind) ?? 0) + s.count);
  const order: StageKind[] = ["shortlisted", "outreach", "interviewing", "hired"];
  let best: StageKind | null = null;
  for (const kind of order) {
    const n = by.get(kind) ?? 0;
    if (n > 0 && (best === null || n >= (by.get(best) ?? 0))) best = kind;
  }
  return best ? `${by.get(best)} ${KIND_PHRASE[best]}` : null;
}

/** The total as it fits the middle of the ring: 214, 1.2k, 12k. */
export function shortCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? Math.round(k * 10) / 10 : Math.round(k)}k`;
}

/** What a screen reader says for the ring: "5 people: 3 Shortlisted, 1 Interviewing, 1 Hired; 2 rejected". Calm when empty. */
export function stagesLine(stages: readonly CampaignStage[]): string {
  const total = totalOf(stages);
  const rejected = rejectedOf(stages);
  if (total === 0) return rejected > 0 ? `No one on the board; ${rejected} rejected` : "No one yet";
  const parts = onBoardStages(stages).filter((s) => s.count > 0).map((s) => `${s.count} ${s.name}`);
  return `${total} ${total === 1 ? "person" : "people"}: ${parts.join(", ")}${rejected > 0 ? `; ${rejected} rejected` : ""}`;
}

/** The ring's radius on its 40-unit canvas (StageDonut.tsx draws on a 40 by 40 box, whatever size it is shown at). */
export const DONUT_RADIUS = 17.5;

/** The ring's thickness, in canvas units, for a donut shown `size` px wide: slim, about 8.5% of its width (4px at the least, 10px at the most). */
export const ringWidth = (size: number): number => Math.min(10, Math.max(4, size * 0.085)) / (size / 40);

/** How many pixels one path unit (a hundredth of the ring) is at `size`. */
export const unitPx = (size: number): number => ((2 * Math.PI * DONUT_RADIUS) / 100) * (size / 40);

/** One stretch of the ring, measured on a path of length 100, from the top and clockwise. */
export type Arc = { id: string; start: number; len: number; hue: StageHue; muted: boolean };

/** Breathing room between two neighbours, and the least a small share may show, in pixels: the same on a small ring and a large one. */
export const GAP_PX = 3;
export const LEAST_PX = 3.4;

/** The arcs of a ring shown `size` px wide: one per stage on the board that has someone in it (the rejected are not in the ring), sized by its share, a small gap between neighbours. */
export function arcsOf(stages: readonly CampaignStage[], size = 40): Arc[] {
  const shown = stages.map((s, i) => ({ s, i })).filter((x) => x.s.count > 0 && x.s.kind !== "passed");
  const total = totalOf(shown.map((x) => x.s));
  if (!total) return [];
  if (shown.length === 1) {
    const { s, i } = shown[0]!;
    return [{ id: s.id, start: 0, len: 100, hue: stageHue(s, i), muted: stageMuted(s) }];
  }
  const gap = GAP_PX / unitPx(size);
  const least = LEAST_PX / unitPx(size);
  let at = 0;
  return shown.map(({ s, i }) => {
    const share = (s.count / total) * 100;
    const arc: Arc = { id: s.id, start: at + gap / 2, len: Math.max(least, share - gap), hue: stageHue(s, i), muted: stageMuted(s) };
    at += share;
    return arc;
  });
}
