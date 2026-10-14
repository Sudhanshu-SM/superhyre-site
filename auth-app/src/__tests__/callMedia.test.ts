import { describe, expect, it } from "vitest";
import { clock, fillTimes, parseTranscript } from "../callMedia";
import { callsFor } from "../campaign";

describe("parseTranscript", () => {
  it("reads WebVTT cues, voice tags and merges one speaker's consecutive cues", () => {
    const p = parseTranscript(`WEBVTT

00:00:01.000 --> 00:00:04.000
<v Punith>Hi, is this a good time?</v>

00:00:04.500 --> 00:00:06.000
<v Punith>It's about a backend role.</v>

00:01:02.250 --> 00:01:05.000
Aditya: Yes, go ahead.`);
    expect(p.format).toBe("vtt");
    expect(p.speakers).toEqual(["Punith", "Aditya"]);
    expect(p.turns).toHaveLength(2);
    expect(p.turns[0]).toEqual({ at: 1, speaker: "Punith", text: "Hi, is this a good time? It's about a backend role." });
    expect(p.turns[1]!.at).toBeCloseTo(62.25);
    expect(p.timed).toBe(true);
  });

  it("reads SRT with comma milliseconds", () => {
    const p = parseTranscript("1\r\n00:00:02,500 --> 00:00:05,000\r\nSpeaker 1: Hello there\r\n\r\n2\r\n00:00:06,000 --> 00:00:08,000\r\nSpeaker 2: Hi\r\n");
    expect(p.format).toBe("srt");
    expect(p.turns.map((t) => [t.at, t.speaker, t.text])).toEqual([[2.5, "Speaker 1", "Hello there"], [6, "Speaker 2", "Hi"]]);
  });

  it("reads bracketed and bare timestamps on plain lines", () => {
    const p = parseTranscript("[00:12] You: Hi Aditya\n00:20 Aditya: Hey\nthis continues the turn\n[1:02:03] You: Bye");
    expect(p.format).toBe("plain");
    expect(p.turns.map((t) => [t.at, t.speaker])).toEqual([[12, "You"], [20, "Aditya"], [3723, "You"]]);
    expect(p.turns[1]!.text).toBe("Hey this continues the turn");
  });

  it("leaves untimed lines at -1 and fillTimes spreads them in order", () => {
    const p = parseTranscript("Recruiter: Hello\nCandidate: Hi there\nRecruiter: Thanks");
    expect(p.timed).toBe(false);
    expect(p.turns.every((t) => t.at === -1)).toBe(true);
    const filled = fillTimes(p.turns, 60);
    expect(filled[0]!.at).toBe(0);
    expect(filled.every((t, i) => i === 0 || t.at > filled[i - 1]!.at)).toBe(true);
    expect(filled[2]!.at).toBeLessThan(60);
  });

  it("formats clock times", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75.9)).toBe("1:15");
    expect(clock(3723)).toBe("1:02:03");
  });
});

describe("fixture call scripts", () => {
  it("connected calls carry an ordered transcript inside the recording; no-answer calls have none", () => {
    const calls = callsFor("backend-snr");
    for (const c of calls) {
      if (c.outcome === "connected") {
        expect(c.recording).toBe(c.duration);
        expect(c.transcript!.length).toBeGreaterThan(8);
        expect(c.transcript!.every((t, i) => t.at < c.duration && (i === 0 || t.at > c.transcript![i - 1]!.at))).toBe(true);
      }
      if (c.outcome === "no-answer" || c.outcome === "scheduled") expect(c.recording).toBeUndefined();
    }
  });
});
