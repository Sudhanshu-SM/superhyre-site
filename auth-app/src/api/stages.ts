import type { StageKind } from "../campaignsData";
import type { StageHue } from "../stageDonut";
import { api } from "./client";
import { publicApi } from "./forms";

/**
 * A campaign's own pipeline stages, the client link and the client's review page, as the API serves them
 * (server: the campaign stages module). Stores and pages call these; the wire shapes are the contract's.
 *
 * A stage is a column of the board. Its `kind` is what the numbers treat it as (shortlisted, outreach,
 * interviewing, hired, passed); its name and colour are the campaign's own. Hired and Rejected are locked and
 * always last.
 */

export type { StageKind } from "../campaignsData";

/** The kinds a working stage can count as. Hired and Rejected are not a choice: they are always there, at the end. */
export type WorkingKind = Extract<StageKind, "shortlisted" | "outreach" | "interviewing">;
export const WORKING_KINDS: readonly WorkingKind[] = ["shortlisted", "outreach", "interviewing"];

/** The palette keys a stage's colour may be: the same strings the server validates. */
export type StageColor = StageHue;

export type StageDef = {
  id: string;
  name: string;
  kind: StageKind;
  position: number;
  /** One of the palette keys, or null for the default tone of its kind. */
  color: StageColor | null;
  /** The stage the client sees on their review page. At most one per campaign. */
  clientView: boolean;
  /** Hired and Rejected: fixed name, fixed colour, always last. */
  locked: boolean;
  /** Cards in it, when the server counted. */
  count?: number;
};

/** One working stage as it is sent. A stage that has an `id` is kept (renamed, recoloured, moved); one without is new. */
export type StageInput = { id?: string; name: string; kind: WorkingKind; color?: StageColor | null; clientView?: boolean };

export type StagesBody = {
  stages: StageInput[];
  /** Where the people of a removed stage go, by the removed stage's id. */
  moveTo?: Record<string, string>;
};

export const getStages = (campaignId: string) =>
  api<{ stages: StageDef[] }>("GET", `/v1/campaigns/${campaignId}/stages`).then((r) => r.stages);

export const putStages = (campaignId: string, body: StagesBody) =>
  api<{ stages: StageDef[] }>("PUT", `/v1/campaigns/${campaignId}/stages`, body).then((r) => r.stages);

/* ── the client link (staff) ── */

export type ClientLink = {
  enabled: boolean;
  url: string | null;
  /** The stage the client is shown. */
  stageId: string | null;
  /** People waiting for the client's word. */
  waiting: number;
  verdicts: { approved: number; declined: number };
};

/** What a client said about one person. */
export type ClientVerdict = { verdict: "approved" | "declined"; note: string | null; reviewerName: string | null; at: string };

export const getClientLink = (campaignId: string) => api<ClientLink>("GET", `/v1/campaigns/${campaignId}/client-review`);
/** Makes the link, or a new one: the old address stops working. Turns it on. */
export const makeClientLink = (campaignId: string) => api<ClientLink>("POST", `/v1/campaigns/${campaignId}/client-review`);
export const turnOffClientLink = (campaignId: string) => api<ClientLink | undefined>("DELETE", `/v1/campaigns/${campaignId}/client-review`);

/* ── the client's page: no session, the token is the key ── */

export type ReviewExperience = {
  title?: string | null;
  company?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean | null;
  description?: string | null;
};

export type ReviewCandidate = {
  id: string;
  name: string;
  headline: string | null;
  location: string | null;
  yearsExperience: number | null;
  skills: string[];
  summary: string | null;
  whyMatch: string | null;
  /** Rows are read tolerantly (reviewView.ts): a string or an object, whatever the profile had. */
  experience: unknown[];
  education: unknown[];
  screening: { question: string; answer: string }[];
  /** A short-lived signed link. */
  resumeUrl: string | null;
  verdict: { verdict: "approved" | "declined"; note: string | null; at: string } | null;
};

export type PublicReview = {
  /** `closed`: the role is filled or the search ended; the page then takes no more answers. */
  campaign: { title: string; company: string | null; orgName: string; orgLogoUrl: string | null; closed?: boolean };
  stageName: string;
  candidates: ReviewCandidate[];
};

export const getPublicReview = (token: string) => publicApi<PublicReview>("GET", `/public/review/${encodeURIComponent(token)}`);

export type VerdictBody = { verdict: "approved" | "declined"; note?: string; reviewerName?: string };
export const sendVerdict = (token: string, candidateId: string, body: VerdictBody) =>
  publicApi<{ ok: true }>("POST", `/public/review/${encodeURIComponent(token)}/candidates/${encodeURIComponent(candidateId)}/verdict`, body);
