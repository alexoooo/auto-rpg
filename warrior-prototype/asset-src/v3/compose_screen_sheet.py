"""Compose the authored-v3 screening sheet.

One row per candidate, one column per review angle, with the accepted control on
the top row so a change is read against what it replaces rather than in
isolation. This is a review aid only: nothing here feeds the metric.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


VIEWS = ("front", "front_left", "left", "back")
CROP = (140, 24, 500, 740)
SCALE = 0.62
MARGIN = 14
LABEL_HEIGHT = 34
HEADER_HEIGHT = 30
BACKGROUND = (18, 16, 15)
TEXT = (236, 232, 226)
MUTED = (150, 144, 136)


def font(size):
    for name in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--row", action="append", required=True,
                        help="directory=label, in the order the rows should appear")
    return parser.parse_args()


def main():
    args = arguments()
    rows = []
    for entry in args.row:
        directory, _, label = entry.partition("=")
        rows.append((args.review / directory, label or directory))

    tile = (int((CROP[2] - CROP[0]) * SCALE), int((CROP[3] - CROP[1]) * SCALE))
    width = MARGIN + len(VIEWS) * (tile[0] + MARGIN)
    height = HEADER_HEIGHT + len(rows) * (tile[1] + LABEL_HEIGHT + MARGIN) + MARGIN
    sheet = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    title_font = font(19)
    small_font = font(15)

    for index, view in enumerate(VIEWS):
        x = MARGIN + index * (tile[0] + MARGIN)
        draw.text((x, 8), view.replace("_", " "), fill=MUTED, font=small_font)

    y = HEADER_HEIGHT
    for directory, label in rows:
        missing = [view for view in VIEWS if not (directory / f"{view}.png").exists()]
        if missing:
            sys.exit(f"{directory} is missing renders: {', '.join(missing)}")
        draw.text((MARGIN, y), label, fill=TEXT, font=title_font)
        for index, view in enumerate(VIEWS):
            image = Image.open(directory / f"{view}.png").convert("RGB")
            image = image.crop(CROP).resize(tile, Image.LANCZOS)
            sheet.paste(image, (MARGIN + index * (tile[0] + MARGIN), y + LABEL_HEIGHT))
        y += LABEL_HEIGHT + tile[1] + MARGIN

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)
    print(f"wrote {args.output} ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
