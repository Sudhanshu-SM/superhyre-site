import { useEffect, useState } from "react";
import { API_URL } from "./api/client";
import "./formLinkChip.css";

/**
 * A pasted application-form link, shown as a small card (the picture, the role, the host) the way a chat app
 * shows one. Only this console's own links qualify: the API's `/share/<key>` address, or the in-app
 * `#/apply/<key>` one. The words come from the API's share page, so the card says what a chat app would.
 * A link that can't be read stays as it was: plain text, no card.
 */

const KEY = /^[A-Za-z0-9_-]{20,64}$/;

export type FormLink = { url: string; key: string; host: string };

/** The form links in a piece of text, once each, in order. */
export function formLinks(text: string): FormLink[] {
  const out: FormLink[] = [];
  const seen = new Set<string>();
  const api = API_URL ? safeUrl(API_URL)?.origin : null;
  const here = typeof window !== "undefined" ? window.location.origin : null;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'()]+/g)) {
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    const u = safeUrl(raw);
    if (!u) continue;
    let key: string | null = null;
    const share = /^\/share\/([^/]+)\/?$/.exec(u.pathname);
    if (share && api && u.origin === api) key = share[1] ?? null;
    const app = /^#\/apply\/([^/?]+)/.exec(u.hash);
    if (!key && app && here && u.origin === here) key = app[1] ?? null;
    if (!key || !KEY.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ url: raw, key, host: u.host });
  }
  return out;
}

const safeUrl = (s: string): URL | null => {
  try { return new URL(s); } catch { return null; }
};

type Card = { title: string; image: string | null };
const cache = new Map<string, Promise<Card | null>>();

function load(key: string): Promise<Card | null> {
  if (!API_URL) return Promise.resolve(null);
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`${API_URL}/share/${encodeURIComponent(key)}?json=1`)
      .then((r) => (r.ok ? (r.json() as Promise<{ title?: unknown; image?: unknown }>) : null))
      .then((j) => (j && typeof j.title === "string" ? { title: j.title, image: typeof j.image === "string" ? j.image : null } : null))
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

function Chip({ link }: { link: FormLink }): JSX.Element | null {
  const [card, setCard] = useState<Card | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let live = true;
    void load(link.key).then((c) => { if (live) setCard(c); });
    return () => { live = false; };
  }, [link.key]);
  if (!card) return null;
  return (
    <a className="flc" href={link.url} target="_blank" rel="noopener noreferrer">
      {card.image && !broken && <img className="flc-img" src={card.image} width={44} height={44} alt="" onError={() => setBroken(true)} />}
      <span className="flc-t">
        <strong>{card.title}</strong>
        <small>{link.host}</small>
      </span>
    </a>
  );
}

/** The cards for every form link in `text`, or nothing. */
export function FormLinkChips({ text }: { text: string }): JSX.Element | null {
  const links = formLinks(text);
  if (!links.length) return null;
  return <div className="flc-list">{links.map((l) => <Chip key={l.key} link={l} />)}</div>;
}
