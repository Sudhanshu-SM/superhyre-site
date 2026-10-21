import { type ComponentType, lazy, Suspense, useContext, useMemo } from "react";
import { TurnContext, cardScope } from "../agentThread";
import type { ViewCard, ViewKind } from "../chatViews";
import { isViewKind } from "../chatViews";
import { Loader } from "../components/Loader";
import { useLiveMoment } from "./LiveMoment";
import type { LiveViewProps } from "./types";

/**
 * Draws the view the agent named, in the chat. One file per view, loaded when first shown, so a
 * chat that never compares anyone never loads the comparison. Each file owns its own live data.
 */
const VIEWS: Record<ViewKind, React.LazyExoticComponent<ComponentType<LiveViewProps>>> = {
  sourcing: lazy(() => import("./Sourcing")),
  outreach: lazy(() => import("./Outreach")),
  status: lazy(() => import("./Status")),
  assign: lazy(() => import("./Assign")),
  report: lazy(() => import("./Report")),
  compare: lazy(() => import("./Compare")),
  schedule: lazy(() => import("./Schedule")),
  leak: lazy(() => import("./Leak")),
  rediscover: lazy(() => import("./Rediscover")),
  intake: lazy(() => import("./Intake")),
  digest: lazy(() => import("./Digest")),
  campaign: lazy(() => import("./Campaign")),
  form: lazy(() => import("./Form")),
  "form-status": lazy(() => import("./FormStatus")),
  client: lazy(() => import("./Client")),
  "campaign-new": lazy(() => import("./NewCampaign")),
  "coming-up": lazy(() => import("./ComingUp")),
  "memory-doubts": lazy(() => import("./MemoryDoubts")),
};

export function LiveView({ card }: { card: ViewCard }): JSX.Element | null {
  const ctx = useLiveMoment();
  /* The card's own scope inside its turn: what it asked and what it made are kept under it, so a chat that
     is left and come back to shows the card as it was (answered questions replayed, a form made shown done). */
  const turn = useContext(TurnContext);
  const scope = useMemo(() => (turn ? cardScope(turn, card.key) : null), [turn, card.key]);
  if (!isViewKind(card.view) || !ctx) return null;
  const View = VIEWS[card.view];
  return (
    <TurnContext.Provider value={scope}>
      <Suspense fallback={<p className="orc-stage" aria-live="polite"><Loader size="sm" />Opening</p>}>
        <View card={card} ctx={ctx} />
      </Suspense>
    </TurnContext.Provider>
  );
}
