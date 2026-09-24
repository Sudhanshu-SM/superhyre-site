import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* Which vendors power Superhyre is ours to know, not the user's.

   The same rule as the extension's vendor-neutral test. Everything listed
   below is either served by GitHub Pages as committed — Pages has no build
   step, so access/ IS production — or compiled into what is. A vendor's name
   in any of it is one view-source or DevTools search away from every visitor.
   Comments are held to the same rule: this test cannot tell a comment from a
   string, and prose can say "the contact-data provider" or "the AI model".

   The names themselves are not written here. This repository is public, so a
   readable list would publish exactly what the test exists to keep private.
   Each entry is the SHA-256 of a lowercased name with its spaces removed; the
   test hashes every word, and every adjacent pair of words, in each file —
   camelCase split first, so a name written as one word or as two both match.

   Deliberately not scanned: supabase/ (server-side, and it has to name the
   APIs it calls), these tests, and the local sourcing/ tool, which is
   untracked and not part of the served site. */
const VENDOR_SHA256 = new Set([
  "06ea6f1d0510183a24355a5643ce232d16e871228c9e6a4479511b43861df52f",
  "b860941a60da7e0c496d54a287352d998a4566f82472e6b861dfcc516ff60540",
  "7ff8e44441c0050a60176f5e3fb21045dfad43668d5e6b8d6ef259ce45e8303f",
  "8d3aa1a6f227d714692a9d5a7fbbda496fb09f17f7207a11ffd0a4cca6cf35b7",
  "1ed9c4669b0b7f12fe14ed7fa498906515a275a00c8570c14fb29d2bd62271a6",
  "91baef02ea6919d001371c7d8aa579e298f58016d99f27c275b809134f9cd7d4",
  "c857d09db23e6822e3600bc06ad8d58f92ed62bc8efd81c753f77048662cb97d",
  "c70eca6b0f88f44d81a41311647e50fda1ac454ec04ffd442b0eb4743a993131",
  "7d3194f79e645c42e4396dda38be04766810ec6a00d00aced3ffc2a0a1f1a9ef",
  "60965168ce762e949600281ba6d01fee136e5b6e8257b1f216f9025ed324474c",
  "5d72436256ada53828b51895a94bb8489e9f1ac4fe937a8024ef1594e7045ff6",
]);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function namesVendor(text: string): boolean {
  const words = text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.some((w, i) =>
    VENDOR_SHA256.has(sha256(w)) || VENDOR_SHA256.has(sha256((words[i - 1] ?? "") + w)));
}

const SITE = fileURLToPath(new URL("../../../", import.meta.url));

/** Files under a site folder whose names match, as site-relative paths. */
function under(dir: string, ext: RegExp): string[] {
  return readdirSync(join(SITE, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => ext.test(f))
    .map((f) => join(dir, f));
}

const shipped = [
  ...under("auth-app/src", /\.(tsx?|css)$/).filter((f) => !f.includes("__tests__")),
  "auth-app/index.html",
  ...under("access", /\.(js|css|html)$/),
  ...under("extension", /\.html$/),
  ...readdirSync(SITE).filter((f) => /\.(html|js|css)$/.test(f)),
];

describe("vendor-neutral site", () => {
  it("recognises a vendor name however it is written", () => {
    // ContactOut is the one name this repo already publishes — the sourcing
    // function calls its API — so it is the one safe to spell out here.
    expect(namesVendor("Paste a JD, get ContactOut candidates.")).toBe(true);
    expect(namesVendor("get contact out candidates")).toBe(true);
    expect(namesVendor("Paste a JD, get matching candidates.")).toBe(false);
  });

  it("reads the shipped files it guards", () => {
    // A glob that silently matched nothing would pass forever.
    expect(shipped.length).toBeGreaterThan(20);
    expect(shipped).toContain(join("access", "index.html"));
  });

  it("names no vendor anywhere a visitor can read", () => {
    const offenders = shipped.filter((f) => namesVendor(readFileSync(join(SITE, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
