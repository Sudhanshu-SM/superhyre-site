#!/usr/bin/env python3
"""
The picture a pasted form link shows in chat (WhatsApp, Slack, LinkedIn, iMessage): the terracotta clipboard on
the brand orange, with the SuperHyre mark.

    python3 scripts/build-share-images.py            from auth-app/

Writes superhyre-site/assets/share/form-share-square.png (400x400, what the link card draws as its small image)
and form-share-wide.png (1200x630, for apps that prefer a banner). The API's /share/<key> page points at both
(platform/server/src/modules/forms/share.ts). Source: superhyre-site/assets/empty-state-transparent/form-clipboard.png.

Needs: Pillow, numpy, ImageMagick (`magick`, to draw the mark).
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
SRC = SITE / "assets" / "empty-state-transparent" / "form-clipboard.png"
OUT = SITE / "assets" / "share"
LOGO_SVG = SITE / "assets" / "logo.svg"
FONT = SITE / "assets" / "mondwest-neuebit-font" / "ppmondwest-regular.otf"

ORANGE = (204, 77, 23)  # --accent-fill #cc4d17, the form's brand orange


def drawing(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def mark(height: int) -> Image.Image:
    """The logo in white, `height` px tall, with a transparent ground."""
    svg = LOGO_SVG.read_text().replace("#F97316", "#ffffff")
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "m.svg"
        out = Path(d) / "m.png"
        f.write_text(svg)
        subprocess.run(["magick", "-background", "none", "-density", "1200", str(f), "-resize", f"x{height}", str(out)], check=True)
        return Image.open(out).convert("RGBA")


def lift(canvas: Image.Image, art: Image.Image, at: tuple[int, int]) -> None:
    """Paste with a soft, short shadow so a terracotta board still has an edge on an orange ground."""
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow = Image.new("RGBA", art.size, (60, 20, 5, 90))
    shadow.putalpha(art.getchannel("A").point(lambda v: v * 90 // 255))
    sh.paste(shadow, (at[0], at[1] + max(4, art.height // 60)), shadow)
    sh = sh.filter(ImageFilter.GaussianBlur(max(4, art.height // 40)))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(art, at)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    clip = drawing(Image.open(SRC).convert("RGBA"))

    # Square, 400: the clipboard centred, the mark small at the top left.
    sq = Image.new("RGBA", (400, 400), ORANGE + (255,))
    h = 270
    art = clip.resize((round(clip.width * h / clip.height), h), Image.LANCZOS)
    lift(sq, art, ((400 - art.width) // 2 + 4, 400 - art.height - 40))
    m = mark(30)
    sq.alpha_composite(m, (28, 26))
    sq.convert("RGB").save(OUT / "form-share-square.png", optimize=True)

    # Wide, 1200x630: the mark and the clipboard on the right, cropped by the edge.
    wide = Image.new("RGBA", (1200, 630), ORANGE + (255,))
    h = 560
    art = clip.resize((round(clip.width * h / clip.height), h), Image.LANCZOS)
    lift(wide, art, (1200 - art.width - 110, 630 - art.height + 90))
    m = mark(64)
    wide.alpha_composite(m, (84, 84))
    # The wordmark beside it, and the line the card is for.
    d = ImageDraw.Draw(wide)
    d.text((84 + m.width + 18, 84 + 4), "superhyre", font=ImageFont.truetype(str(FONT), 52), fill=(255, 255, 255))
    d.text((84, 250), "Apply in a couple\nof minutes.", font=ImageFont.truetype(str(FONT), 68), fill=(255, 255, 255), spacing=10)
    wide.convert("RGB").save(OUT / "form-share-wide.png", optimize=True)
    for f in sorted(OUT.glob("*.png")):
        print(f.name, f.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
