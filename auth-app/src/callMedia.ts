/**
 * Reading what a person adds to a call by hand: a transcript (WebVTT, SRT or plain lines) and the shape of a
 * recording (its length, a row of peaks). The files themselves go to the API (api/calls.ts).
 */

/* ── transcript parsing ──
   Accepts WebVTT, SRT, or plain lines in any of these shapes:
     [00:12] Speaker: text      00:12 Speaker: text      Speaker: text
   A line with no speaker continues the turn before it. Plain lines with no
   time get `at: -1`; fillTimes() spreads them over the recording. */

export type ParsedTurn = { at: number; speaker: string; text: string };
export type Parsed = { format: "vtt" | "srt" | "plain"; turns: ParsedTurn[]; speakers: string[]; timed: boolean };

const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?`;
const CUE = new RegExp(`^${TIME}\\s*-->\\s*${TIME}`);
const LEAD = new RegExp(`^\\[?${TIME}\\]?\\s*[-–]?\\s*`);
const SPEAKER = /^([A-Za-z][\w.'’ -]{0,28}?)\s*:\s+(.+)$/;
const VOICE = /^<v(?:\.[^ >]+)?\s+([^>]+)>(.*?)(?:<\/v>)?$/;

function secs(h: string | undefined, m: string, s: string, ms: string | undefined): number {
  return (h ? +h * 3600 : 0) + +m * 60 + +s + (ms ? +ms.padEnd(3, "0") / 1000 : 0);
}

const clean = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function cueText(lines: readonly string[], fallback: string): { speaker: string; text: string } {
  const joined = lines.map((l) => l.trim()).filter(Boolean).join(" ");
  const v = VOICE.exec(joined);
  if (v) return { speaker: v[1]!.trim(), text: clean(v[2]!) };
  const sp = SPEAKER.exec(clean(joined));
  if (sp) return { speaker: sp[1]!.trim(), text: sp[2]!.trim() };
  return { speaker: fallback, text: clean(joined) };
}

export function parseTranscript(raw: string): Parsed {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const isVtt = /^WEBVTT/.test(lines[0]?.trim() ?? "");
  const hasCues = lines.some((l) => CUE.test(l.trim()));
  const turns: ParsedTurn[] = [];
  const push = (t: ParsedTurn) => {
    if (!t.text) return;
    const prev = turns[turns.length - 1];
    /* consecutive cues from one speaker read as one turn */
    if (prev && prev.speaker === t.speaker && (hasCues || t.at < 0)) { prev.text = `${prev.text} ${t.text}`; return; }
    turns.push(t);
  };

  if (isVtt || hasCues) {
    let i = 0, last = "Speaker 1";
    while (i < lines.length) {
      const m = CUE.exec(lines[i]!.trim());
      if (!m) { i++; continue; }
      const at = secs(m[1], m[2]!, m[3]!, m[4]);
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== "") body.push(lines[i++]!);
      const { speaker, text: t } = cueText(body, last);
      last = speaker;
      push({ at, speaker, text: t });
    }
    return finish(isVtt ? "vtt" : "srt", turns);
  }

  let last = "Speaker 1";
  for (const line0 of lines) {
    let line = line0.trim();
    if (!line) continue;
    let at = -1;
    const t = LEAD.exec(line);
    if (t && (line.startsWith("[") || /^\d/.test(line))) { at = secs(t[1], t[2]!, t[3]!, t[4]); line = line.slice(t[0].length); }
    const sp = SPEAKER.exec(line);
    if (sp) { last = sp[1]!.trim(); turns.push({ at, speaker: last, text: clean(sp[2]!) }); continue; }
    const prev = turns[turns.length - 1];
    if (prev && at < 0) { prev.text = `${prev.text} ${clean(line)}`; continue; }
    turns.push({ at, speaker: last, text: clean(line) });
  }
  return finish("plain", turns);
}

function finish(format: Parsed["format"], turns: ParsedTurn[]): Parsed {
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  return { format, turns, speakers, timed: turns.length > 0 && turns.every((t) => t.at >= 0) };
}

/** Untimed turns get times spread over the recording, by length. */
export function fillTimes<T extends { at: number; text: string }>(turns: readonly T[], seconds: number): T[] {
  if (turns.every((t) => t.at >= 0)) return [...turns];
  const total = turns.reduce((a, t) => a + t.text.length + 30, 0) || 1;
  let acc = 0;
  return turns.map((t) => {
    const at = t.at >= 0 ? t.at : Math.round((acc / total) * Math.max(1, seconds) * 10) / 10;
    acc += t.text.length + 30;
    return { ...t, at };
  });
}

/** "mm:ss", or "h:mm:ss" past an hour. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/* ── waveform ── */

/** Deterministic bars for a call with no real audio: a gentle speech-like
    envelope from the id, so the same call always draws the same shape. */
export function fakePeaks(id: string, n: number): number[] {
  let s = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out: number[] = [];
  let level = 0.5;
  for (let i = 0; i < n; i++) {
    level += (r() - 0.5) * 0.35;
    level = Math.min(0.95, Math.max(0.18, level));
    const pause = r() < 0.07 ? 0.25 : 1;
    out.push(Math.max(0.08, level * pause * (0.65 + r() * 0.35)));
  }
  return out;
}

/** Peaks from real audio, via the Web Audio API. Null when it can't decode. */
export async function decodePeaks(file: Blob, n: number): Promise<{ peaks: number[]; seconds: number } | null> {
  const Ctx: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    const peaks: number[] = [];
    for (let i = 0; i < n; i++) {
      let max = 0;
      const end = Math.min(data.length, (i + 1) * step);
      for (let j = i * step; j < end; j++) { const v = Math.abs(data[j]!); if (v > max) max = v; }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return { peaks: peaks.map((p) => Math.max(0.06, p / top)), seconds: buf.duration };
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/** Duration from an Audio element's metadata. Null if the browser can't read it. */
export function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (v: number | null) => { a.removeAttribute("src"); resolve(v); };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}
