import { CAMPAIGNS } from "./workspaces";

/**
 * Campaigns, as the Campaigns page lists them.
 *
 * Fixture data. The three campaigns that carry overview figures elsewhere
 * (backend-snr, platform-sre, ios-mid) use the same funnel numbers here, so
 * the page and the overview agree; the rest are filled in to the same shape.
 */

export type CampaignStatus = "active" | "paused" | "draft" | "closed";

export type Stage = "sourced" | "shortlisted" | "contacted" | "replied" | "interviews" | "hired";

export const STAGES: readonly { id: Stage; label: string }[] = [
  { id: "sourced", label: "Sourced" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "interviews", label: "Interviewing" },
  { id: "hired", label: "Hired" },
];

export type CampaignRow = {
  id: string;
  name: string;
  department: string;
  location: string;
  status: CampaignStatus;
  owner: string;
  team: readonly string[];
  funnel: Readonly<Record<Stage, number>>;
  /** People sourced per day, oldest first, last 14 days. */
  trend: readonly number[];
  /** Hires this campaign is meant to make. */
  target: number;
  /** Agents currently working on it, by what they are doing. */
  agents: readonly string[];
  /** Something waiting on a person, if anything. */
  needs?: string;
  updatedAgo: string;
  createdAgo: string;
};

const BY_ID: Readonly<Record<string, Omit<CampaignRow, "id" | "name" | "department" | "location">>> = {
  "backend-snr": {
    status: "active", owner: "Punith S", team: ["Punith S", "Arnab J", "Sudhanshu M"],
    funnel: { sourced: 214, shortlisted: 13, contacted: 33, replied: 10, interviews: 4, hired: 1 },
    trend: [3, 6, 5, 7, 6, 2, 1, 8, 10, 7, 11, 9, 2, 1], target: 3,
    agents: ["Sourcing", "Outreach"], needs: "4 replies waiting", updatedAgo: "12m ago", createdAgo: "3w ago",
  },
  "platform-sre": {
    status: "active", owner: "Sudhanshu M", team: ["Sudhanshu M", "Riya K"],
    funnel: { sourced: 96, shortlisted: 7, contacted: 19, replied: 5, interviews: 1, hired: 0 },
    trend: [2, 3, 3, 5, 4, 1, 1, 5, 6, 4, 6, 5, 1, 0], target: 2,
    agents: ["Sourcing"], updatedAgo: "1h ago", createdAgo: "2w ago",
  },
  "ios-mid": {
    status: "paused", owner: "Riya K", team: ["Riya K"],
    funnel: { sourced: 58, shortlisted: 4, contacted: 9, replied: 2, interviews: 1, hired: 1 },
    trend: [1, 2, 1, 2, 2, 0, 0, 2, 3, 2, 4, 3, 1, 1], target: 2,
    agents: [], needs: "Paused 9 days, no one assigned", updatedAgo: "9d ago", createdAgo: "5w ago",
  },
  "design-lead": {
    status: "active", owner: "Arnab J", team: ["Arnab J", "Punith S"],
    funnel: { sourced: 41, shortlisted: 6, contacted: 11, replied: 6, interviews: 3, hired: 0 },
    trend: [0, 1, 2, 3, 2, 1, 0, 2, 4, 3, 3, 4, 2, 1], target: 1,
    agents: ["Outreach"], needs: "2 interviews to schedule", updatedAgo: "34m ago", createdAgo: "10d ago",
  },
  "gtm-ae": {
    status: "closed", owner: "Punith S", team: ["Punith S", "Riya K"],
    funnel: { sourced: 132, shortlisted: 18, contacted: 40, replied: 15, interviews: 7, hired: 2 },
    trend: [4, 3, 2, 2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0], target: 2,
    agents: [], updatedAgo: "3d ago", createdAgo: "2mo ago",
  },
  "ds-applied": {
    status: "active", owner: "Riya K", team: ["Riya K", "Sudhanshu M", "Arnab J"],
    funnel: { sourced: 77, shortlisted: 9, contacted: 22, replied: 8, interviews: 2, hired: 1 },
    trend: [2, 2, 4, 3, 5, 3, 2, 6, 5, 7, 6, 8, 5, 4], target: 2,
    agents: ["Sourcing", "Screening"], updatedAgo: "5m ago", createdAgo: "3w ago",
  },
  "fin-controller": {
    status: "draft", owner: "Sudhanshu M", team: ["Sudhanshu M"],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], target: 1,
    agents: [], needs: "Brief not finished", updatedAgo: "2d ago", createdAgo: "2d ago",
  },
};

export const CAMPAIGN_ROWS: readonly CampaignRow[] = CAMPAIGNS.map((c) => {
  const [department = "", location = ""] = c.role.split(" · ");
  return { id: c.id, name: c.name, department, location, ...BY_ID[c.id]! };
});

export const STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = {
  active: "Active", paused: "Paused", draft: "Draft", closed: "Closed",
};

export const DEPARTMENTS = ["Engineering", "Design", "Data", "Product", "Go to market", "Finance", "Operations"] as const;

export const TEAM = ["Punith S", "Arnab J", "Sudhanshu M", "Riya K"] as const;

/** A new, empty campaign as the create dialog makes it. */
export function newCampaign(input: { name: string; department: string; location: string; target: number; owner: string; agent: boolean }): CampaignRow {
  const id = `c-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
  return {
    id,
    name: input.name,
    department: input.department,
    location: input.location || "Remote",
    status: input.agent ? "active" : "draft",
    owner: input.owner,
    team: [input.owner],
    funnel: { sourced: 0, shortlisted: 0, contacted: 0, replied: 0, interviews: 0, hired: 0 },
    trend: Array.from({ length: 14 }, () => 0),
    target: input.target,
    agents: input.agent ? ["Sourcing"] : [],
    needs: input.agent ? undefined : "Brief not finished",
    updatedAgo: "Just now",
    createdAgo: "Just now",
  };
}
