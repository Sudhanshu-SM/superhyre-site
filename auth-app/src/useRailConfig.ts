import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE } from "./api/client";
import { campaignRows as campaignRowsOf, channelsRow, workspaceRows } from "./railConfig";
import type { ConfigRow, IntakeState, PeopleState, RailGo, RailLayout } from "./railConfig";
import { can, standingOf } from "./can";
import { campaignLink, ROUTES } from "./nav";
import type { CampaignRow } from "./campaignsData";
import { retryCampaigns, useCampaignRow, useCampaignRows, useCampaignsFailed, useCampaignsReady, useMemberList } from "./campaignStore";
import { reloadConnections, useConnections } from "./connectionsStore";
import { retryForms, useForms, useFormsLoad } from "./formsStore";
import { useSession } from "./roleStore";
import { mayChangeCampaign } from "./campaignRights";
import { useCampaignSpec } from "./specDraft";
import { summariseFilters, valuesFromSetup, valuesFromSpec, withSaved } from "./liveFilters";
import type { Values } from "./filters";
import type { Campaign } from "./workspaces";

/**
 * The rows for the Agent page's Configuration panel, from the workspace's own stores.
 *
 * The panel describes the campaign the person chose, if they chose one, and otherwise the
 * workspace: the console always has a default campaign for the sidebar, but a default is
 * not a choice and the agent does not assume it, so neither does this panel.
 *
 * Not connected, there is nothing here to read and the prototype's fixtures stand in
 * (the caller passes no config at all).
 */

/** How many times a failed intake read is asked for again by itself, and how long it waits (3 s, 6 s, 12 s, 24 s). */
export const INTAKE_RETRIES = 4;
export const intakeRetryDelay = (tried: number): number => 3000 * 2 ** tried;

/**
 * What the panel is drawn from: the rows the data gives, which of the two fixed lists they fill (`layout`), where each
 * row goes when it is clicked (`go`), and the dialog a row has asked to open, if one is open.
 */
export type RailConfig = {
  scope: string;
  rows: readonly ConfigRow[];
  layout: RailLayout;
  inOrg: boolean;
  go: Readonly<Partial<Record<string, RailGo>>>;
  dialog: { kind: "edit" | "team"; row: CampaignRow; canShare: boolean; canReassign: boolean; close: () => void } | null;
};

export function useRailConfig(
  campaign: Campaign,
  chosen: boolean,
  inOrg: boolean,
  /** What the job description and filters rows open; without it the campaign's panel does not carry those two rows. */
  search?: { onJd: () => void; onFilters: () => void; next?: { jd: boolean; filters: string | null } },
): RailConfig | undefined {
  /* LIVE is fixed when the app is built, so this bail-out never changes between renders. */
  if (!LIVE) return undefined;
  const [dialog, setDialog] = useState<"edit" | "team" | null>(null);
  const viewer = useSession();
  const connections = useConnections();
  const campaigns = useCampaignRows();
  const campaignsReady = useCampaignsReady();
  const campaignsFailed = useCampaignsFailed();
  const row = useCampaignRow(campaign.id);
  const forClause = LIVE && chosen && campaign.id ? campaign.id : "";
  const spec = useCampaignSpec(forClause);
  const forms = useForms(forClause);
  const formsLoad = useFormsLoad(forClause);
  const aboutCampaign = !!forClause && !!row;
  /* A read that did not come back (a request caught mid-change, a moment offline) is asked for again, a little
     later each time, before it is left to "Try again": the row heals itself rather than sit on "Couldn't load". */
  const intakeTries = useRef(0);
  useEffect(() => {
    if (formsLoad === "ready") intakeTries.current = 0;
    if (formsLoad === "ready" || formsLoad === "loading" || !aboutCampaign || !row) return;
    if (intakeTries.current >= INTAKE_RETRIES) return;
    const t = window.setTimeout(() => { intakeTries.current += 1; retryForms(row.id); }, intakeRetryDelay(intakeTries.current));
    return () => window.clearTimeout(t);
  }, [formsLoad, aboutCampaign, row?.id]);
  const list = useMemberList();
  const people: PeopleState = list.ready ? { status: "ready", members: list.members } : { status: "loading" };
  const onRetryConnections = useCallback(() => { void reloadConnections(); }, []);
  /* What the agent remembers is its own business, not a row here; what it has coming up is on Home. */

  if (aboutCampaign && row) {
    const intake: IntakeState = formsLoad === "ready"
      ? { status: "ready", forms: forms.map((f) => ({ name: f.name, status: f.status })) }
      : formsLoad === "loading" ? { status: "loading" } : { status: "failed" };
    const onRetryIntake = () => retryForms(row.id);
    const spoken = spec.approved?.jdText ?? spec.latest?.jdText ?? row.setup?.jd ?? null;
    const named = spec.approved ?? spec.latest;
    const base: Values = named ? valuesFromSpec(named.spec) : valuesFromSetup(row.setup);
    const searchState = search && {
      jd: spoken?.trim() ? true : spec.ready ? false : null,
      filters: summariseFilters(withSaved(base, row.setup?.filters as Values | undefined)),
      mayChange: mayChangeCampaign(viewer, row),
      onJd: search.onJd,
      onFilters: search.onFilters,
    };
    /* Who may change what is the page's own rule (the campaign's menu uses it too): assigning is for admins and
       owners; sharing is those and the campaign's own owner. Anyone else is taken to the campaign instead. */
    const teamwork = can(standingOf(viewer), "campaign.assign");
    const canShare = teamwork || (!!row.ownerId && row.ownerId === viewer.userId && standingOf(viewer) !== "personal");
    const overview = campaignLink(row.id);
    const go: Partial<Record<string, RailGo>> = {
      Owner: teamwork ? { onClick: () => setDialog("edit") } : { href: overview },
      Collaborators: teamwork ? { onClick: () => setDialog("team") } : { href: overview },
      Visibility: canShare ? { onClick: () => setDialog("edit") } : { href: overview },
      Intake: { href: campaignLink(row.id, "forms") },
      ...(search ? { "Job description": { onClick: search.onJd }, Filters: { onClick: search.onFilters } } : {}),
    };
    return {
      scope: row.name,
      rows: campaignRowsOf(row, {
        ...viewer, connections, onRetryConnections, intake, onRetryIntake, inOrg,
        ...(searchState ? { search: searchState } : {}),
      }),
      layout: "campaign",
      inOrg,
      go,
      dialog: dialog ? { kind: dialog, row, canShare, canReassign: teamwork, close: () => setDialog(null) } : null,
    };
  }

  /* A campaign was chosen but its row hasn't arrived: hold the shape of its panel rather
     than show the workspace's for a moment and swap. */
  if (forClause && !campaignsReady && !campaignsFailed) {
    return {
      scope: campaign.name,
      rows: [
        { label: "Owner", pending: true }, { label: "Collaborators", pending: true }, { label: "Visibility", pending: true },
        channelsRow(connections, viewer, onRetryConnections), { label: "Intake", pending: true },
      ],
      layout: "campaign",
      inOrg,
      go: search ? { "Job description": { onClick: search.onJd }, Filters: { onClick: search.onFilters } } : {},
      dialog: null,
    };
  }

  return {
    scope: "All campaigns",
    layout: "workspace",
    inOrg,
    go: {
      Owner: { href: "#/teams" },
      Team: { href: "#/teams" },
      Campaigns: { href: `#${ROUTES.campaigns.path}` },
      ...(search ? { "Job description": { onClick: search.onJd }, Filters: { onClick: search.onFilters } } : {}),
    },
    dialog: null,
    rows: workspaceRows({
      ...viewer, connections, onRetryConnections, campaigns, campaignsReady, campaignsFailed, onRetryCampaigns: retryCampaigns, people, inOrg,
      ...(search
        ? { search: { jd: search.next?.jd ?? false, filters: search.next?.filters ?? null, mayChange: true, onJd: search.onJd, onFilters: search.onFilters } }
        : {}),
    }),
  };
}
