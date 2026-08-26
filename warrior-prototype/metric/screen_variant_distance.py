"""Reject visually collapsed variant families before formal experiments."""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

import numpy as np
from PIL import Image

from v2_contract import VIEWS


def image_distance(left: Path, right: Path) -> float:
    a = np.asarray(Image.open(left).convert("RGB"), dtype=np.float32)
    b = np.asarray(Image.open(right).convert("RGB"), dtype=np.float32)
    if a.shape != b.shape:
        raise ValueError(f"variant images differ in shape: {left} and {right}")
    return float(np.abs(a - b).mean() / 255)


def evaluate(root: Path, variants: list[str], minimum: float) -> dict:
    pairs = []
    for left, right in itertools.combinations(variants, 2):
        per_view = {
            view: image_distance(root / left / f"{view}.png", root / right / f"{view}.png")
            for view in VIEWS
        }
        mean = float(np.mean(list(per_view.values())))
        pairs.append({"left": left, "right": right, "mean": mean,
                      "maximum": max(per_view.values()), "views": per_view,
                      "passes": mean >= minimum})
    return {"schemaVersion": 1, "minimumMeanRgbDistance": minimum,
            "variants": variants, "pairs": pairs,
            "passes": bool(pairs) and all(pair["passes"] for pair in pairs)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("variants", nargs="+")
    parser.add_argument("--minimum", type=float, default=.0015)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = evaluate(args.root, args.variants, args.minimum)
    output = args.output or args.root / "variant-distance.json"
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for pair in report["pairs"]:
        print(f"{pair['left']} vs {pair['right']}: {pair['mean']:.6f}")
    if not report["passes"]:
        raise SystemExit(f"variant family does not clear mean RGB distance {args.minimum}")


if __name__ == "__main__":
    main()
