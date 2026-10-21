import type { Ask } from "../Clarify";
import { clientQuestion, newCampaignQuestion } from "../clarify";
import { MOST_OPENINGS, canonicalCity, parseOpenings } from "../campaignDraft";
import type { CampaignRow } from "../campaignsData";
import type { Client } from "../clients";
import type { MomentCtx } from "../moments";
import { cityOptions, departmentOptions, liveCampaignAnswers } from "./clientCampaign";

/**
 * The guided questions for adding a client and setting up a campaign, asked with the console's own
 * tiles and fields. The wording and the order are the demo's (`clientQuestion`, `newCampaignQuestion`
 * in clarify.ts); what changes is where the options come from: this workspace's real clients, teams
 * and cities, with a way to say something else in words. With real data nothing starts agents yet, so
 * that question is not asked; years of experience is, because the campaign's brief keeps it.
 */

/** What the questions draw their options from, read when each question is asked so it is never stale. */
export type LiveData = { clients: readonly Client[]; rows: readonly Pick<CampaignRow, "department" | "location">[] };
export type DataSource = () => LiveData;

const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });

/* ═══════════════════════════════ a client ═══════════════════════════════ */

/**
 * A client is asked for by name and nothing else: website, industry, contact and fee terms are optional and
 * added on the Clients page later. The wording is the demo's (`clientQuestion`).
 */
export function liveClientAsk(_data: DataSource): Ask {
  return (_kind: unknown, said: string, ctx: MomentCtx) => clientQuestion(said, ctx);
}

/* ═══════════════════════════════ a campaign ═══════════════════════════════ */

export function liveCampaignAsk(data: DataSource): Ask {
  return (_kind: unknown, said: string, ctx: MomentCtx) => {
    const { clients, rows } = data();
    /* With nobody to choose from "no client" is the answer. Everything else is left as it was answered: what the
       message says is the demo's question's to read, so it can be shown as an answer and changed. */
    const a = liveCampaignAnswers(said, ctx.answers, clients);
    const answered = { ...ctx.answers, ...(a.client === "none" && !ctx.answers?.client ? { client: "none" } : {}) };
    const seen = Object.create(ctx, { answers: { value: answered, enumerable: true } }) as MomentCtx;
    const q = newCampaignQuestion(said, seen);
    if (!q) return null;

    switch (q.id) {
      case "nc-dept": {
        /* The department the role's words say is a tile, so it can be shown as the answer; "Other" is a field under them. */
        const tiles = departmentOptions(rows);
        const inferred = q.preset;
        const options = inferred && !tiles.some((o) => o.id.toLowerCase() === inferred.toLowerCase())
          ? [{ id: inferred, label: inferred }, ...tiles.slice(0, -1)]
          : tiles;
        return { ...q, options, other: { placeholder: "e.g. Platform", max: 60 } };
      }

      case "nc-location": {
        /* In words, when no city is known: the demo's own question, the message's city (if it named one) the text that is taken. */
        const near = a.mode === "remote";
        const cities = cityOptions(rows, clients.find((c) => c.id === a.client));
        if (!cities.length) return q;
        /* The city the message named is a tile of its own when no campaign or client is there. */
        const named = q.preset?.trim() ?? "";
        const tiles = named && !cities.some((c) => c.id.toLowerCase() === named.toLowerCase())
          ? [{ id: named, label: named, meta: "From your message" }, ...cities]
          : cities;
        const { why: _why, input: _input, ...rest } = q;
        return {
          ...rest,
          dense: true,
          options: [...tiles, ...(near ? [{ id: "none", label: "No city in particular" }] : [])],
          other: { placeholder: "e.g. Pune", max: 60 },
          apply: (ids) => (ids[0] === "none" ? { answers: { location: "" } } : set("location")(ids.map((v) => canonicalCity(v)))),
        };
      }

      case "nc-openings":
        /* Any number from 1 to 99: the tiles are only the usual ones, "Other" takes the rest. */
        return {
          ...q,
          other: {
            placeholder: "e.g. 4", max: 12, numeric: true,
            check: (text) => (parseOpenings(text) === null ? `Use a number from 1 to ${MOST_OPENINGS}.` : null),
          },
          apply: ([v]) => ({ answers: { openings: String(parseOpenings(v ?? "") ?? 1) } }),
        };

      /* Nothing starts these agents with real data: the search begins once the role spec is approved. */
      case "nc-agents":
        return null;

      default:
        return q;
    }
  };
}
