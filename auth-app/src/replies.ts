import { REPLY_FIXTURE } from "./orchestrator";
import type { ModeId, ReplyArtefact } from "./orchestrator";

/* ═══════════════════════════════ replies ════════════════════════════════════

   WHAT AN AGENT SAYS, AND THE THREE SHAPES IT COMES IN.

   ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
   The surface had exactly one reply shape: the artefact — an addressed card
   with tinted sections and a commit button. It is the right shape for what it
   is, and it was the ONLY shape, which made it wrong by default: most answers
   to most questions are a paragraph. Rendering "148 sourced, 24 shortlisted,
   the bottleneck is the reply rate" as a reviewable object with a commit
   button would be claiming there is something to commit, and there is not.

   So a reply is a union of three kinds, and the artefact is the SPECIAL one:

     prose      the common case. A paragraph or two, no container.
     question   the agent needs something from the recruiter before it can act.
     artefact   a reviewable object with one act waiting on it.

   The distinction is load-bearing. The artefact earns its card because it is
   a thing you accept, edit or send; a paragraph is not, and giving prose a
   card would flatten the difference between "here is what I found" and "here
   is what I will do if you press this". If everything is a card, the card
   stops meaning anything.

   ── THE TRACE IS ORTHOGONAL ─────────────────────────────────────────────────
   All three kinds can carry a `trace`: the ordered steps the run took and —
   the interesting half — what each one turned up. It hangs off the union
   rather than off one kind because "what did you look at to get here" is a
   question you can ask of an answer, a question or an artefact alike.

   ── NOTHING HERE RAN ────────────────────────────────────────────────────────
   Every field below is a fixture. The trace steps in particular are the steps
   the real pipeline WILL execute — they are `STAGES[mode]` in the past tense,
   deliberately, so the four labels a recruiter watches go by while the brief
   runs are the same four they can open afterwards. Neither list reports work
   that happened, and Reply.tsx prints a line inside every expanded trace
   saying so and naming `agent_conversations`.                                */

/**
 * One step of a run: what it did, what it concluded, and what it came across.
 *
 * `found` is the half that matters. A trace that only lists steps is a
 * progress bar with extra words — "Read the brief" tells a recruiter nothing
 * they could not have assumed. "Read the brief → the comp band is in a
 * separate doc, not in the brief" is the part they could not have known, and
 * it is also the part that explains the answer that follows.
 */
export type TraceStep = {
  label: string;
  /** What the step concluded. Optional: some steps only turn things up. */
  detail?: string;
  /** What it came across. Optional: some steps only conclude. */
  found?: readonly string[];
};

/**
 * One tappable answer to a clarifying question.
 *
 * Two fields rather than one, because the pill and the sentence are not the
 * same text. The pill has to fit on a line next to three others ("Include
 * them"); what lands in the composer has to survive being sent on its own
 * ("Include candidates who are up to two years short on seniority, and mark
 * them as a stretch"). Collapsing them would force one of the two to be bad.
 *
 * `text` is a DRAFT, never an act — Reply.tsx hands it to `onAnswer`, which
 * seeds the composer and gives the recruiter the caret. Same contract as the
 * suggestions under the composer and the briefs in the rail: the surface
 * offers you a sentence, you send it.
 */
export type QuickReply = { label: string; text: string };

export type AgentReply =
  /** Paragraphs. The default, and the one that should look like nothing. */
  | { kind: "prose"; thoughtMs: number; trace?: readonly TraceStep[]; body: readonly string[] }
  /** The agent asks. `options` are drafts; the composer is the free-text path. */
  | {
      kind: "question";
      thoughtMs: number;
      trace?: readonly TraceStep[];
      ask: string;
      /** What the answer changes. Optional, because sometimes it is obvious. */
      why?: string;
      options: readonly QuickReply[];
    }
  /** The reviewable object, from orchestrator.ts. */
  | { kind: "artefact"; thoughtMs: number; trace?: readonly TraceStep[]; artefact: ReplyArtefact };

/* ── the step labels, once per mode ──────────────────────────────────────────
   Named constants rather than twelve literals, and the reason is correctness
   rather than tidiness: these are `STAGES[mode]` in the past tense, and the
   claim the trace makes — "these are the steps the run executes" — only holds
   while all three replies in a mode name the SAME four steps. Spelled out at
   the call sites via a short key so a fixture still reads as a fixture.      */

const SRC_STEP = {
  brief: "Read the brief",
  plan: "Planned the search",
  match: "Matched the role",
  rank: "Ranked the candidates",
} as const;

const AGT_STEP = {
  brief: "Read the brief",
  campaign: "Checked the campaign",
  sequence: "Sequenced the work",
  draft: "Drafted next steps",
} as const;

/* ── the fixtures ────────────────────────────────────────────────────────────
   Ordered prose, question, artefact — prose first because prose is the common
   case and an array a caller walks by index should start at the ordinary
   thing. Every number below comes from the fixtures the rest of the surface
   already renders: PIPELINE (148 sourced, 24 shortlisted, 61 contacted, 17
   replied, 6 interviewing), WAITING (Meera 3d, Tobias 2d, Priya 2d, Daniel
   1d), SOURCES (the JD, the scorecard, the comp doc) and SCHEDULE (Meera at
   10:30 today). A reply that disagreed with the tile above it would be worse
   than no reply.                                                             */

export const REPLIES: Record<ModeId, readonly AgentReply[]> = {
  sourcing: [
    {
      kind: "prose",
      thoughtMs: 2400,
      body: [
        "148 people have been sourced for Senior Backend Engineers and 24 are shortlisted, so roughly one in six is clearing the bar you set. For a staff-level brief that is a healthy rate, and it is not where this campaign is losing people.",
        "The drop is further down. 61 have been contacted and 17 have replied, which is a little over a quarter, and four of those replies are still waiting on an answer from you — three of them for two days or more. Six candidates are interviewing.",
      ],
      trace: [
        {
          label: SRC_STEP.brief,
          detail: "Senior Backend Engineers. Postgres at scale is the one hard requirement.",
          found: [
            "Senior Backend Engineer JD, 82 KB",
            "The comp band is a separate 14 KB doc, not part of the brief",
          ],
        },
        {
          label: SRC_STEP.plan,
          detail: "Nothing to search. The question was about the campaign, not about candidates.",
        },
        {
          label: SRC_STEP.match,
          detail: "Counted the five pipeline stages instead, widest first.",
          found: ["148 sourced, 24 shortlisted", "61 contacted, 17 replied", "6 interviewing"],
        },
        {
          label: SRC_STEP.rank,
          detail: "Ranked the stage-to-stage drops to find the widest one.",
          found: [
            "Contacted to replied is the widest drop by far",
            "Four replies are unanswered — Meera Raghavan has waited 3 days",
          ],
        },
      ],
    },
    {
      kind: "question",
      thoughtMs: 3100,
      ask: "Should I shortlist people who are short on seniority but strong on the hard requirement?",
      why: "It changes one candidate today — Anika Bose, strong Postgres, two years short — and it changes every run of this brief after that.",
      options: [
        {
          label: "Include them",
          text: "Include candidates who are up to two years short on seniority, and mark them as a stretch.",
        },
        {
          label: "Keep them separate",
          text: "Keep anyone short on seniority out of the shortlist and in a second list I can review separately.",
        },
        {
          label: "Exact matches only",
          text: "Only shortlist candidates who meet the seniority bar, and drop the rest.",
        },
      ],
      trace: [
        {
          label: SRC_STEP.brief,
          detail: "The brief asks for senior, and does not say what counts as senior.",
          found: ["The JD asks for 8+ years", "The brief itself gives no number"],
        },
        {
          label: SRC_STEP.plan,
          detail: "Four filters, ordered by how hard each one cuts.",
          found: ["Postgres at scale cuts hardest", "Location was the loosest — India or remote"],
        },
        {
          label: SRC_STEP.match,
          detail: "Scored all 148 sourced profiles against the four filters.",
          found: ["12 clear every filter", "1 clears every filter except seniority"],
        },
        {
          label: SRC_STEP.rank,
          detail: "Stopped at the one I cannot place without you.",
          found: [
            "Anika Bose has 6 years against the JD's 8, and the deepest Postgres work of anyone sourced",
            "Nobody shortlisted so far sits under the bar, so there is no precedent to copy",
          ],
        },
      ],
    },
    {
      kind: "artefact",
      thoughtMs: 4200,
      artefact: REPLY_FIXTURE.sourcing,
      trace: [
        {
          label: SRC_STEP.brief,
          detail: "Senior Backend Engineers. Postgres at scale is the one hard requirement.",
          found: ["Senior Backend Engineer JD, 82 KB", "Interview scorecard, synced from Notion 2h ago"],
        },
        {
          label: SRC_STEP.plan,
          detail: "Four filters, ordered by how hard each one cuts.",
          found: ["Postgres at scale cuts hardest", "Go or Rust was treated as a preference, not a filter"],
        },
        {
          label: SRC_STEP.match,
          detail: "Scored all 148 sourced profiles against the four filters.",
          found: ["12 clear every filter", "2 of the 12 are already in another campaign of yours"],
        },
        {
          label: SRC_STEP.rank,
          detail: "Ordered by the hard requirement first, then by everything else.",
          found: [
            "Meera Raghavan scaled Postgres to 40TB at a payments company",
            "Daniel Okoro's scaling story fits, but it is Rust rather than Go",
          ],
        },
      ],
    },
  ],

  agent: [
    {
      kind: "prose",
      thoughtMs: 2100,
      body: [
        "Four candidates are waiting on a reply, and three of them have been waiting two days or more. Meera Raghavan is the oldest at three days, and she already has a screening booked with you at 10:30 today.",
        "Three of the four asked about the comp band, which I can answer from the doc attached to this campaign. Meera's question is about visa sponsorship, and nothing in the brief, the JD or the comp doc covers it — so that one needs you rather than me.",
      ],
      trace: [
        {
          label: AGT_STEP.brief,
          detail: "Chase the candidates waiting on a reply.",
          found: ["All four are in Senior Backend Engineers"],
        },
        {
          label: AGT_STEP.campaign,
          detail: "61 contacted, 17 replied, 4 of those still unanswered.",
          found: [
            "Meera Raghavan, 3 days",
            "Tobias Lindqvist and Priya Anand, 2 days each",
            "Daniel Okoro, 1 day",
          ],
        },
        {
          label: AGT_STEP.sequence,
          detail: "Split them by whether the answer already exists here.",
          found: ["Three asked about comp — the doc answers it", "One asked about sponsorship — nothing answers it"],
        },
        {
          label: AGT_STEP.draft,
          detail: "Nothing drafted. The question was about the state of the threads, not about sending.",
        },
      ],
    },
    {
      kind: "question",
      thoughtMs: 2800,
      ask: "Meera Raghavan asked whether this role sponsors a visa. What should I tell her?",
      why: "Nothing in the campaign answers it, and she has been waiting three days. Whatever you say here I will reuse for anyone else who asks.",
      options: [
        {
          label: "We sponsor",
          text: "Tell her this role sponsors visas, and say the same in any other thread that asks.",
        },
        {
          label: "We don't",
          text: "Tell her this role cannot sponsor a visa, and say the same in any other thread that asks.",
        },
        {
          label: "Case by case",
          text: "Tell her sponsorship is decided case by case, and flag her question for the hiring manager.",
        },
        {
          label: "I'll answer her",
          text: "Leave Meera Raghavan's thread alone — I will answer her about sponsorship myself.",
        },
      ],
      trace: [
        {
          label: AGT_STEP.brief,
          detail: "Chase the candidates waiting on a reply.",
          found: ["Meera Raghavan's thread is the oldest of the four, at 3 days"],
        },
        {
          label: AGT_STEP.campaign,
          detail: "Searched all three attached documents for an answer. None of them say.",
          found: [
            "Senior Backend Engineer JD — no mention of sponsorship",
            "Comp band, IN + remote — salary only",
            "No sponsorship field anywhere on the campaign",
          ],
        },
        {
          label: AGT_STEP.sequence,
          detail: "Held her thread back and left the other three ready.",
          found: ["The other 60 contacted candidates give no precedent to copy"],
        },
        {
          label: AGT_STEP.draft,
          detail: "Did not draft this one. A guess here is a promise about someone's right to work.",
        },
      ],
    },
    {
      kind: "artefact",
      thoughtMs: 3600,
      artefact: REPLY_FIXTURE.agent,
      trace: [
        {
          label: AGT_STEP.brief,
          detail: "Chase the four candidates waiting on a reply.",
          found: ["All four are in Senior Backend Engineers"],
        },
        {
          label: AGT_STEP.campaign,
          detail: "61 contacted, 17 replied, 4 of those still unanswered.",
          found: ["Outlook is connected and sends from your address", "Two interview slots are free tomorrow morning"],
        },
        {
          label: AGT_STEP.sequence,
          detail: "Comp questions first, since the answer already exists here.",
          found: ["Three of the four asked about the comp band", "One asked about visa sponsorship"],
        },
        {
          label: AGT_STEP.draft,
          detail: "Four messages. Three are complete; one is held back for you.",
          found: [
            "Each one answers the question that was actually asked",
            "Meera Raghavan's needs a human answer on sponsorship",
          ],
        },
      ],
    },
  ],
};
