import type { Ask } from "../Clarify";
import type { Option, Question } from "../clarify";
import { clientQuestion, newCampaignQuestion } from "../clarify";
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

/** The last tile of a list that can't hold every answer: choosing it asks in words instead. */
export const OTHER = "other";

const set = (k: string) => ([v]: readonly string[]) => ({ answers: { [k]: v ?? "" } });

/**
 * A tile question with one more tile. Choosing it records that the answer is coming in words
 * (`<key>Typed`) and the question is asked again as a field. `keep` tiles stay after the new one.
 */
export function withOther(q: Question, key: string, tile: Option, keep = 0): Question {
  const at = q.options.length - keep;
  return {
    ...q,
    options: [...q.options.slice(0, at), tile, ...q.options.slice(at)],
    apply: (ids) => (ids[0] === OTHER ? { answers: { [`${key}Typed`]: "yes" } } : q.apply(ids)),
  };
}

/** The same question, answered in words, into `key`. */
export function inWords(q: Question, key: string, input: NonNullable<Question["input"]>): Question {
  const { remember: _r, preset: _p, filter: _f, multi: _m, dense: _d, ...rest } = q;
  return { ...rest, options: [], input, apply: set(key) };
}

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
    /* The demo's question reads the answers off the context; give it ones with "no client" filled in when there is nobody to pick. */
    const a = liveCampaignAnswers(said, ctx.answers, clients);
    const seen = Object.create(ctx, { answers: { value: a, enumerable: true } }) as MomentCtx;
    const q = newCampaignQuestion(said, seen);
    if (!q) return null;

    switch (q.id) {
      case "nc-dept":
        if (a.deptTyped) return inWords(q, "dept", { placeholder: "e.g. Platform", verb: "Continue", max: 60 });
        return withOther({ ...q, options: departmentOptions(rows) }, "dept", { id: OTHER, label: "Another team…", meta: "Type it in" });

      case "nc-location": {
        /* In words: the demo's own question. */
        if (a.locationTyped) return q;
        const near = a.mode === "remote";
        const cities = cityOptions(rows, clients.find((c) => c.id === a.client));
        if (!cities.length) return q;
        const { why: _why, input: _input, ...rest } = q;
        return withOther({
          ...rest,
          dense: true,
          options: [...cities, ...(near ? [{ id: "none", label: "No city in particular" }] : [])],
          apply: (ids) => (ids[0] === "none" ? { answers: { location: "" } } : set("location")(ids)),
        }, "location", { id: OTHER, label: "Another city…", meta: "Type it in" }, near ? 1 : 0);
      }

      case "nc-comp":
        /* Years of experience belong to the brief; asked once, just before the pay. */
        if (a.exp === undefined) {
          return {
            id: "nc-exp", step: "Experience", ms: 350, found: a.role?.trim() ?? q.found, ask: "How many years of experience?",
            why: "Skip it if it depends on the person.",
            options: [], input: { placeholder: "e.g. 5 to 8", verb: "Continue", optional: true, max: 20 },
            apply: set("exp"),
          };
        }
        return q;

      /* Nothing starts these agents with real data: the search begins once the role spec is approved. */
      case "nc-agents":
        return null;

      default:
        return q;
    }
  };
}
