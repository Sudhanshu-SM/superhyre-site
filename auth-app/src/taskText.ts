/**
 * What a typed task already says: the day it is due ("monday", "tomorrow", "26 Oct", "in 3 days") and the teammate it
 * is for (their name in the words). Both are read from the text as typed, so a task can be added with nothing but words;
 * what is not said falls back to today and to the person typing, and can be changed once it is added.
 */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

export type DueFromText = { dueAt: string; day: string };

const endOfDay = (d: Date): string => {
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
  return e.toISOString();
};
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ahead = (now: Date, days: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);

/** A calendar day, or null when the month has no such day (31 Feb). A day already past this year means next year. */
function calendarDay(now: Date, day: number, month: number, year?: number): Date | null {
  const y = year ?? now.getFullYear();
  const d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  const today = ahead(now, 0);
  if (year === undefined && d < today) return new Date(y + 1, month, day);
  return d;
}

/** The day a task's words ask for, as the end of that day; null when they name none. */
export function dueFromText(text: string, now: Date = new Date()): DueFromText | null {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const found = (d: Date): DueFromText => ({ dueAt: endOfDay(d), day: dayKey(d) });

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) {
    const d = calendarDay(now, Number(iso[3]), Number(iso[2]) - 1, Number(iso[1]));
    if (d) return found(d);
  }
  /* "26 oct", "26th october", "26 oct 2026" */
  const dm = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+(\\d{4}))?`).exec(t);
  if (dm) {
    const d = calendarDay(now, Number(dm[1]), MONTHS.indexOf(dm[2]!.slice(0, 3) as (typeof MONTHS)[number]), dm[3] ? Number(dm[3]) : undefined);
    if (d) return found(d);
  }
  /* "oct 26", "october 26th" */
  const md = new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`).exec(t);
  if (md) {
    const d = calendarDay(now, Number(md[2]), MONTHS.indexOf(md[1]!.slice(0, 3) as (typeof MONTHS)[number]), md[3] ? Number(md[3]) : undefined);
    if (d) return found(d);
  }
  /* "26/10", "26/10/2026" (day first) */
  const slash = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/.exec(t);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : undefined;
    const d = calendarDay(now, Number(slash[1]), Number(slash[2]) - 1, year);
    if (d) return found(d);
  }
  const inN = /\bin (\d{1,2}) (day|days|week|weeks)\b/.exec(t);
  if (inN) return found(ahead(now, Number(inN[1]) * (inN[2]!.startsWith("week") ? 7 : 1)));
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return found(ahead(now, 1));
  for (let i = 0; i < DAYS.length; i += 1) {
    if (new RegExp(`\\b${DAYS[i]}\\b`).test(t)) {
      /* The next one: said on a Monday, "monday" is the Monday after. */
      const gap = (i - now.getDay() + 7) % 7 || 7;
      return found(ahead(now, gap));
    }
  }
  if (/\bnext week\b/.test(t)) return found(ahead(now, (8 - now.getDay()) % 7 || 7));
  if (/\b(today|tonight|eod|end of day)\b/.test(t)) return found(ahead(now, 0));
  return null;
}

import { similarWord } from "./nameSlips";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "iu").test(text);

/**
 * The one teammate the words are about: by full name, else by a first (or last) name no other teammate shares. Two
 * teammates named, or a name two teammates share, is no answer: the task is added for the person typing and the
 * follow-up asks who.
 */
export function memberInText(text: string, team: readonly string[]): string | null {
  const names = [...new Set(team.map((n) => n.trim()).filter(Boolean))];
  const hits = new Set<string>();
  for (const full of names) {
    if (mentions(text, full)) { hits.add(full); continue; }
    const parts = full.split(/\s+/).filter((p) => p.length > 1);
    for (const part of parts) {
      const sharedBy = names.filter((n) => n.split(/\s+/).some((p) => p.toLowerCase() === part.toLowerCase()));
      if (sharedBy.length === 1 && mentions(text, part)) { hits.add(full); break; }
    }
  }
  if (hits.size === 1) return [...hits][0]!;
  if (hits.size > 1) return null;
  return memberWithSlip(text, names);
}

/**
 * Nobody is named as spelled: a name with a slip in it ("Dve Roa to send the BD list") is read as the teammate it is close to.
 * Two words in a row that fit a first and last name, or one word of four letters or more that fits one part of one name; two
 * teammates fitting is no answer. The follow-up under the field always names who it was read as, and can change it.
 */
export function memberWithSlip(text: string, names: readonly string[]): string | null {
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  const hits = new Set<string>();
  for (const full of names) {
    const parts = full.split(/\s+/).filter((p) => p.length > 1);
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
    for (let i = 0; i < words.length; i += 1) {
      const w = words[i]!;
      if (first && last && words[i + 1] && similarWord(w, first) && similarWord(words[i + 1]!, last)) { hits.add(full); break; }
      // A word that is only the start of a name ("arch" for Archi) is another word, not a slip of that name.
      if (w.length >= 4 && parts.some((p) => p.length >= 4 && similarWord(w, p) && !p.toLowerCase().startsWith(w.toLowerCase()))) { hits.add(full); break; }
    }
  }
  return hits.size === 1 ? [...hits][0]! : null;
}
