"""Render coherent whole-warrior proportion models without editing accepted source."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
BASE_PATH = HERE.parent / "build_warrior.py"
spec = importlib.util.spec_from_file_location("warrior_control", BASE_PATH)
control = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(control)

VARIANTS = {
    "tall_narrow": (.91, 1.10),
    "broad_compact": (1.08, .95),
    "heroic": (.99, 1.06),
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def main():
    args = arguments()
    root = control.make_warrior()
    width, height = VARIANTS[args.variant]
    floor_pivot = .05
    root.scale.x = width
    root.scale.z = height
    root.location.z = floor_pivot * (1.0 - height)
    root["screen_variant"] = args.variant
    root["screen_width_scale"] = width
    root["screen_height_scale"] = height
    args.review.mkdir(parents=True, exist_ok=True)
    control.render_reviews(args.review, root)
    print(f"rendered body model {args.variant} to {args.review}")


if __name__ == "__main__":
    main()
