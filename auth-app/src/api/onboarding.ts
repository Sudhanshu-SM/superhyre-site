import { api, ApiError } from "./client";

/** Set-up after sign-in (server: modules/onboarding). */

export type SetupStep = "company" | "about" | "first_role" | "brand" | "first_steps" | "done";

export type Setup = {
  step: SetupStep;
  version: number;
  answers: Record<string, Record<string, unknown> | undefined>;
  domain: string | null;
  organizationId: string | null;
  completedAt: string | null;
};

export type BrandTheme = {
  logoUrl: string | null;
  primary: string;
  onPrimary: string;
  palette: string[];
  fontDisplay: string;
  fontBody: string;
  tone: "plain" | "warm" | "formal";
  source: "website" | "manual" | "default";
  adjustedFrom: string | null;
};

export type Fact = { text: string; source: string; url: string };

export type Research = {
  domain: string;
  website: string;
  name: string;
  about: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  facts: Fact[];
  hiringMode: "own" | "clients" | "both" | "unknown";
  roles: { title: string; location: string | null }[];
  specialisms: string[];
  locations: string[];
  industry: string | null;
  tone: "plain" | "warm" | "formal";
  careersUrl: string | null;
  partial: boolean;
};

export type ResearchView = {
  status: "running" | "done" | "failed";
  domain: string;
  website: string;
  runId: string | null;
  research: Research | null;
  brand: BrandTheme | null;
  error: string | null;
  finishedAt: string | null;
};

export const ROLES = [
  { value: "founder", label: "Founder" },
  { value: "head_of_talent", label: "Head of talent" },
  { value: "recruiter", label: "Recruiter" },
  { value: "sourcer", label: "Sourcer" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "agency_owner", label: "Agency owner" },
  { value: "other", label: "Something else" },
] as const;
export type PartInHiring = (typeof ROLES)[number]["value"];

/** What the lean set-up keeps as it goes (the server's `answers.lean`), and what it sends at the end. */
export type LeanSaved = import("../setup/lean/steps").Saved;
export type LeanFinishBody = NonNullable<ReturnType<typeof import("../setup/lean/steps").finishBody>> & {
  /** A small picture (data URL) for the organisation being created; optional and never required. */
  logo?: string | null;
};
export type LeanResult = {
  /** The organisation made by the set-up; null when everything went into Personal. */
  organisationId: string | null;
  campaignId: string;
  clientId: string | null;
  /** The chat to open: focused on the campaign. The first search appears in it as the run goes on. */
  conversationId: string;
  /** The first turn's run: with a job description it reads it, approves the spec and starts the search, in the background. */
  setupRunId: string;
  /** The starting spec drafted from the title, when the job description was skipped. */
  specRunId: string | null;
};

/** An organisation found for the person: its name, and whether joining is direct or needs an admin's approval. */
export type OrgMatch = { id: string; name: string; joinMode: "direct" | "request" };
/** An invitation waiting for this person's verified email. */
export type Invitation = {
  id: string;
  organisationName: string;
  inviterName: string | null;
  role: "admin" | "recruiter";
  createdAt: string;
  expiresAt: string;
};

export const onboardingApi = {
  setup: () => api<{ setup: Setup | null; research: ResearchView | null }>("GET", "/v1/onboarding/setup"),
  begin: () => api<{ setup: Setup; research: ResearchView | null }>("POST", "/v1/onboarding/setup"),
  research: (website?: string | null, refresh?: boolean) =>
    api<ResearchView>("POST", "/v1/onboarding/research", { website: website ?? null, ...(refresh ? { refresh } : {}) }),
  researchNow: (domain?: string) =>
    api<{ research: ResearchView | null }>("GET", `/v1/onboarding/research${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`).then(
      (r) => r.research,
    ),
  createOrganisation: (body: { version: number; name: string; website: string | null; hiringMode: "own" | "clients" | "both"; fullName: string }) =>
    api<{ organisationId: string; setup: Setup }>("POST", "/v1/onboarding/organisation", body),
  /** Keeps the lean set-up's answers as they are given (resumes on any device). */
  lean: (saved: LeanSaved) => api<{ setup: Setup }>("PUT", "/v1/onboarding/lean", saved).then((r) => r.setup),
  /** Makes the first campaign (and the organisation, if one was chosen), once, and starts the first search. */
  finish: (body: LeanFinishBody) => api<LeanResult>("POST", "/v1/onboarding/finish", body),
  /** The set-up is over without a first campaign: the person joined a team. */
  done: () => api<void>("POST", "/v1/onboarding/done", {}),
  /** Is an organisation of this name on SuperHyre? Name only; null when not (or when it can't be asked). */
  lookupOrganisation: (name: string) =>
    api<{ match: OrgMatch | null }>("GET", `/v1/onboarding/organisations/lookup?name=${encodeURIComponent(name)}`).then((r) => r.match),
  /** The organisation on the verified email's domain, if any. */
  organisationByDomain: () =>
    api<{ match: OrgMatch | null }>("GET", "/v1/onboarding/organisations/by-domain").then((r) => r.match),
  invitations: () => api<{ invitations: Invitation[] }>("GET", "/v1/invitations").then((r) => r.invitations),
  /** `fullName` is the name they typed in set-up, so joining never leaves them shown by their email address. */
  acceptInvitation: (id: string, fullName?: string) =>
    api<{ organisationId: string; role: string }>("POST", `/v1/invitations/${encodeURIComponent(id)}/accept`, fullName ? { fullName } : {}),
  /** Joins at once when the organisation allows it for this address, otherwise asks. */
  joinOrganisation: (id: string, fullName?: string) =>
    api<{ status: "joined"; organisationId: string; role: string } | { status: "requested"; requestId: string }>(
      "POST",
      `/v1/organisations/${encodeURIComponent(id)}/join`,
      fullName ? { fullName } : {},
    ),
  save: (version: number, step: Exclude<SetupStep, "done">, answers: Record<string, unknown>) =>
    api<{ setup: Setup }>("PATCH", "/v1/onboarding/setup", { version, step, answers }).then((r) => r.setup),
  back: (version: number, step: Exclude<SetupStep, "done">) =>
    api<{ setup: Setup }>("POST", "/v1/onboarding/setup/back", { version, step }).then((r) => r.setup),
  brand: () => api<{ brand: BrandTheme }>("GET", "/v1/organisation/brand").then((r) => r.brand),
  saveBrand: (brand: BrandTheme) => api<{ brand: BrandTheme }>("PUT", "/v1/organisation/brand", { brand }).then((r) => r.brand),
};

/**
 * Finishes the set-up, safe to repeat: the server makes everything once per person and a repeat
 * returns the same ids, so a slow, dropped or still-starting attempt is simply made again and comes
 * back as the success it was. Only an answer that says no (the person is already in another
 * organisation, say) is final. Never a scary error for an idempotent success.
 */
export async function finishWithRetry(
  body: LeanFinishBody,
  opts: { attempts?: number; timeoutMs?: number; pauseMs?: number } = {},
): Promise<LeanResult> {
  const { attempts = 3, timeoutMs = 60_000, pauseMs = 1_500 } = opts;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, pauseMs * i));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        onboardingApi.finish(body),
        new Promise<never>((_, no) => {
          timer = setTimeout(() => no(new Error("That is taking longer than it should.")), timeoutMs);
        }),
      ]);
    } catch (err) {
      last = err;
      // The server answered no (a 4xx other than "slow down"): trying again cannot change it.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}
