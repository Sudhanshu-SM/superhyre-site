import { Component, lazy } from "react";
import type { ComponentType, ReactNode } from "react";
import { Loader } from "./components/Loader";
import { LoadFailed } from "./ui";

/**
 * The console's pages, each a file of its own that is fetched the first time it is opened.
 *
 * Loading all of them up front made the first visit wait for pages nobody had asked for (2 MB of script, on a
 * link where a megabyte takes five seconds). `preloadPages` then fetches them quietly, one after another, once
 * the page on screen has what it needs, so opening the next one is not a wait.
 */

type PropsOf<T> = T extends (props: infer P) => unknown ? P : never;

/** A page, by the name it is exported under; its props are the ones the page itself declares. */
function page<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType<PropsOf<M[K]>> })));
}

const loaders = {
  home: () => import("./Home"),
  agent: () => import("./Agent"),
  campaigns: () => import("./CampaignsPage"),
  workspace: () => import("./CampaignWorkspace"),
  outreach: () => import("./OutreachPage"),
  forms: () => import("./CampaignForms"),
  contacts: () => import("./Contacts"),
  clients: () => import("./Clients"),
  settings: () => import("./Settings"),
  analytics: () => import("./AnalyticsPages"),
  /* Dormant: no route and no nav row. Kept so the page can be brought back (see AnalyticsUsage.tsx). */
  usage: () => import("./AnalyticsUsage"),
  activity: () => import("./AgentActivity"),
  board: () => import("./CampaignBoard"),
  fleet: () => import("./Fleet"),
};

export const Home = page(loaders.home, "Home");
export const Agent = page(loaders.agent, "Agent");
export const CampaignsPage = page(loaders.campaigns, "CampaignsPage");
export const CampaignOverview = page(loaders.workspace, "CampaignOverview");
export const CampaignCandidates = page(loaders.workspace, "CampaignCandidates");
export const CampaignShortlisted = page(loaders.workspace, "CampaignShortlisted");
export const CampaignOutreach = page(loaders.outreach, "CampaignOutreach");
export const OutreachPage = page(loaders.outreach, "OutreachPage");
export const CampaignForms = page(loaders.forms, "CampaignForms");
export const ContactsPage = page(loaders.contacts, "ContactsPage");
export const ClientsPage = page(loaders.clients, "ClientsPage");
export const SettingsPage = page(loaders.settings, "SettingsPage");
export const OverviewAnalyticsPage = page(loaders.analytics, "OverviewAnalyticsPage");
export const RecruitersAnalyticsPage = page(loaders.analytics, "RecruitersAnalyticsPage");
export const OutreachAnalyticsPage = page(loaders.analytics, "OutreachAnalyticsPage");
export const PipelineAnalyticsPage = page(loaders.analytics, "PipelineAnalyticsPage");
export const CampaignsAnalyticsPage = page(loaders.analytics, "CampaignsAnalyticsPage");
export const UsageAnalyticsPage = page(loaders.usage, "UsageAnalyticsPage");
export const AgentActivity = page(loaders.activity, "AgentActivity");
export const CampaignBoard = page(loaders.board, "CampaignBoard");
export const Fleet = page(loaders.fleet, "Fleet");

/** In the order people are most likely to go next from the first page. */
const ORDER: ReadonlyArray<() => Promise<unknown>> = [
  loaders.home, loaders.agent, loaders.campaigns, loaders.workspace, loaders.settings, loaders.contacts,
  loaders.clients, loaders.outreach, loaders.analytics, loaders.forms,
];

let preloading = false;

/**
 * Fetches the pages not seen yet, one at a time, when the browser has nothing else to do. Not on a
 * connection that asked for less data, and a failed fetch ends it: the page asks for itself when it is opened.
 */
export function preloadPages(): void {
  if (preloading || typeof window === "undefined") return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  preloading = true;
  const idle: (fn: () => void) => void = typeof window.requestIdleCallback === "function"
    ? (fn) => window.requestIdleCallback(fn, { timeout: 4000 })
    : (fn) => { setTimeout(fn, 1500); };
  let i = 0;
  const next = () => {
    const load = ORDER[i++];
    if (!load) return;
    void load().then(() => idle(next), () => { /* it will be asked for when it is opened */ });
  };
  /* After the page on screen has fetched what it needs: not in competition with it. */
  setTimeout(() => idle(next), 2500);
}

/** What shows while a page's file arrives: the page loader, where the page will be. */
export function PageFallback(): JSX.Element {
  return <div className="con-page" aria-busy="true"><Loader size="lg" label="Loading" block /></div>;
}

/**
 * A page's file that could not be fetched (the link dropped, or a new release replaced the old file). The rest
 * of the console is still there; this says what happened and offers the one thing that fixes it.
 */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <div className="con-page"><LoadFailed what="This page" onRetry={() => window.location.reload()} /></div>;
  }
}
