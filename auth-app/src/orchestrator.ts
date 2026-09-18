import {
  Check, Clock, Envelope, FilePdf, FileText, FunnelSimple,
  MicrosoftOutlookLogo, MicrosoftTeamsLogo, NotionLogo, SlackLogo, Sparkle,
  Target, UsersThree, VideoCamera
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { CAMPAIGNS } from "./workspaces";

/**
 * The orchestrator surface: briefs, modes, campaign configuration.
 *
 * ── WHY "BRIEF" AND NOT "CHAT" ──────────────────────────────────────────────
 * "Chat" and "conversation" describe the medium, not the work, and they flatten
 * the most important object in the product into the same noun a support widget
 * uses. A recruiter does not chat a role into existence — they BRIEF someone on
 * it: here is the role, here is who we want, go find them. The agent then works
 * the brief.
 *
 * It is also the word the industry already uses. An intake brief is the
 * artefact a recruiter and a hiring manager produce together, and a job
 * description is an INPUT to it — which is exactly the relationship the
 * composer models, where the JD is a piece of context you attach.
 *
 * Considered and rejected: "Thread" (medium again, and generic across every AI
 * product), "Session" (infrastructural), "Search" (already the name of a
 * campaign page, and it undersells an agent that also writes, schedules and
 * shortlists), "Mission" (theatrical for a tool people use all day).
 *
 * Every brief belongs to exactly one campaign, which is why the campaign name
 * travels with it in the rail.
 */
export type Brief = {
  id: string;
  /** What the recruiter asked for, in their words. Doubles as the rail label. */
  title: string;
  /** The campaign it was worked under. */
  campaign: string;
  /** Relative age, pre-rendered: there is no server clock to diff against. */
  when: string;
  mode: ModeId;
};

/**
 * The two modes.
 *
 * Not a model picker. They change what the agent is FOR, which is why each one
 * offers different context to attach: sourcing needs a role definition and a
 * filter set, an agent run needs neither.
 */
export type ModeId = "sourcing" | "agent";

export type Mode = {
  id: ModeId;
  label: string;
  Icon: Icon;
  /** Shown under the composer once selected — what this mode will do. */
  blurb: string;
};

export const MODES: readonly Mode[] = [
  {
    id: "sourcing",
    label: "Sourcing",
    Icon: Target,
    blurb: "Find and rank candidates against a role.",
  },
  {
    id: "agent",
    label: "Agent",
    Icon: Sparkle,
    blurb: "Run multi-step work across the campaign.",
  },
];

/** Context a brief can carry. Sourcing-only, because only sourcing reads it. */
export type ContextSlot = {
  id: string;
  label: string;
  Icon: Icon;
  /** One line of what attaching this changes. */
  hint: string;
};

export const SOURCING_CONTEXT: readonly ContextSlot[] = [
  {
    id: "jd",
    label: "Job description",
    Icon: FileText,
    hint: "Ranks candidates against the role as written",
  },
  {
    id: "filters",
    label: "Set filters",
    Icon: FunnelSimple,
    hint: "Location, seniority, company, must-haves",
  },
];

/**
 * Per-campaign setup, as the rail's Configuration panel reads it.
 *
 * ── SET AND NOT-SET ARE DIFFERENT TYPES HERE, ON PURPOSE ────────────────────
 * A configured field is a `string`; an unconfigured one is `null`. That
 * distinction is what lets the rail render the reference's best idea — an
 * empty row whose value position holds the ACTION that would fill it ("Link
 * ATS job") rather than a blank, a dash, or the word "None".
 *
 * Writing `atsJob: "None"` would collapse the two into one string and the rail
 * could no longer tell "nothing is linked, here is how" from "the linked thing
 * is called None". The null is the information.
 *
 * Fixtures against `campaigns`.
 */
export const CAMPAIGN_CONFIG = {
  visibility: "Shared",
  department: "Engineering",
  /* Genuinely unset — there is no ATS integration and no intake form builder,
     so these are null rather than invented. The rail turns each into a link to
     the page where it WOULD be configured, which is a real navigation rather
     than a control that promises something nothing can do. */
  atsJob: null as string | null,
  intake: null as string | null,
};

/** Recent briefs. Fixtures — there is no `agent_conversations` table yet. */
export const BRIEFS: readonly Brief[] = [
  { id: "b1", title: "Staff engineers who have scaled Postgres", campaign: "Senior Backend Engineers", when: "2h", mode: "sourcing" },
  { id: "b2", title: "Chase the four candidates waiting on a reply", campaign: "Senior Backend Engineers", when: "Yesterday", mode: "agent" },
  { id: "b3", title: "SRE leads, Bangalore or remote India", campaign: "Platform SRE", when: "2d", mode: "sourcing" },
  { id: "b4", title: "Summarise every screening call this week", campaign: "iOS Engineers", when: "4d", mode: "agent" },
  /* Enough rows that the rail's list is genuinely TRUNCATED rather than
     merely short. Four inline out of four is not a truncation — nothing is
     hidden, so "View all" would open a dialog showing the same four, and the
     control would be a lie about there being more. Seven makes the pattern
     honest: the rail shows the recent ones, the dialog shows everything. */
  { id: "b5", title: "Find platform engineers who have run Kubernetes at scale", campaign: "Platform SRE", when: "6d", mode: "sourcing" },
  { id: "b6", title: "Draft rejection notes for everyone we passed on", campaign: "Senior Backend Engineers", when: "1w", mode: "agent" },
  { id: "b7", title: "iOS engineers with Swift Concurrency in production", campaign: "iOS Engineers", when: "2w", mode: "sourcing" },
];

/**
 * What a campaign can be configured with.
 *
 * ── CHANNELS ────────────────────────────────────────────────────────────────
 * Where the agent is allowed to speak. A campaign that can source but cannot
 * message is half a campaign, so this belongs next to the brief rather than
 * buried in settings — it is the difference between the agent drafting and the
 * agent sending.
 */
export type Channel = {
  id: string;
  name: string;
  Icon: Icon;
  connected: boolean;
  /** Where the agent posts when this one is live. */
  detail: string;
  /**
   * The brand's own colour, for the mark.
   *
   * Measured against the white panel it renders on: Slack 11.00:1, Outlook
   * 4.53:1, Teams 6.60:1, Notion 17.59:1 — all clear of the 3:1 floor for a
   * meaningful glyph, Outlook by the least margin and still passing.
   *
   * This is colour spent on RECOGNITION, which is the one thing a brand mark
   * does better than its own name: you find Slack in a row of four by its
   * silhouette and its aubergine before you have read anything. That is also
   * why it is a field and not a hash — these are four fixed brands with four
   * real colours, not a palette assigned to arbitrary strings.
   */
  brand: string;
};

/* Real brand marks, not a generic glyph each. A channel row is answering
   "which platform", and a recruiter recognises the logo a half-second before
   they read the word — which is the entire reason this row exists rather than
   a line of text in settings. Phosphor ships all four, so no new dependency
   and no hand-pasted SVG to go stale. */
export const CHANNELS: readonly Channel[] = [
  { id: "slack", name: "Slack", Icon: SlackLogo, connected: true, detail: "#hiring-backend", brand: "#611f69" },
  { id: "outlook", name: "Outlook", Icon: MicrosoftOutlookLogo, connected: true, detail: "Outreach from your address", brand: "#0078d4" },
  { id: "teams", name: "Teams", Icon: MicrosoftTeamsLogo, connected: false, detail: "Interview scheduling", brand: "#4f52b2" },
  { id: "notion", name: "Notion", Icon: NotionLogo, connected: false, detail: "Sync the scorecard", brand: "#191918" },
];

/** Who else is working this campaign. */
export type Collaborator = { id: string; name: string; role: string; initial: string };

export const COLLABORATORS: readonly Collaborator[] = [
  { id: "c1", name: "Punith S", role: "Owner", initial: "P" },
  { id: "c2", name: "Arnab J", role: "Recruiter", initial: "A" },
  { id: "c3", name: "Sudhanshu M", role: "Hiring manager", initial: "S" },
];

export const COLLABORATOR_ICON: Icon = UsersThree;

/**
 * The three numbers the campaign header carries.
 *
 * Chosen because they are the only three that describe MOVEMENT through the
 * pipeline rather than its size: how many you picked, how many you reached,
 * how many reached back. A total headcount tells a recruiter nothing they can
 * act on before lunch.
 *
 * Fixtures, and the copy below says so — `org_candidates` and `outreach_queue`
 * are the tables these will read.
 */
export type Stat = {
  id: string;
  label: string;
  value: number;
  hue: Hue;
  /** Change over the trailing week. Signed; 0 renders as "no change", not "+0". */
  delta: number;
  /**
   * Trailing daily values, oldest first, for the sparkline.
   *
   * A bare 61 tells a recruiter nothing: they cannot tell whether outreach is
   * accelerating or stalled, which is the only question the number is being
   * asked. The shape is the answer, so the shape ships with the number.
   */
  spark: readonly number[];
};

export const CAMPAIGN_STATS: readonly Stat[] = [
  { id: "shortlisted", label: "Shortlisted", value: 24, hue: "violet", delta: 6,
    spark: [11, 13, 14, 16, 18, 21, 24] },
  { id: "contacted", label: "Contacted", value: 61, hue: "blue", delta: 18,
    spark: [22, 29, 34, 41, 48, 55, 61] },
  { id: "interested", label: "Interested", value: 9, hue: "sage", delta: -1,
    spark: [7, 8, 10, 11, 10, 10, 9] },
];

/**
 * What the agent does while a brief is running, as ordered stages.
 *
 * ── THESE ARE THE PLAN, NOT A PERFORMANCE ───────────────────────────────────
 * `delight.md` is explicit that waiting must "show truthful progress, useful
 * context, or product-specific activity" and must "never fake work". There is
 * no orchestrator backend, so these stages do not report work that happened —
 * they name the steps the brief WILL run, in order, and the reply that follows
 * says plainly that nothing is wired and names the tables it will read.
 *
 * The distinction matters: a spinner that invents "Analysing 1,204 profiles"
 * is a lie about data. A sequence that reads "Reading the brief → Planning the
 * search" is a legible statement of intent, and it is the same list the real
 * implementation has to execute.
 */
export const STAGES: Record<ModeId, readonly string[]> = {
  sourcing: ["Reading the brief", "Planning the search", "Matching the role", "Ranking candidates"],
  agent: ["Reading the brief", "Checking the campaign", "Sequencing the work", "Drafting next steps"],
};

/* ═════════════════════════════════ hues ═════════════════════════════════════

   The seven category hues, matching the --c-* tokens in access.css. Each was
   solved for its contrast floor rather than picked: every mark clears 3:1 on
   white and on its own tint, every text form clears 4.5:1 on both.

   Orange stays the brand and the only action colour. These are for CATEGORY
   and STATUS — what kind of thing this is, what state it is in — and a hue is
   never the only carrier of either, so colour-blind users lose nothing: the
   label, the glyph and the position all say it too.                          */

export type Hue = "brand" | "amber" | "sage" | "teal" | "blue" | "violet" | "rose";

export const HUES: readonly Hue[] = ["brand", "amber", "sage", "teal", "blue", "violet", "rose"];

/** Human label for the hue picker in a tile's menu. */
export const HUE_LABEL: Record<Hue, string> = {
  brand: "Terracotta", amber: "Ochre", sage: "Moss", teal: "Teal",
  blue: "Slate blue", violet: "Violet", rose: "Rose",
};

/* The tile model — TileKind, TileSpec, TILE_SPAN, TILE_KINDS, DEFAULT_LAYOUT,
   SIZE_RANK — was deleted with the widget gallery. Home shows a fixed
   overview now: what it displays is a decision rather than a preference, so
   there is no spec to persist, no size to clamp and no version to bump.

   The PAYLOADS below survive, because the overview cards read the same
   fixtures the tiles did. */

/* ══════════════════════════ tile payloads ═══════════════════════════════════
   Fixtures. Every one names the table it stands in for.                      */

export type Stage = {
  id: string;
  label: string;
  count: number;
  /**
   * The stage's own colour.
   *
   * Per-stage rather than one hue for the whole funnel, because the five
   * stages are five different states and a recruiter reads down them looking
   * for where people are sitting. One hue made the bars a single quantity in
   * five lengths; five hues make them five states.
   *
   * They run cool to warm in pipeline order, so the colour itself carries
   * progress: blue (just found) through violet and teal to amber (in play) and
   * sage (in process). Hue is never the only carrier — the label and the count
   * are on every row — so the sequence survives being read in greyscale.
   */
  hue: Hue;
};

/** Pipeline stages, widest first — a funnel that does not narrow is not one. */
export const PIPELINE: readonly Stage[] = [
  { id: "sourced", label: "Sourced", count: 148, hue: "blue" },
  { id: "shortlisted", label: "Shortlisted", count: 24, hue: "violet" },
  { id: "contacted", label: "Contacted", count: 61, hue: "teal" },
  { id: "replied", label: "Replied", count: 17, hue: "amber" },
  { id: "interviewing", label: "Interviewing", count: 6, hue: "sage" },
];

export type Waiting = { id: string; name: string; role: string; initial: string; hue: Hue; waited: string };

export const WAITING: readonly Waiting[] = [
  { id: "w1", name: "Meera Raghavan", role: "Staff · Postgres", initial: "M", hue: "violet", waited: "3d" },
  { id: "w2", name: "Tobias Lindqvist", role: "Senior · Go", initial: "T", hue: "blue", waited: "2d" },
  { id: "w3", name: "Priya Anand", role: "Staff · Kafka", initial: "P", hue: "sage", waited: "2d" },
  { id: "w4", name: "Daniel Okoro", role: "Senior · Rust", initial: "D", hue: "amber", waited: "1d" },
];

export type Slot = { id: string; when: string; day: string; who: string; kind: string; Icon: Icon; hue: Hue };

export const SCHEDULE: readonly Slot[] = [
  { id: "s1", when: "10:30", day: "Today", who: "Meera Raghavan", kind: "Screening", Icon: VideoCamera, hue: "blue" },
  { id: "s2", when: "14:00", day: "Today", who: "Priya Anand", kind: "System design", Icon: VideoCamera, hue: "violet" },
  { id: "s3", when: "09:00", day: "Tomorrow", who: "Tobias Lindqvist", kind: "Hiring manager", Icon: Envelope, hue: "sage" },
];

export type Source = { id: string; name: string; meta: string; Icon: Icon; hue: Hue };

export const SOURCES: readonly Source[] = [
  { id: "d1", name: "Senior Backend Engineer JD", meta: "PDF · 82 KB", Icon: FilePdf, hue: "rose" },
  { id: "d2", name: "Interview scorecard", meta: "Notion · synced 2h", Icon: NotionLogo, hue: "brand" },
  { id: "d3", name: "Comp band, IN + remote", meta: "Doc · 14 KB", Icon: FileText, hue: "blue" },
];

/* ═════════════════════════════ my tasks ═════════════════════════════════════

   What the surface owed a recruiter and did not give them: a reason to open it.
   Metrics describe the past and the composer waits for instruction; neither
   answers "what should I do now". This does.

   Fixtures against `recruiter_tasks`, which does not exist yet.              */

export type TaskState = "todo" | "doing" | "blocked" | "done";

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  todo: "To do", doing: "In progress", blocked: "Blocked", done: "Done",
};

/** State carries a hue, but the label always ships with it. */
export const TASK_STATE_HUE: Record<TaskState, Hue> = {
  todo: "teal", doing: "blue", blocked: "rose", done: "sage",
};

export type TaskChip = { label: string; hue: Hue; Icon?: Icon };

export type TaskItem = {
  id: string;
  title: string;
  state: TaskState;
  /** Keyed to CAMPAIGNS, so tasks and the overview filter by the same id. */
  campaignId: CampaignKey;
  /**
   * Days until due: 0 is today, negative is overdue, positive is ahead.
   *
   * THIS REPLACED A BOOLEAN `urgent`, and the replacement is the reason the
   * list can carry a time filter at all. The flag was standing in for a due
   * date the fixture did not have, which was fine while the only question was
   * "is this row loud" and stopped being fine the moment the list needed
   * Today / Next 7 days — you cannot range-filter a boolean. A number answers
   * both: `pressing` becomes `dueInDays <= 0`, so the urgency treatment and
   * the filter now read the SAME field instead of one approximating the other.
   */
  dueInDays: number;
  chips: readonly TaskChip[];
};

export const TASKS: readonly TaskItem[] = [
  { id: "k1", title: "Approve the outreach draft for four staff engineers",
    state: "doing", campaignId: "backend-snr", dueInDays: 0,
    chips: [{ label: "By today", hue: "rose", Icon: Clock }, { label: "4 drafts", hue: "blue", Icon: Envelope }] },
  { id: "k2", title: "Screening call with Meera Raghavan",
    state: "todo", campaignId: "backend-snr", dueInDays: 0,
    chips: [{ label: "10:30", hue: "amber", Icon: Clock }, { label: "Join", hue: "blue", Icon: VideoCamera }] },
  /* Overdue, and blocked BECAUSE it is waiting on a person. The two facts
     belong together: this is the row that proves an overdue task is not the
     same thing as a neglected one. */
  { id: "k3", title: "Confirm the comp band before the hiring-manager loop",
    state: "blocked", campaignId: "backend-snr", dueInDays: -2,
    chips: [{ label: "Waiting on Punith", hue: "rose", Icon: UsersThree }] },
  { id: "k4", title: "Shortlist the Bangalore SRE longlist",
    state: "todo", campaignId: "platform-sre", dueInDays: 1,
    chips: [{ label: "By tomorrow", hue: "teal", Icon: Clock }, { label: "31 to review", hue: "violet", Icon: Target }] },
  { id: "k6", title: "Draft the SRE outreach sequence",
    state: "todo", campaignId: "platform-sre", dueInDays: 3,
    chips: [{ label: "In 3 days", hue: "teal", Icon: Clock }] },
  { id: "k7", title: "Review the iOS take-home submissions",
    state: "doing", campaignId: "ios-mid", dueInDays: 5,
    chips: [{ label: "5 to review", hue: "violet", Icon: Target }] },
  { id: "k5", title: "Send the iOS screening summaries to the panel",
    state: "done", campaignId: "ios-mid", dueInDays: -1,
    chips: [{ label: "Sent", hue: "sage", Icon: Check }] },
];

/* ══════════════════════════ reply artefacts ═════════════════════════════════

   A reply is an ARTEFACT, not a paragraph.

   The reference makes this concrete: the model's answer arrives as a
   Gmail-shaped card with addressed fields, semantically coloured sections and
   a per-section edit affordance — something you review and act on, not prose
   you read and then retype somewhere else. The previous version rendered a
   sentence, which is why the surface had nothing to do after the reply landed.

   Nothing here is wired. `body` says so and names the table.                 */

export type ReplyBlock =
  | { kind: "lead"; body: string }
  | { kind: "field"; label: string; value: string; chip?: boolean }
  | { kind: "section"; title: string; hue: Hue; items: readonly string[] }
  | { kind: "note"; body: string };

export type ReplyArtefact = {
  /** The surface being drafted into, so the card can wear its shape. */
  app: string;
  /* No `Icon`. The card header used to render it in a tinted container, which
     restated a caption that already says "Shortlist" or "Outreach" — an icon
     that repeats adjacent text is decoration, and the field went with it
     rather than being left for someone to reintroduce. */
  hue: Hue;
  /** The primary act this artefact is waiting for. */
  commit: string;
  blocks: readonly ReplyBlock[];
};

export const REPLY_FIXTURE: Record<ModeId, ReplyArtefact> = {
  sourcing: {
    app: "Shortlist", hue: "violet", commit: "Add 12 to the campaign",
    blocks: [
      { kind: "lead", body: "Here is the shortlist this brief would produce, ranked by how closely each matches the role." },
      { kind: "field", label: "Campaign", value: "Senior Backend Engineers", chip: true },
      { kind: "field", label: "Matched", value: "12 of 148 sourced" },
      { kind: "section", title: "Strong match", hue: "sage", items: [
        "Meera Raghavan — scaled Postgres to 40TB at a payments company",
        "Priya Anand — Kafka and Postgres, led a 6-engineer platform team",
        "Tobias Lindqvist — Go and Postgres, remote-first for four years",
      ] },
      { kind: "section", title: "Worth a look", hue: "amber", items: [
        "Daniel Okoro — Rust rather than Go, but the scaling story fits",
        "Anika Bose — strong Postgres, two years short on seniority",
      ] },
      { kind: "note", body: "Not wired yet. This will rank `org_candidates` against the brief and write to `outreach_queue`." },
    ],
  },
  agent: {
    app: "Outreach", hue: "blue", commit: "Send all four",
    blocks: [
      { kind: "lead", body: "Four candidates have been waiting on a reply. Here is what the agent would send." },
      { kind: "field", label: "To", value: "4 candidates · Senior Backend Engineers", chip: true },
      { kind: "field", label: "Channel", value: "Outlook, from your address" },
      { kind: "section", title: "What each message does", hue: "blue", items: [
        "Answers the question they actually asked, not a template",
        "Restates the comp band, since three of four asked for it",
        "Offers two interview slots from your calendar",
      ] },
      { kind: "section", title: "Held back for you", hue: "rose", items: [
        "Meera Raghavan asked about visa sponsorship — needs a human answer",
      ] },
      { kind: "note", body: "Not wired yet. This will read `outreach_queue` and send through `org_integrations`." },
    ],
  },
};

/**
 * Starting points, rendered as plain lines under the composer.
 *
 * The reference puts these as bare text — no card, no border, no icon — and
 * that is the correct weight for them: they are examples of what to type, so
 * they should look like text you could have typed, not like features. An
 * earlier pass made each one a bordered tile, which is how four suggestions
 * became four more containers competing with the thing they were suggesting to.
 *
 * Per mode, because a sourcing example and an agent instruction are not
 * interchangeable and offering the wrong one teaches the wrong mental model.
 */
export const SUGGESTIONS: Record<ModeId, readonly string[]> = {
  sourcing: [
    "Staff engineers who have scaled Postgres past 10TB",
    "SRE leads in Bangalore, or remote anywhere in India",
    "Backend engineers from Series B companies, Go or Rust",
  ],
  agent: [
    "Chase the four candidates waiting on a reply",
    "Summarise every screening call from this week",
    "Draft outreach for everyone shortlisted but not contacted",
  ],
};

/* ═══════════════════════════ overview data ══════════════════════════════════

   What Home shows, and the one invariant that makes its campaign filter
   trustworthy:

       THE PARTS SUM TO THE WHOLE.

   Every number here is stored PER CAMPAIGN. "All campaigns" is not a fourth
   fixture sitting beside the three — it IS the three added up. That is the
   difference between a filter and a lie: were the overall totals their own
   hand-written numbers, the day someone edited one campaign the header would
   disagree with the sum of its own parts, and nothing in the type system would
   notice. 148 candidates is 78 + 46 + 24, and it reads 148 because that is
   what those add to, not because 148 is typed anywhere.

   Fixtures against `org_candidates` and `campaigns`.                         */

/** The fourteen days the chart plots and its x-axis labels. Oldest first. */
export const DAYS: readonly string[] = [
  "Mon 2", "Tue 3", "Wed 4", "Thu 5", "Fri 6", "Sat 7", "Sun 8",
  "Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13", "Sat 14", "Sun 15",
];

export type DayPoint = { day: string; n: number };

export type Funnel = {
  shortlisted: number; contacted: number; replied: number; interviews: number;
};

type CampaignOverview = {
  /** Sourced per day, index-aligned to DAYS. */
  sourced: readonly number[];
  funnel: Funnel;
  /** Open roles on the req. */
  open: number;
  /** Days since anything moved — the number that says a campaign has stalled. */
  quietFor: number;
};

/**
 * Keyed by the ids in workspaces.ts CAMPAIGNS — the canonical list the sidebar
 * switcher already reads.
 *
 * It did not used to be. This table carried its own `sbe` / `sre` / `ios` for
 * the same three campaigns the switcher called `backend-snr` / `platform-sre` /
 * `ios-mid`: two id spaces for one concept, which works right up until
 * something has to filter by campaign across both. Naming them once is what
 * lets Home's header, the task list and the sidebar mean the same campaign.
 *
 * Only three of the seven carry data. The scope switcher offers exactly these
 * plus All, because putting four all-zero views behind a control that looks
 * like it narrows data is a worse answer than not offering them.
 */
const OVERVIEW = {
  "backend-snr": {
    sourced: [3, 6, 5, 7, 6, 2, 1, 8, 10, 7, 11, 9, 2, 1],
    funnel: { shortlisted: 13, contacted: 33, replied: 10, interviews: 4 },
    open: 3, quietFor: 0,
  },
  "platform-sre": {
    sourced: [2, 3, 3, 5, 4, 1, 1, 5, 6, 4, 6, 5, 1, 0],
    funnel: { shortlisted: 7, contacted: 19, replied: 5, interviews: 1 },
    open: 2, quietFor: 2,
  },
  "ios-mid": {
    sourced: [1, 2, 1, 2, 2, 0, 0, 2, 3, 2, 4, 3, 1, 1],
    funnel: { shortlisted: 4, contacted: 9, replied: 2, interviews: 1 },
    open: 1, quietFor: 9,
  },
} as const satisfies Record<string, CampaignOverview>;

/** A campaign with overview data, as a literal union rather than `string`. */
export type CampaignKey = keyof typeof OVERVIEW;

/** What the overview is showing: everything, or one campaign. */
export type Scope = "all" | CampaignKey;

export const SCOPED: readonly CampaignKey[] =
  Object.keys(OVERVIEW) as CampaignKey[];

export const isScoped = (s: Scope): s is CampaignKey => s !== "all";

/** Display name from the canonical list, so no name is written twice. */
export const campaignName = (id: string): string =>
  CAMPAIGNS.find((c) => c.id === id)?.name ?? id;

/** The campaigns a scope covers — one, or all of them. This fold is the only
 *  place "all" is given meaning, so every card agrees on what it means. */
const keysFor = (scope: Scope): readonly CampaignKey[] =>
  isScoped(scope) ? [scope] : SCOPED;

export function sourcedFor(scope: Scope): readonly DayPoint[] {
  const keys = keysFor(scope);
  return DAYS.map((day, i) => ({
    day,
    n: keys.reduce((a, k) => a + (OVERVIEW[k].sourced[i] ?? 0), 0),
  }));
}

export type Step = { id: string; label: string; n: number; of: number };

/**
 * The four stages Home reports, in pipeline order.
 *
 * Starts at Shortlisted because Sourced is the chart directly above it, and a
 * number repeated two inches from its own graph is the kind of redundancy that
 * makes a dashboard feel padded.
 */
export function stepsFor(scope: Scope): readonly Step[] {
  const keys = keysFor(scope);
  const add = (pick: (f: Funnel) => number) =>
    keys.reduce((a, k) => a + pick(OVERVIEW[k].funnel), 0);

  const sourced = sourcedFor(scope).reduce((a, d) => a + d.n, 0);
  const contacted = add((f) => f.contacted);
  const replied = add((f) => f.replied);

  /* Each denominator is the step it came FROM, the only honest one for a
     funnel: 17 replies is 28% of the 61 contacted, not 11% of everyone
     sourced. Printed beside the bar so the ratio can be checked. */
  return [
    { id: "shortlisted", label: "Shortlisted", n: add((f) => f.shortlisted), of: sourced },
    { id: "contacted", label: "Contacted", n: contacted, of: sourced },
    { id: "replied", label: "Replied", n: replied, of: contacted },
    { id: "interviews", label: "Interviews", n: add((f) => f.interviews), of: replied },
  ];
}

export type ActiveCampaign = {
  id: CampaignKey;
  name: string;
  role: string;
  open: number;
  /**
   * Candidates in flight — DERIVED from the funnel, never stored. It used to be
   * its own fixture field reading 61 for Senior Backend Engineers, which was
   * also the OVERALL contacted count: one number that happened to equal a
   * different number, waiting to be read as the same fact. Deriving it means
   * this card and the Progress card cannot drift apart.
   */
  live: number;
  quietFor: number;
};

export function campaignsFor(scope: Scope): readonly ActiveCampaign[] {
  return keysFor(scope).map((k) => {
    const meta = CAMPAIGNS.find((c) => c.id === k);
    const o = OVERVIEW[k];
    return {
      id: k,
      name: meta?.name ?? k,
      role: meta?.role ?? "",
      open: o.open,
      live: o.funnel.contacted,
      quietFor: o.quietFor,
    };
  });
}

/** A campaign quiet this long has stalled rather than merely paused. */
export const STALE_DAYS = 7;

/* ═══════════════════════════ the agent fleet ════════════════════════════════

   The orchestrator does not do the work. It DEPLOYS agents — one or more per
   campaign, each working a stage of that campaign's pipeline — and supervises
   them. This is the Supervisor pattern, and the interface's job is to make the
   hierarchy legible: which agents exist, which stage each is on, what it is
   doing right now, and which of them needs a human.

   Fixtures against a future `agent_runs`. Frontend-only pass, so they are
   written to exercise EVERY state rather than to look healthy — a state that
   cannot be rendered is a state that has not been designed.

   ── WHY FRESHNESS IS A FIELD AND NOT A SPINNER ──
   Agents publish on independent schedules. One reports every few seconds while
   it streams, one wakes hourly, one only when an event arrives, and one is
   failing and retrying with backoff. So the interface cannot ask "what is
   happening now" and wait — it reads the LATEST KNOWN GOOD STATE and says how
   old that is. `seenAgo` is therefore not decoration; it is the difference
   between a status that is true and one that merely looks live. An agent
   `running` whose last word was nineteen minutes ago is a different fact from
   one that spoke four seconds ago, and only the timestamp tells them apart. */

/**
 * The states an agent run can be in.
 *
 * Deliberately the five the research names — queued, running, waiting,
 * error, done — rather than a boolean `busy`. Two of them are the reason the
 * list exists at all: `waiting` is the agent asking permission and is the only
 * state a human MUST act on, and `error` is the one a spinner would hide
 * forever.
 */
export type RunState = "queued" | "running" | "waiting" | "error" | "done";

/**
 * Why a run stopped, when it stopped badly.
 *
 * ── THE DISTINCTION IS THE WHOLE POINT ──
 * "tool" means a connector outside the agent's control broke: the mailbox
 * rejected the send, the search API timed out. "agent" means the agent itself
 * could not do the thing. Collapsing these into one red state is what makes a
 * user stop believing the product works — a broken integration reads as a
 * stupid agent, and they lose faith in the part that was fine.
 *
 * `fix` is the recovery path, because a failure state with no next step is a
 * dead end and the research is explicit that dead-end failures are what break
 * trust.
 */
export type Fault = {
  kind: "tool" | "agent";
  /** What broke, in the user's terms rather than the system's. */
  what: string;
  /** The one action that would clear it. */
  fix: string;
};

export type FleetAgent = {
  id: string;
  campaignId: CampaignKey;
  /** What this agent is for. Its own pipeline, not the campaign's. */
  role: string;
  state: RunState;
  /** Index into `steps`, so "which stage" is answerable without prose. */
  step: number;
  steps: readonly string[];
  /**
   * What it is doing right now, in one line. A legible statement of intent,
   * never an invented metric — "Ranking 61 matched profiles" is a claim the
   * fixture can back; "Analysing 1,204 profiles" would be a number with
   * nothing behind it.
   */
  doing: string;
  /** Minutes since this agent last reported. See the note above. */
  seenAgo: number;
  fault?: Fault;
  /** What it has produced so far, when that is a countable thing. */
  yielded?: string;
};

export const FLEET: readonly FleetAgent[] = [
  /* Healthy and mid-flight: the ordinary case, and the one that must stay
     quiet so the two below can be loud. */
  {
    id: "f1", campaignId: "backend-snr", role: "Sourcing",
    state: "running", step: 2,
    steps: ["Reading the brief", "Planning the search", "Matching the role", "Ranking candidates"],
    doing: "Matching the role against 61 contacted profiles",
    seenAgo: 0, yielded: "24 shortlisted",
  },
  /* WAITING — the only state a human must act on. Deliberately not an error:
     nothing is broken, the agent is being careful. */
  {
    id: "f2", campaignId: "backend-snr", role: "Outreach",
    state: "waiting", step: 1,
    steps: ["Drafting", "Awaiting approval", "Sending", "Logging replies"],
    doing: "Four drafts ready for your approval before anything sends",
    seenAgo: 12, yielded: "4 drafts",
  },
  /* ERROR, and it is a TOOL fault — the connector broke, not the agent. The
     copy has to say so, or this reads as the agent being incapable. */
  {
    id: "f3", campaignId: "platform-sre", role: "Outreach",
    state: "error", step: 2,
    steps: ["Drafting", "Awaiting approval", "Sending", "Logging replies"],
    doing: "Stopped after 6 of 19 sends",
    seenAgo: 41,
    fault: {
      kind: "tool",
      what: "The connected mailbox rejected the send — its daily limit is reached",
      fix: "Reconnect the mailbox or wait for the limit to reset",
    },
  },
  /* Queued behind f3, which is why it has not started: a queued agent with no
     visible reason reads as a stuck one. */
  {
    id: "f4", campaignId: "platform-sre", role: "Screening",
    state: "queued", step: 0,
    steps: ["Reading transcripts", "Scoring", "Summarising"],
    doing: "Waiting on the outreach run to finish",
    seenAgo: 41,
  },
  /* An AGENT fault, for contrast with f3. Same red state, completely different
     message and a different fix. */
  {
    id: "f5", campaignId: "ios-mid", role: "Sourcing",
    state: "error", step: 1,
    steps: ["Reading the brief", "Planning the search", "Matching the role", "Ranking candidates"],
    doing: "Could not plan a search from the brief",
    seenAgo: 9,
    fault: {
      kind: "agent",
      what: "The brief has no location or seniority, so the search matched too broadly to rank",
      fix: "Add a location or a seniority band and re-run",
    },
  },
  /* Finished. Present so the list has a resting end-state and so `done` is not
     a state only reachable by waiting. */
  {
    id: "f6", campaignId: "ios-mid", role: "Screening",
    state: "done", step: 2,
    steps: ["Reading transcripts", "Scoring", "Summarising"],
    doing: "Summarised 5 screening calls",
    seenAgo: 96, yielded: "5 summaries",
  },
];

/**
 * How urgently a state wants a human, lowest first.
 *
 * Module-level and exported because three callers need it — the agent sort,
 * the campaign sort, and the roster's lead pick — and a supervision order
 * written three times is three orders that will disagree. `waiting` leads
 * because it is the only state where work has halted pending a person.
 */
export const RUN_RANK: Record<RunState, number> = {
  waiting: 0, error: 1, running: 2, queued: 3, done: 4,
};

/** State → hue. Every one is an existing measured token; see the hues note. */
export const RUN_HUE: Record<RunState, Hue | null> = {
  /* No hue at all. A queued agent is the absence of activity, and giving it a
     colour would mean every row in the list is coloured — at which point the
     colour has stopped carrying information. */
  queued: null,
  running: "blue",
  waiting: "amber",
  error: "rose",
  done: "sage",
};

export const RUN_LABEL: Record<RunState, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Needs you",
  error: "Stopped",
  done: "Done",
};

/** The fleet for a scope, in the order a supervisor should read it. */
export function fleetFor(scope: Scope): readonly FleetAgent[] {
  const keys = keysFor(scope);
  const inScope = FLEET.filter((a) => keys.includes(a.campaignId));

  /* ── SORTED BY WHO NEEDS A HUMAN, NOT BY TIME ──
     A supervision list ordered by recency buries the one agent that is
     blocked behind five that are fine. `waiting` first because it is the only
     state where work has actually halted pending a person; then `error`;
     then the live ones; then the inert. Within a rank, least recently seen
     first — the quietest agent in a rank is the one most likely to be wrong. */
  return [...inScope].sort(
    (a, b) => RUN_RANK[a.state] - RUN_RANK[b.state] || b.seenAgo - a.seenAgo,
  );
}

/**
 * What an agent produced at a step it has FINISHED.
 *
 * ── WHY THERE IS NO ENTRY FOR THE CURRENT STEP ──────────────────────────────
 * Because `agent.doing` already says what the current step is doing, and a
 * fixture that stated it twice could state it differently. Keyed
 * `${agentId}:${stepIndex}` and populated only for indices strictly BELOW the
 * agent's `step`; `flowFor` reads `doing` for the step the agent is on. A test
 * pins that — a note at or past the current step is a contradiction waiting to
 * be rendered.
 *
 * Fixtures against `agent_runs`, same as FLEET.
 */
export const STEP_NOTE: Record<string, string> = {
  /* f1 — Sourcing, backend-snr, on step 2 of 4. */
  "f1:0": "Read the brief and pulled out six facets",
  "f1:1": "Built a four-clause search from seniority, skills and location",
  /* f2 — Outreach, backend-snr, on step 1 of 4. */
  "f2:0": "Wrote four drafts from the shortlist",
  /* f3 — Outreach, platform-sre, stopped on step 2 of 4. */
  "f3:0": "Wrote nineteen drafts",
  "f3:1": "Approved by you",
  /* f4 — Screening, platform-sre, queued on step 0. Nothing finished yet, so
     nothing here. An empty run is allowed to have an empty flow. */
  /* f5 — Sourcing, ios-mid, stopped on step 1 of 4. */
  "f5:0": "Read the brief",
  /* f6 — Screening, ios-mid, finished all three steps. */
  "f6:0": "Read five call transcripts",
  "f6:1": "Scored each against the interview scorecard",
  "f6:2": "Summarised 5 screening calls",
};

/**
 * The agents to show in the live feed, busiest first.
 *
 * ── WHY PER-AGENT AND NOT PER-CAMPAIGN ──────────────────────────────────────
 * The bar this replaces showed one card per campaign, which answered "which
 * campaigns exist" — a question the sidebar already answers. The feed answers
 * "who is working right now", and the thing that works is an AGENT. A campaign
 * does not read a brief; a Sourcing agent does.
 *
 * ── AND WHY FINISHED AND QUEUED AGENTS ARE NOT IN IT ────────────────────────
 * `done` has stopped and `queued` has not started, so neither can produce a
 * new line while you watch. A feed whose rows cannot change is a list.
 *
 * Capped at three because the ask was explicit and the reason is sound: this
 * sits above the composer, and a feed that grows without bound would push the
 * page's hero down every time someone deployed an agent.
 */
export function feedAgents(scope: Scope, cap = 3): readonly FleetAgent[] {
  const eligible = fleetFor(scope)
    /* ── `queued` IS OUT, `done` IS IN, AND THEY ARE NOT THE SAME CASE ──
       A queued agent has not started: no steps to show, nothing said, and no
       real last-heard time to order by. A FINISHED agent has a complete
       workflow and a true age, and "this one is done" is a thing a supervisor
       needs to see rather than have silently vanish. It renders paused. */
    .filter((a) => a.state !== "queued")
    .sort((a, b) => a.seenAgo - b.seenAgo);

  /* ── THE WORKING AGENT IS NEVER CROWDED OUT ──
     Ordering purely by recency let a running agent fall off the band the
     moment two others reported more recently — and the one agent actually
     producing work is the one the feed exists to show. So it is seated first
     and the remaining slots go to the most recent of the rest. With nothing
     running the band is simply the latest few, which is the same list. */
  const working = eligible.find((a) => a.state === "running");
  const rest = eligible.filter((a) => a.id !== working?.id);
  return (working ? [working, ...rest] : rest).slice(0, cap);
}

/**
 * The prompt that seeds the composer for an unstaffed pipeline stage.
 *
 * Exists as a function, and lives here, because two surfaces offer this same
 * action — the campaign timeline and the fleet board — and it shipped reading
 * "Deploy **a** outreach agent". The article depends on the role's first
 * sound, so it cannot be a fixed string in a template; `Outreach` is the one
 * of the three that takes "an", and a fourth role would get it right for free.
 */
export function deployPrompt(role: PipelineRole, campaign: string): string {
  const lower = role.toLowerCase();
  const article = /^[aeiou]/.test(lower) ? "an" : "a";
  return `Deploy ${article} ${lower} agent on ${campaign} that `;
}

/**
 * The word for a state — and for an error, the word for its KIND.
 *
 * `RUN_LABEL` says "Stopped" for both fault kinds, which is the collapse the
 * `Fault` docstring spends a paragraph forbidding: a broken mailbox and an
 * unusable brief need different people doing different things, and one red
 * noun on both teaches a user that the agent is simply unreliable.
 *
 * "Your turn" for `waiting` because the reader IS the blocker, and a surface
 * that knows that should say it in the second person.
 *
 * Lives here rather than in a component because two surfaces now show it —
 * the campaign bar and the fleet board — and a vocabulary written twice is two
 * vocabularies that will drift.
 */
export function wordFor(a: FleetAgent, state: RunState): string {
  if (state === "waiting") return "Your turn";
  if (state === "error") return a.fault?.kind === "tool" ? "Tool broke" : "Stuck";
  return RUN_LABEL[state];
}

/**
 * Role → hue. The timeline's spine is coloured by WHO did the work.
 *
 * ── WHY ROLE EARNS A HUE WHERE CAMPAIGN DID NOT ─────────────────────────────
 * Per-campaign colour was refused earlier on this surface, and the precedent
 * is in this repo: `Stack`'s per-entity hues were deleted because a hue every
 * sibling has encodes nothing. Role is the opposite case — there are exactly
 * THREE, they are a fixed ordered anatomy, and the question the timeline has
 * to answer is literally "which agent did what". Colour is the fastest
 * possible answer to a three-way identity question.
 *
 * ── AND WHY THESE THREE ─────────────────────────────────────────────────────
 * State already spends blue (running), amber (waiting), rose (error) and sage
 * (done). Teal, violet and brand are what is left, so no hue does double duty
 * and a reader never has to ask whether a colour means who or what.
 *
 * Measured: 3.30 / 3.68 / 3.53 against white, all clear of the 3:1 floor for a
 * meaningful mark. Separation ΔE 74.6 / 74.7 / 80.5 between the three — the
 * ring trio that had to be rebuilt in revision 38 was ΔE 9; anything past ~23
 * is comfortable. Minimum ΔE against ANY state hue is 30.7, so role and state
 * cannot be confused for each other either.
 *
 * Colour is never the only carrier: state rides on the node's SHAPE (filled,
 * ringed, outlined), so the whole timeline still reads in greyscale.
 */
export const ROLE_HUE: Record<PipelineRole, Hue> = {
  Sourcing: "teal",
  Outreach: "violet",
  Screening: "brand",
};

/**
 * When each step happened, in minutes before now. Keyed `${agentId}:${step}`.
 *
 * ── THE FIELD THAT MAKES A CHRONOLOGY HONEST ────────────────────────────────
 * `flowFor` deliberately groups by AGENT rather than interleaving, and the
 * reason was recorded at the time: `seenAgo` is per agent, so there were no
 * per-step timestamps to sort on and a merged timeline would have had to
 * invent the order two agents' steps happened in.
 *
 * This is that missing column, declared rather than derived. `agent_runs`
 * would log a transition per step; nothing here is computed from a string or
 * guessed from position. With it, `timelineFor` can merge every agent's work
 * into one true sequence — which is the whole point of a campaign timeline.
 *
 * INVARIANT, pinned by test: an agent's LAST entry equals its `seenAgo`. The
 * most recent step is by definition when the agent last reported, and a
 * fixture that disagreed would put a step after the agent's own clock.
 */
export const STEP_AT: Record<string, number> = {
  /* f1 — Sourcing, backend-snr, running, last seen 0m. */
  "f1:0": 180, "f1:1": 95, "f1:2": 0,
  /* f2 — Outreach, backend-snr, waiting on a person, last seen 12m. */
  "f2:0": 48, "f2:1": 12,
  /* f3 — Outreach, platform-sre, stopped, last seen 41m. */
  "f3:0": 300, "f3:1": 210, "f3:2": 41,
  /* f4 — Screening, platform-sre, queued behind f3, last seen 41m. */
  "f4:0": 41,
  /* f5 — Sourcing, ios-mid, stopped on the brief, last seen 9m. */
  "f5:0": 75, "f5:1": 9,
  /* f6 — Screening, ios-mid, finished, last seen 96m. */
  "f6:0": 260, "f6:1": 180, "f6:2": 96,
};

/** One thing one agent did, at one time. */
export type TimelineEvent = {
  id: string;
  agent: FleetAgent;
  role: PipelineRole;
  /** The step's own name — "Planning the search". */
  step: string;
  /** What it produced. Absent only where the fixture has no note. */
  note?: string;
  /** Minutes before now. */
  at: number;
  /**
   * `done` — finished and moved on.
   * `doing` — the step in flight; this agent is thinking about it right now.
   * `blocked` — halted here, either asking a person or broken.
   */
  kind: "done" | "doing" | "blocked";
};

/**
 * Every agent's work on one campaign, merged into one sequence, oldest first.
 *
 * Interleaved across agents — which `flowFor` could not do and this can, only
 * because `STEP_AT` exists. Reading top to bottom you see the campaign's
 * actual history: Sourcing reads the brief, Sourcing plans a search, Outreach
 * starts drafting off what Sourcing found, and so on, with the handoffs
 * visible as the spine changes colour.
 */
export function timelineFor(campaignId: CampaignKey): readonly TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const agent of fleetFor(campaignId)) {
    agent.steps.forEach((step, i) => {
      /* Steps the agent has not reached have not happened, so they are not
         events. A timeline is a record of what occurred, not a plan. */
      const reached = agent.state === "done" ? i <= agent.step : i <= agent.step;
      if (!reached) return;
      const at = STEP_AT[`${agent.id}:${i}`];
      if (at === undefined) return;
      const current = i === agent.step && agent.state !== "done";
      out.push({
        id: `${agent.id}:${i}`,
        agent,
        role: agent.role as PipelineRole,
        step,
        note: current ? agent.doing : STEP_NOTE[`${agent.id}:${i}`],
        at,
        kind: current
          ? (agent.state === "waiting" || agent.state === "error" ? "blocked" : "doing")
          : "done",
      });
    });
  }
  /* Oldest first: a timeline is read downward in the order things happened,
     and the newest event is what the reader ends on — which is why the live
     agent lands at the bottom rather than needing to be sought at the top. */
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Campaigns worth showing in the bar, most recently active first.
 *
 * ── TWO RULES, BOTH ASKED FOR AND BOTH DEFENSIBLE ───────────────────────────
 * FINISHED CAMPAIGNS ARE OMITTED. A campaign whose every agent is `done` has
 * nothing in flight, so it cannot change while you are looking at it and it
 * cannot need you. Keeping it would spend a slot in a bar whose whole job is
 * "what is happening now" on the one thing that definitionally is not.
 *
 * SORTED BY LATEST ACTIVITY, not by urgency — and this differs from
 * `rosterFor` on purpose. The roster answers "where should I look first",
 * so it leads with whoever needs a human. This bar answers "what is moving",
 * so it leads with whatever reported most recently. Two questions, two orders;
 * collapsing them would make one of the two surfaces lie.
 */
export function activeCampaigns(scope: Scope): readonly CampaignRoster[] {
  return rosterFor(scope)
    .filter((c) => c.agents.some((a) => a.state !== "done"))
    /* ── SORTED BY THE NUMBER THE CARD SHOWS ──
       First draft sorted on the freshest agent's `seenAgo` while the card
       displayed the LEAD's, so the rendered ages ran 12m, 9m, 41m — an order
       the reader cannot verify because the key is off screen. Same fault the
       rail's tiebreak had in revision 42: ranking on a number the surface
       does not display. `leadOf` is what the card renders, so the bar is now
       legible top to bottom. */
    .sort((a, b) => leadOf(a).seenAgo - leadOf(b).seenAgo);
}

/**
 * The agent a campaign's card speaks for: the one that most needs a person,
 * and among equals the one heard from most recently.
 *
 * Exported because the card renders it and `activeCampaigns` sorts on it, and
 * a lead picked two different ways is two different leads.
 */
export function leadOf(c: CampaignRoster): FleetAgent {
  return [...c.agents].sort(
    (x, y) => RUN_RANK[x.state] - RUN_RANK[y.state] || x.seenAgo - y.seenAgo,
  )[0]!;
}

/** A step in an agent's flow, and whether it has been reached. */
export type FlowStep = {
  name: string;
  state: "done" | "at" | "ahead";
  /**
   * What happened. Present for finished steps and for the one in flight;
   * absent for steps not reached — a step the agent has not started has
   * nothing honest to say about itself.
   */
  note?: string;
};

export type AgentFlow = { agent: FleetAgent; steps: readonly FlowStep[] };

/**
 * Everything the agents on one campaign have done, per agent, in order.
 *
 * ── DERIVED, NOT AUTHORED ───────────────────────────────────────────────────
 * The flow is a projection of FLEET — each agent's own `steps` array split at
 * its `step` index — rather than a second hand-written history of the campaign.
 * A parallel narrative is free to disagree with the roster it sits behind: the
 * row could say "Matching the role" while the flow showed the search still
 * being planned, and nothing in the type system would notice. Deriving it means
 * the two cannot drift, for the same reason the overview's totals are folds of
 * their parts rather than a fourth stored number.
 *
 * Grouped BY AGENT rather than interleaved into one campaign-wide timeline,
 * and that is a data-honesty limit, not a layout preference: `seenAgo` is per
 * agent, so there are no per-step timestamps to interleave on. A merged
 * timeline would have to invent the order steps happened in across two agents.
 */
export function flowFor(campaignId: CampaignKey): readonly AgentFlow[] {
  return fleetFor(campaignId).map((agent) => ({
    agent,
    steps: agent.steps.map((name, i): FlowStep => {
      /* A finished agent has no step in flight. Without this, `done` would
         render its last step as the one currently running — which is how a
         completed run ends up looking like it is still going. */
      const at = agent.state !== "done" && i === agent.step;
      const done = agent.state === "done" ? i <= agent.step : i < agent.step;
      return {
        name,
        state: at ? "at" : done ? "done" : "ahead",
        note: at ? agent.doing : done ? STEP_NOTE[`${agent.id}:${i}`] : undefined,
      };
    }),
  }));
}

/**
 * One campaign, as the roster reads it.
 *
 * `lead` is the agent a supervisor should look at first — `fleetFor` already
 * sorts by who needs a human, so it is simply the head of that list. The row's
 * headline and its age both describe the lead, because "this campaign last
 * reported 12m ago" is a weaker fact than "the thing waiting on you has been
 * waiting 12m".
 */
/**
 * The ordered anatomy of a campaign.
 *
 * ── THIS IS THE STRUCTURE THE ROSTER WAS THROWING AWAY ──────────────────────
 * `role` is not a free-form label, it is a position in a three-stage pipeline:
 * you source candidates, you reach out to them, you screen the ones who reply.
 * The order is a product fact, not a sort preference.
 *
 * Stating it lets the surface draw what ISN'T there, which turns out to be the
 * most differentiating fact in the fixture — every campaign is missing a
 * different slot:
 *
 *   backend-snr   Sourcing 3/4 · Outreach 2/4 · ——           missing the END
 *   platform-sre  ——          · Outreach 3/4 · Screening 1/3 missing the START
 *   ios-mid       Sourcing 2/4 · ——          · Screening 3/3 missing the MIDDLE
 *
 * All three rendered `2 agents` before this, so all three were structurally
 * indistinguishable. ios-mid in particular has a broken front end and a
 * finished back end, and the old row could not say so.
 */
export const AGENT_ROLES = ["Sourcing", "Outreach", "Screening"] as const;

export type PipelineRole = (typeof AGENT_ROLES)[number];

/**
 * One stage of a campaign's pipeline — the agent filling it, or nothing.
 *
 * `agent: null` is the information, not a missing case to guard against. A
 * campaign with no Screening agent has a real, actionable gap, and the only way
 * to draw a gap is to render the slot whether or not it is filled.
 */
export type PipelineSlot = { role: PipelineRole; agent: FleetAgent | null };

export type CampaignRoster = {
  id: CampaignKey;
  name: string;
  agents: readonly FleetAgent[];
  /** All three stages, in pipeline order, filled or empty. */
  slots: readonly PipelineSlot[];
  needsYou: number;
  /** How many of this campaign's agents have stopped rather than asked. */
  stopped: number;
};

/**
 * The fleet folded onto its campaigns.
 *
 * ── WHY THE ROSTER IS PER CAMPAIGN AND NOT PER RUN ──────────────────────────
 * The flat list showed six rows for three campaigns at 552px — 55% of the
 * viewport — and made the reader do the grouping: two Outreach rows on two
 * different campaigns sat adjacent and read as one campaign's pair. A
 * supervisor watches CAMPAIGNS and wants to know, per campaign, whether
 * anything needs them and what is moving. That is one row each.
 *
 * Campaigns with no agents are omitted rather than listed empty: the roster
 * answers "what are my agents doing", and a campaign with none deployed has no
 * answer to give here.
 */
/**
 * How many campaigns the strip draws before it folds the rest into a count.
 *
 * ── WHY A CAP AND NOT A SCROLL ──────────────────────────────────────────────
 * The pipeline strip is correct at three campaigns and wrong at twelve: a
 * horizontal anatomy needs width per stage, and past a handful the right shape
 * is a list again. Two topologies for one component is precisely the
 * second-convention-beside-the-first this codebase refuses.
 *
 * So the precondition is made true BY CONSTRUCTION rather than hoped for.
 * `rosterFor` already sorts by who needs a human, which means the first three
 * are by definition the ones that need attention and the tail is by definition
 * the part that does not — the cap is not an arbitrary truncation, it is the
 * sort's own answer to "which three matter".
 */
export const STRIP_CAP = 3;

export function rosterFor(scope: Scope): readonly CampaignRoster[] {
  const out: CampaignRoster[] = [];
  for (const id of keysFor(scope)) {
    const agents = fleetFor(id);
    if (agents.length === 0) continue;
    /* Indexed by role so a slot can be empty. `find` rather than a map built
       from the agents, because the AGENT_ROLES order has to drive the output —
       building from the agents would order the slots by whoever happens to
       exist and lose the anatomy. */
    const slots = AGENT_ROLES.map((role): PipelineSlot => ({
      role,
      agent: agents.find((a) => a.role === role) ?? null,
    }));
    out.push({
      id,
      name: campaignName(id),
      agents,
      slots,
      needsYou: agents.filter((a) => a.state === "waiting").length,
      stopped: agents.filter((a) => a.state === "error").length,
    });
  }
  /* ── BY THE LEAD'S STATE, USING THE AGENT RANK VERBATIM ──
     The first draft of this sorted on `needsYou > 0`, which collapsed
     `waiting` and `error` into one bucket — and that contradicted the very
     rule it claimed to be reusing. Inside a campaign `fleetFor` puts `waiting`
     (a human must act) ahead of `error` (something broke); a boolean at the
     campaign level threw that away, so a campaign whose agent was merely
     stopped could outrank one actually waiting on a person.

     Ranking campaigns by their LEAD's state is the same rule one level up, and
     now genuinely so. Ties break on who has been unheard longest — the
     quietest campaign in a rank is the one most likely to be wrong. */
  /* ── BY THE MOST URGENT AGENT ON THE CAMPAIGN ──
     Was `RUN_RANK[lead.state]`, which is the same comparison — `lead` was the
     rank-0 agent — but reading it off the agents directly is what lets the
     lead concept go. `pickLead` was a max(), and a max() is why 3 of 3 rows
     were loud, why all three steppers drew the same length, and why the one
     running agent never reached the screen. */
  return out.sort(
    (a, b) => rankOf(a) - rankOf(b) || quietestOf(b) - quietestOf(a),
  );
}

/** The rank of a campaign's most urgent agent. */
const rankOf = (c: CampaignRoster): number =>
  Math.min(...c.agents.map((a) => RUN_RANK[a.state]));

/**
 * How long the agent the heading speaks for has been silent.
 *
 * ── THE TIEBREAK MUST USE A NUMBER THE SURFACE SHOWS ──
 * First version took `Math.max` over every agent's `seenAgo`, which put iOS
 * (9m) ahead of Platform SRE (41m) among the two stopped campaigns — because
 * iOS's max came from its FINISHED Screening agent at 96m. A finished agent
 * being quiet for 96 minutes is not staleness, it is completion, and it has no
 * business ordering anything.
 *
 * Worse, the region's heading displays the urgent agent's age, so the sort was
 * ranking on a number the reader could not see while the visible ages ran 9m
 * then 41m — ascending, against a rule that says quietest first. Reading the
 * same agent the heading reads makes the order legible from the screen.
 */
const quietestOf = (c: CampaignRoster): number => {
  let best = c.agents[0]!;
  for (const a of c.agents) if (RUN_RANK[a.state] < RUN_RANK[best.state]) best = a;
  return best.seenAgo;
};

/**
 * "4m ago" / "just now".
 *
 * Under a minute reads as "just now" rather than "0m ago": zero is a real
 * number and printing it beside a live agent invites the reader to wonder
 * whether the clock is broken.
 */
export function seen(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ═════════════════════════ grounded recommendations ═════════════════════════

   `SUGGESTIONS` is a static list per mode — the same three strings whatever
   the recruiter has actually been doing. That is a placeholder wearing the
   clothes of a recommendation.

   These are grounded: each one states the OBSERVATION it came from, so the
   recruiter can judge the suggestion instead of trusting it. A recommendation
   that cannot say why it is being made is indistinguishable from an ad.

   Fixtures, derived from the same task and campaign fixtures the rest of the
   surface reads — so the counts in `because` match what Home would show. */

export type Recommendation = {
  id: string;
  /** The observation. What in the data prompted this. */
  because: string;
  /** The prompt it would hand the composer. Seeds, never sends. */
  prompt: string;
  /** Which campaign it came out of, or null for cross-campaign. */
  campaignId: CampaignKey | null;
};

export const RECOMMENDATIONS: readonly Recommendation[] = [
  {
    id: "r1",
    because: "17 of 61 contacted have replied — 44 have not",
    prompt: "Draft a second follow-up for the 44 contacted candidates who have not replied.",
    campaignId: "backend-snr",
  },
  {
    id: "r2",
    because: "iOS Engineers has had no movement in 9 days",
    prompt: "Why has the iOS Engineers campaign stalled, and what would restart it?",
    campaignId: "ios-mid",
  },
  {
    id: "r3",
    because: "Your last three searches all asked for Postgres at scale",
    prompt: "Save my Postgres-at-scale criteria as a reusable filter set.",
    campaignId: null,
  },
  {
    id: "r4",
    because: "24 shortlisted, 0 contacted on Senior Backend Engineers",
    prompt: "Draft first-touch outreach for everyone shortlisted but not yet contacted.",
    campaignId: "backend-snr",
  },
];

export function recommendationsFor(scope: Scope): readonly Recommendation[] {
  const keys = keysFor(scope);
  return RECOMMENDATIONS.filter(
    (r) => r.campaignId === null || keys.includes(r.campaignId),
  );
}
