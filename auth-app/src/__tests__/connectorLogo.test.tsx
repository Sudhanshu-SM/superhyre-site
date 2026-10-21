import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConnectCard } from "../agentCards/ConnectCard";
import { CONNECTOR_NAME, ConnectorLogo, isConnectorId } from "../ConnectorLogo";
import type { ConnectorId } from "../ConnectorLogo";
import { channelsRow } from "../railConfig";
import { OrgConnectionCard } from "../SettingsOrgConnection";
import { SettingsConnections } from "../SettingsConnections";
import { GoogleProducts } from "../SettingsGoogleProducts";
import { productRows } from "../googleProducts";
import type { GoogleConnection, OrgConnection } from "../api/identity";
import type { ConnectionsState } from "../connectionsStore";

/* An owner: the connect card is for someone who may connect Slack. */
vi.mock("../can", async (importOriginal) => ({ ...(await importOriginal<typeof import("../can")>()), useCan: () => true }));

/**
 * The mark of each connector: drawn inline in the brand's colours, on a light tile in both themes, and
 * shown where a connector is named (Connections, the agent's connect card, the rail's channels).
 */

const ALL: ConnectorId[] = ["google", "gmail", "sheets", "calendar", "tasks", "slack", "notion", "whatsapp"];
const html = (el: JSX.Element) => renderToStaticMarkup(el);

describe("the marks", () => {
  it("draws every connector inline, with nothing fetched", () => {
    for (const id of ALL) {
      const out = html(<ConnectorLogo id={id} />);
      expect(out, id).toMatch(/<svg[^>]*viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(out, id).not.toMatch(/<img|<image|href=|https?:|url\(/i);
      expect(out, id).toContain(`aria-label="${CONNECTOR_NAME[id]}"`);
    }
  });

  it("uses each brand's own colours", () => {
    const has = (id: ConnectorId, ...colours: string[]) => colours.forEach((c) => expect(html(<ConnectorLogo id={id} />), `${id} ${c}`).toContain(c));
    has("google", "#4285F4", "#34A853", "#FBBC05", "#EA4335");
    has("gmail", "#EA4335", "#fff");
    has("sheets", "#0F9D58", "#fff");
    has("slack", "#E01E5A", "#36C5F0", "#2EB67D", "#ECB22E");
    has("notion", "#fff", "#111");
    has("whatsapp", "#25D366", "#fff");
  });

  it("draws the Google Workspace wordmark from the official shapes, inline, in Google's colours and its grey", () => {
    const w = html(<ConnectorLogo id="google" wide />);
    expect(w).toMatch(/viewBox="0 0 3995\.04 512"/);
    expect(w).toContain('aria-label="Google Workspace"');
    for (const c of ["#4285f4", "#ea4335", "#fbbc04", "#34a853", "#5f6368"]) expect(w, c).toContain(c);
    // Nothing fetched, nothing that runs, nothing that can collide with another id on the page.
    expect(w).not.toMatch(/<img|<image|<script|<style|<text|<use|<clipPath|href=|https?:|url\(|\sid=/i);
    // A light slot in both themes, 40px high by default, or the height asked for.
    expect(w).toMatch(/conn-logo conn-logo-wide[^>]*height:40px/);
    expect(html(<ConnectorLogo id="google" wide={32} />)).toMatch(/height:32px/);
    // Only Google has one: another connector asked for it stays its own mark.
    expect(html(<ConnectorLogo id="slack" wide />)).toContain("is-slack");
    expect(html(<ConnectorLogo id="slack" wide />)).not.toContain("conn-logo-wide");
  });

  it("keeps the wide slot white in the dark theme, because the wordmark's grey would not read on a dark card", () => {
    const css = readFileSync(new URL("../connectorLogo.css", import.meta.url), "utf8");
    expect(css).toMatch(/:root\[data-theme="dark"\] \.conn-logo-wide \{[^}]*background: #fff/);
  });

  it("is a bare mark by default and a 36px light tile, or the size asked, when tiled", () => {
    expect(html(<ConnectorLogo id="slack" />)).not.toContain("conn-logo-tile");
    const t = html(<ConnectorLogo id="slack" tile />);
    expect(t).toContain("conn-logo-tile");
    expect(t).toMatch(/width:36px;height:36px/);
    expect(html(<ConnectorLogo id="notion" tile={40} />)).toMatch(/width:40px;height:40px/);
  });

  it("is left out of what a screen reader says when the name is written beside it", () => {
    const out = html(<ConnectorLogo id="google" decorative />);
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain("role=");
  });

  it("keeps the tile white in the dark theme, so a brand colour never shifts", () => {
    const css = readFileSync(new URL("../connectorLogo.css", import.meta.url), "utf8");
    expect(css).toMatch(/:root\[data-theme="dark"\] \.conn-logo-tile \{[^}]*background: #fff/);
  });

  it("has no mark for a data provider", () => {
    for (const id of ["crustdata", "salesql", "apollo", "apify", "outlook"]) expect(isConnectorId(id), id).toBe(false);
    expect(Object.keys(CONNECTOR_NAME).sort()).toEqual(["calendar", "gmail", "google", "notion", "sheets", "slack", "tasks", "whatsapp"]);
    // WhatsApp has a mark, but the rail's channel chips keep their own icon.
    expect(isConnectorId("whatsapp")).toBe(false);
  });
});

describe("where they are shown", () => {
  it("puts Google's row of Connections on the Workspace wordmark, with no second 'Google' beside it, and Slack and Notion on a 40px tile", () => {
    const g = html(<SettingsConnections canManage />);
    // The wordmark is the name: it is read as "Google Workspace", and the row writes no plain "Google" label.
    expect(g).toMatch(/conn-logo conn-logo-wide is-google[^>]*height:40px[^>]*role="img" aria-label="Google Workspace"/);
    expect(g).not.toContain("conn-logo-tile is-google");
    expect(g).not.toMatch(/class="st-name">Google</);
    // The parts of Google carry their own marks once they are read (until then, ghosts of the same four rows).
    expect(g).toContain("gw-row");
    const parts = html(<GoogleProducts rows={productRows({ available: true, status: "connected", accountEmail: "a@b.c", scopes: [], products: ["gmail"], connectedAt: null })} checking={false} onCheck={null} />);
    for (const mark of ["is-gmail", "is-calendar", "is-tasks", "is-sheets"]) expect(parts, mark).toContain(mark);
    for (const provider of ["slack", "notion"] as const) {
      const o = html(<OrgConnectionCard provider={provider} canManage />);
      expect(o, provider).toMatch(new RegExp(`conn-logo conn-logo-tile is-${provider}[^>]*width:40px;height:40px`));
      expect(o, provider).toContain('class="st-name"');
    }
  });

  it("lists contact lookups for those who manage the connections, once, with the one rule and no vendor", () => {
    const mine = html(<SettingsConnections canManage />);
    expect(mine.match(/Contact lookups/g)).toHaveLength(1);
    expect(mine).toContain("Emails are free. A phone number uses one credit, and only when one is found.");
    expect(mine).not.toMatch(/salesql|apollo/i);
    // A recruiter in an organisation does not manage its connections, so the row is not theirs to see.
    expect(html(<SettingsConnections canManage={false} />)).not.toContain("Contact lookups");
  });

  it("gives the agent's connect card the wordmark for Google and the same tile for Slack and Notion", () => {
    const google = html(<ConnectCard provider="google" mode="oauth" url="https://accounts.example.test/x" />);
    expect(google).toContain("conn-logo conn-logo-wide is-google");
    expect(google).toContain('aria-label="Google Workspace"');
    // The name is in the wordmark, so the card does not write "Google" again as its heading.
    expect(google).toContain('<p class="kc-title">Not connected</p>');
    for (const [provider, name] of [["slack", "Slack"], ["notion", "Notion"]] as const) {
      const out = html(<ConnectCard provider={provider} mode="oauth" url="https://accounts.example.test/x" />);
      expect(out, provider).toContain(`conn-logo conn-logo-tile is-${provider}`);
      expect(out, provider).toContain(`${name} isn&#x27;t connected`);
    }
  });

  it("keeps the four-colour G in a square slot: the rail's dots and small chips", () => {
    const g = html(<ConnectorLogo id="google" size={14} decorative />);
    expect(g).not.toContain("conn-logo-wide");
    expect(g).toMatch(/viewBox="0 0 18 18"/);
    for (const c of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) expect(g).toContain(c);
    expect(g).not.toContain("#5f6368");
  });

  it("offers the rail's three small marks when nothing is connected, and not once something is", () => {
    const google: GoogleConnection = { available: true, status: "disconnected", accountEmail: null, scopes: [], products: [], connectedAt: null };
    const slack: OrgConnection = {
      provider: "slack", status: "connected", accountName: "bot", workspaceName: "Acme", connectedBy: null,
      connectedAt: "2026-10-09T00:00:00Z", lastUsedAt: null, lastError: null, scopes: [], settings: {},
    };
    const c = (over: Partial<ConnectionsState>): ConnectionsState =>
      ({ status: "ready", google, slack: null, notion: null, oauth: { slack: false, notion: false }, error: null, at: 0, ...over });
    const none = channelsRow(c({}), { role: "admin" }, () => {});
    expect(none.value).toBe("None connected");
    expect(none.offer).toEqual(["google", "slack", "notion"]);
    expect(none.marks).toBeUndefined();
    const some = channelsRow(c({ slack }), { role: "admin" }, () => {});
    expect(some.offer).toBeUndefined();
    expect(some.marks?.map((m) => m.id)).toEqual(["slack"]);
  });
});
