"""Build the reviewed target-derived rigid-v4 reference masks."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, uniform_filter

from prepare_v2_reference import transform_for_box, warp_ids, bbox
from score import ANNOTATIONS_PATH, canonicalize, polygon_mask, reference_view
from v2_contract import MATERIALS, REGIONS, VIEWS


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = Path(__file__).resolve().parent / "reference"
TARGET = REFERENCE / "rigid-v4"
PROPOSALS = REFERENCE / "proposals"

CARDINAL = {
    "background": ((64, 64, 65),),
    "head": ((243, 173, 124),),
    "hair": ((76, 54, 36),),
    "collar": ((130, 64, 132),),
    "torso": ((191, 54, 47),),
    "warm": ((239, 131, 19), (243, 194, 19), (208, 180, 10)),
    "upper": ((120, 119, 119),),
    "arm": ((22, 147, 160), (46, 98, 185)),
    "hand": ((112, 180, 29),),
    "waist": ((124, 81, 42),),
    "thigh": ((206, 71, 126),),
    "lower": ((76, 182, 199), (163, 202, 10)),
    "shield": ((47, 70, 114),),
    "blade": ((177, 176, 176),),
}
DIAGONAL = {
    "background": ((49, 14, 68),),
    "head": ((228, 134, 16),),
    "hair": ((74, 55, 42),),
    "collar": ((203, 159, 8),),
    "torso": ((11, 101, 113),),
    "pauldron": ((138, 43, 160),),
    "upper": ((37, 87, 174), (47, 67, 193)),
    "vambrace": ((209, 63, 91),),
    "hand": ((228, 134, 16),),
    "waist": ((115, 69, 44),),
    "thigh": ((49, 123, 65), (63, 117, 40)),
    "knee": ((203, 159, 8),),
    "greave": ((63, 114, 164),),
    "shield": ((63, 117, 40),),
    "blade": ((156, 154, 142),),
}


def nearest_labels(image: np.ndarray, palette: dict[str, tuple[tuple[int, int, int], ...]]) -> np.ndarray:
    labels, colours = [], []
    for label, values in palette.items():
        for value in values:
            labels.append(label)
            colours.append(value)
    distances = np.linalg.norm(image[:, :, None, :].astype(np.float32)
                               - np.asarray(colours, dtype=np.float32)[None, None, :, :], axis=3)
    nearest = np.argmin(distances, axis=2)
    return np.asarray(labels, dtype=object)[nearest]


def side_ids(mask: np.ndarray, left_name: str, right_name: str,
             left_x: float, right_x: float) -> np.ndarray:
    output = np.zeros(mask.shape, dtype=np.uint8)
    xs = np.indices(mask.shape)[1]
    left = np.abs(xs - left_x) <= np.abs(xs - right_x)
    output[mask & left] = REGIONS.index(left_name) + 1
    output[mask & ~left] = REGIONS.index(right_name) + 1
    return output


def classify(view: str, crop: np.ndarray, spec: dict, silhouette: np.ndarray) -> np.ndarray:
    diagonal = "left" in view or "right" in view
    labels = nearest_labels(crop, DIAGONAL if diagonal else CARDINAL)
    height, width = silhouette.shape
    y = np.indices(silhouette.shape)[0] / height
    result = np.zeros(silhouette.shape, dtype=np.uint8)

    equipment = np.zeros(silhouette.shape, dtype=bool)
    for part in ("head_hair", "shield", "sword"):
        points = spec["parts"].get(part)
        if not points:
            continue
        mask = polygon_mask((width, height), points) & silhouette
        equipment |= mask
        if part == "head_hair":
            result[mask & (labels == "hair")] = REGIONS.index("hair_beard") + 1
            result[mask & (result == 0)] = REGIONS.index("head_skin") + 1
        elif part == "shield":
            result[mask & (labels == "shield")] = REGIONS.index("shield_field") + 1
            result[mask & (result == 0)] = REGIONS.index("shield_rim_boss") + 1
        else:
            result[mask & (labels == "blade")] = REGIONS.index("sword_blade") + 1
            result[mask & (result == 0)] = REGIONS.index("sword_hilt") + 1

    body = silhouette & ~equipment
    result[body & (labels == "collar") & (y < .35)] = REGIONS.index("collar") + 1
    result[body & (labels == "torso")] = REGIONS.index("torso") + 1
    result[body & (labels == "waist")] = REGIONS.index("waist") + 1
    if diagonal:
        groups = {
            "pauldron": ("left_pauldron", "right_pauldron", "left_shoulder", "right_shoulder"),
            "upper": ("left_upper_arm", "right_upper_arm", "left_shoulder", "right_shoulder"),
            "vambrace": ("left_vambrace", "right_vambrace", "left_hand", "right_hand"),
            "hand": ("left_hand", "right_hand", "left_hand", "right_hand"),
            "thigh": ("left_thigh", "right_thigh", "left_boot", "right_boot"),
            "knee": ("left_knee", "right_knee", "left_boot", "right_boot"),
            "greave": ("left_greave_boot", "right_greave_boot", "left_boot", "right_boot"),
        }
    else:
        groups = {
            "upper": ("left_upper_arm", "right_upper_arm", "left_shoulder", "right_shoulder"),
            "hand": ("left_hand", "right_hand", "left_hand", "right_hand"),
            "thigh": ("left_thigh", "right_thigh", "left_boot", "right_boot"),
        }
        labels[(labels == "warm") & (y < .42)] = "pauldron"
        labels[(labels == "warm") & (y >= .42) & (y < .72)] = "knee"
        labels[(labels == "warm") & (y >= .72)] = "greave"
        labels[(labels == "thigh") & (y < .40)] = "collar"
        labels[(labels == "arm") & (y < .48)] = "vambrace"
        labels[(labels == "arm") & (y >= .48) & (y < .72)] = "knee"
        labels[(labels == "arm") & (y >= .72)] = "greave"
        labels[(labels == "lower") & (y < .70)] = "knee"
        labels[(labels == "lower") & (y >= .70)] = "greave"
        groups.update({
            "pauldron": ("left_pauldron", "right_pauldron", "left_shoulder", "right_shoulder"),
            "vambrace": ("left_vambrace", "right_vambrace", "left_hand", "right_hand"),
            "knee": ("left_knee", "right_knee", "left_boot", "right_boot"),
            "greave": ("left_greave_boot", "right_greave_boot", "left_boot", "right_boot"),
        })
    for label, (left_name, right_name, left_anchor, right_anchor) in groups.items():
        mask = body & (labels == label)
        split = side_ids(mask, left_name, right_name,
                         spec["landmarks"][left_anchor][0], spec["landmarks"][right_anchor][0])
        result[split > 0] = split[split > 0]

    # The proposal colours are most ambiguous on ornate knees and greaves.
    # Their vertical ownership is much more reliable than their generated hue.
    protected = np.isin(result, [
        REGIONS.index("left_vambrace") + 1, REGIONS.index("right_vambrace") + 1,
        REGIONS.index("left_hand") + 1, REGIONS.index("right_hand") + 1,
        REGIONS.index("waist") + 1,
    ])
    leg_bands = (
        ((y >= .72) & body, "left_greave_boot", "right_greave_boot"),
        ((y >= .60) & (y < .72) & body, "left_knee", "right_knee"),
        ((y >= .44) & (y < .60) & body & ~protected, "left_thigh", "right_thigh"),
    )
    for mask, left_name, right_name in leg_bands:
        split = side_ids(mask, left_name, right_name,
                         spec["landmarks"]["left_boot"][0], spec["landmarks"]["right_boot"][0])
        result[split > 0] = split[split > 0]
    if view == "back":
        head = polygon_mask((width, height), spec["parts"]["head_hair"]) & silhouette
        result[head] = REGIONS.index("hair_beard") + 1

    missing = silhouette & (result == 0)
    if np.any(missing):
        known = result > 0
        if not np.any(known):
            raise ValueError(f"{view} proposal classified no target pixels")
        _, indices = distance_transform_edt(~known, return_indices=True)
        result[missing] = result[indices[0][missing], indices[1][missing]]
    return result


def materials_from_regions(regions: np.ndarray) -> np.ndarray:
    output = np.zeros(regions.shape, dtype=np.uint8)
    for region_id, name in enumerate(REGIONS, 1):
        if name == "head_skin": material = "skin"
        elif name == "hair_beard": material = "hair"
        elif "upper_arm" in name: material = "mail_underlayer"
        elif name == "waist": material = "leather"
        elif name == "ignored_cloth": material = "cloth"
        elif name.startswith("shield_"): material = "shield"
        elif name == "sword_blade": material = "blade"
        elif name == "sword_hilt": material = "bright_edge"
        else: material = "dark_plate"
        output[regions == region_id] = MATERIALS.index(material) + 1
    return output


def smooth_body_regions(regions: np.ndarray) -> np.ndarray:
    """Remove proposal colour speckle without moving equipment silhouettes."""
    output = regions.copy()
    body = (regions >= 1) & (regions <= 19)
    counts = np.stack([
        uniform_filter((regions == region_id).astype(np.float32), size=11, mode="constant")
        for region_id in range(1, 20)
    ])
    majority = np.argmax(counts, axis=0).astype(np.uint8) + 1
    output[body] = majority[body]
    return output


def main() -> None:
    if TARGET.exists():
        raise SystemExit("rigid-v4 already exists; reference profiles are immutable")
    annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
    registration = json.loads((REFERENCE / "rigid-v3" / "registration.json").read_text(encoding="utf-8"))
    registration.update({"profile": "rigid-v4", "parentProfile": "rigid-v3",
                         "ownershipSource": "vision proposal plus original polygons and landmarks"})
    (TARGET / "structural").mkdir(parents=True)
    (TARGET / "material").mkdir(parents=True)
    visibility = {}
    proposal_files = {
        False: PROPOSALS / "warrior-angles-cardinal-imagegen.png",
        True: PROPOSALS / "warrior-angles-diagonal-imagegen.png",
    }
    loaded = {key: np.asarray(Image.open(path).convert("RGB")) for key, path in proposal_files.items()}
    for view in VIEWS:
        spec = annotations["views"][view]
        source = loaded["left" in view or "right" in view]
        x, y, width, height = spec["crop"]
        crop = source[y:y + height, x:x + width]
        raw_reference = reference_view(annotations, view)
        raw_ids = classify(view, crop, spec, raw_reference["parts"] > 0)
        reference_box = bbox(raw_reference["parts"] > 0)
        reference_transform = transform_for_box(reference_box)
        ids = smooth_body_regions(warp_ids(raw_ids, reference_transform))
        materials = materials_from_regions(ids)
        Image.fromarray(ids).save(TARGET / "structural" / f"{view}.png")
        Image.fromarray(materials).save(TARGET / "material" / f"{view}.png")
        visibility[view] = {name: int(np.count_nonzero(ids == index))
                            for index, name in enumerate(REGIONS, 1)}
    (TARGET / "registration.json").write_text(json.dumps(registration, indent=2) + "\n", encoding="utf-8")
    regions = {
        "schemaVersion": 1, "profile": "rigid-v4", "parentProfile": "rigid-v3",
        "review": "target-derived coarse structural masks reviewed in all eight views on 2026-08-21",
        "regions": {name: index for index, name in enumerate(REGIONS, 1)},
        "materials": {name: index for index, name in enumerate(MATERIALS, 1)},
        "visibilityPixels": visibility,
    }
    (TARGET / "regions.json").write_text(json.dumps(regions, indent=2) + "\n", encoding="utf-8")
    consistency = json.loads((REFERENCE / "rigid-v3" / "consistency.json").read_text(encoding="utf-8"))
    consistency.update({"profile": "rigid-v4", "parentProfile": "rigid-v3",
                        "status": "frozen-target-derived-coarse",
                        "reviewedViews": list(VIEWS),
                        "sourceBoundary": "imagegen proposals plus target annotations only"})
    (TARGET / "consistency.json").write_text(json.dumps(consistency, indent=2) + "\n", encoding="utf-8")
    print(f"wrote target-derived proposal profile to {TARGET}")


if __name__ == "__main__":
    main()
