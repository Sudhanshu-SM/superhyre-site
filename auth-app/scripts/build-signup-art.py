#!/usr/bin/env python3
"""
Turns the generated sign-up art into small transparent WebP files the app can load
(auth-app/src/setup/art/<group>/<name>.webp).

    python3 scripts/build-signup-art.py            from auth-app/

Source: superhyre-site/assets/sign-up-flow-transparent (the pictures with their background already
removed) when it is there; otherwise superhyre-site/assets/sign-up-flow (pictures on white).

With transparent sources the alpha is used as it comes: hard-edged pieces get their outermost pixel
trimmed (it is a blend with the old white) and are shrunk in premultiplied alpha, so edges are smooth
and never carry a halo; soft pieces (glows, sun, cloud) keep their fade.

The tablet pose is also baked into a small set of frames (see bake_tablet): the generated "breathe" and
"blink" sprites are crops of that pose, so they are laid back onto it, and the app only has to fade
between pictures that already line up.

With white sources, the background comes off per kind of piece, because one rule does not fit them all:

  solid    shapes with hard edges (hero, props, leaves, hills, sparks, dial, icons):
           the white connected to the picture's edge is removed (so white shoes or a white
           star face inside a piece stay), the mask is eroded a pixel to drop the
           white-blended rim, and the picture is shrunk in premultiplied alpha so edges are
           smooth and never carry a white halo.
  holes    pieces with an empty middle that is also white (dial, rings, segments, ripples,
           the watch): every near-white pixel goes, not only the outside.
  glow     soft pieces that fade into white (halos, beam, sun, cloud, glow): the colour is
           kept as one flat tint and the fade becomes alpha.
  opaque   background plates (fields): kept as they are, just smaller.

Needs: Pillow, numpy, scipy. The source pictures are not shipped; only the WebP output is.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent.parent / "assets"
SRC = ASSETS / "sign-up-flow-transparent" if (ASSETS / "sign-up-flow-transparent").is_dir() else ASSETS / "sign-up-flow"
OUT = HERE.parent / "src" / "setup" / "art"

# Output edge length (the longer side), by group; sprites and small pieces stay small.
SIZE = {"hero": 1100, "star-dial": 512, "powers": 320, "props": 1024, "scenery": 2048, "effects": 512, "sprites": 256}

# Heroes share one canvas (feet on the same baseline), so they are cropped by the same box:
# the figure fills the picture, and every pose still lines up with every other.
CROP = {"hero": (0.14, 0.12, 0.86, 0.88)}

# The story's props (prop-*) are drawn small in the middle of a big canvas. They are trimmed to what
# is drawn, so a prop's bottom edge is its bottom and it can stand on the ground.
TRIM_PREFIX = "prop-"
TRIM_PAD = 6

# Never exported on their own: the tablet pose's breathe and blink frames are baked into the hero set.
BAKED = ("sprite-breathe-", "sprite-blink-", "hero-tablet-blink")

# Where the breathe/blink sprites sit on the tablet pose, in that picture's own pixels (found by
# matching them against it: correlation 0.999). They are 1448 px squares cut from (300, 386).
TABLET_SPRITE = (300, 386, 1448)

HOLES = ("dial-", "ring-progress-", "ripple-", "watch-star", "seg-", "sprite-ripple-")
GLOW = ("star-glow", "glow", "sun", "cloud", "beam", "sprite-star-pulse-")
OPAQUE = ("field-",)


def kind_of(name: str) -> str:
    stem = name.removesuffix(".png")
    if stem.startswith(OPAQUE):
        return "opaque"
    if stem.startswith(GLOW):
        return "glow"
    if stem.startswith(HOLES):
        return "holes"
    return "solid"


def near_white(rgb: np.ndarray, tol: int) -> np.ndarray:
    return (rgb >= 255 - tol).all(axis=2)


def solid_mask(rgb: np.ndarray) -> np.ndarray:
    """Foreground = everything not reachable from the edge through near-white."""
    white = near_white(rgb, 6)
    labels, _ = ndimage.label(white)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, edge[edge > 0])
    fg = ~background
    # Drop the one-pixel rim where the shape's edge was blended with white.
    return ndimage.binary_erosion(fg, iterations=1) | (fg & ~ndimage.binary_dilation(background, iterations=2))


def holes_mask(rgb: np.ndarray) -> np.ndarray:
    fg = ~near_white(rgb, 4)
    return ndimage.binary_erosion(fg, iterations=1) | (fg & ~ndimage.binary_dilation(~fg, iterations=2))


def to_rgba(arr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    return np.dstack([arr, (mask * 255).astype(np.uint8)])


def shrink_premultiplied(rgba: np.ndarray, size: tuple[int, int]) -> Image.Image:
    """Resizes with colour weighted by alpha, so transparent pixels never bleed their colour in."""
    f = rgba.astype(np.float32) / 255.0
    a = f[..., 3:4]
    premult = np.concatenate([f[..., :3] * a, a], axis=2)
    chans = [Image.fromarray(premult[..., i]).resize(size, Image.LANCZOS) for i in range(4)]
    out = np.stack([np.asarray(c, dtype=np.float32) for c in chans], axis=2)
    alpha = np.clip(out[..., 3:4], 0, 1)
    rgb = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0)
    final = np.concatenate([np.clip(rgb, 0, 1), alpha], axis=2)
    return Image.fromarray((final * 255 + 0.5).astype(np.uint8), "RGBA")


def glow_rgba(rgb: np.ndarray) -> np.ndarray:
    """Soft piece on white: one flat tint (the strongest colour present), alpha from the fade."""
    f = rgb.astype(np.float32)
    green = f[..., 1]
    core_idx = np.unravel_index(np.argmin(green), green.shape)
    core = f[core_idx]
    span = max(255.0 - float(core[1]), 1.0)
    alpha = np.clip((255.0 - green) / span, 0.0, 1.0)
    tint = np.broadcast_to(core, f.shape)
    rgba = np.dstack([tint, alpha * 255.0])
    return np.clip(rgba, 0, 255).astype(np.uint8)


def finish(rgba: np.ndarray, group: str, name: str) -> Image.Image:
    """Shrinks a picture (with alpha) to its group's size, in premultiplied alpha, and crops/trims it."""
    img_h, img_w = rgba.shape[:2]
    longest = SIZE[group]
    scale = longest / max(img_w, img_h)
    size = (max(1, round(img_w * scale)), max(1, round(img_h * scale)))
    out = shrink_premultiplied(rgba, size)
    if group == "props" and name.startswith(TRIM_PREFIX):
        box = out.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            pad = TRIM_PAD
            out = out.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(out.width, box[2] + pad), min(out.height, box[3] + pad)))
    box = CROP.get(group)
    if box:
        w, h = out.size
        out = out.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
    return out


def native_rgba(arr: np.ndarray, kind: str) -> np.ndarray:
    """A picture whose background is already transparent: keep its alpha; trim the blended outer pixel of hard edges."""
    out = arr.copy()
    if kind in ("solid", "holes"):
        fg = out[..., 3] > 127
        out[..., 3] = (ndimage.binary_erosion(fg, iterations=1) * 255).astype(np.uint8)
    return out


def process(path: Path, group: str) -> tuple[Image.Image, str]:
    img = Image.open(path).convert("RGBA")
    arr = np.asarray(img)
    kind = kind_of(path.name)
    if kind == "opaque":
        rgb = img.convert("RGB")
        scale = SIZE[group] / max(rgb.size)
        return rgb.resize((round(rgb.width * scale), round(rgb.height * scale)), Image.LANCZOS), kind
    if arr[..., 3].min() < 255:
        return finish(native_rgba(arr, kind), group, path.name), kind
    rgb = arr[..., :3]
    if kind == "glow":
        rgba = glow_rgba(rgb)
    elif kind == "holes":
        rgba = to_rgba(rgb, holes_mask(rgb))
    else:
        rgba = to_rgba(rgb, solid_mask(rgb))
    return finish(rgba, group, path.name), kind


def sprite_layer(path: Path) -> np.ndarray:
    """A tablet sprite, scaled up to the size it covers on the pose, as float RGBA in 0..1 (premultiplied)."""
    _, _, side = TABLET_SPRITE
    im = Image.open(path).convert("RGBA")
    f = np.asarray(im, dtype=np.float32) / 255.0
    a = f[..., 3:4]
    pm = np.concatenate([f[..., :3] * a, a], axis=2)
    chans = [np.asarray(Image.fromarray(pm[..., i]).resize((side, side), Image.LANCZOS), dtype=np.float32) for i in range(4)]
    return np.stack(chans, axis=2)


def bake_tablet(root: Path) -> list[tuple[str, np.ndarray]]:
    """
    Lays the tablet pose's sprite frames back onto the pose itself, so the app can fade between whole,
    registered pictures: hero-tablet (frame 1), -b2 .. -b4 (the breath), and -eyes-2, -eyes-3 (half and
    fully closed eyes, as small patches on an otherwise empty picture).

    A frame replaces the pose in its upper body only: it fades out over the hips, where the sprite is cut.
    """
    ox, oy, side = TABLET_SPRITE
    base_img = Image.open(root / "hero" / "hero-tablet.png").convert("RGBA")
    base = np.asarray(base_img, dtype=np.float32) / 255.0
    base_pm = np.concatenate([base[..., :3] * base[..., 3:4], base[..., 3:4]], axis=2)
    h, w = base.shape[:2]
    ys = (np.arange(side, dtype=np.float32) / side)[:, None, None]
    feather = np.clip((0.84 - ys) / (0.84 - 0.62), 0.0, 1.0)  # 1 above 62% of the sprite, 0 below 84%

    def paste(layer: np.ndarray, weight: np.ndarray) -> np.ndarray:
        out = base_pm.copy()
        region = out[oy : oy + side, ox : ox + side]
        a = np.clip(layer[..., 3:4], 0, 1) * weight
        # premultiplied "layer over region", with the layer scaled by its weight
        out[oy : oy + side, ox : ox + side] = layer * weight + region * (1 - a)
        return out

    def unpremultiply(pm: np.ndarray) -> np.ndarray:
        a = pm[..., 3:4]
        rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
        return (np.clip(np.concatenate([rgb, a], axis=2), 0, 1) * 255 + 0.5).astype(np.uint8)

    frames: list[tuple[str, np.ndarray]] = []
    for i in range(1, 5):
        layer = sprite_layer(root / "sprites" / f"sprite-breathe-{i}.png")
        name = "hero-tablet" if i == 1 else f"hero-tablet-b{i}"
        frames.append((name, unpremultiply(paste(layer, feather))))

    # The eyes: only what differs from the open-eyed sprite, grown a little and feathered.
    open_img = np.asarray(Image.open(root / "sprites" / "sprite-breathe-1.png").convert("RGBA"), dtype=np.float32)
    for n in (2, 3):
        shut = np.asarray(Image.open(root / "sprites" / f"sprite-blink-{n}.png").convert("RGBA"), dtype=np.float32)
        diff = np.abs(shut[..., :3] - open_img[..., :3]).sum(axis=2) > 40
        mask = ndimage.gaussian_filter(ndimage.binary_dilation(diff, iterations=7).astype(np.float32), 3.5)
        mask = np.clip(mask * 1.6, 0, 1) * (shut[..., 3] > 127)
        f = shut / 255.0
        rgba = np.dstack([f[..., :3], mask]).astype(np.float32)
        pm = np.concatenate([rgba[..., :3] * rgba[..., 3:4], rgba[..., 3:4]], axis=2)
        chans = [np.asarray(Image.fromarray(pm[..., c]).resize((side, side), Image.LANCZOS), dtype=np.float32) for c in range(4)]
        big = np.stack(chans, axis=2)
        canvas = np.zeros((h, w, 4), dtype=np.float32)
        canvas[oy : oy + side, ox : ox + side] = big
        frames.append((f"hero-tablet-eyes-{n}", unpremultiply(canvas)))
    return frames


def main() -> int:
    if not SRC.is_dir():
        print(f"source folder not found: {SRC}", file=sys.stderr)
        return 1
    manifest: list[dict] = []
    total = 0
    tablet = SRC / "hero" / "hero-tablet.png"
    # The tablet frames can be baked only from transparent sources (they are laid over the pose).
    bake = tablet.is_file() and (SRC / "sprites" / "sprite-breathe-1.png").is_file() and np.asarray(Image.open(tablet).convert("RGBA"))[..., 3].min() < 255
    for group_dir in sorted(p for p in SRC.iterdir() if p.is_dir()):
        group = group_dir.name
        if group not in SIZE:
            continue
        (OUT / group).mkdir(parents=True, exist_ok=True)
        if group == "hero" and bake:
            for name, arr in bake_tablet(SRC):
                kind = "solid" if "eyes" not in name else "soft"
                out = finish(native_rgba(arr, kind), group, name + ".png")
                dest = OUT / group / f"{name}.webp"
                out.save(dest, "WEBP", quality=90, alpha_quality=100, method=6)
                total += dest.stat().st_size
                manifest.append({"name": name, "group": group, "kind": kind, "width": out.width, "height": out.height})
        for png in sorted(group_dir.glob("*.png")):
            if bake and (png.name.startswith(BAKED) or png.name == "hero-tablet.png"):
                continue
            img, kind = process(png, group)
            dest = OUT / group / png.name.replace(".png", ".webp")
            if kind == "opaque":
                img.save(dest, "WEBP", quality=88, method=6)
            else:
                img.save(dest, "WEBP", quality=90, alpha_quality=100, method=6)
            total += dest.stat().st_size
            manifest.append({"name": dest.stem, "group": group, "kind": kind, "width": img.width, "height": img.height})
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{len(manifest)} files, {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
