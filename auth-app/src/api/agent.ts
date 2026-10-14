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
  createdAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  runs: Array<{ id: string; skill: string; status: string; campaignId: string | null; createdAt: string }>;
  eventCursor: number;
};

export type Verdict = { requirementId: string; verdict: "met" | "partial" | "not_met" | "unknown"; evidence: string };

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
};

export type ChatCard =
  | {
      kind: "people";
      key: string;
      source: "matches" | "pipeline" | "found";
      campaignId: string | null;
      campaignName: string | null;
      narrowedTo: string | null;
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
    }
  /** A kind this console does not know (a newer server): kept in order, drawn as nothing. */
  | { kind: "unknown"; key: string; was: string };

/** A next step an outcome offers: opens somewhere, or says something to the agent. */
export type Suggestion = { label: string; href?: string; text?: string };

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
};

export type SourcingStatus = {
  approvedSpec: { id: string; version: number } | null;
  /** People found for this campaign: the same count every page gives, whatever was decided since. */
  shown: number;
  /** What the found people add up to. Absent from older servers. */
  counts?: MatchCounts;
  requests: number;
  nextSize: number;
  exhausted: boolean;
  crustdata: boolean;
};

/* Told after a shortlist or a pass lands, so what shows a campaign's counts can read them again. */
const decided = new Set<(campaignId: string) => void>();
export function onDecision(fn: (campaignId: string) => void): () => void {
  decided.add(fn);
  return () => { decided.delete(fn); };
}
const told = (campaignId: string) => { for (const fn of decided) fn(campaignId); };

export const agentApi = {
  conversations: () => api<{ conversations: Conversation[] }>("GET", "/v1/conversations"),
  createConversation: (focusCampaignId?: string) =>
    api<Conversation>("POST", "/v1/conversations", focusCampaignId ? { focusCampaignId } : {}),
  conversation: (id: string) => api<ConversationDetail>("GET", `/v1/conversations/${id}`),
  send: (id: string, body: { clientId: string; text: string; campaignId?: string }) =>
    api<{ message: ChatMessage; runId: string }>("POST", `/v1/conversations/${id}/messages`, body),
  decide: (runId: string, seq: number, decision: "approve" | "decline") =>
    api<Record<string, unknown>>("POST", `/v1/runs/${runId}/approvals/${seq}`, { decision }),
  sourcing: (campaignId: string) => api<SourcingStatus>("GET", `/v1/campaigns/${campaignId}/sourcing`),
  /** From a chat, the search belongs to it and to the turn (`parentRunId`) it was asked from. */
  findMore: (campaignId: string, from?: { conversationId: string; parentRunId: string }) =>
    api<{ runId: string; size: number }>("POST", `/v1/campaigns/${campaignId}/sourcing`, from ?? {}),
  matchProfile: (campaignId: string, personId: string) =>
    api<MatchProfile>("GET", `/v1/campaigns/${campaignId}/matches/${personId}`),
  decisions: (campaignId: string) =>
    api<{ shortlisted: string[]; passed: string[] }>("GET", `/v1/campaigns/${campaignId}/matches/decisions`),
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
  approve: (campaignId: string, specId: string, opts: { match?: boolean } = {}) =>
    api<SpecRow & { matching?: { kind: "search" | "rank"; runId: string; people: number } | null }>(
      "POST",
      `/v1/campaigns/${campaignId}/spec/${specId}/approve${opts.match ? "?match=true" : ""}`,
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
