import type { Icon } from "@phosphor-icons/react";
import {
  ChartBar, ClockCounterClockwise, Graph, MagnifyingGlass, PaperPlaneTilt, Robot, SunHorizon, TrendDown, UsersThree,
} from "@phosphor-icons/react";
import type { ModeId } from "./orchestrator";
import { FLEET, PIPELINE, sourcedFor } from "./orchestrator";
import { estimate, fromBrief } from "./filters";

/**
 * Ideas — what the landing page offers to start with.
 *
 * Every idea is grounded: it carries the observation it came from and a
 * small picture of that observation, so the recruiter judges the idea on
 * evidence rather than trusting a canned suggestion. Every prompt lands on a
 * moment the agent actually has, so picking one always leads somewhere.
 *
 * Sourcing mode offers searches, each with a live match estimate from the
 * same model the filters dialog uses. Agent mode offers the work that is
 * waiting: replies, a stopped agent, reports.
 */

export type IdeaKind = "search" | "act" | "insight";

export type Signal =
  | { type: "matches"; n: number }
  | { type: "spark"; data: readonly number[]; label: string }
  | { type: "faces"; initials: readonly string[]; label: string }
  | { type: "ring"; value: number; max: number; label: string }
  | { type: "alert"; label: string };

export type Idea = {
  id: string; kind: IdeaKind; prompt: string; because: string; signal: Signal; Icon: Icon;
  /** What the tile shows: the prompt, cut to read at a glance. The full
      prompt is what gets typed into the composer. */
  short?: string;
};

const search = (id: string, prompt: string, because: string, Icon: Icon = MagnifyingGlass, short?: string): Idea => ({
  id, kind: "search", prompt, because, short, signal: { type: "matches", n: estimate(fromBrief(prompt)) }, Icon,
});

const SEARCHES: readonly Idea[] = [
  search("s1", "Staff backend engineers in Bangalore who have scaled Postgres, 8+ years", "Your last three searches asked for Postgres at scale", MagnifyingGlass, "Staff engineers who scaled Postgres in Bangalore"),
  search("s2", "Senior Go or Rust engineers from Series B fintechs, remote in India", "Fintech profiles replied fastest on your last campaign", MagnifyingGlass, "Go or Rust engineers from Series B fintechs"),
  search("s3", "SRE leads in Hyderabad with Kubernetes, 6+ years", "Platform SRE has no sourcing agent yet", Graph, "SRE leads in Hyderabad who run Kubernetes"),
  search("s4", "Backend engineers in Pune open to work, 4+ years, Kafka", "Open-to-work profiles in Pune rose this week", MagnifyingGlass, "Kafka engineers in Pune who are open to work"),
  search("s5", "Principal engineers who led database migrations, remote", "Two of your hires came from migration-heavy roles", MagnifyingGlass, "Principal engineers who led database migrations"),
  search("s6", "Senior engineers in Chennai with Go and Postgres, 5+ years", "Chennai is under-searched for this role", MagnifyingGlass, "Senior Go and Postgres engineers in Chennai"),
];

const waiting = FLEET.filter((a) => a.state === "waiting").length;
const stopped = FLEET.filter((a) => a.state === "error");
const replied = PIPELINE.find((s) => s.id === "replied")!.count;
const contacted = PIPELINE.find((s) => s.id === "contacted")!.count;

const ACTIONS: readonly Idea[] = [
  {
    id: "a1", Icon: PaperPlaneTilt, kind: "act", prompt: "Reach out to the shortlist on WhatsApp first", short: "Reach out to the shortlist on WhatsApp",
    because: "24 shortlisted on Senior Backend, none contacted yet",
    signal: { type: "faces", initials: ["RM", "PN", "AB", "SK"], label: "+20 more" },
  },
  {
    id: "a2", Icon: Robot, kind: "act", prompt: "How are all my agents doing?",
    because: `${waiting} waiting on you, ${stopped.length} stopped`,
    signal: { type: "alert", label: `${waiting + stopped.length} need you` },
  },
  {
    id: "a3", Icon: TrendDown, kind: "insight", prompt: "Where are we losing people?",
    because: `${replied} of ${contacted} contacted have replied`,
    signal: { type: "ring", value: replied, max: contacted, label: "reply rate" },
  },
  {
    id: "a4", Icon: ChartBar, kind: "insight", prompt: "Show me the campaign numbers for backend", short: "Chart the backend campaign",
    because: "Sourcing picked up this week",
    signal: { type: "spark", data: sourcedFor("backend-snr").map((d) => d.n), label: "sourced, 14 days" },
  },
  {
    id: "a5", Icon: UsersThree, kind: "act", prompt: "Compare Priya and Anika",
    because: "Both shortlisted, and both in two campaigns",
    signal: { type: "faces", initials: ["PN", "AB"], label: "side by side" },
  },
  {
    id: "a6", Icon: SunHorizon, kind: "insight", prompt: "Catch me up on overnight",
    because: "17 sourced and 5 replies since you last looked",
    signal: { type: "spark", data: [2, 3, 1, 4, 6, 5, 7], label: "overnight" },
  },
  {
    id: "a7", Icon: ClockCounterClockwise, kind: "act", prompt: "Anyone from past searches?",
    because: "3 people from earlier searches fit this brief",
    signal: { type: "faces", initials: ["AR", "SK", "MD"], label: "you know them" },
  },
];

export function ideasFor(mode: ModeId): readonly Idea[] {
  return mode === "sourcing" ? SEARCHES : ACTIONS;
}

export const KIND_LABEL: Record<IdeaKind, string> = {
  search: "Search",
  act: "Do",
  insight: "Understand",
};
