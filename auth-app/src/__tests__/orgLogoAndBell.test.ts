import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce, browserAlertState, dismissBrowserAlerts, enableBrowserAlerts } from "../browserAlerts";
import { coverRect, dataUrlBytes, isUploadedLogo, LOGO_MAX_BYTES, logoFileProblem } from "../logoImage";
import { categoriesIn, categoryOf, emptyLine, visibleNotices } from "../notificationsView";
import { setupLogo } from "../setup/lean/logoDraft";

/** The organisation logo upload's rules, and the bell panel's filters and browser-alert row. */

describe("logo files", () => {
  it("takes PNG, JPG, WebP and SVG up to 2 MB, and says why for anything else", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(logoFileProblem({ type, size: 1000 })).toBeNull();
    }
    expect(logoFileProblem({ type: "image/gif", size: 1000 })).toBe("Use a PNG, JPG, WebP or SVG image.");
    expect(logoFileProblem({ type: "application/pdf", size: 1000 })).toBe("Use a PNG, JPG, WebP or SVG image.");
    expect(logoFileProblem({ type: "image/png", size: LOGO_MAX_BYTES })).toBeNull();
    expect(logoFileProblem({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toBe("That image is over 2 MB. Pick a smaller one.");
    expect(logoFileProblem({ type: "image/png", size: 0 })).toBe("That file is empty.");
  });

  it("crops to the centre of a square", () => {
    // A wide picture is scaled to the height and centred horizontally.
    expect(coverRect(400, 200, 256)).toEqual({ x: -128, y: 0, w: 512, h: 256 });
    // A tall one the other way round.
    expect(coverRect(200, 400, 256)).toEqual({ x: 0, y: -128, w: 256, h: 512 });
    expect(coverRect(100, 100, 256)).toEqual({ x: 0, y: 0, w: 256, h: 256 });
  });

  it("counts the bytes in a data URL without decoding it", () => {
    expect(dataUrlBytes(`data:image/png;base64,${btoa("hello")}`)).toBe(5);
    expect(dataUrlBytes("data:image/png;base64,")).toBe(0);
  });

  it("tells an uploaded logo from a typed link", () => {
    expect(isUploadedLogo("http://localhost:8090/media/org-logos/abc?v=1")).toBe(true);
    expect(isUploadedLogo("https://cdn.example.com/logo.png")).toBe(false);
    expect(isUploadedLogo(null)).toBe(false);
  });

  it("keeps the set-up's picture out of the answers, and forgets it when told", () => {
    setupLogo.set("data:image/png;base64,AAAA");
    expect(setupLogo.get()).toBe("data:image/png;base64,AAAA");
    setupLogo.set(null);
    expect(setupLogo.get()).toBeNull();
  });
});

describe("the bell's categories and filters", () => {
  const n = (kind: string, readAt: string | null = null) => ({ kind, readAt });

  it("puts every kind the server sends in one category, and an unknown one in Other", () => {
    expect(categoryOf("invitation")).toBe("invitations");
    expect(categoryOf("join_request")).toBe("requests");
    expect(categoryOf("member_joined")).toBe("team");
    expect(categoryOf("task_assigned")).toBe("handovers");
    expect(categoryOf("campaign_owner")).toBe("handovers");
    expect(categoryOf("reminder")).toBe("reminders");
    expect(categoryOf("watch")).toBe("agent");
    expect(categoryOf("call_missed")).toBe("calls");
    expect(categoryOf("form_applicant")).toBe("applicants");
    expect(categoryOf("something_new")).toBe("other");
  });

  it("lists only the categories that have something, in the menu's order", () => {
    expect(categoriesIn([n("reminder"), n("invitation"), n("watch"), n("invitation_answered")])).toEqual(["invitations", "reminders", "agent"]);
    expect(categoriesIn([])).toEqual([]);
  });

  it("narrows by unread and by category together", () => {
    const items = [n("invitation"), n("reminder", "2026-10-01"), n("reminder"), n("watch", "2026-10-02")];
    expect(visibleNotices(items, { unreadOnly: false, category: "all" })).toHaveLength(4);
    expect(visibleNotices(items, { unreadOnly: true, category: "all" })).toHaveLength(2);
    expect(visibleNotices(items, { unreadOnly: false, category: "reminders" })).toHaveLength(2);
    expect(visibleNotices(items, { unreadOnly: true, category: "reminders" })).toHaveLength(1);
  });

  it("says calmly why a list is empty", () => {
    expect(emptyLine({ unreadOnly: false, category: "all" }, 0)).toBe("Nothing new. You're all caught up.");
    expect(emptyLine({ unreadOnly: true, category: "all" }, 5)).toBe("Nothing unread. You're all caught up.");
    expect(emptyLine({ unreadOnly: false, category: "agent" }, 5)).toBe("Nothing here under this filter.");
  });
});

describe("alerts in the browser", () => {
  let permission: NotificationPermission;
  const shown: { body: string }[] = [];
  const store = new Map<string, string>();

  beforeEach(() => {
    permission = "default";
    shown.length = 0;
    store.clear();
    class FakeNotification {
      static get permission() { return permission; }
      static requestPermission = vi.fn(async () => { permission = "granted"; return permission; });
      onclick: (() => void) | null = null;
      constructor(_title: string, opts: { body: string }) { shown.push({ body: opts.body }); }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("window", {
      Notification: FakeNotification,
      focus: () => {},
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks until it is answered or dismissed, and then not again", async () => {
    expect(browserAlertState()).toBe("ask");
    dismissBrowserAlerts();
    expect(browserAlertState()).toBe("hidden");
    store.clear();
    expect(await enableBrowserAlerts()).toBe("granted");
    expect(browserAlertState()).toBe("granted");
    permission = "denied";
    expect(browserAlertState()).toBe("denied");
  });

  it("shows an alert only when allowed and the tab is behind another", () => {
    announce("Your agent replied.");
    expect(shown).toHaveLength(0); // not allowed yet
    permission = "granted";
    vi.stubGlobal("document", { hidden: false });
    announce("Your agent replied.");
    expect(shown).toHaveLength(0); // the tab is in front
    vi.stubGlobal("document", { hidden: true });
    announce("Your agent replied.");
    expect(shown).toEqual([{ body: "Your agent replied." }]);
  });
});

describe("the organisation chip", () => {
  const css = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

  it("is a 28px rounded square with a hairline, 14px from a 15px name, centred on the icon axis", () => {
    const access = css("access.css");
    const chip = /\.nav-ws-chip \{([^}]*)\}/.exec(access)?.[1] ?? "";
    expect(chip).toMatch(/width: 28px;\s*height: 28px;/);
    expect(chip).toMatch(/margin: 0 14px 0 calc\(\(var\(--nav-icon-box\) - 28px\) \/ 2\);/);
    expect(chip).toMatch(/border: 1px solid color-mix\(/);
    expect(chip).toMatch(/border-radius: 8px;/);
    expect(/\.nav-ws-name \{([^}]*)\}/.exec(access)?.[1]).toMatch(/font: 500 15px\/1\.3 var\(--ui\);/);
    // The same chip wherever the mark is drawn: cover, an 8px radius at 28px.
    expect(css("orgMark.css")).toMatch(/\.orgmark img \{[^}]*object-fit: cover;/);
    expect(css("OrgMark.tsx")).toContain("Math.round((size * 8) / 28)");
    expect(css("OrgMark.tsx")).toContain("size = 28");
  });
});
