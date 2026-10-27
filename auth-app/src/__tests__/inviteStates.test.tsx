import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InviteState } from "../api/identity";
import { INVITE_STATE_LABEL, INVITE_STATE_LINE, INVITE_STATE_TONE, inviteDetail, inviteIsOpen, inviteNeedsResend } from "../membership";
import { Tag } from "../Tag";
import { Tile } from "../Tile";

/** Where an invitation stands, in words, and the two small pieces the Everyone page is built from. */

const STATES: readonly InviteState[] = ["accepted", "expired", "bounced", "delivered", "sent", "not_sent"];
const fmt = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const base = { createdAt: "2026-10-27T08:00:00Z", expiresAt: "2026-11-03T08:00:00Z" };

describe("an invitation's state", () => {
  it("has a word, a sentence and a tone, every one of them", () => {
    for (const s of STATES) {
      expect(INVITE_STATE_LABEL[s].length, s).toBeGreaterThan(2);
      expect(INVITE_STATE_LINE[s].length, s).toBeGreaterThan(10);
      expect(INVITE_STATE_TONE[s], s).toBeTruthy();
    }
    expect(INVITE_STATE_LABEL).toMatchObject({ accepted: "Accepted", expired: "Expired", bounced: "Bounced", delivered: "Delivered", sent: "Sent", not_sent: "Not emailed" });
  });

  it("is open until it is answered or runs out, and worth sending again when the email did not arrive or the link ran out", () => {
    expect(STATES.filter((s) => inviteIsOpen({ state: s }))).toEqual(["bounced", "delivered", "sent", "not_sent"]);
    expect(STATES.filter((s) => inviteNeedsResend({ state: s }))).toEqual(["expired", "bounced", "not_sent"]);
  });

  it("says when it went and when it runs out, why it did not go, when it was joined and when it ran out", () => {
    expect(inviteDetail({ ...base, state: "sent", emailedAt: "2026-10-27T09:00:00Z" }, fmt)).toBe("Sent 27/10. Open until 03/11");
    expect(inviteDetail({ ...base, state: "delivered" }, fmt)).toBe("Sent 27/10. Open until 03/11");
    // The reason ends once, however the server worded it.
    expect(inviteDetail({ ...base, state: "not_sent", emailError: "The email provider refused the message." }, fmt)).toBe("The email provider refused the message. Open until 03/11");
    expect(inviteDetail({ ...base, state: "not_sent" }, fmt)).toBe("No email was sent. Open until 03/11");
    expect(inviteDetail({ ...base, state: "accepted", acceptedAt: "2026-10-27T10:00:00Z" }, fmt)).toBe("Joined 27/10");
    expect(inviteDetail({ ...base, state: "expired" }, fmt)).toBe("Ran out 03/11");
  });
});

describe("the tag and the tile", () => {
  it("wears its tone, and carries the longer sentence as a title", () => {
    const html = renderToStaticMarkup(createElement(Tag, { tone: "good", title: "They joined." }, "Accepted"));
    expect(html).toContain('class="tag is-good"');
    expect(html).toContain('title="They joined."');
    expect(renderToStaticMarkup(createElement(Tag, {}, "Recruiter"))).toContain('class="tag is-plain"');
  });

  it("shows the picture when there is one, the initials when there is not, and an envelope for someone only invited", () => {
    expect(renderToStaticMarkup(createElement(Tile, { name: "Ravi Menon" }))).toContain(">RM<");
    const picture = renderToStaticMarkup(createElement(Tile, { name: "Ravi Menon", url: "https://example.test/r.png" }));
    expect(picture).toContain('src="https://example.test/r.png"');
    expect(picture).toContain("no-referrer");
    const invited = renderToStaticMarkup(createElement(Tile, { name: "x@y.dev", url: "https://example.test/r.png", invited: true }));
    expect(invited).toContain("is-invited");
    expect(invited).not.toContain("<img");
    expect(invited).toContain("<svg");
  });
});
