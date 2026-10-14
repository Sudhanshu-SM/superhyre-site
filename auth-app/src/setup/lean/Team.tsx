import { useEffect, useMemo, useState } from "react";
import type { Invitation, OrgMatch } from "../../api/onboarding";
import { type Answers, nameFromDomain, type Team } from "./steps";

/**
 * "Your team": the one beat whose question depends on who the person is. Everyone starts in Personal,
 * which is theirs alone; this decides whether they also join or create an organisation.
 *
 *   an invitation waiting for this address      shown first: join it, or not now
 *   a work address, an organisation on its domain  "<Name> is already on SuperHyre": join (at once when it
 *                                               allows that for them, otherwise by asking), or not now
 *   a work address, none on its domain          create one (the name is offered from the domain), or just me
 *   a personal address (gmail and the like)     "which organisation do you work with?", optional; found
 *                                               by name: ask to join, or no, a different one; not found:
 *                                               create it, or just me
 *
 * `resolveTeam` is the whole rule for which of these it is, kept apart from the screen so it is tested.
 */

/** What the beat needs from the server (live) or from a stand-in (the preview). */
export type TeamApi = {
  invitations: () => Promise<Invitation[]>;
  /** The organisation on the verified work address's domain; never asked for a personal address. */
  byDomain: () => Promise<OrgMatch | null>;
  lookup: (name: string) => Promise<OrgMatch | null>;
  /** `fullName` is what they typed for their name, so being let in never leaves them shown by their email address. */
  accept: (invitationId: string, fullName?: string) => Promise<void>;
  join: (organisationId: string, fullName?: string) => Promise<"joined" | "requested">;
  /** They are in a team now: the set-up is over, and the console opens on it. */
  joined: () => void;
};

/** Facts about the account, as the server's `/v1/me` has them. */
export type TeamContext = {
  /** gmail and the like: no domain to find a team by. */
  personalEmail: boolean;
  /** "acme.com" for a work address. */
  domain: string | null;
  /** The name of an organisation they already asked to join and are waiting on. */
  pending: string | null;
};

export type TeamView =
  | { v: "loading" }
  | { v: "invitation"; item: Invitation; more: number }
  | { v: "match"; org: OrgMatch; via: "domain" | "name"; /** What they typed, kept for "No, a different one". */ typed?: string }
  | { v: "sent"; name: string }
  | { v: "ask" }
  | { v: "create"; name: string };

/** Which view the beat shows, from what is known. Pure. */
export function resolveTeam(
  data: { invitations: Invitation[]; domain: OrgMatch | null } | null,
  skipped: number,
  ctx: TeamContext,
  answers: Pick<Answers, "team">,
): TeamView {
  if (!data) return { v: "loading" };
  const waiting = data.invitations.slice(skipped);
  const [first] = waiting;
  if (first) return { v: "invitation", item: first, more: waiting.length - 1 };
  if (answers.team?.kind === "asked") return { v: "sent", name: answers.team.name };
  if (ctx.pending) return { v: "sent", name: ctx.pending };
  if (data.domain) return { v: "match", org: data.domain, via: "domain" };
  if (ctx.personalEmail) return { v: "ask" };
  return { v: "create", name: nameFromDomain(ctx.domain) };
}

/**
 * What "No, a different one" does. The organisation on their own work address is simply "not now" (they carry on in
 * Personal). One found by a name they typed goes back to the question with nothing in the field, so it can never
 * lead to a form that makes another organisation of the same name.
 */
export function afterNo(via: "domain" | "name"): "personal" | "ask" {
  return via === "domain" ? "personal" : "ask";
}

/**
 * The screen for an organisation the server says is already there when one was about to be made: that one, to
 * join or to ask to join, in place of an error. Null when it cannot be found by that name.
 */
export function clashView(match: OrgMatch | null, typed: string): Extract<TeamView, { v: "match" }> | null {
  return match ? { v: "match", org: match, via: "name", typed } : null;
}

/**
 * The beat's state: what was fetched, what the person has done in it, and the view that follows.
 * Fetching starts when the set-up opens, so the answer is usually there by the time the beat is.
 */
export function useTeam(ctx: TeamContext, api: TeamApi | undefined, answers: Pick<Answers, "team">, active: boolean) {
  const [data, setData] = useState<{ invitations: Invitation[]; domain: OrgMatch | null } | null>(api ? null : { invitations: [], domain: null });
  const [skipped, setSkipped] = useState(0);
  const [override, setOverride] = useState<TeamView | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!api) return;
    let live = true;
    void Promise.all([
      api.invitations().catch(() => [] as Invitation[]),
      ctx.personalEmail ? Promise.resolve(null) : api.byDomain().catch(() => null),
    ]).then(([invitations, domain]) => {
      if (live) setData({ invitations, domain });
    });
    // Slow or silent is the same as "nothing waiting": the set-up is never held on a server that did not answer.
    const giveUp = window.setTimeout(() => live && setData((d) => d ?? { invitations: [], domain: null }), 6000);
    return () => {
      live = false;
      window.clearTimeout(giveUp);
    };
  }, [api, ctx.personalEmail, version]);

  // Coming back to the beat starts from what is known, not from where the person last was in it.
  useEffect(() => {
    if (active) setOverride(null);
  }, [active]);

  const resolved = useMemo(() => resolveTeam(data, skipped, ctx, answers), [data, skipped, ctx, answers]);
  return {
    view: override ?? resolved,
    show: setOverride,
    skipInvitation: () => setSkipped((n) => n + 1),
    /** Looks again (the organisation on the domain may have appeared since). */
    refresh: () => {
      setData(null);
      setOverride(null);
      setVersion((n) => n + 1);
    },
  };
}

/** What the beat saves when it ends in Personal or with a name to create. */
export const teamPersonal: Team = { kind: "personal" };
