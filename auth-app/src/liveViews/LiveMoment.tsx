import { createContext, useContext } from "react";
import type { MomentCtx } from "../moments";

/** The live implementation of a turn's MomentCtx, provided by the Agent page around each live turn. */
const LiveMomentContext = createContext<MomentCtx | null>(null);

export const LiveMomentProvider = LiveMomentContext.Provider;
export const useLiveMoment = (): MomentCtx | null => useContext(LiveMomentContext);
