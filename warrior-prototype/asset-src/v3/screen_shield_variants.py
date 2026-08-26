"""Screen contact-preserving rigid shield transforms around the accepted hand."""

from __future__ import annotations

import argparse
import importlib.util
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
BASE_PATH = HERE.parent / "build_warrior.py"
spec = importlib.util.spec_from_file_location("warrior_control", BASE_PATH)
control = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(control)

VARIANTS = {
    "yaw_in": (0.0, math.radians(12), 1.0, 0.0),
    "yaw_in_20": (0.0, math.radians(20), 1.0, 0.0),
    "yaw_in_28": (0.0, math.radians(28), 1.0, 0.0),
    "yaw_in_high": (math.radians(-5), math.radians(18), 1.0, .025),
    "yaw_out": (0.0, math.radians(-12), 1.0, 0.0),
    "high_compact": (math.radians(-8), 0.0, .94, .035),
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def transform_shield(root, variant):
    pitch, yaw, scale, lift = VARIANTS[variant]
    pivot = Vector((.50, -.19, .80))
    transform = (Matrix.Translation(pivot + Vector((0, 0, lift)))
                 @ Matrix.Rotation(yaw, 4, "Z")
                 @ Matrix.Rotation(pitch, 4, "X")
                 @ Matrix.Diagonal((scale, scale, scale, 1.0))
                 @ Matrix.Translation(-pivot))
    for obj in tuple(bpy.data.objects):
        if obj.name == "kite_shield" or obj.name.startswith("shield_"):
            if obj.parent != root:
                raise ValueError(f"unexpected shield parent for {obj.name}")
            obj.matrix_local = transform @ obj.matrix_local
    for name in ("shield_top", "shield_outer", "shield_bottom"):
        control.REVIEW_LANDMARKS[name] = tuple(
            transform @ Vector(control.REVIEW_LANDMARKS[name]))


def main():
    args = arguments()
    root = control.make_warrior()
    root.scale.x = .91
    root.scale.z = 1.10
    root.location.z = .05 * (1.0 - 1.10)
    transform_shield(root, args.variant)
    root["screen_variant"] = args.variant
    args.review.mkdir(parents=True, exist_ok=True)
    control.render_reviews(args.review, root)
    print(f"rendered shield transform {args.variant} to {args.review}")


if __name__ == "__main__":
    main()
