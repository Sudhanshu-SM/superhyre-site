#!/usr/bin/env python3
"""
Turns the generated empty-state pictures (42 transparent 2048 px PNGs) into small WebP files the app can
load (auth-app/src/assets/empty/<name>.webp).

    python3 scripts/build-empty-art.py            from auth-app/ (all of them)
    python3 scripts/build-empty-art.py form-clipboard    only the named ones (the rest are left as they are)

Source: superhyre-site/assets/empty-state-transparent. The 11 Oct set draws each object at its own size on
the 2048 canvas (some wide, some tall), so every picture is fitted on its own: cropped to what it draws,
padded to a square with the same margin, so each reads at the same visual weight wherever it is shown.
Then shrunk in premultiplied alpha, so the edges are smooth and never carry a halo, and saved as lossy
WebP with real transparency.

Needs: Pillow, numpy.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent / "assets" / "empty-state-transparent"
OUT = HERE.parent / "src" / "assets" / "empty"

SIZE = 560  # shown at 96 to 280 px, so this holds up at 2x
AIR = 0.09  # margin around the drawing, as a share of its longer side


def fit(im: Image.Image) -> Image.Image:
    """Crop to the drawing and centre it on a square with an even margin."""
    alpha = np.asarray(im)[..., 3]
    ys, xs = np.where(alpha > 8)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = int(max(x1 - x0, y1 - y0) * (1 + 2 * AIR))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    left, top = cx - side // 2, cy - side // 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im.crop((x0, y0, x1, y1)), (x0 - left, y0 - top))
    return canvas


def shrink(im: Image.Image) -> Image.Image:
    """Resize in premultiplied alpha so a transparent edge never leaks its (unrelated) colour."""
    a = np.asarray(im.convert("RGBA"), dtype=np.float32) / 255.0
    pm = a.copy()
    pm[..., :3] *= a[..., 3:4]
    small = []
    for c in range(4):
        ch = Image.fromarray((pm[..., c] * 255).astype(np.uint8))
        small.append(np.asarray(ch.resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32) / 255.0)
    out = np.stack(small, axis=-1)
    alpha = out[..., 3:4]
    rgb = np.where(alpha > 1e-4, out[..., :3] / np.maximum(alpha, 1e-4), 0)
    out = np.concatenate([np.clip(rgb, 0, 1), alpha], axis=-1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def main() -> None:
    import sys

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    only = set(sys.argv[1:])
    files = sorted(f for f in SRC.glob("*.png") if not only or f.stem in only)
    for f in files:
        im = fit(Image.open(f).convert("RGBA"))
        small = shrink(im)
        dest = OUT / f"{f.stem}.webp"
        small.save(dest, "WEBP", quality=90, method=6, alpha_quality=100)
        total += dest.stat().st_size
    print(f"{len(files)} pictures -> {OUT} ({total / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
