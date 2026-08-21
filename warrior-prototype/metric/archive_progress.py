"""Compact a completed experiment phase's front renders into one labelled sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def contact_sheet(source: Path, output: Path, columns: int = 8) -> None:
    paths = sorted(source.glob("*.png"))
    if not paths:
        raise ValueError(f"no PNG progress frames exist under {source}")
    thumb_width, thumb_height = 128, 160
    label_height = 22
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_width, rows * (thumb_height + label_height)), (18, 15, 13))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        left = (index % columns) * thumb_width + (thumb_width - image.width) // 2
        top = (index // columns) * (thumb_height + label_height)
        sheet.paste(image, (left, top))
        label = path.stem.removeprefix("0000-") if index == 0 else path.stem[:4]
        draw.text((index % columns * thumb_width + 5, top + thumb_height + 4), label,
                  fill=(230, 225, 218), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    contact_sheet(args.source, args.output)


if __name__ == "__main__":
    main()

