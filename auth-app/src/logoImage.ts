/**
 * An organisation's logo, from a file the person chose: checked, cropped to a square and shrunk to 256 px in
 * the browser, so what is sent is a small PNG (or WebP/JPEG when that is smaller) and never the original.
 * An SVG is drawn onto the same canvas, which is also why the server never has to hold one.
 */

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
/** What the file input offers. */
export const LOGO_ACCEPT = LOGO_TYPES.join(",");
/** The biggest file taken. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** The side of the stored square. */
export const LOGO_PX = 256;
/** What the server keeps (it refuses more). */
export const LOGO_SENT_MAX = 256 * 1024;

export const LOGO_HINT = "PNG, JPG, WebP or SVG, up to 2 MB. It's cropped to a square.";

/** Why a file cannot be used, in words, or null when it can. */
export function logoFileProblem(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPG, WebP or SVG image.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > LOGO_MAX_BYTES) return "That image is over 2 MB. Pick a smaller one.";
  return null;
}

/** Where a source of `w` by `h` is drawn so that it covers a `size` square, centred (a centre crop). */
export function coverRect(w: number, h: number, size: number): { x: number; y: number; w: number; h: number } {
  const s = Math.max(size / w, size / h);
  const dw = w * s;
  const dh = h * s;
  // `|| 0` so a centred axis is 0, not -0.
  return { x: (size - dw) / 2 || 0, y: (size - dh) / 2 || 0, w: dw, h: dh };
}

/** The bytes a data URL holds, without decoding it. */
export function dataUrlBytes(url: string): number {
  const b64 = url.slice(url.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

function load(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image we can read."));
    };
    img.src = url;
  });
}

/** The file as a 256 px square data URL, ready to send. Throws a sentence a person can read. */
export async function squareLogo(file: File): Promise<string> {
  const problem = logoFileProblem(file);
  if (problem) throw new Error(problem);
  const img = await load(file);
  // An SVG without a size reports 0; it is drawn at the target size instead.
  const w = img.naturalWidth || LOGO_PX;
  const h = img.naturalHeight || LOGO_PX;
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_PX;
  canvas.height = LOGO_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the image. Try another.");
  ctx.imageSmoothingQuality = "high";
  const r = coverRect(w, h, LOGO_PX);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  for (const [type, quality] of [["image/png", undefined], ["image/webp", 0.85], ["image/jpeg", 0.85]] as const) {
    const out = canvas.toDataURL(type, quality);
    if (out.startsWith(`data:${type}`) && dataUrlBytes(out) <= LOGO_SENT_MAX) return out;
  }
  throw new Error("That image is too detailed to use as a logo. Try a simpler one.");
}

/** The address of an organisation's own uploaded logo (as the server hands it out). */
export const isUploadedLogo = (url: string | null | undefined): boolean => Boolean(url && url.includes("/media/org-logos/"));
