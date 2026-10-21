import { api } from "./client";

/**
 * What leaving something behind touches, asked before it is done: the loose ends of rejecting or hiring people (their
 * interviews, reminders, queued messages, tasks), of rejecting the rest of a campaign, and of removing a member. The
 * server answers with a summary line it wrote and the items behind it; the console shows both and decides nothing.
 * Every field is read tolerantly (windDown.ts): an older server simply has nothing to say.
 */

/** One thing tied to a person: a title, who it is about, when. */
export type TiedItem = { id?: string; title?: string | null; person?: string | null; at?: string | null };

export type LooseEnds = {
  counts?: { total?: number; [kind: string]: number | undefined };
  summary?: string | null;
  meetings?: TiedItem[];
  reminders?: TiedItem[];
  sends?: TiedItem[];
  tasks?: TiedItem[];
};

/** The rest of a campaign, before they are rejected. */
export type PassOpenPreview = LooseEnds & {
  /** A list of people (`[{ id, name, stage }]`); older servers sent only a number. */
  people?: ({ id?: string; name?: string | null; stage?: string | null } | string)[] | number;
  peopleCount?: number;
  defaultReason?: string | null;
};

export const passOpenPreview = (campaignId: string) => api<PassOpenPreview>("GET", `/v1/campaigns/${campaignId}/pass-open/preview`);

/** What rejecting (`passed`) or hiring (`hired`) these board cards would leave loose. */
export const looseEnds = (campaignId: string, ccIds: readonly string[], to: "passed" | "hired") =>
  api<LooseEnds>("GET", `/v1/campaigns/${campaignId}/loose-ends?ids=${encodeURIComponent(ccIds.join(","))}&to=${to}`);

/** What removing a member hands on, and to whom by default. */
export type RemovalPreview = {
  member?: { id?: string; name?: string | null } | null;
  holdings?: { campaigns?: number; candidates?: number; openTasks?: number; reminders?: number; teams?: number };
  tasks?: TiedItem[];
  reminders?: TiedItem[];
  teams?: ({ id?: string; name?: string | null } | string)[];
  reassignTo?: { id: string; name: string | null } | null;
};

export const removalPreview = (userId: string) => api<RemovalPreview>("GET", `/v1/members/${userId}/removal-preview`);
