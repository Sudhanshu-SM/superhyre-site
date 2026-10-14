import { api } from "./client";

/** The Support page's one call (POST /v1/support, server/src/modules/support). */

export type SupportTopic = "question" | "problem" | "feedback" | "billing" | "other";

export type SupportRequest = {
  name: string;
  email: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  /** The console route the person was on ("campaign-candidates"): a name, never an address with ids. */
  page: string | null;
  /** One file, its bytes as base64. */
  attachment: { name: string; type: string; data: string } | null;
};

/** `emailed` is false when the message is saved but the email to support did not go; it is not lost. */
export type SupportReceipt = { ok: true; emailed: boolean };

export const supportApi = {
  send: (request: SupportRequest) => api<SupportReceipt>("POST", "/v1/support", request),
};
