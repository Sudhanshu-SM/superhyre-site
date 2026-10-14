import { OUTREACH_LABEL } from "./nav";
import type { RouteId, SettingsSection } from "./nav";

/**
 * What the browser tab says, so a tab-heavy window and the history list show where each one is.
 *
 * "Page · SuperHyre", most specific first. Middot, not an em dash: the design references ban the em dash in
 * anything the person reads, and a tab title is about as visible as it gets.
 */

export const TITLE_SUFFIX = "SuperHyre";

const join = (...parts: ReadonlyArray<string | null | undefined | false>): string =>
  [...parts.filter((p): p is string => !!p && p.trim() !== ""), TITLE_SUFFIX].join(" · ");

const SETTINGS: Readonly<Record<SettingsSection, string>> = {
  profile: "Profile",
  organisation: "Organisation",
  members: "Members",
  connections: "Connections",
};

const PAGES: Readonly<Record<RouteId, string>> = {
  home: "Home",
  agent: "Agent",
  campaigns: "Campaigns",
  contacts: "Candidates",
  calls: OUTREACH_LABEL,
  clients: "Clients",
  "analytics-overview": "Overview",
  "analytics-recruiters": "Recruiters",
  "analytics-outreach": "Outreach",
  "analytics-pipeline": "Pipeline",
  "analytics-campaigns": "Campaigns",
  "campaign-overview": "Overview",
  "campaign-candidates": "Pipeline",
  "campaign-forms": "Forms & responses",
  "campaign-calls": OUTREACH_LABEL,
  "campaign-shortlisted": "Shortlisted",
  settings: "Settings",
  support: "Support",
};

export type TitleInput = {
  route: RouteId;
  /** The Settings section on screen, when the route is Settings. */
  section?: SettingsSection | null | undefined;
  /** The campaign a campaign page is about, once its name is known. */
  campaign?: string | null | undefined;
  /** A link that goes nowhere: the page says so, and so does the tab. */
  unknown?: boolean | undefined;
  /** What a Clients or Forms page is about once it is open on one: the client's name, the form's name. */
  detail?: string | null | undefined;
  /** For the person who is on their own (a recruiter, a personal workspace), the people page is "My work". */
  mine?: boolean | undefined;
};

export function pageTitle(t: TitleInput): string {
  if (t.unknown) return join("Page not found");
  if (t.route === "settings") return join(SETTINGS[t.section ?? "profile"], "Settings");
  if (t.route.startsWith("analytics-")) return join(t.route === "analytics-recruiters" && t.mine ? "My work" : PAGES[t.route], "Analytics");
  if (t.route.startsWith("campaign-")) {
    // The overview is the campaign itself: its name leads. The working pages say which page, then whose.
    if (t.route === "campaign-overview") return join(t.campaign || "Campaign");
    // A form that is open leads with its own name, then where it lives.
    return t.route === "campaign-forms" ? join(t.detail, PAGES[t.route], t.campaign) : join(PAGES[t.route], t.campaign);
  }
  // A client that is open leads with its own name.
  if (t.route === "clients") return join(t.detail, PAGES[t.route]);
  return join(PAGES[t.route]);
}

/** The sign-in, the set-up and the candidate's own page are not the console: each has a title of its own. */
export const SIGN_IN_TITLE = join("Sign in");
export const SET_UP_TITLE = join("Welcome");
