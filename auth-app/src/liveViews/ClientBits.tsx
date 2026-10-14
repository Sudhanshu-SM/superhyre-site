import { useEffect } from "react";
import { memberName } from "../campaignStore";
import { Loader } from "../components/Loader";
import type { MomentCtx } from "../moments";
import { useSession } from "../roleStore";

/** The chat's own "working on it" line, for the moment before a question can be asked. */
export function Waiting({ text }: { text: string }): JSX.Element {
  return (
    <p className="orc-stage" aria-live="polite">
      <Loader size="sm" />
      {text}
    </p>
  );
}

/** The signed-in person as the member pickers name them, so the record they make is theirs. */
export function useOwnerLabel(): string {
  const s = useSession();
  return memberName(s.userId) ?? s.name;
}

/** Tells the transcript to follow when the card changes size. */
export function useGrow(ctx: Pick<MomentCtx, "onGrow">, ...changes: readonly unknown[]): void {
  useEffect(() => { ctx.onGrow(); }, changes);
}
