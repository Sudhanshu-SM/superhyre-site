import { describe, expect, it } from "vitest";
import { dueFromText, memberInText } from "../taskText";

// Saturday 24 Oct 2026, midday local.
const NOW = new Date(2026, 9, 24, 12, 0, 0);
const day = (text: string) => dueFromText(text, NOW)?.day ?? null;

describe("dueFromText", () => {
  it("reads a weekday as the next one", () => {
    expect(day("saloni vc for BD for monday")).toBe("2026-10-26");
    expect(day("call Asha by friday")).toBe("2026-10-30");
    expect(day("sync on saturday")).toBe("2026-10-31");
  });
  it("reads relative words", () => {
    expect(day("send the JD tomorrow")).toBe("2026-10-25");
    expect(day("review offers today")).toBe("2026-10-24");
    expect(day("close this eod")).toBe("2026-10-24");
    expect(day("follow up in 3 days")).toBe("2026-10-27");
    expect(day("check in 2 weeks")).toBe("2026-11-07");
    expect(day("plan next week")).toBe("2026-10-26");
  });
  it("reads dates, day first, and rolls a past day to next year", () => {
    expect(day("interview on 28 Oct")).toBe("2026-10-28");
    expect(day("interview Oct 28th")).toBe("2026-10-28");
    expect(day("due 05/11")).toBe("2026-11-05");
    expect(day("due 2026-12-01")).toBe("2026-12-01");
    expect(day("renew on 3 jan")).toBe("2027-01-03");
  });
  it("ignores a month word that is not a date and a day the month lacks", () => {
    expect(day("I may call him")).toBeNull();
    expect(day("31 feb")).toBeNull();
    expect(day("source 5 more engineers")).toBeNull();
  });
  it("returns the end of that day", () => {
    const due = dueFromText("tomorrow", NOW)!;
    const d = new Date(due.dueAt);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([25, 23, 59]);
  });
});

describe("memberInText", () => {
  const team = ["Archi Shah", "Dev Rao", "Dev Patel", "Meera Iyer"];
  it("finds a teammate by full name or by a first name nobody shares", () => {
    expect(memberInText("tell Archi to call saloni", team)).toBe("Archi Shah");
    expect(memberInText("Meera: screen the new batch", team)).toBe("Meera Iyer");
    expect(memberInText("ask dev rao for the sheet", team)).toBe("Dev Rao");
  });
  it("does not guess between two teammates who share a name", () => {
    expect(memberInText("ask Dev for the sheet", team)).toBeNull();
  });
  it("does not guess when two teammates are named or none is", () => {
    expect(memberInText("Archi and Meera to split the list", team)).toBeNull();
    expect(memberInText("saloni vc for BD for monday", team)).toBeNull();
  });
  it("matches whole words only", () => {
    expect(memberInText("research the market", ["Res Kumar"])).toBeNull();
    expect(memberInText("archive the old roles", team)).toBeNull();
  });
});

describe("a teammate typed with a slip", () => {
  const team = ["Archi Shah", "Dev Rao", "Dev Patel", "Meera Iyer", "Priyanka Shetty"];
  it("is read as the teammate it is close to, first and last name or one longer word", () => {
    expect(memberInText("Dve Roa to send the BD list for Meridian by monday", team)).toBe("Dev Rao");
    expect(memberInText("Dev Rao ko the sheet", team)).toBe("Dev Rao");
    expect(memberInText("archie to call saloni", team)).toBe("Archi Shah");
    expect(memberInText("Mira: screen the new batch", team)).toBe("Meera Iyer");
    expect(memberInText("Priyanka Shety to chase the invoice", team)).toBe("Priyanka Shetty");
  });
  it("does not guess between two teammates it fits, or for a short word", () => {
    expect(memberInText("Dve to send the list", team)).toBeNull();
    expect(memberInText("rao to send the list", [...team, "Rahul Rao"])).toBeNull();
    expect(memberInText("dan to send the list", team)).toBeNull();
  });
  it("leaves alone words that only look a little like a name", () => {
    expect(memberInText("arch design review for the frontend role", team)).toBeNull();
    expect(memberInText("share the deck with the client", team)).toBeNull();
    expect(memberInText("mere ideas for the role", team)).toBeNull();
  });
});
