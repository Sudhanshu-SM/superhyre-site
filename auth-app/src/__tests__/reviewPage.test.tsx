import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicReview } from "../api/stages";
import { Notice, Screen } from "../ReviewPage";
import { REVIEW_FIXTURE } from "../reviewFixture";
import { reviewTokenFrom } from "../reviewKey";
import {
  answerLine, answeredOnly, metaLine, progressLine, rememberName, rememberedName, safeLink, schoolRows, skillsLine, verdictBody, whenLabel, workRows, yearsLine,
} from "../reviewView";

/**
 * The client's page: opened by a link and nothing else. Calm, complete about the person (what they do, why they
 * match, work, schooling, screening answers, resume), two plain ways to answer, and no contact detail of any kind.
 */

const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const send = () => Promise.resolve();

describe("which address is a review page", () => {
  it("is #/review/<token>, or a /review/<token> path, and nothing else", () => {
    expect(reviewTokenFrom("#/review/abc123_DEF-xyz")).toBe("abc123_DEF-xyz");
    expect(reviewTokenFrom("#/review/abc/extra?x=1")).toBe("abc");
    expect(reviewTokenFrom("", "/access/review/tok-1")).toBe("tok-1");
    expect(reviewTokenFrom("", "/review/tok-1/")).toBe("tok-1");
    expect(reviewTokenFrom("#/apply/some-form")).toBeNull();
    expect(reviewTokenFrom("#/reviews")).toBeNull();
    expect(reviewTokenFrom("#/review/")).toBeNull();
    expect(reviewTokenFrom("", "/")).toBeNull();
    expect(reviewTokenFrom("#/review/a%20b")).toBe("a b");
  });

  it("is wired to its own chunk, with no sign-in, before the app", () => {
    const main = src("main.tsx");
    expect(main).toContain('import("./ReviewPage")');
    expect(main).toContain("reviewTokenFrom(window.location.hash, window.location.pathname)");
    expect(main.indexOf("<ReviewPage")).toBeLessThan(main.indexOf("<Themed><App />"));
  });
});

describe("the page with people on it", () => {
  const html = renderToStaticMarkup(<Screen review={REVIEW_FIXTURE} send={send} />);

  it("names the search, who it is for and how many there are to look at", () => {
    expect(html).toContain("Senior Backend Engineer");
    expect(html).toContain("Hiring for Acme Fintech.");
    expect(html).toContain("2 people to look at.");
    expect(html).toContain("Northline Search");
  });

  it("gives one card per person with everything the client needs to decide", () => {
    expect(html.match(/<article/g)).toHaveLength(2);
    for (const bit of [
      "Meera Iyer", "Staff engineer, payments platform", "Bengaluru · 9 years of experience", "Go · PostgreSQL · Kafka · AWS",
      "Why they match", "Nine years on payment infrastructure", "Experience", "Staff Engineer", "Razorpay, 2021 to now", "2017 to 2021",
      "Education", "NIT Trichy", "B.Tech, Computer Science", "2011 – 2015", "Their answers", "Notice period?", "Sixty days, can start in January.",
    ]) expect(html, bit).toContain(bit);
  });

  it("leaves out a section a person has nothing for, instead of an empty heading", () => {
    const second = html.slice(html.indexOf("Arjun Nair"));
    expect(second).toContain("Experience");
    expect(second).not.toContain("Education");
    expect(second).not.toContain("Their answers");
    expect(second).not.toContain("Open their resume");
  });

  it("asks for a name once, at the top, and has Approve and Not for us under each person", () => {
    expect(html.match(/Your name/g)).toHaveLength(1);
    expect(html.match(/>Approve</g)).toHaveLength(2);
    expect(html.match(/>Not for us</g)).toHaveLength(2);
    expect(html.match(/Add a note for the team \(optional\)/g)).toHaveLength(2);
    expect(html).toContain('maxLength="500"');
  });

  it("shows no contact detail anywhere", () => {
    expect(html).not.toMatch(/mailto:|tel:|@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d ()-]{8,}\d|linkedin\.com|Email|Phone/i);
  });

  it("opens a resume in a new tab only when there is a web address for it", () => {
    const review: PublicReview = { ...REVIEW_FIXTURE, candidates: [{ ...REVIEW_FIXTURE.candidates[0]!, resumeUrl: "https://files.example/resume.pdf?sig=1" }, { ...REVIEW_FIXTURE.candidates[1]!, resumeUrl: "javascript:alert(1)" }] };
    const out = renderToStaticMarkup(<Screen review={review} send={send} />);
    expect(out).toContain('href="https://files.example/resume.pdf?sig=1" target="_blank" rel="noopener noreferrer"');
    expect(out.match(/Open their resume/g)).toHaveLength(1);
    expect(out).not.toContain("javascript:");
  });

  it("tells back an answer already given, with its note and a way to change it, and says when everyone is answered", () => {
    const answered: PublicReview = {
      ...REVIEW_FIXTURE,
      candidates: REVIEW_FIXTURE.candidates.map((c, i) => ({ ...c, verdict: { verdict: i === 0 ? ("approved" as const) : ("declined" as const), note: i === 0 ? "Lovely, let's talk." : null, at: "2026-10-18T10:00:00Z" } })),
    };
    const out = renderToStaticMarkup(<Screen review={answered} send={send} />);
    expect(out).toContain("You approved this person.");
    expect(out).toContain("You marked this person as not for you.");
    expect(out).toContain("Lovely, let&#x27;s talk.");
    expect(out.match(/>Change</g)).toHaveLength(2);
    expect(out).not.toContain(">Approve<");
    expect(out).toContain("Thank you. You have answered everyone.");
  });
});

describe("when there is nothing to show", () => {
  it("is calm about an empty list", () => {
    const out = renderToStaticMarkup(<Screen review={{ ...REVIEW_FIXTURE, candidates: [] }} send={send} />);
    expect(out).toContain("Nothing to review right now");
    expect(out).toContain("When someone is ready for you to look at");
    expect(out).not.toMatch(/error|wrong|sorry|oops/i);
  });

  it("is calm about a link that is off, and says what to do", () => {
    const out = renderToStaticMarkup(<Notice art={{ name: "form-closed", size: 180 }} title="This link isn't active any more" text="Ask your recruiter for a new one." />);
    expect(out).toContain("This link isn&#x27;t active any more");
    expect(out).toContain("Ask your recruiter for a new one.");
    expect(out).not.toMatch(/error|wrong|sorry|oops|404/i);
  });

  it("shows the logo mark's loader while it loads, and a Try again when asked to offer one", () => {
    expect(renderToStaticMarkup(<Notice busy text="Loading" />)).toContain('class="ldr');
    expect(renderToStaticMarkup(<Notice title="Slow" text="x" retry={() => {}} />)).toContain("Try again");
  });

  it("treats a link the page can read in the app's own code path as the live one, and the preview as a fixture", () => {
    const page = src("ReviewPage.tsx");
    expect(page).toContain('LIVE && token !== "preview"');
    expect(page).toContain("err instanceof ApiError && err.status === 404");
  });
});

describe("how the page reads a profile", () => {
  it("makes months and years out of dates in the shapes a profile has", () => {
    expect(whenLabel("2021-03-01")).toBe("Mar 2021");
    expect(whenLabel("2019")).toBe("2019");
    expect(whenLabel(2015)).toBe("2015");
    expect(whenLabel(null)).toBe("");
    expect(whenLabel("soon")).toBe("");
  });

  it("reads work and schooling tolerantly and drops what is not a row of words", () => {
    expect(workRows([
      { title: "Engineer", company: "Acme", startDate: "2020-01-01", endDate: "2022-06-01" },
      { role: "Lead", employer: "Beta", start: "2022-07", current: true, description: "Ran the team." },
      "Freelance",
      { company: "Solo Ltd" },
      {}, null, 7,
    ])).toEqual([
      { title: "Engineer", company: "Acme", when: "2020 to 2022", about: "" },
      { title: "Lead", company: "Beta", when: "2022 to now", about: "Ran the team." },
      { title: "Freelance", company: "", when: "", about: "" },
      { title: "Solo Ltd", company: "", when: "", about: "" },
    ]);
    expect(schoolRows([{ institution: "IIT Madras", degree: "M.Tech", fieldOfStudy: "AI", start_year: 2016, end_year: 2018 }, "Open University", { degree: "x" }])).toEqual([
      { school: "IIT Madras", detail: "M.Tech, AI", when: "2016 – 2018" },
      { school: "Open University", detail: "", when: "" },
    ]);
    expect(workRows(undefined)).toEqual([]);
  });

  it("says years and place in one line, and nothing for what it does not know", () => {
    expect(yearsLine(9)).toBe("9 years of experience");
    expect(yearsLine(1)).toBe("1 year of experience");
    expect(yearsLine(0.2)).toBe("Under a year of experience");
    expect(yearsLine(null)).toBe("");
    expect(metaLine({ location: " Pune ", yearsExperience: 6 })).toBe("Pune · 6 years of experience");
    expect(metaLine({ location: null, yearsExperience: null })).toBe("");
    expect(skillsLine([" Go ", "", "Rust"])).toBe("Go · Rust");
    expect(answeredOnly([{ question: "Q", answer: " A " }, { question: "Q2", answer: " " }])).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("counts what is left to answer without nagging", () => {
    expect(progressLine(0, 0)).toBe("");
    expect(progressLine(1, 0)).toBe("One person to look at.");
    expect(progressLine(5, 0)).toBe("5 people to look at.");
    expect(progressLine(5, 2)).toBe("3 people still to look at.");
    expect(progressLine(2, 1)).toBe("One person still to look at.");
    expect(progressLine(3, 3)).toBe("Thank you. You have answered everyone.");
    expect(answerLine("approved")).toBe("You approved this person.");
  });

  it("only links to web addresses", () => {
    expect(safeLink("https://a.test/x")).toBe("https://a.test/x");
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("data:text/html,x")).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});

describe("the answer that goes to the server", () => {
  it("trims the note and the name, leaves out the empty ones and holds the note to 500", () => {
    expect(verdictBody("approved", "  Good fit  ", " Dev ")).toEqual({ verdict: "approved", note: "Good fit", reviewerName: "Dev" });
    expect(verdictBody("declined", "   ", "")).toEqual({ verdict: "declined" });
    expect(verdictBody("approved", "x".repeat(900), "").note).toHaveLength(500);
  });

  it("remembers the name for this tab only, and shrugs if the tab cannot", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(rememberedName(store)).toBe("");
    rememberName("  Dev Patel ", store);
    expect(rememberedName(store)).toBe("Dev Patel");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(rememberedName(broken)).toBe("");
    expect(() => rememberName("x", broken)).not.toThrow();
    expect(rememberedName(null)).toBe("");
    expect(src("reviewView.ts")).toContain("window.sessionStorage");
    expect(src("reviewView.ts")).not.toContain("localStorage");
  });
});

describe("the page's look", () => {
  const css = src("review.css");
  it("is light wherever it is shown and kept out of the generated dark theme", () => {
    expect(css).toContain("color-scheme: light");
    expect(src("theme/postcssDark.ts")).toMatch(/BUILDER_ONLY = \/\(apply\|review\)\\\.css\$\//);
  });
  it("draws no coloured edge on one side of a card", () => {
    expect(css).not.toMatch(/border-(left|inline-start)[^;]*\d+px/);
  });
});
