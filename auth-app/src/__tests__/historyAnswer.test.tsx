import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose } from "../ReplyProse";

const ANSWER = [
  "**This week so far** (Mon 19 Oct to Wed 21 Oct)",
  "- **Pipeline:** 110 found, 18 contacted, 10 replied, 9 interviewing, 5 hired.",
  "- **Moved:** 19 people changed stage (Shortlisted 19, Outreach 12, Interviewing 5).",
  "- **Hired (5)**",
  "  - Senior Backend Engineer: Suresh Mehta",
  "  - DevOps / Infrastructure Engineer: Sourav Kapoor, Arjun Kulkarni",
  "- **Rejected (19)**",
  "  - Senior Backend Engineer: Tara Shetty QA55 (no reason was recorded)",
  "  - DevOps / Infrastructure Engineer: 11 (Role filled 10, Notice period 1)",
  "- **Interviews:** Rahul Verma QA, Thu 22 Oct, 4:00 pm (Helix Robotics DevOps Engineer); 3 cancelled.",
  "- **Tasks:** 15 added, 10 done; overdue: Send Aman the job description, Review 35 matches.",
].join("\n");

describe("what happened, as the agent gives it", () => {
  const html = renderToStaticMarkup(<Prose text={ANSWER} />);

  it("is a heading line over one bullet list, a bullet each", () => {
    expect(html).toContain("<strong>This week so far</strong> (Mon 19 Oct to Wed 21 Oct)");
    // five bullets, two of them with a line under the label for each campaign
    expect(html.match(/<ul class="lt-list">/g)).toHaveLength(1);
    expect(html.match(/<ul class="lt-list lt-sub">/g)).toHaveLength(2);
    expect(html.match(/<li>/g)).toHaveLength(5 + 5);
  });

  it("shows the lead word of each bullet in bold and no mark as characters", () => {
    for (const label of ["Pipeline:", "Moved:", "Hired (5)", "Rejected (19)", "Interviews:", "Tasks:"]) {
      expect(html).toContain(`<strong>${label}</strong>`);
    }
    expect(html).not.toContain("**");
    // the text after the label stays on the same bullet
    expect(html).toMatch(/<li><strong>Pipeline:<\/strong> 110 found, 18 contacted/);
  });

  it("nests a line under its label, and does not turn it into a bullet of its own", () => {
    expect(html).toContain('<li><strong>Hired (5)</strong><ul class="lt-list lt-sub"><li>Senior Backend Engineer: Suresh Mehta</li><li>DevOps / Infrastructure Engineer: Sourav Kapoor, Arjun Kulkarni</li></ul></li>');
    expect(html).toContain("Tara Shetty QA55 (no reason was recorded)</li><li>DevOps / Infrastructure Engineer: 11 (Role filled 10, Notice period 1)</li></ul></li>");
  });

  it("is one short sentence above a person's bullets, as a paragraph then the list", () => {
    const out = renderToStaticMarkup(
      <Prose text={"Tara was rejected on both.\n\n**Tara Shetty QA55**\n- **Senior Backend Engineer:** rejected Wed 21 Oct, 11:18 am by you. No reason was recorded.\n- **Helix Robotics DevOps Engineer:** rejected Wed 21 Oct, 8:05 am by you. Reason: Role filled."} />,
    );
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out).toContain("<strong>Tara Shetty QA55</strong>");
    expect(out).toContain("<strong>Senior Backend Engineer:</strong> rejected Wed 21 Oct, 11:18 am by you. No reason was recorded.");
  });
});
