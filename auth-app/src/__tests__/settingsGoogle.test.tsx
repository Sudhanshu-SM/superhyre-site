import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connections, GoogleConnection } from "../api/identity";

/** The Google card in Settings and the connect card in the chat, for Calendar and Tasks: every state, in words. */

const { server } = vi.hoisted(() => ({ server: { reply: null as unknown } }));
vi.mock("../api/client", () => {
  class ApiError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) { super(message); }
  }
  return { LIVE: true, API_URL: "http://api.test", ApiError, api: async () => server.reply };
});
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));

const store = await import("../connectionsStore");
const { GoogleProducts, GoogleProductsGhost } = await import("../SettingsGoogleProducts");
const { ConnectCard, linkFor } = await import("../agentCards/ConnectCard");
const { TurnContext } = await import("../agentThread");
const { productRows } = await import("../googleProducts");
const { addAccessLabel, schedulingState } = await import("../connectStates");
const { ConnectorLogo } = await import("../ConnectorLogo");

const GOOGLE: GoogleConnection = {
  available: true, status: "connected", accountEmail: "ana@hirewell.in", scopes: [], products: ["gmail", "sheets"], connectedAt: "2026-10-21T00:00:00Z",
};
async function serverSays(google: Partial<GoogleConnection>): Promise<void> {
  server.reply = { google: { ...GOOGLE, ...google }, slack: null, notion: null, providers: {} } satisfies Connections;
  await store.reloadConnections();
}
const text = (markup: string) =>
  markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

beforeEach(async () => { await serverSays({}); });

describe("the parts of the connection", () => {
  it("lists each with what it does and where it stands, as plain text", () => {
    const rows = productRows({ ...GOOGLE, productStates: [
      { product: "gmail", label: "Gmail", state: "on" }, { product: "calendar", label: "Google Calendar", state: "needs_access" },
      { product: "tasks", label: "Google Tasks", state: "needs_access" }, { product: "sheets", label: "Files", state: "on" },
    ] });
    const markup = renderToStaticMarkup(<GoogleProducts rows={rows} checking={false} onCheck={null} />);
    const t = text(markup);
    expect(t).toContain("Email Sends the outreach you approve, from your own address. On");
    expect(t).toContain("Calendar Finds free time and sends interview invitations from your own calendar. Needs access");
    expect(t).toContain("Files Drive and Sheets: where shortlists go when you export them. On");
    // State is text: no dot, no pill.
    expect(markup).not.toMatch(/class="[^"]*(pill|dot|badge)/);
  });

  it("says a switched-off API with the link to switch it on and a way to check again", () => {
    const rows = productRows({ ...GOOGLE, productStates: [
      { product: "gmail", label: "Gmail", state: "on" },
      { product: "calendar", label: "Google Calendar", state: "api_disabled", message: "Google Calendar isn't switched on for the Google project this app signs in with yet.", help: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" },
      { product: "tasks", label: "Google Tasks", state: "on" }, { product: "sheets", label: "Files", state: "on" },
    ] });
    const markup = renderToStaticMarkup(<GoogleProducts rows={rows} checking={false} onCheck={() => undefined} />);
    expect(text(markup)).toContain("Google Calendar isn't switched on for the Google project this app signs in with yet. Open Google Cloud Check again");
    expect(markup).toContain('href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"');
    expect(markup).toContain('role="alert"');
    expect(text(renderToStaticMarkup(<GoogleProducts rows={rows} checking onCheck={() => undefined} />))).toContain("Checking");
  });

  it("has ghosts of the same four rows while Google is being read", () => {
    const markup = renderToStaticMarkup(<GoogleProductsGhost />);
    expect((markup.match(/gw-row/g) ?? []).length).toBe(4);
    expect(markup).toContain("Reading what Google is used for");
  });
});

describe("the marks", () => {
  it("has a Calendar and a Tasks mark, and Google is still the Workspace wordmark", () => {
    expect(renderToStaticMarkup(<ConnectorLogo id="calendar" size={16} />)).toContain('aria-label="Google Calendar"');
    expect(renderToStaticMarkup(<ConnectorLogo id="tasks" size={16} />)).toContain('aria-label="Google Tasks"');
    expect(renderToStaticMarkup(<ConnectorLogo id="google" wide={40} />)).toContain('aria-label="Google Workspace"');
  });
});

describe("the chat's card for Calendar and Tasks", () => {
  it("asks to add Calendar access to a sign-in that only has Gmail, and says so plainly", async () => {
    const markup = renderToStaticMarkup(<ConnectCard provider="google" products={["calendar"]} label="Google Calendar" reason="Add Calendar access so I can schedule your meetings." url="https://accounts.example/consent" />);
    const t = text(markup);
    expect(t).toContain("Needs your OK in Google");
    expect(t).toContain("Add Calendar access so I can schedule your meetings.");
    expect(t).toContain("Add Calendar access");
    expect(t).not.toContain("Connected as");
    expect(markup).toContain('aria-label="Connect Google Calendar"');
    expect(markup).toContain("is-calendar");
  });

  it("asks for both together, and for Tasks alone", () => {
    expect(addAccessLabel(["calendar", "tasks"])).toBe("Add Calendar & Tasks access");
    expect(addAccessLabel(["tasks"])).toBe("Add Tasks access");
    expect(addAccessLabel(["calendar"])).toBe("Add Calendar access");
  });

  it("is done once the access is there", async () => {
    await serverSays({ products: ["gmail", "sheets", "calendar", "tasks"] });
    const t = text(renderToStaticMarkup(<ConnectCard provider="google" products={["calendar"]} label="Google Calendar" waiting={false} url="https://accounts.example/consent" />));
    expect(t).toContain("Google Calendar is on");
    expect(schedulingState(store.connectionsNow(), ["calendar", "tasks"])).toEqual({ s: "connected", as: "ana@hirewell.in" });
  });

  it("does not say it is on, with Carry on, while the server has just asked for the connection and this window has not read it again", async () => {
    await serverSays({ products: ["gmail", "sheets", "calendar", "tasks"] });
    const live = text(renderToStaticMarkup(<ConnectCard provider="google" mode="oauth" products={["calendar"]} label="Google Calendar" reason="Add Calendar access so I can schedule your meetings." turnSaid="When am I free on Friday afternoon?" />));
    expect(live).toContain("Needs to be reconnected");
    expect(live).toContain("Reconnect Google Calendar");
    expect(live).not.toContain("is on");
    expect(live).not.toContain("Carry on");
    expect(live).not.toContain("Send me a test email");
    // A card from an earlier visit is read as the store has it.
    const back = text(renderToStaticMarkup(
      <TurnContext.Provider value={{ id: "t1", restored: true }}>
        <ConnectCard provider="google" mode="oauth" products={["calendar"]} label="Google Calendar" turnSaid="When am I free on Friday afternoon?" />
      </TurnContext.Provider>,
    ));
    expect(back).toContain("Google Calendar is on");
  });

  it("asks to reconnect when the sign-in itself ran out", async () => {
    await serverSays({ status: "expired", products: [] });
    expect(schedulingState(store.connectionsNow(), ["calendar"]).s).toBe("reconnect");
    expect(text(renderToStaticMarkup(<ConnectCard provider="google" products={["calendar"]} label="Google Calendar" url="https://accounts.example/consent" />))).toContain("Reconnect Google Calendar");
  });

  it("opens the link the server made, else asks for Calendar and Tasks only", async () => {
    expect(await linkFor("google", "https://accounts.example/consent", { oauth: { slack: false, notion: false } }, ["calendar"])).toBe("https://accounts.example/consent");
    server.reply = { url: "https://accounts.example/asked" };
    expect(await linkFor("google", null, { oauth: { slack: false, notion: false } }, ["calendar", "tasks"])).toBe("https://accounts.example/asked");
  });
});
