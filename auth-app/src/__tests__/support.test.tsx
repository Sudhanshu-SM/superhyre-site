import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { SupportRequest } from "../api/support";
import { SupportFailed, SupportForm, SupportPage, SupportSent } from "../SupportPage";
import {
  draftProblems, fileProblem, fileType, messageCount, pageBeforeSupport, rememberPage, sendSupport, SUPPORT_EMAIL,
} from "../supportForm";
import type { Draft } from "../supportForm";

/**
 * The Support page: what it shows, what it asks for, and what happens when the message goes or cannot go.
 * There is no DOM here, so the screen is read as markup and the rules as plain functions.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

const good: Draft = {
  name: "Priya Rajan",
  email: "priya@acme.dev",
  topic: "problem",
  subject: "  Candidates will not load ",
  message: "  The candidates page spins forever after I open a campaign.  ",
};

const file = (name: string, size: number, type: string) => ({ name, size, type });
const noop = () => {};

describe("the page", () => {
  const html = renderToStaticMarkup(<SupportPage />);

  it("is a title, one line of intro and a form", () => {
    expect(html).toContain(">Support</h1>");
    expect(html).toContain("Ask us anything or tell us what&#x27;s not working. We read every message.");
    expect(html).toContain("<form");
    expect(html).toContain(">Send message</button>");
  });

  it("asks for a name, an email, a topic, a subject (optional), a message and one optional file", () => {
    for (const label of ["Your name", "Your email", "Topic", "Subject", "Message", "Attachment"]) expect(html).toContain(label);
    expect(html).toMatch(/Subject <span class="sp-opt">optional<\/span>/);
    for (const topic of ["Question", "Something is not working", "Feedback", "Billing or account", "Other"]) {
      expect(html).toContain(`>${topic}</option>`);
    }
    expect(html).toContain("PNG, JPG, PDF or text, up to 5 MB.");
    expect(html).toContain('accept=".png,.jpg,.jpeg,.pdf,.txt,');
  });

  it("counts the message as it is written", () => {
    expect(html).toContain("0 / 5,000");
    expect(messageCount("  hello  ")).toBe("5 / 5,000");
    expect(messageCount("x".repeat(4321))).toBe("4,321 / 5,000");
  });

  it("says when they usually reply and where else to write, once", () => {
    expect(html).toContain("We usually reply within a working day.");
    expect(html.match(/href="mailto:punith@superhyre\.com"/g)).toHaveLength(1);
    expect(SUPPORT_EMAIL).toBe("punith@superhyre.com");
  });

  it("has no documentation link while there is no documentation page", () => {
    expect(html).not.toMatch(/Documentation/i);
  });

  it("is plain: no status pills, no apology, no vendor names", () => {
    expect(html).not.toMatch(/sorry|oops|unfortunately|claude|anthropic|openai|supabase|railway/i);
    expect(html).not.toMatch(/class="[^"]*\b(pill|badge)\b/);
  });

  it("starts with the signed-in person's name and email, which they can change", () => {
    const filled = renderToStaticMarkup(<SupportPage account={{ name: "Priya Rajan", email: "priya@acme.dev" }} />);
    expect(filled).toMatch(/id="sp-name"[^>]*value="Priya Rajan"|value="Priya Rajan"[^>]*id="sp-name"/);
    expect(filled).toMatch(/id="sp-email"[^>]*value="priya@acme.dev"|value="priya@acme.dev"[^>]*id="sp-email"/);
    expect(filled).not.toMatch(/id="sp-name"[^>]*readOnly/);
    // The Console draws it as it always has: no props to wire.
    expect(src("Console.tsx")).toContain('route === "support" ? (\n            <SupportPage />');
  });
});

describe("what each field needs", () => {
  it("lets a complete message go", () => {
    expect(draftProblems(good)).toEqual({});
  });

  it("asks for a name and a working email", () => {
    expect(draftProblems({ ...good, name: "  " }).name).toBe("Add your name so we know who to reply to.");
    expect(draftProblems({ ...good, email: "" }).email).toBe("Add the email we should reply to.");
    for (const email of ["priya", "priya@", "priya@acme", "pri ya@acme.dev"]) {
      expect(draftProblems({ ...good, email }).email).toBe("That email doesn't look right.");
    }
  });

  it("asks for at least 10 and at most 5,000 characters, counted without the spaces round it", () => {
    expect(draftProblems({ ...good, message: "" }).message).toBe("Write your message here.");
    expect(draftProblems({ ...good, message: "123456789" }).message).toMatch(/at least 10 characters/);
    expect(draftProblems({ ...good, message: "          x         " }).message).toMatch(/at least 10/);
    expect(draftProblems({ ...good, message: "1234567890" }).message).toBeUndefined();
    expect(draftProblems({ ...good, message: "x".repeat(5000) }).message).toBeUndefined();
    expect(draftProblems({ ...good, message: "x".repeat(5001) }).message).toMatch(/over 5,000 characters/);
  });

  it("does not need a subject, but keeps it short", () => {
    expect(draftProblems({ ...good, subject: "" })).toEqual({});
    expect(draftProblems({ ...good, subject: "s".repeat(121) }).subject).toMatch(/under 120/);
  });

  it("shows a problem calmly under its field, and marks the field", () => {
    const html = renderToStaticMarkup(
      <SupportForm
        draft={{ ...good, message: "short" }}
        problems={draftProblems({ ...good, message: "short" })}
        file={null} fileError={null} busy={false}
        onChange={noop} onLeave={noop} onSubmit={noop} onChoose={noop} onDrop={noop}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/A little more, please: at least 10 characters\./);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="sp-message-err"');
  });
});

describe("the one attachment", () => {
  it("takes PNG, JPG, PDF and text up to 5 MB", () => {
    for (const f of [file("a.png", 10, "image/png"), file("a.jpg", 10, "image/jpeg"), file("a.pdf", 10, "application/pdf"), file("a.txt", 10, "text/plain")]) {
      expect(fileProblem(f)).toBeNull();
    }
    expect(fileProblem(file("big.pdf", 5 * 1024 * 1024, "application/pdf"))).toBeNull();
  });

  it("knows a text file by its extension when the browser gives no type", () => {
    expect(fileType(file("notes.txt", 3, ""))).toBe("text/plain");
    expect(fileType(file("shot.JPEG", 3, "application/octet-stream"))).toBe("image/jpeg");
    expect(fileType(file("page.html", 3, "text/html"))).toBeNull();
  });

  it("says why a file is not taken, in one line", () => {
    expect(fileProblem(file("clip.mp4", 10, "video/mp4"))).toBe("Attach a PNG, JPG, PDF or text file.");
    expect(fileProblem(file("big.pdf", 5 * 1024 * 1024 + 1, "application/pdf"))).toBe("That file is over 5 MB. Choose a smaller one.");
    expect(fileProblem(file("empty.txt", 0, "text/plain"))).toBe("That file is empty.");
  });

  it("shows as a chip with its size and a way to take it off", () => {
    const html = renderToStaticMarkup(
      <SupportForm
        draft={good} problems={{}} file={{ name: "screen.png", size: 120 * 1024 }} fileError={null} busy={false}
        onChange={noop} onLeave={noop} onSubmit={noop} onChoose={noop} onDrop={noop}
      />,
    );
    expect(html).toContain("sp-chip");
    expect(html).toContain("screen.png");
    expect(html).toContain("120 KB");
    expect(html).toContain('aria-label="Remove screen.png"');
    expect(html).not.toContain("Attach a file");
  });
});

describe("sending", () => {
  const receipt = (emailed: boolean) => async (_r: SupportRequest) => ({ ok: true as const, emailed });

  it("sends what was written, trimmed, with the page they were on and the file as base64", async () => {
    const sent: SupportRequest[] = [];
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "screen.png", { type: "image/png" });
    const out = await sendSupport(good, png, "campaign-candidates", async (r) => {
      sent.push(r);
      return { ok: true, emailed: true };
    });
    expect(out).toEqual({ kind: "sent", emailed: true });
    expect(sent[0]).toEqual({
      name: "Priya Rajan",
      email: "priya@acme.dev",
      topic: "problem",
      subject: "Candidates will not load",
      message: "The candidates page spins forever after I open a campaign.",
      page: "campaign-candidates",
      attachment: { name: "screen.png", type: "image/png", data: "iVBORw==" },
    });
  });

  it("sends no attachment when there is none", async () => {
    const send = vi.fn(receipt(true));
    await sendSupport(good, null, null, send);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ attachment: null, page: null });
  });

  it("reports a message that was saved but not emailed as sent, without the email", async () => {
    expect(await sendSupport(good, null, null, receipt(false))).toEqual({ kind: "sent", emailed: false });
  });

  it("says what the server said when it refuses, and offers an edit only when the message itself is the problem", async () => {
    const limited = await sendSupport(good, null, null, async () => {
      throw new ApiError(429, "rate_limited", "You've sent a few messages already. Try again a little later.");
    });
    expect(limited).toEqual({ kind: "failed", message: "You've sent a few messages already. Try again a little later.", editable: false });

    const refused = await sendSupport(good, null, null, async () => {
      throw new ApiError(400, "bad_request", "That file is over 5 MB. Attach a smaller one.");
    });
    expect(refused).toEqual({ kind: "failed", message: "That file is over 5 MB. Attach a smaller one.", editable: true });

    const offline = await sendSupport(good, null, null, async () => {
      throw new ApiError(0, "network", "Can't reach SuperHyre. Check your connection and try again.");
    });
    expect(offline).toMatchObject({ kind: "failed", editable: false });
    expect(offline.kind === "failed" && offline.message).toContain("Check your connection");
  });

  it("does not put \"Not found.\" in front of anyone when the server has no such route", async () => {
    const out = await sendSupport(good, null, null, async () => {
      throw new ApiError(404, "not_found", "Not found.");
    });
    expect(out).toEqual({ kind: "failed", message: "We couldn't send that just now.", editable: false });
  });

  it("never leaves a raw error in front of anyone", async () => {
    const out = await sendSupport(good, null, null, async () => {
      throw new TypeError("Failed to fetch at https://api.example.com/v1/support");
    });
    expect(out).toEqual({ kind: "failed", message: "Your message is still here.", editable: false });
  });
});

describe("the two ways it ends", () => {
  it("thanks them and says where the reply goes, with a way to write another", () => {
    const html = renderToStaticMarkup(<SupportSent emailed email="priya@acme.dev" onAgain={noop} />);
    expect(html).toContain("Thanks, we&#x27;ve got it.");
    expect(html).toContain("We&#x27;ll reply to priya@acme.dev.");
    expect(html).toContain(">Send another</button>");
    expect(html).not.toContain("mailto:");
  });

  it("says it is saved when the email could not go, and gives the address", () => {
    const html = renderToStaticMarkup(<SupportSent emailed={false} email="priya@acme.dev" onAgain={noop} />);
    expect(html).toContain(">Saved.</h2>");
    expect(html).toContain("We&#x27;ll get back to you at priya@acme.dev.");
    expect(html).toContain('href="mailto:punith@superhyre.com"');
  });

  it("says it did not go through, calmly, with Try again and the plain way to write instead", () => {
    const html = renderToStaticMarkup(
      <SupportFailed message="Can't reach SuperHyre. Check your connection and try again." editable={false} onRetry={noop} onEdit={noop} />,
    );
    expect(html).toContain("That didn&#x27;t go through.");
    expect(html).toContain("Check your connection");
    expect(html).toContain(">Try again</button>");
    expect(html).toContain("or write to <a href=\"mailto:punith@superhyre.com\">punith@superhyre.com</a>");
    expect(html).not.toContain("Edit your message");
    expect(renderToStaticMarkup(<SupportFailed message="x" editable onRetry={noop} onEdit={noop} />)).toContain("Edit your message");
  });

  it("does not say the address twice on the page when it is already in the answer", () => {
    // The page's own line (below the form) drops the address while the failed answer is carrying it.
    expect(src("SupportPage.tsx")).toContain('view.kind === "form" || (view.kind === "sent" && view.emailed)');
  });
});

describe("which page they were on", () => {
  it("is the last page that was not Support, by name, with no ids in it", () => {
    rememberPage("#/campaign/pipeline");
    expect(pageBeforeSupport()).toBe("campaign-candidates");
    rememberPage("#/support");
    expect(pageBeforeSupport()).toBe("campaign-candidates");
    rememberPage("#/clients/6f1c2d3e-0000-4000-8000-000000000000/notes");
    expect(pageBeforeSupport()).toBe("clients");
  });
});

describe("the page's measure", () => {
  const css = src("support.css");
  it("is one column of 640px, with 6px from label to field, 24px between fields and 32px above the button", () => {
    expect(css).toMatch(/\.con-page\.sp \{ max-width: 640px; margin: 0 auto; \}/);
    expect(css).toMatch(/\.con-page\.sp \.con-lede \{ max-width: none; \}/);
    expect(css).toMatch(/\.sp \.ncx-f \{ gap: 6px; \}/);
    expect(css).toMatch(/\.sp-form \{ display: grid; gap: 24px;/);
    expect(css).toMatch(/\.sp-act \{ padding-top: 8px; \}/); // 24 + 8
    expect(css).toMatch(/\.sp \.ncx-in \{ border-radius: 8px; \}/);
  });

  it("stacks the name and email on a phone", () => {
    expect(css).toMatch(/@media \(max-width: 560px\) \{\s*\.sp-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
