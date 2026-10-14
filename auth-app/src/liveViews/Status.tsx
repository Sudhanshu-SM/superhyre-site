import { useEffect, useMemo, useRef, useState } from "react";
import { AgentStrip, AgentsOverview } from "../AgentsOverview";
import type { Ask } from "../Clarify";
import { Clarified } from "../Clarify";
import {
  campaignsOf,
  fleetLead,
  scopeAgents,
  statusQuestion,
  useWatchAgents,
  visibleAgents,
} from "../liveAgents";
import type { MomentCtx } from "../moments";
import { act } from "../moments";
import { resolvedCampaignId } from "./ask";
import { Checked, useFleet, useFresh } from "./fleetKit";
import type { LiveViewProps } from "./types";
import "../liveAgents.css";

/**
 * The agents, drawn from the server's keep-sourcing watches: a strip in the conversation with
 * those needing a person first, and the overview dialog, which opens by itself once the
 * check-in lands. Pause, resume and stop act on the real watch and the strip follows.
 * Asks which campaign only when the request names none and agents work on several.
 */
export default function StatusView({ card, ctx }: LiveViewProps): JSX.Element {
  const fleet = useWatchAgents();
  const showing = useMemo(() => visibleAgents(fleet.agents), [fleet.agents]);
  const campaigns = useMemo(() => campaignsOf(showing), [showing]);
  /* The question is read when the answer is needed, so a refresh of the list doesn't restart it. */
  const campaignsNow = useRef(campaigns);
  campaignsNow.current = campaigns;
  const ask = useMemo<Ask>(
    () => (_kind, _said, c) => {
      if (card.campaignId || resolvedCampaignId(card, c) || campaignsNow.current.length < 2) return null;
      return statusQuestion(campaignsNow.current);
    },
    [card],
  );

  const ready = fleet.status !== "loading";
  const failed = fleet.status === "failed";
  const steps = failed
    ? []
    : [
        `${showing.length} ${showing.length === 1 ? "agent" : "agents"} across ${campaigns.length} ${campaigns.length === 1 ? "campaign" : "campaigns"}`,
      ];

  return (
    <div className="src mo">
      {failed ? (
        <div className="lv-fail">
          <p className="lt-note">Couldn't check in with the agents just now. {fleet.error}</p>
          <button type="button" className="src-btn is-quiet mo-small" onClick={fleet.reload}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <Checked
            phase={{ id: "s-check", live: "Checking in with the agents", done: "Checked in with the agents" }}
            ready={ready}
            steps={steps}
          />
          {ready && (
            <Clarified kind="status" ctx={ctx} ask={ask}>
              {(c) => <Fleet card={card} ctx={c} />}
            </Clarified>
          )}
        </>
      )}
    </div>
  );
}

function Fleet({ card, ctx }: { card: LiveViewProps["card"]; ctx: MomentCtx }): JSX.Element {
  const answered = resolvedCampaignId(card, ctx);
  const scope = answered === "all" ? null : answered;
  const [widened, setWidened] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const fleet = useFleet({ selected, open });
  const fresh = useFresh(card, ctx.said);

  const shown = useMemo(() => {
    const inScope = scopeAgents(fleet.views, widened ? null : scope);
    return inScope.filter((a) => fleet.stripIds.has(a.id));
  }, [fleet.views, fleet.stripIds, scope, widened]);
  const first = shown[0]?.id ?? fleet.views[0]?.id ?? "";
  const current = selected ?? first;
  // The agent the overview opens on, so what it has been doing is read before it is asked for.
  useEffect(() => {
    if (!selected && first) setSelected(first);
  }, [selected, first]);

  /* The overview opens by itself once the check-in has landed, but only in the turn being
     answered, not when a chat is opened from history. */
  const opened = useRef(false);
  useEffect(() => {
    if (!fresh || opened.current || shown.length === 0) return;
    opened.current = true;
    window.setTimeout(() => setOpen(true), 500);
  }, [fresh, shown.length]);

  const grow = ctx.onGrow;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the transcript follows when the list changes
  useEffect(() => {
    grow();
  }, [shown.length, widened, grow]);

  const named = scope ? campaignName(fleet.views, scope, card.campaignName) : null;

  if (shown.length === 0) {
    const elsewhere = fleet.views.filter((a) => fleet.stripIds.has(a.id)).length;
    return (
      <div className="lv-none">
        <p className="src-para">
          {named ? `Nobody is working on ${named} yet.` : "No agents are working yet."} An agent can keep
          sourcing a campaign for you: it looks for new people on a schedule and stops at the number or date
          you set.
        </p>
        <div className="lv-acts">
          <button
            type="button"
            className="src-btn is-primary mo-small"
            onClick={() => act(ctx, `Assign the agent to ${named ?? ctx.campaign?.name ?? "a campaign"}`)}
          >
            Put an agent to work{named ? ` on ${named}` : ""}
          </button>
          {named && elsewhere > 0 && !widened && (
            <button type="button" className="src-btn is-quiet mo-small" onClick={() => setWidened(true)}>
              See the {elsewhere} {elsewhere === 1 ? "agent" : "agents"} on other campaigns
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="src-para">{fleetLead(shown)}</p>
      <AgentStrip
        agents={shown}
        onOpen={(id) => {
          setSelected(id ?? shown[0]?.id ?? null);
          setOpen(true);
        }}
      />
      <AgentsOverview
        open={open}
        onClose={() => setOpen(false)}
        agents={fleet.views}
        selected={current}
        onSelect={setSelected}
        onControl={fleet.control}
        ctx={ctx}
      />
    </>
  );
}

/** The campaign's name: from an agent on it, else the one the agent named. */
function campaignName(
  views: readonly { campaignId: string; campaignName?: string }[],
  id: string,
  named: string | null,
): string | null {
  return views.find((a) => a.campaignId === id)?.campaignName ?? named ?? null;
}
