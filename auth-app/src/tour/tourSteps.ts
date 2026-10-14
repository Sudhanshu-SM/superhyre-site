import { can } from "../can";
import type { Capability, Standing } from "../can";
import { OUTREACH_LABEL } from "../nav";
import type { RouteId } from "../nav";

/**
 * The guided tour's steps, in the order they are shown: the sidebar from the top, then the campaign's pages,
 * then the places that are always there, then the agent's page. Each points at something the person can
 * touch (`data-tour="..."` on the element) and says in one sentence what it is for and when to reach for it.
 *
 * Which steps a person gets follows what they have: Calls is the owner's and the admins' (the same table the
 * sidebar uses, `can.ts`), and a step whose target is not on the page when its turn comes is skipped, so the
 * tour is never a spotlight on nothing.
 */

export type TourPlace = "right" | "bottom" | "left" | "top";

export type TourStep = {
  id: string;
  /** The `data-tour` value of what it points at. */
  target: string;
  /** A selector for the same thing, for when the attribute is not there. */
  fallback?: string;
  /** The console page it lives on; absent for the sidebar and bell, which are on every page. */
  route?: RouteId;
  /** Where it is: the sidebar is a drawer on a phone, and has to be opened for these. */
  area: "nav" | "page";
  /** What the person needs to have for this step (the same capabilities the sidebar uses). */
  capability?: Capability;
  title: string;
  text: string;
  place: TourPlace;
};

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "home", target: "nav-home", area: "nav", title: "Home", text: "Your day at a glance: what needs you and what is coming up.", place: "right" },
  { id: "agent", target: "nav-agent", area: "nav", title: "Agent", text: "Brief your hiring agent in plain words whenever you need people found, ranked or contacted.", place: "right" },
  { id: "campaigns", target: "nav-campaigns", area: "nav", title: "Campaigns", text: "Every role you are hiring for, and how far along each one is.", place: "right" },
  { id: "candidates", target: "nav-contacts", area: "nav", title: "Candidates", text: "Everyone you have a record for, whichever campaign found them.", place: "right" },
  { id: "calls", target: "nav-calls", area: "nav", capability: "calls.all", title: OUTREACH_LABEL, text: "Every email, WhatsApp chat and call, with the whole conversation one click away.", place: "right" },
  { id: "clients", target: "nav-clients", area: "nav", title: "Clients", text: "The companies you hire for, and the campaigns you run for them.", place: "right" },
  { id: "analytics", target: "nav-analytics", area: "nav", title: "Analytics", text: "How hiring is going: replies, where people drop off and what needs a look.", place: "right" },
  { id: "campaign-overview", target: "nav-campaign-overview", area: "nav", title: "Campaign overview", text: "One campaign at a glance: who is in the pipeline and what the agent is doing.", place: "right" },
  { id: "campaign-pipeline", target: "nav-campaign-candidates", area: "nav", title: "Pipeline", text: "Everyone in this campaign by stage, where you move people along.", place: "right" },
  { id: "campaign-forms", target: "nav-campaign-forms", area: "nav", title: "Forms and responses", text: "Screening questions you send to candidates, and the answers that come back.", place: "right" },
  { id: "campaign-outreach", target: "nav-campaign-calls", area: "nav", title: `${OUTREACH_LABEL} for this campaign`, text: "Every message and call for this campaign, ready to open.", place: "right" },
  { id: "campaign-shortlisted", target: "nav-campaign-shortlisted", area: "nav", title: "Shortlisted", text: "The people you have moved forward, ready for a decision.", place: "right" },
  { id: "quick-find", target: "quick-find", area: "nav", title: "Quick find", text: "Jump to any page or campaign, or ask the agent, from anywhere with Ctrl K.", place: "right" },
  { id: "bell", target: "bell", area: "nav", title: "Notifications", text: "Replies, approvals and anything waiting on you show up here.", place: "right" },
  { id: "settings", target: "nav-settings", area: "nav", title: "Settings", text: "Your profile, your team and what the agent is connected to.", place: "right" },
  { id: "support", target: "nav-support", area: "nav", title: "Support", text: "Stuck or curious? Write to us here and we reply within a working day.", place: "right" },
  { id: "composer", target: "composer", fallback: ".orc-composer-field", route: "agent", area: "page", title: "Brief the agent", text: "Say what you need in your own words, then press Enter.", place: "top" },
  { id: "jd", target: "jd-slot", fallback: ".orc-slots .orc-gslot:nth-child(1)", route: "agent", area: "page", title: "Job description", text: "Attach the job description so the agent knows exactly who to look for.", place: "top" },
  { id: "filters", target: "filters-slot", fallback: ".orc-slots .orc-gslot:nth-child(2)", route: "agent", area: "page", title: "Filters", text: "Narrow a search by place, experience, skills and more.", place: "top" },
  { id: "ideas", target: "ideas", fallback: ".orc-ideas", route: "agent", area: "page", title: "Ideas to start from", text: "Not sure what to ask? Pick an idea and the agent takes it from there.", place: "top" },
  { id: "history", target: "history", fallback: ".rail-hist", route: "agent", area: "page", title: "History", text: "Every chat with the agent, ready to pick up where you left off.", place: "left" },
  { id: "configuration", target: "configuration", fallback: ".rail-config", route: "agent", area: "page", title: "Configuration", text: "What the agent is set up to do here, at a glance.", place: "left" },
];

/** The steps this person gets, in order. */
export function stepsFor(standing: Standing | null | undefined): TourStep[] {
  return TOUR_STEPS.filter((s) => !s.capability || !standing || can(standing, s.capability));
}

/** The selector that finds a step's target: its attribute, then its fallback. */
export function selectorFor(step: Pick<TourStep, "target" | "fallback">): string {
  const attr = `[data-tour="${step.target}"]`;
  return step.fallback ? `${attr}, ${step.fallback}` : attr;
}

/* ── skipping what is not there ──────────────────────────────────────────── */

/**
 * Finds the step to show from `index` going `dir` (1 forwards, -1 back). `prepare` takes a step to its page and
 * says whether its target is there; a step that is not is dropped from the plan, and the walk carries on past it.
 * Going back, running out of steps stays on the first one that is there; going forward it is the end (null).
 */
export async function settleStep(
  plan: readonly TourStep[],
  index: number,
  dir: 1 | -1,
  prepare: (step: TourStep) => Promise<boolean>,
): Promise<{ plan: TourStep[]; index: number | null }> {
  const steps = [...plan];
  let i = Math.max(index, 0);
  // Past the end going forward is the end; past it going back is the last step.
  if (i >= steps.length && dir === -1) i = steps.length - 1;
  while (i >= 0 && i < steps.length) {
    if (await prepare(steps[i]!)) return { plan: steps, index: i };
    steps.splice(i, 1);
    // Forwards, the next step has slid into `i`; back, the one before it is at `i - 1`.
    if (dir === -1) i -= 1;
  }
  if (dir === -1 && steps.length > 0) return settleStep(steps, 0, 1, prepare);
  return { plan: steps, index: null };
}

/** "3 of 18". */
export const counter = (index: number, total: number): string => `${index + 1} of ${total}`;

/* ── where the popover sits ──────────────────────────────────────────────── */

export type Box = { left: number; top: number; width: number; height: number };

const GAP = 14;
const MARGIN = 12;

/**
 * Puts the popover beside the target, on the side asked for if it fits and on the one with the most room if not,
 * kept inside the viewport. On a phone it is a sheet along the edge furthest from the target.
 */
export function placePopover(
  target: Box,
  pop: { width: number; height: number },
  view: { width: number; height: number },
  prefer: TourPlace,
): { left: number; top: number; side: TourPlace | "sheet" } {
  if (view.width < 560) {
    const targetMid = target.top + target.height / 2;
    const top = targetMid > view.height / 2 ? MARGIN : view.height - pop.height - MARGIN;
    return { left: MARGIN, top: Math.max(MARGIN, top), side: "sheet" };
  }
  const room: Record<TourPlace, number> = {
    right: view.width - (target.left + target.width) - MARGIN,
    left: target.left - MARGIN,
    bottom: view.height - (target.top + target.height) - MARGIN,
    top: target.top - MARGIN,
  };
  const need = (s: TourPlace): number => (s === "left" || s === "right" ? pop.width : pop.height) + GAP;
  const order: TourPlace[] = [prefer, ...(["right", "bottom", "left", "top"] as const).filter((s) => s !== prefer)];
  const side = order.find((s) => room[s] >= need(s)) ?? order.slice().sort((a, b) => room[b] - room[a])[0]!;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let left: number;
  let top: number;
  if (side === "right") {
    left = target.left + target.width + GAP;
    top = target.top + target.height / 2 - pop.height / 2;
  } else if (side === "left") {
    left = target.left - pop.width - GAP;
    top = target.top + target.height / 2 - pop.height / 2;
  } else if (side === "bottom") {
    left = target.left + target.width / 2 - pop.width / 2;
    top = target.top + target.height + GAP;
  } else {
    left = target.left + target.width / 2 - pop.width / 2;
    top = target.top - pop.height - GAP;
  }
  left = clamp(left, MARGIN, view.width - pop.width - MARGIN);
  top = clamp(top, MARGIN, view.height - pop.height - MARGIN);
  return { left, top, side };
}
