import type { MomentCtx } from "../moments";
import type { ViewCard } from "../chatViews";

/**
 * What every live view receives. `ctx` is the same context the chat's replies were always
 * given (the turn's words, verdicts, opening a profile or the ranked list, seeding the composer,
 * navigating), now implemented by the live page, so the console's own components take it unchanged.
 */
export type LiveViewProps = {
  card: ViewCard;
  ctx: MomentCtx;
};
