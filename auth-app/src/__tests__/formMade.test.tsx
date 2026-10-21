import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnContext, cardScope, clearThread, saveMade, saveTrail, savedMade, savedTrail } from "../agentThread";
import type { MomentCtx } from "../moments";

/**
 * The connected chat's form card, left and come back to. The card used to ask "What kind of role is it?"
 * again, with the form already made and shared: the turn's scope was only ever given to the prototype's
 * turns, so a connected card could neither replay its answers nor remember what it made. Against a fake server.
 */

const calls: string[] = [];
let reply: (method: string, path: string) => unknown = () => ({});

/* The stores are read with useSyncExternalStore, which a server render refuses without a server snapshot:
   here the snapshot is simply what the store holds. */
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  return { ...real, useSyncExternalStore: <T,>(_subscribe: unknown, get: () => T) => get() };
});

vi.mock("../api/client", async (orig) => {
  const real = await orig<typeof import("../api/client")>();
  return {
    ...real,
    LIVE: true,
    api: async (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      const r = reply(method, path);
      if (r instanceof Error) throw r;
      return r;
    },
  };
});

const SERVER = "11111111-1111-4111-8111-111111111111";
const LINK = "https://app.superhyre.test/apply/AbCdEf123456";
const view = (id: string, over: Record<string, unknown> = {}) => ({
  id, campaignId: "k1", name: "Software Engineer screening", status: "live", version: 2, title: "Software Engineer", description: null,
  role: null, theme: "ember", questions: [
    { id: "s1", type: "yesno", title: "Have you worked hands-on with Go?", required: true, accept: ["Yes"] },
    { id: "s2", type: "short", title: "Anything else?", required: false },
  ],
  publicLink: LINK, shareLink: LINK, hasDraftChanges: false,
  createdAt: "2026-10-04T08:00:00Z", updatedAt: "2026-10-04T08:00:00Z", ...over,
});
const row = (id: string, over: Record<string, unknown> = {}) => ({ id, status: "live", responses: 3, newApplicants: 1, publicLink: LINK, ...over });

const ctx = {
  said: "", verdicts: {}, onVerdict: () => {}, openProfile: () => {}, openList: () => {}, deploy: () => null, undeploy: () => {},
  seed: () => {}, onGrow: () => {}, onBusy: () => {}, prefs: {}, setPref: () => {},
} as unknown as MomentCtx;

type Store = typeof import("../formsStore");
let store: Store;

/* The card and the chat view pull in most of the console. Loading them inside a test counted against its own
   5 second limit, and under a busy full run that limit was missed (the test "failed" on the import, not the
   card), so they are loaded here, where the wait is a hook's. */
beforeAll(async () => {
  store = await import("../formsStore");
  await import("../Moments");
  await import("../liveViews/Form");
}, 60_000);
beforeEach(() => { clearThread(); calls.length = 0; });
afterEach(() => { store.forgetLoadedForms(); });

describe("a card's scope inside its turn", () => {
  it("is the turn's key with the card's own behind it, so two cards or two chats never share an answer", () => {
    const turn = { id: "5f0c-uuid", restored: true };
    expect(cardScope(turn, "view:form:k1:")).toEqual({ id: "5f0c-uuid#view:form:k1:", restored: true });
    expect(cardScope(turn, "view:form:k2:").id).not.toBe(cardScope(turn, "view:form:k1:").id);
    expect(cardScope({ id: "other-uuid", restored: true }, "view:form:k1:").id).not.toBe(cardScope(turn, "view:form:k1:").id);
  });

  it("keeps a connected card's answers and what it made, by that key, and clears them with a new chat", () => {
    const key = cardScope({ id: "t-1", restored: false }, "view:form:k1:").id;
    saveTrail(key, [{ qid: "form-family", ids: ["engineering"], auto: "preset" }]);
    saveMade(key, SERVER);
    expect(savedTrail(key)).toEqual([{ qid: "form-family", ids: ["engineering"], auto: "preset" }]);
    expect(savedMade(key)).toBe(SERVER);
    clearThread();
    expect(savedMade(key)).toBeNull();
    expect(savedTrail(key)).toEqual([]);
  });
});

describe("where a connected turn gives its scope", () => {
  const src = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8");

  it("wraps the views a connected turn draws, which it never did: only the prototype's moments had it", () => {
    const agent = src("Agent.tsx");
    expect(agent).toMatch(/<TurnContext\.Provider value=\{turnInfo\}>\s*<LiveMomentProvider value=\{ctx\}>\s*<LiveTurnBody/);
    /* The server's turn, by its own key: a turn's place in the list moves between chats. */
    expect(agent).toContain("const turnKey = turn.liveKey ?? turn.id;");
  });

  it("gives each card its own scope inside the turn's", () => {
    const views = src("liveViews/index.tsx");
    expect(views).toContain("cardScope(turn, card.key)");
    expect(views).toMatch(/<TurnContext\.Provider value=\{scope\}>[\s\S]*<View card=\{card\} ctx=\{ctx\} \/>/);
  });
});

describe("a form the chat made, found again", () => {
  it("is read from the server by its id, with its link and how many have answered", async () => {
    reply = (_m, p) => (p.endsWith("/forms") ? { forms: [row(SERVER)] } : view(SERVER));
    const form = await store.recallForm(SERVER);
    expect(form).toMatchObject({ id: SERVER, name: "Software Engineer screening", campaign: "k1" });
    await store.loadForms("k1");
    expect(store.getFormMeta(SERVER)).toMatchObject({ status: "live", publicLink: LINK, responses: 3, newApplicants: 1 });
  });

  it("is the same form this session made, under the id it was made with, not a second copy", async () => {
    reply = (m, p) => (m === "POST" ? view(SERVER) : p.endsWith("/forms") ? { forms: [row(SERVER)] } : view(SERVER));
    const kit = await import("../formKit");
    const made = await store.ensureLiveDraft("k1|say|{}", () => kit.draftForm({ campaignId: "k1", family: "other" }), [], "k1");
    expect(await store.serverIdOf(made.id)).toBe(SERVER);
    calls.length = 0;

    const found = await store.recallForm(SERVER);
    expect(found?.id).toBe(made.id);
    expect(calls).toEqual([]);
    // The counts that arrive for the server's id land on the form as this session holds it.
    await store.refreshFormCount(made.id);
    expect(store.getFormMeta(made.id).responses).toBe(3);
  });

  it("is null when the server no longer has it, which is when the card asks again", async () => {
    reply = () => new Error("not found");
    expect(await store.recallForm("22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(await store.recallForm("not-an-id")).toBeNull();
  });
});

describe("the card, left and come back to", () => {
  it("shows the form made: its name, the link to send with Copy link, the preview, the builder, and how many answered", async () => {
    reply = (_m, p) => (p.endsWith("/forms") ? { forms: [row(SERVER)] } : view(SERVER));
    const { FormMade } = await import("../Moments");
    const form = await store.recallForm(SERVER);
    await store.loadForms("k1");
    const html = renderToStaticMarkup(<FormMade ctx={ctx} form={form!} />);
    expect(html).toContain("Software Engineer screening");
    expect(html).toContain("Screening form, live");
    expect(html).toContain(LINK);
    expect(html).toContain("Copy link");
    expect(html).toContain("Open in builder");
    expect(html).toContain("Preview");
    expect(html).toContain("3 responses, 1 new");
    expect(html).toContain("Open responses");
    expect(html).not.toContain("What kind of role is it?");
  });

  it("says a draft has no link yet, and offers one action: publish it and copy the link", async () => {
    reply = (_m, p) => (p.endsWith("/forms") ? { forms: [row(SERVER, { status: "draft", responses: 0, newApplicants: 0, publicLink: null })] } : view(SERVER, { status: "draft", publicLink: null, shareLink: null }));
    const { FormMade } = await import("../Moments");
    const form = await store.recallForm(SERVER);
    await store.loadForms("k1");
    const html = renderToStaticMarkup(<FormMade ctx={ctx} form={form!} />);
    expect(html).toContain("Screening form, draft");
    expect(html).toContain("Publish and copy link");
    // One primary: the others are quiet, and there is no link row, no second way to share, no responses yet.
    expect(html.match(/is-primary/g)).toHaveLength(1);
    expect(html).toContain("Open in builder");
    expect(html).toContain("Preview");
    expect(html).not.toContain("Copy link");
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Open responses");
  });

  it("shows the link with Copy link, in place, once the form is published from the card", async () => {
    let live = false;
    reply = (m, p) => {
      if (m === "POST" && p.endsWith("/publish")) { live = true; return { id: SERVER, status: "live", version: 1, publicLink: LINK, shareLink: LINK }; }
      if (p.endsWith("/forms")) return { forms: [row(SERVER, live ? {} : { status: "draft", responses: 0, newApplicants: 0, publicLink: null })] };
      return live ? view(SERVER) : view(SERVER, { status: "draft", publicLink: null, shareLink: null });
    };
    const { FormMade } = await import("../Moments");
    const form = await store.recallForm(SERVER);
    await store.loadForms("k1");
    expect(renderToStaticMarkup(<FormMade ctx={ctx} form={form!} />)).toContain("Publish and copy link");

    await store.publishForm(form!.id);
    const html = renderToStaticMarkup(<FormMade ctx={ctx} form={form!} />);
    expect(html).toContain("Screening form, live");
    expect(html).toContain(LINK);
    expect(html).toContain("Copy link");
    expect(html).not.toContain("Publish and copy link");
    expect(html).toContain("Preview");
    expect(html.match(/is-primary/g)).toHaveLength(1);
    // The link is one row, not two.
    expect(html.split(LINK).length - 1).toBeLessThanOrEqual(3);
  });

  it("opens on the form it made, not on the first question, when its turn is restored", async () => {
    const FormView = (await import("../liveViews/Form")).default;
    const scope = cardScope({ id: "turn-42", restored: true }, "view:form:k1:");
    saveMade(scope.id, SERVER);
    const html = renderToStaticMarkup(
      <TurnContext.Provider value={scope}>
        <FormView card={{ kind: "view", key: "view:form:k1:", view: "form", campaignId: "k1", campaignName: "Software Engineer", candidateIds: [], personIds: [], query: null }} ctx={ctx} />
      </TurnContext.Provider>,
    );
    expect(html).toContain("Opening the form");
    expect(html).not.toContain("What kind of role is it?");
    expect(html).not.toContain("Reading the role spec");
  });

  it("opens on a form the agent made itself (create_form names it in the card), never asking for one to be drafted", async () => {
    const { madeFormOf } = await import("../liveViews/formAsk");
    expect(madeFormOf(`form:${SERVER}`)).toBe(SERVER);
    expect(madeFormOf("form:not-an-id")).toBeNull();
    expect(madeFormOf("software engineer")).toBeNull();
    expect(madeFormOf(null)).toBeNull();

    const FormView = (await import("../liveViews/Form")).default;
    const scope = cardScope({ id: "turn-44", restored: false }, `view:form:k1:${SERVER}`);
    const html = renderToStaticMarkup(
      <TurnContext.Provider value={scope}>
        <FormView card={{ kind: "view", key: `view:form:k1:${SERVER}`, view: "form", campaignId: "k1", campaignName: "Software Engineer", candidateIds: [], personIds: [], query: `form:${SERVER}` }} ctx={ctx} />
      </TurnContext.Provider>,
    );
    expect(html).toContain("Opening the form");
    expect(html).not.toContain("What kind of role is it?");
    expect(html).not.toContain("Reading the role spec");
  });

  it("waits for the campaign's role before replaying a half-answered card, so the answers are found as they were", async () => {
    reply = () => ({});
    const FormView = (await import("../liveViews/Form")).default;
    const scope = cardScope({ id: "turn-43", restored: true }, "view:form:k-wait:");
    saveTrail(scope.id, [{ qid: "form-family", ids: ["engineering"], auto: "preset" }]);
    const html = renderToStaticMarkup(
      <TurnContext.Provider value={scope}>
        <FormView card={{ kind: "view", key: "view:form:k-wait:", view: "form", campaignId: "k-wait", campaignName: "Software Engineer", candidateIds: [], personIds: [], query: null }} ctx={ctx} />
      </TurnContext.Provider>,
    );
    expect(html).toContain("Reading the role spec");
    expect(html).not.toContain("What kind of role is it?");
  });
});
