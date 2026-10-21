import { api } from "./client";

/** Shapes from the API's agent, matching and sourcing modules (server/src/modules/{agent,matching,sourcing}). */

export type Conversation = {
  id: string;
  title: string | null;
  focusCampaignId: string | null;
  focusCampaignName?: string | null;
  lastMessage?: string | null;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  seq: number;
  role: "user" | "assistant";
  text: string;
  clientId: string | null;
  runId: string | null;
  campaignIds: string[];
  /** What the message kept of a press: an answer given on a question's card, or a button's words. Absent for typed words. */
  artifact?: Record<string, unknown> | null;
  createdAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  runs: Array<{ id: string; skill: string; status: string; campaignId: string | null; createdAt: string }>;
  eventCursor: number;
};

export type Verdict = {
  requirementId: string;
  verdict: "met" | "partial" | "not_met" | "unknown";
  evidence: string;
  /** Why, in a few words (results made under policy v2 have one). */
  rationale?: string;
};

export type Tier = "A" | "B" | "C";

/**
 * What a match row says about fit (server: modules/matching/results.ts). Every figure is the server's; the console only
 * shows them. All of it is absent from an older server, which sent `score` as 0 to 1 and no status.
 */
export type MatchStatus = "scored" | "insufficient_evidence" | "not_scored_yet" | "knocked_out";

export type RequirementResult = {
  id: string;
  text: string;
  importance: "knockout" | "must" | "nice";
  weight: number;
  verdict: "met" | "partial" | "not_met" | "unknown";
  /** The profile's own words; empty when there is none to quote. */
  evidence: string;
  rationale: string;
  /** What this requirement added to the fit (weight times credit); null when it could not be assessed. */
  contribution: number | null;
  /** Who settled it: the profile's own fields ("code"), the model, or an earlier version of the role. */
  by?: "code" | "model" | "earlier";
};

export type MatchOverride = {
  by: string | null;
  reason: string;
  at: string;
  from: Tier | null;
  to: Tier;
  /** The role-spec version the call was first made on, when it carries over to a later one. */
  carriedFrom?: number;
  /** The system's result has changed since the call was made. */
  systemChanged?: boolean;
};

export type MatchKnockout = {
  reason: string;
  rule: string;
  evidence: string | null;
  at: string;
  override?: { by: string | null; reason: string; at: string };
};

/** The one resolved state to show for a person on a role (words, colour, a quiet note): what every screen says. */
export type MatchDisplay = {
  label: string;
  tone: "strong" | "good" | "partial" | "needs_evidence" | "not_scored" | "ruled_out";
  note: string | null;
};

export type MatchFit = {
  /** The resolved state to show; absent from an older server. */
  display?: MatchDisplay;
  /** 0 to 100, only for a valid fit. */
  score: number | null;
  /** 0 to 100: how much of the role could be checked. */
  coverage: number | null;
  status: MatchStatus;
  fit: 1 | 2 | 3 | null;
  toVerify: Array<{ requirementId: string; text: string }>;
  requirements: RequirementResult[];
  strengths: string[];
  concerns: string[];
  missing: string[];
  /** Why there is no tier, in plain words. */
  note: string | null;
  knockout: MatchKnockout | null;
  override: MatchOverride | null;
  policyVersion: "v1" | "v2";
  rubricVersion: number;
  evaluatedAt: string | null;
};

export type Match = {
  personId: string;
  fullName: string;
  headline: string | null;
  currentTitle: string | null;
  currentCompanyName: string | null;
  city: string | null;
  linkedinUrl: string | null;
  profileImageUrl: string | null;
  yearsOfExperience: number | null;
  source: string;
  stage: "rules" | "features" | "judged";
  score: number | null;
  tier: "A" | "B" | "C" | null;
  knockedOut: string | null;
  judgement: { verdicts: Verdict[]; strengths: string[]; concerns: string[] } | null;
  /** Fit, coverage, status, the requirement-level verdicts and the audit facts. Absent from older servers. */
  display?: MatchFit["display"];
  fit?: MatchFit["fit"];
  status?: MatchStatus;
  coverage?: MatchFit["coverage"];
  toVerify?: MatchFit["toVerify"];
  requirements?: MatchFit["requirements"];
  strengths?: MatchFit["strengths"];
  concerns?: MatchFit["concerns"];
  missing?: MatchFit["missing"];
  note?: MatchFit["note"];
  knockout?: MatchFit["knockout"];
  override?: MatchFit["override"];
  policyVersion?: MatchFit["policyVersion"];
  rubricVersion?: MatchFit["rubricVersion"];
  evaluatedAt?: MatchFit["evaluatedAt"];
  /** Whether this workspace has an email or a phone for them, never what it is. Absent from older servers. */
  hasEmail?: boolean;
  hasPhone?: boolean;
  /** Contact details were looked up (or typed); false means nobody has asked for them yet. */
  contactsChecked?: boolean;
  /** What was decided about them (on the board, or passed); null or absent while they wait for a call. */
  decision?: "shortlisted" | "passed" | null;
};

/**
 * What the people a campaign's searches found add up to, said by the server once for every page:
 * `found` never shrinks when someone is decided; it splits into decided, waiting for a call, ruled
 * out by a hard requirement, and not ranked yet on the approved spec.
 */
export type MatchCounts = {
  found: number;
  shortlisted: number;
  passed: number;
  toReview: number;
  ruledOut: number;
  unranked: number;
  /** People with a tier. One definition, said the same by the card, the live view and the agent. Absent from older servers. */
  matchedClosely?: number;
  /** Read, but too little on the profile for a tier (0% coverage included): not counted as matched. */
  needsEvidence?: number;
  /** Not read closely yet. With the people ruled out, these three add up to everyone found. */
  notScoredYet?: number;
};

export type MatchAuditEntry = {
  id: string;
  specVersion: number;
  kind: "scored" | "override" | "override_cleared";
  fromTier: Tier | null;
  toTier: Tier | null;
  reason: string | null;
  by: string | null;
  byName: string | null;
  snapshot: Record<string, unknown>;
  at: string;
};

/** A campaign's ranked list: the people waiting for a call (`rows`) and those already decided. */
export type MatchList = { spec: SpecRow | null; rows: Match[]; decided?: Match[]; counts?: MatchCounts };

/**
 * What the chat shows beside the agent's words (server: modules/agent/cards.ts). A lookup
 * the agent made arrives as a card; `key` names what it is about, so asking again replaces it.
 */
export type CardPerson = {
  /** A sourced person, not yet on the board. */
  personId: string | null;
  /** A candidate in this workspace. */
  candidateId: string | null;
  campaignCandidateId: string | null;
  name: string;
  title: string | null;
  company: string | null;
  city: string | null;
  years: number | null;
  tier: "A" | "B" | "C" | null;
  stage: string | null;
  daysInStage: number | null;
  strengths: string[];
  concerns: string[];
  linkedinUrl: string | null;
  /** Their details on file, only on a card the person asked for them with. */
  email?: string | null;
  phone?: string | null;
};

/**
 * A drafted role spec to approve, as one card (server: `role_spec` in agent/cards.ts). What is true now (draft, approved,
 * finding people) is read from the campaign's spec when it is drawn; these fields are what it showed when it was made.
 */
export type RoleSpecCardData = {
  kind: "role_spec";
  key: string;
  campaignId: string;
  campaignName: string;
  /** The drafted version; null when nothing was drafted (the card offers to try again). */
  specId: string | null;
  version: number | null;
  spec: {
    title: string;
    seniority: string | null;
    locations: string[];
    remoteOk: boolean;
    yearsMin: number | null;
    yearsMax: number | null;
    mustCount: number;
    niceCount: number;
    musts: string[];
    avoid: string[];
  } | null;
  approved: boolean;
  /** Why it stands unfinished, in a calm sentence. */
  trouble: string | null;
  /** `drafting`: the job description is still being read; the draft that follows replaces this card (same key). */
  status?: "drafting" | "ready";
};

export type ChatCard =
  | {
      kind: "people";
      key: string;
      source: "matches" | "pipeline" | "found";
      campaignId: string | null;
      campaignName: string | null;
      narrowedTo: string | null;
      /** What each person shows beyond the name, when the person's remembered preferences say less; absent shows all. */
      fields?: Array<"role" | "city" | "fit" | "stage">;
      total: number;
      people: CardPerson[];
    }
  | {
      kind: "campaign";
      key: string;
      campaignId: string;
      name: string;
      status: string;
      client: string | null;
      target: number | null;
      location: string | null;
      stages: Array<{ stage: string; people: number }>;
      spec: { title: string; version: number | null } | null;
      draftWaiting: boolean;
      sourcing: { shown: number; exhausted: boolean; nextSize: number } | null;
      watches: Array<{ summary: string; state: string; found: number }>;
    }
  | {
      kind: "view";
      key: string;
      /** Which of the console's views to draw in the chat (see chatViews.ts). */
      view: string;
      campaignId: string | null;
      campaignName: string | null;
      candidateIds: string[];
      personIds: string[];
      query: string | null;
    }
  | {
      kind: "campaigns";
      key: string;
      items: Array<{ id: string; name: string; status: string; client: string | null }>;
    }
  | {
      /** What a write did, with the numbers and the obvious next steps (agent-framework.md section 6). */
      kind: "outcome";
      key: string;
      summary: string;
      counts: Record<string, number> | null;
      next: Suggestion[];
      /** The way back for a change that ran at once ("Undo"), as the words to say to the agent. */
      undo: Suggestion | null;
      campaignId: string | null;
      capability: string | null;
    }
  | RoleSpecCardData
  | {
      /** A quiet button to a page of the console, after a short how-to answer. */
      kind: "link";
      key: string;
      label: string;
      href: string;
    }
  | {
      /** What needs the person across their open campaigns: a row each, most urgent first, with a quiet button on each. */
      kind: "attention";
      key: string;
      /** Home's own task figures: the open tasks assigned to the person, and how many are late, due today, or later. */
      tasks: { open: number; overdue: number; today: number; later: number } | null;
      items: Array<{ campaignId: string | null; campaign: string; group?: "overdue" | "today" | "waiting" | "soon"; line: string; cta: Suggestion }>;
      more: number;
    }
  | {
      /** How many people are at each stage on each campaign: one compact table with a totals row. */
      kind: "counts";
      key: string;
      columns: string[];
      rows: Array<{ id: string; name: string; client: string | null; cells: number[]; extras: Array<{ name: string; people: number }>; hiresWanted?: number | null }>;
      totals: number[];
    }
  | {
      /** A file the person takes, made in the browser from their own rows when they press the button. */
      kind: "export";
      key: string;
      campaignId: string;
      campaignName: string;
      list: "shortlist" | "pipeline";
      format: "csv" | "xlsx";
    }
  | {
      /** A sheet the person takes: counts and names only; the file is made by the API when they press Download. */
      kind: "file";
      key: string;
      sheetId: string;
      title: string;
      filename: string;
      rows: number;
      columns: number;
      /** The API path that makes the file ("/v1/sheets/:id/download"). */
      downloadUrl: string;
      /** Set once the sheet was put in their Google Drive. */
      googleUrl: string | null;
      /** The list had more than a file holds. */
      capped: boolean;
    }
  | {
      /** A connection the agent needs and the person has not made: opens the sign-in, then carries on. */
      kind: "connect";
      key: string;
      provider: "google" | "slack" | "notion";
      url: string | null;
      /** `token`: the server has no sign-in to open, so the card asks for the token itself. */
      mode: "oauth" | "token" | null;
      field: { label: string; help: string } | null;
      reason: string | null;
      /** What to send again once connected; the turn's own message when absent. */
      retryText: string | null;
      /**
       * Something the person asked for is held up on this connection, so the card carries on once it is made.
       * False when it was asked for on its own ("connect Gmail"); an older server does not say, which reads as true.
       */
      waiting?: boolean;
      /** The name on the card when it is not Gmail's ("Google Calendar"), and which parts of Google it is for. */
      label?: string | null;
      products?: Array<"gmail" | "sheets" | "calendar" | "tasks">;
    }
  | {
      /** Someone with no email: look it up or add it by hand, then the times they were wanted for. */
      kind: "need_email";
      key: string;
      campaignCandidateId: string;
      candidateId: string;
      campaignId: string | null;
      name: string;
    }
  | {
      /** Free times on the person's calendar to pick from. A pick asks the agent to book it; nothing is booked here. */
      kind: "slots";
      key: string;
      timezone: string;
      durationMinutes: number;
      forName: string | null;
      campaignId: string | null;
      campaignCandidateId: string | null;
      slots: Array<{ startsAt: string; endsAt: string; when: string }>;
      /** Hours the person never stated, said on the card as the usual ones. */
      assumed: string[];
    }
  | {
      /** Emails written to look over: each in full, with its words, so the chat shows what is waiting in Outreach. */
      kind: "drafts";
      key: string;
      campaignId: string | null;
      campaignName: string | null;
      emails: Array<{ messageId: string; to: string; subject: string; body: string }>;
    }
  /** A kind this console does not know (a newer server): kept in order, drawn as nothing. */
  | { kind: "unknown"; key: string; was: string };

/** A next step an outcome offers: opens somewhere, or says something to the agent. */
export type Suggestion = {
  label: string;
  href?: string;
  text?: string;
  /** The exact people this follow-up is about: pressing it sends them as data, and only they are acted on. */
  only?: { campaignId: string; campaignCandidateIds: string[] };
};

/** A sourced person's profile for the sheet (server: matching `matchProfile`). Never holds contacts. */
export type MatchProfile = {
  profile: {
    personId: string;
    fullName: string;
    headline: string | null;
    summary: string | null;
    currentTitle: string | null;
    currentCompanyName: string | null;
    city: string | null;
    country: string | null;
    locationText: string | null;
    yearsOfExperience: number | null;
    linkedinUrl: string | null;
    completeness: "basic" | "scraped" | "enriched";
    experiences: Array<{
      title: string | null;
      company: string | null;
      description: string | null;
      startDate: string | null;
      endDate: string | null;
      isCurrent: boolean;
    }>;
    skills: string[];
  };
  education: unknown[];
  profileImageUrl: string | null;
  stage: "rules" | "features" | "judged" | null;
  score: number | null;
  tier: "A" | "B" | "C" | null;
  judgement: { verdicts: Verdict[]; strengths: string[]; concerns: string[] } | null;
} & Partial<Omit<MatchFit, "score">> & { knockedOut?: string | null };

export type SourcingStatus = {
  approvedSpec: { id: string; version: number } | null;
  /** People found for this campaign: the same count every page gives, whatever was decided since. */
  shown: number;
  /** What the found people add up to. Absent from older servers. */
  counts?: MatchCounts;
  /** Found people still waiting for a close read against the approved spec. Absent from older servers. */
  unscored?: number;
  /** The found people by where they stand, counted once on the server. Absent from older servers. */
  standing?: FoundBuckets;
  /** A search or a scoring going now, with its run to follow. Absent from older servers. */
  running?: { runId: string; kind: "search" | "rescore" } | null;
  /** The latest search or scoring that has ended, so a screen that was following it can show it done. Absent from older servers. */
  lastRun?: { runId: string; kind: "search" | "rescore"; status: "done" | "failed" | "cancelled"; finishedAt: string | null } | null;
  requests: number;
  nextSize: number;
  exhausted: boolean;
  crustdata: boolean;
};

export type FoundBuckets = { found: number; strong: number; good: number; partial: number; needsEvidence: number; notScored: number; ruledOut: number };

/* Told after a shortlist or a pass lands, so what shows a campaign's counts can read them again. */
const decided = new Set<(campaignId: string) => void>();
export function onDecision(fn: (campaignId: string) => void): () => void {
  decided.add(fn);
  return () => { decided.delete(fn); };
}
const told = (campaignId: string) => { for (const fn of decided) fn(campaignId); };

/**
 * What a button asks for in code, beside its words: the invitation for one person at a time picked on the free-times
 * card (`book`), or free times for one person (`times`). The server does it without reading the words as a question.
 */
export type Structured = {
  book?: { campaignCandidateId: string; startsAt: string; endsAt: string };
  times?: { campaignCandidateId: string };
  /** The card that gets this person's email, asked for in code. */
  contacts?: { campaignCandidateId: string };
  /** A button on a card about particular people: those people, as ids. What the agent does is for them only. */
  only?: { campaignId: string; campaignCandidateIds: string[] };
};

export const agentApi = {
  conversations: () => api<{ conversations: Conversation[] }>("GET", "/v1/conversations"),
  createConversation: (focusCampaignId?: string) =>
    api<Conversation>("POST", "/v1/conversations", focusCampaignId ? { focusCampaignId } : {}),
  conversation: (id: string) => api<ConversationDetail>("GET", `/v1/conversations/${id}`),
  /** `quiet` is the label of the button the words came from: they are sent, but shown as no message of the person's. */
  send: (id: string, body: { clientId: string; text: string; campaignId?: string; quiet?: string } & Structured) =>
    api<{ message: ChatMessage; runId: string }>("POST", `/v1/conversations/${id}/messages`, body),
  /** The pick on a question's card. `again` is a Send again after the turn it started did not come through. */
  answer: (id: string, body: { clientId: string; runId: string; seq: number; ids: string[]; value?: string; again?: boolean }) =>
    api<{ runId: string; repeated: boolean; answer: { ids: string[]; value?: string; line: string } & Record<string, unknown> }>(
      "POST", `/v1/conversations/${id}/answer`, body,
    ),
  /** `attempt` is only sent by a Try again: which answer of the card this tab was looking at. */
  decide: (
    runId: string,
    seq: number,
    decision: "approve" | "decline",
    attempt?: number,
    /** What was done on the card itself first: one of the times it offered (by place) and the Meet link on or off. */
    edit?: { slot?: number; meet?: boolean },
  ) =>
    api<Record<string, unknown>>("POST", `/v1/runs/${runId}/approvals/${seq}`, {
      decision,
      ...(attempt === undefined ? {} : { attempt }),
      ...(edit?.slot === undefined ? {} : { slot: edit.slot }),
      ...(edit?.meet === undefined ? {} : { meet: edit.meet }),
    }),
  sourcing: (campaignId: string) => api<SourcingStatus>("GET", `/v1/campaigns/${campaignId}/sourcing`),
  /** From a chat, the search belongs to it and to the turn (`parentRunId`) it was asked from. */
  /** "Score the rest": the people found and not yet read closely are scored on the approved spec, as a run of its own. */
  score: (campaignId: string, actionId?: string) =>
    api<{ runId: string; people: number; already: boolean }>("POST", `/v1/campaigns/${campaignId}/sourcing/score`, actionId ? { actionId } : {}),
  findMore: (campaignId: string, from?: { conversationId: string; parentRunId: string }, actionId?: string) =>
    api<{ runId: string; size: number }>("POST", `/v1/campaigns/${campaignId}/sourcing`, { ...(from ?? {}), ...(actionId ? { actionId } : {}) }),
  matchProfile: (campaignId: string, personId: string) =>
    api<MatchProfile>("GET", `/v1/campaigns/${campaignId}/matches/${personId}`),
  decisions: (campaignId: string) =>
    api<{ shortlisted: string[]; passed: string[] }>("GET", `/v1/campaigns/${campaignId}/matches/decisions`),
  /** A recruiter's own call on a result, with the reason; `to: "clear"` takes their call back. `key` is a person id or a board card id. */
  override: (campaignId: string, key: string, input: { to: Tier | "clear"; reason?: string }) =>
    api<MatchFit & { personId: string; tier: Tier | null }>("POST", `/v1/campaigns/${campaignId}/matches/${key}/override`, input),
  /** Everything the system and the team did to one result, newest first. */
  audit: (campaignId: string, key: string) =>
    api<{ entries: MatchAuditEntry[] }>("GET", `/v1/campaigns/${campaignId}/matches/${key}/audit`),
  /** Asks for more of a thin profile to be filled in, so the result can be made on more than a headline. */
  screen: (campaignId: string, key: string) =>
    api<{ queued: boolean; heldBack: boolean }>("POST", `/v1/campaigns/${campaignId}/matches/${key}/screen`, {}),
  cancel: (runId: string) => api<Record<string, unknown>>("POST", `/v1/runs/${runId}/cancel`),
  shortlist: (campaignId: string, personIds: string[]) =>
    api<{ added: number }>("POST", `/v1/campaigns/${campaignId}/matches/shortlist`, { personIds }).then((r) => { told(campaignId); return r; }),
  reject: (campaignId: string, personIds: string[], reason?: string) =>
    api<{ rejected: number }>("POST", `/v1/campaigns/${campaignId}/matches/reject`, {
      personIds,
      ...(reason ? { reason } : {}),
    }).then((r) => { told(campaignId); return r; }),
};

/* ── role spec (server/src/modules/matching) ───────────────────────────── */

export type Requirement = {
  id: string;
  kind: "skill" | "experience" | "title" | "domain" | "education" | "location" | "language" | "other";
  text: string;
  importance: "knockout" | "must" | "nice";
  weight: number;
  skill?: string | null;
  minYears?: number | null;
};

export type RoleSpec = {
  title: string;
  seniority?: string | null;
  yearsMin?: number | null;
  yearsMax?: number | null;
  locations: string[];
  remoteOk: boolean;
  requirements: Requirement[];
  avoid: string[];
};

export type SpecRow = {
  id: string;
  version: number;
  spec: RoleSpec;
  jdText: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export const specApi = {
  get: (campaignId: string) =>
    api<{ latest: SpecRow | null; approved: SpecRow | null }>("GET", `/v1/campaigns/${campaignId}/spec`),
  draft: (campaignId: string, jdText?: string) =>
    api<SpecRow>("POST", `/v1/campaigns/${campaignId}/spec/draft`, jdText ? { jdText } : {}),
  draftFromFile: (campaignId: string, file: File) =>
    api<SpecRow>("POST", `/v1/campaigns/${campaignId}/spec/draft-from-file`, file, {
      headers: { "content-type": file.type || "application/octet-stream" },
    }),
  save: (campaignId: string, spec: RoleSpec) => api<SpecRow>("PUT", `/v1/campaigns/${campaignId}/spec`, { spec }),
  /**
   * Approving with `match` also starts matching: the first search when nobody was found yet, or the
   * people already found ranked on this version. `matching` says which (null: nothing to start).
   */
  approve: (campaignId: string, specId: string, opts: { match?: boolean; actionId?: string } = {}) =>
    api<SpecRow & { matching?: { kind: "search" | "rank"; runId: string; people: number } | null }>(
      "POST",
      `/v1/campaigns/${campaignId}/spec/${specId}/approve${opts.match ? `?match=true${opts.actionId ? `&actionId=${encodeURIComponent(opts.actionId)}` : ""}` : ""}`,
    ),
};

/** What the server read out of a file attached in the chat (POST /v1/attachments/read). */
export type ReadFile = {
  text: string;
  pages: number;
  kind: "job_description" | "resume" | "document";
  truncated: boolean;
};

export const attachmentApi = {
  /** The file's text. The body is the file itself, sent as its own type; nothing is kept on the server. */
  read: (file: Blob, type: string) =>
    api<ReadFile>("POST", "/v1/attachments/read", file, { headers: { "content-type": type } }),
};

/** The filters a recruiter set for a campaign's searches, over what its role spec says. */
export const filtersApi = {
  save: (campaignId: string, filters: Readonly<Record<string, readonly string[] | readonly [number, number] | string | boolean>>) =>
    api<{ id: string }>("PUT", `/v1/campaigns/${campaignId}/filters`, { filters }),
};
