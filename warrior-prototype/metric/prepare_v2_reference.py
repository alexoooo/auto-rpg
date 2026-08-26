"""Freeze rigid-v2 registration and bootstrap reviewed visible-region masks."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from score import ANNOTATIONS_PATH, CANVAS, canonicalize, candidate_view, polygon_mask, reference_view
from v2_contract import MATERIALS, PROFILE_ROOT, REGIONS, VIEWS, decode_materials, decode_regions


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / ".review"


def bbox(mask: np.ndarray) -> list[int]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise ValueError("cannot register an empty mask")
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]


def transform_for_box(box: list[int]) -> dict[str, list[int]]:
    left, top, right, bottom = box
    width, height = CANVAS
    scale = min(width * .90 / (right - left), height * .90 / (bottom - top))
    target_width = max(1, round((right - left) * scale))
    target_height = max(1, round((bottom - top) * scale))
    return {
        "sourceBox": box,
        "targetOffset": [(width - target_width) // 2, round(height * .95) - target_height],
        "targetSize": [target_width, target_height],
    }


def warp_ids(ids: np.ndarray, transform: dict[str, list[int]]) -> np.ndarray:
    left, top, right, bottom = transform["sourceBox"]
    target_left, target_top = transform["targetOffset"]
    target_width, target_height = transform["targetSize"]
    crop = Image.fromarray(ids[top:bottom, left:right]).resize(
        (target_width, target_height), Image.Resampling.NEAREST)
    result = np.zeros((CANVAS[1], CANVAS[0]), dtype=np.uint8)
    result[target_top:target_top + target_height,
           target_left:target_left + target_width] = np.asarray(crop)
    return result


def main() -> None:
    annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
    landmarks = json.loads((REVIEW / "landmarks.json").read_text(encoding="utf-8"))
    PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    (PROFILE_ROOT / "structural").mkdir(exist_ok=True)
    (PROFILE_ROOT / "material").mkdir(exist_ok=True)
    registration = {"schemaVersion": 1, "profile": "rigid-v2", "canvas": list(CANVAS), "views": {}}
    consistency = {"schemaVersion": 1, "views": {}}
    visibility = {}
    for view in VIEWS:
        reference = canonicalize(reference_view(annotations, view))
        candidate = candidate_view(REVIEW, view, landmarks, annotations.get("ignoredParts", []))
        accepted_box = bbox(candidate["parts"] > 0)
        candidate_transform = transform_for_box(accepted_box)
        reference_box = bbox(reference_view(annotations, view)["parts"] > 0)
        reference_transform = transform_for_box(reference_box)
        registration["views"][view] = {
            "candidate": candidate_transform,
            "reference": reference_transform,
            "basis": "phase-01 accepted foreground; frozen for all candidates",
        }
        regions = warp_ids(decode_regions(REVIEW / f"{view}.regions.png"), candidate_transform)
        materials = warp_ids(decode_materials(REVIEW / f"{view}.materials.png"), candidate_transform)
        reference_mask = reference["parts"] > 0
        regions[~reference_mask] = 0
        materials[~reference_mask] = 0
        # Preserve the reference's explicit equipment/head semantics even where
        # the bootstrap geometry does not overlap the target silhouette.
        spec = annotations["views"][view]
        raw = np.zeros((spec["crop"][3], spec["crop"][2]), dtype=np.uint8)
        for part_name, region_name in (("head_hair", "hair_beard"), ("shield", "shield_field"),
                                      ("sword", "sword_blade")):
            if part_name in spec["parts"]:
                raw[polygon_mask((raw.shape[1], raw.shape[0]), spec["parts"][part_name])] = REGIONS.index(region_name) + 1
        explicit = warp_ids(raw, reference_transform)
        regions[explicit > 0] = explicit[explicit > 0]
        Image.fromarray(regions).save(PROFILE_ROOT / "structural" / f"{view}.png")
        Image.fromarray(materials).save(PROFILE_ROOT / "material" / f"{view}.png")
        visibility[view] = {
            name: int(np.count_nonzero(regions == index + 1))
            for index, name in enumerate(REGIONS)
        }
        consistency["views"][view] = {
            "confidence": "medium" if "left" in view or "right" in view else "high",
            "note": "Diagonal sheet is independently generated; equipment and small details are directional, not orthographic truth."
                    if "left" in view or "right" in view else "Cardinal-sheet visible surfaces.",
        }
    (PROFILE_ROOT / "registration.json").write_text(json.dumps(registration, indent=2) + "\n", encoding="utf-8")
    (PROFILE_ROOT / "consistency.json").write_text(json.dumps(consistency, indent=2) + "\n", encoding="utf-8")
    contract = {
        "schemaVersion": 1,
        "profile": "rigid-v2",
        "review": "bootstrap masks were generated from accepted object IDs, clipped to target silhouette, and visually reviewed as a phase-02 starting ontology",
        "regions": {name: index + 1 for index, name in enumerate(REGIONS)},
        "materials": {name: index + 1 for index, name in enumerate(MATERIALS)},
        "visibilityPixels": visibility,
    }
    (PROFILE_ROOT / "regions.json").write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
    print(f"wrote rigid-v2 reference contract to {PROFILE_ROOT}")


if __name__ == "__main__":
    main()
