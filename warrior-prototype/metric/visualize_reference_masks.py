"""Render review-only colour previews of stored structural ID masks."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from v2_contract import MATERIAL_LINEAR, REGION_LINEAR, VIEWS, linear_to_srgb


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("profile", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--kind", choices=("structural", "material"),
                        default="structural")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    colours = REGION_LINEAR if args.kind == "structural" else MATERIAL_LINEAR
    palette = np.vstack((np.zeros((1, 3), dtype=np.uint8),
                         np.stack([linear_to_srgb(value) for value in colours])
                         .astype(np.uint8)))
    for view in VIEWS:
        ids = np.asarray(Image.open(args.profile / args.kind / f"{view}.png"),
                         dtype=np.uint8)
        Image.fromarray(palette[ids]).save(args.output / f"{view}.png")


if __name__ == "__main__":
    main()
