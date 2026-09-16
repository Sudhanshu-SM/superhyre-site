import {
  CalendarBlank, ChartBar, ChatCircleDots, Check, Clock,
  ClockCounterClockwise, Envelope, FilePdf, FileText, Files, FunnelSimple,
  MicrosoftOutlookLogo, MicrosoftTeamsLogo, NotionLogo, Plugs, SlackLogo,
  Sparkle, Target, UsersThree, VideoCamera,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

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

/** Recent briefs. Fixtures — there is no `agent_conversations` table yet. */
export const BRIEFS: readonly Brief[] = [
  { id: "b1", title: "Staff engineers who have scaled Postgres", campaign: "Senior Backend Engineers", when: "2h", mode: "sourcing" },
  { id: "b2", title: "Chase the four candidates waiting on a reply", campaign: "Senior Backend Engineers", when: "Yesterday", mode: "agent" },
  { id: "b3", title: "SRE leads, Bangalore or remote India", campaign: "Platform SRE", when: "2d", mode: "sourcing" },
  { id: "b4", title: "Summarise every screening call this week", campaign: "iOS Engineers", when: "4d", mode: "agent" },
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
};

/* Real brand marks, not a generic glyph each. A channel row is answering
   "which platform", and a recruiter recognises the logo a half-second before
   they read the word — which is the entire reason this row exists rather than
   a line of text in settings. Phosphor ships all four, so no new dependency
   and no hand-pasted SVG to go stale. */
export const CHANNELS: readonly Channel[] = [
  { id: "slack", name: "Slack", Icon: SlackLogo, connected: true, detail: "#hiring-backend" },
  { id: "outlook", name: "Outlook", Icon: MicrosoftOutlookLogo, connected: true, detail: "Outreach from your address" },
  { id: "teams", name: "Teams", Icon: MicrosoftTeamsLogo, connected: false, detail: "Interview scheduling" },
  { id: "notion", name: "Notion", Icon: NotionLogo, connected: false, detail: "Sync the scorecard" },
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

/* ════════════════════════════════ tiles ═════════════════════════════════════

   The bento is CONFIGURED, not hard-coded. A recruiter's home should show the
   things that recruiter looks at, and the previous version shipped four tiles
   of one kind (a title and a sentence) which made the asymmetry decorative —
   the grid claimed content weight it did not have.

   A tile kind therefore has to earn its place by showing something structurally
   different: a ring, a funnel, a stack of faces, a file list, a time strip. If
   two kinds would render the same shape, one of them should not exist.        */

export type TileSize = "s" | "m" | "l";

/** What a size means in grid terms. `l` is the only one that takes two rows. */
/**
 * Spans, against a THREE-column grid.
 *
 * `m` at 2 of 3 columns plus an `s` at 1 fills a row exactly, which is what
 * the two-wide/two-narrow default depends on. `l` keeps its two rows for
 * anyone who wants a tall tile from the gallery, but nothing ships with one.
 */
export const TILE_SPAN: Record<TileSize, { cols: number; rows: number }> = {
  s: { cols: 1, rows: 1 },
  m: { cols: 2, rows: 1 },
  l: { cols: 2, rows: 2 },
};

export const TILE_SIZE_LABEL: Record<TileSize, string> = {
  s: "Small", m: "Wide", l: "Large",
};

export type TileKind =
  | "resume" | "suggest" | "pipeline" | "replies"
  | "sources" | "calendar" | "channels" | "metric";

export type TileSpec = {
  /** Stable per placement, so two tiles of the same kind can coexist. */
  id: string;
  kind: TileKind;
  size: TileSize;
  hue: Hue;
};

/**
 * The gallery. `reads` names the table each tile will query once the backend
 * exists, and the tile renders that name where a real product would render a
 * "last updated" — the same honesty rule the reply copy follows.
 */
export type TileKindInfo = {
  kind: TileKind;
  label: string;
  blurb: string;
  Icon: Icon;
  size: TileSize;
  hue: Hue;
  reads: string;
  /**
   * The smallest size that actually holds this kind's content.
   *
   * Data rather than a rule in the menu, because the constraint belongs to the
   * content and not to the UI that happens to change it — `setKind` and `add`
   * both enforce it without either knowing which kind is awkward.
   *
   * It exists because of one measurement: `pipeline` needs 222px and a
   * single-height tile gets 140px, so putting it at `m` overflowed its own
   * card by 51px and drew the action straight through the funnel bars. Every
   * other kind was measured under 140 (resume 139, metric 137, calendar 135,
   * sources 136, suggest 125, replies 121, channels 118).
   */
  minSize: TileSize;
};

/** s < m < l, for comparing against `minSize`. */
export const SIZE_RANK: Record<TileSize, number> = { s: 0, m: 1, l: 2 };

export const TILE_KINDS: readonly TileKindInfo[] = [
  { kind: "resume", label: "Pick up where you left off", Icon: ClockCounterClockwise,
    blurb: "The brief you last worked, and how far it got.",
    size: "m", hue: "brand", reads: "agent_conversations", minSize: "s" },
  { kind: "pipeline", label: "Pipeline", Icon: FunnelSimple,
    blurb: "Stage-by-stage counts for this campaign.",
    size: "m", hue: "violet", reads: "org_candidates", minSize: "m" },
  { kind: "replies", label: "Waiting on you", Icon: ChatCircleDots,
    blurb: "Candidates who replied and have had no answer.",
    size: "m", hue: "rose", reads: "outreach_queue", minSize: "s" },
  { kind: "calendar", label: "Next interviews", Icon: CalendarBlank,
    blurb: "What is scheduled over the next few days.",
    size: "m", hue: "blue", reads: "interviews", minSize: "s" },
  { kind: "sources", label: "Role context", Icon: Files,
    blurb: "Job descriptions and notes this campaign reads from.",
    size: "s", hue: "amber", reads: "campaign_documents", minSize: "s" },
  { kind: "channels", label: "Channels", Icon: Plugs,
    blurb: "Where the agent is allowed to speak.",
    size: "s", hue: "teal", reads: "org_integrations", minSize: "s" },
  { kind: "metric", label: "Single metric", Icon: ChartBar,
    blurb: "One number with its trailing shape.",
    size: "s", hue: "sage", reads: "org_candidates", minSize: "s" },
  { kind: "suggest", label: "Suggested brief", Icon: Sparkle,
    blurb: "A brief worth running, from the campaign's current state.",
    size: "s", hue: "violet", reads: "agent_conversations", minSize: "s" },
];

export const TILE_KIND_INFO: Record<TileKind, TileKindInfo> =
  Object.fromEntries(TILE_KINDS.map((k) => [k.kind, k])) as Record<TileKind, TileKindInfo>;

/**
 * The layout a new recruiter lands on.
 *
 * Deliberately not one of everything: eight tiles is a wall, and a default
 * that overwhelms teaches people to ignore the surface rather than shape it.
 *
 * Cut from five to three, and the reason is worth recording. Five tiles plus a
 * task list filled the viewport so completely that the composer — the actual
 * product — ended up 557px below the fold, and the surface came back judged
 * cluttered. The default now leaves the composer and one row of context above
 * the fold, and anyone who wants the other five kinds can add them. A default
 * has to be defensible on a laptop, not on the largest screen in the office.
 */
export const DEFAULT_LAYOUT: readonly TileSpec[] = [
  /* FOUR tiles, two wide and two narrow, over the three-column grid:
       row 1   resume (2 cols) + metric (1)
       row 2   pipeline (2)    + channels (1)

     `replies` ("Waiting on you") is OUT and `pipeline` has its wide slot.
     Both are one row tall, so neither leaves the dead space the old two-row
     pipeline did.

     Pipeline fits a single row now because its funnel runs in two columns —
     five stages over three rows is 50px against the 86px a single column
     needed, which is what took it from 222px to inside the 106px content box.
     See `.vz-funnel` for the column-major reasoning. */
  { id: "t-resume", kind: "resume", size: "m", hue: "brand" },
  { id: "t-metric", kind: "metric", size: "s", hue: "sage" },
  { id: "t-pipeline", kind: "pipeline", size: "m", hue: "violet" },
  { id: "t-channels", kind: "channels", size: "s", hue: "teal" },
];

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
  campaign: string;
  /** Urgency drives the leading dot's hue and the ordering, not decoration. */
  urgent: boolean;
  chips: readonly TaskChip[];
};

export const TASKS: readonly TaskItem[] = [
  { id: "k1", title: "Approve the outreach draft for four staff engineers",
    state: "doing", campaign: "Senior Backend Engineers", urgent: true,
    chips: [{ label: "By today", hue: "rose", Icon: Clock }, { label: "4 drafts", hue: "blue", Icon: Envelope }] },
  { id: "k2", title: "Screening call with Meera Raghavan",
    state: "todo", campaign: "Senior Backend Engineers", urgent: true,
    chips: [{ label: "10:30", hue: "amber", Icon: Clock }, { label: "Join", hue: "blue", Icon: VideoCamera }] },
  { id: "k3", title: "Confirm the comp band before the hiring-manager loop",
    state: "blocked", campaign: "Senior Backend Engineers", urgent: false,
    chips: [{ label: "Waiting on Punith", hue: "rose", Icon: UsersThree }] },
  { id: "k4", title: "Shortlist the Bangalore SRE longlist",
    state: "todo", campaign: "Platform SRE", urgent: false,
    chips: [{ label: "By tomorrow", hue: "teal", Icon: Clock }, { label: "31 to review", hue: "violet", Icon: Target }] },
  { id: "k5", title: "Send the iOS screening summaries to the panel",
    state: "done", campaign: "iOS Engineers", urgent: false,
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
