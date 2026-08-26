"""Measure ruler sanity and projection limits; never produce an asset decision."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from score_v2 import boundary_distance, iou
from v2_contract import REGIONS, VIEWS


ROOT = Path(__file__).resolve().parents[1]
PROFILE = Path(__file__).resolve().parent / "reference" / "rigid-v3"


def structural_distance(left: np.ndarray, right: np.ndarray) -> float:
    values = []
    for region_id in range(1, len(REGIONS)):
        target = left == region_id
        if not np.any(target):
            continue
        candidate = right == region_id
        boundary, _ = boundary_distance(target, candidate)
        values.append(.65 * (1 - iou(target, candidate)) + .35 * boundary)
    return float(np.mean(values)) if values else 0.0


def audit() -> dict:
    views = {}
    for view in VIEWS:
        target = np.asarray(Image.open(PROFILE / "structural" / f"{view}.png"), dtype=np.uint8)
        identity = structural_distance(target, target)
        if identity != 0.0:
            raise AssertionError(f"identity oracle for {view} was {identity}")
        views[view] = {"identityStructuralDistance": identity}
    return {
        "schemaVersion": 1,
        "profile": "rigid-v3",
        "kind": "nonproduction-2d-oracle",
        "acceptanceEligible": False,
        "warning": "This verifies the ruler floor only. A view-specific target cutout is not a 3D asset.",
        "views": views,
    }


if __name__ == "__main__":
    report = audit()
    output = ROOT / ".review" / "oracle-v3.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"identity oracle is zero in all {len(VIEWS)} views; report: {output}")
