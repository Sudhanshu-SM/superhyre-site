import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inlineList } from "../replyLists";
import { Prose } from "../ReplyProse";

const SAID =
  'Should I create:\n\n1. One task description for both, or two separate tasks? 2. What should the task say exactly - just "Contact Aman", or something more specific like "Contact Aman for the Data Analyst role"? 3. When is it due - tomorrow (Wednesday, 14 Oct)?';

describe("a list written on one line", () => {
  it("is found with its lead-in and its items, numbered from 1", () => {
    expect(inlineList("Before I do it: 1. which campaign? 2. which date? 3. who owns it?")).toEqual({
      lead: "Before I do it:", items: ["which campaign?", "which date?", "who owns it?"], ordered: true,
    });
  });

  it("takes 1. 2. 3. and 1) 2) 3) as items, keeps what leads into them, and keeps each item whole", () => {
    const a = inlineList("Should I: 1. email Aman 2. call him - or text 3. wait until Friday")!;
    expect(a).toMatchObject({ ordered: true, lead: "Should I:" });
    expect(a.items).toEqual(["email Aman", "call him - or text", "wait until Friday"]);
    const b = inlineList("1) One 2) Two")!;
    expect(b).toMatchObject({ ordered: true, lead: "", items: ["One", "Two"] });
  });

  it("reads bullets written inline, and a dash list a colon introduces", () => {
    expect(inlineList("You can do: - find people - email them - book a call")).toMatchObject({
      ordered: false, lead: "You can do:", items: ["find people", "email them", "book a call"],
    });
    expect(inlineList("• find people • email them • book a call")).toMatchObject({ ordered: false, items: ["find people", "email them", "book a call"] });
    expect(inlineList("Pick one: • email • call")).toMatchObject({ ordered: false, lead: "Pick one:", items: ["email", "call"] });
  });

  it("leaves sentences alone: numbers inside words, versions, one item, dashes as punctuation, code and tables", () => {
    for (const t of [
      "Version 1.5 is out and 2.0 is next.",
      "I found 3. Then nothing.",
      "Step 1. is the only step here.",
      "It costs 2.5 lakh, about 3.2 in total.",
      "Just 'Contact Aman' - or something more specific - is fine.",
      "Use `1. a 2. b` as the format.",
      "| 1. a | 2. b |",
      "Chapter 2. 3. 4.",
      "",
    ]) expect(inlineList(t), t).toBeNull();
  });
});

describe("the reply shows it as a list", () => {
  it("turns the agent's enumeration into an ordered list under its lead-in", () => {
    const html = renderToStaticMarkup(<Prose text={SAID} />);
    expect(html).toContain("<p class=\"rep-para\">Should I create:</p>");
    expect(html).toContain('<ol class="lt-list lt-list-ol">');
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
    expect(html).toContain("<li>One task description for both, or two separate tasks?</li>");
    expect(html).toContain("<li>When is it due - tomorrow (Wednesday, 14 Oct)?</li>");
    // and it is no longer printed inline
    expect(html).not.toMatch(/tasks\? 2\./);
  });

  it("leaves an ordinary paragraph, and a real list, as they were", () => {
    const plain = renderToStaticMarkup(<Prose text="Version 1.5 is out. I found 3 people for you." />);
    expect(plain).toBe('<p class="rep-para">Version 1.5 is out. I found 3 people for you.</p>');
    const real = renderToStaticMarkup(<Prose text={"Here you go:\n- one\n- two"} />);
    expect(real).toContain('<ul class="lt-list">');
    expect((real.match(/<li>/g) ?? []).length).toBe(2);
  });
});
