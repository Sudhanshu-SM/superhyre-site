import { useEffect, useState } from "react";
import { agentApi } from "./api/agent";
import { LIVE } from "./api/client";

/**
 * Whether the server takes the paperclip's choice with a message (`adding`, server: modules/agent/adding.ts). A server without it
 * drops the field and answers a fixed phrase with a bare picker, so the menu, the scoped messages and the cards that wait for their
 * files by the add's id are used only once the server says it does; until then, and when it says it does not or cannot be asked, the
 * paperclip opens the picker at once and a Send goes as the words the server has always understood (adding.ts, `legacy`).
 */

let known: Promise<boolean> | null = null;

/** Whether the server takes the choice; asked once, and asked again after a failure. */
export function addingOn(): Promise<boolean> {
  if (!LIVE) return Promise.resolve(false);
  known ??= agentApi
    .capabilities()
    .then((r) => r.adding === true)
    .catch(() => {
      known = null;
      return false;
    });
  return known;
}

/** For tests: forget what was asked. */
export const forgetAdding = () => {
  known = null;
};

/** False until the server says it does. */
export function useAddingOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void addingOn().then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
}
