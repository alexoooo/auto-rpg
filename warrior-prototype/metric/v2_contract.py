"""Shared, versioned contracts for the rigid-v2 diagnostic ruler."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PROFILE_NAME = os.environ.get("WARRIOR_REFERENCE_PROFILE", "rigid-v2")
PROFILE_ROOT = Path(__file__).resolve().parent / "reference" / PROFILE_NAME
VIEWS = (
    "front", "front_left", "left", "back_left",
    "back", "back_right", "right", "front_right",
)
CANVAS = (512, 640)
REGIONS = (
    "head_skin", "hair_beard", "collar", "torso",
    "left_pauldron", "right_pauldron", "left_upper_arm", "right_upper_arm",
    "left_vambrace", "right_vambrace", "left_hand", "right_hand", "waist",
    "left_thigh", "right_thigh", "left_knee", "right_knee",
    "left_greave_boot", "right_greave_boot", "shield_field",
    "shield_rim_boss", "sword_blade", "sword_hilt", "ignored_cloth",
)
MATERIALS = (
    "dark_plate", "bright_edge", "mail_underlayer", "leather", "cloth",
    "skin", "hair", "shield", "blade",
)

# These are the linear object colours authored in build_warrior.py. Blender's
# Standard view transform publishes their sRGB values in the ID PNG.
REGION_LINEAR = (
    (1.0, .20, .20), (.55, .10, .85), (1.0, .55, .05), (.85, .05, .05),
    (.95, .35, .10), (.95, .65, .10), (.55, .85, .10), (.20, .80, .20),
    (.05, .75, .55), (.05, .70, .85), (.10, .35, 1.0), (.30, .15, 1.0),
    (.75, .10, .75), (.95, .15, .55), (1.0, .30, .70), (.75, .45, .90),
    (.55, .35, .80), (.35, .25, .70), (.20, .15, .55), (.10, .45, .95),
    (.10, .75, 1.0), (.95, .95, .15), (.80, .55, .05), (1.0, 0.0, 1.0),
)
MATERIAL_LINEAR = (
    (.85, .10, .10), (1.0, .55, .10), (.75, .10, .75), (.45, .25, .05),
    (1.0, 0.0, 1.0), (1.0, .45, .35), (.30, .10, .05), (.10, .40, 1.0),
    (.80, .90, 1.0),
)


def linear_to_srgb(values: tuple[float, float, float]) -> np.ndarray:
    value = np.asarray(values, dtype=np.float64)
    value = np.where(value <= .0031308, value * 12.92,
                     1.055 * np.power(value, 1 / 2.4) - .055)
    return np.rint(value * 255).astype(np.float32)


def decode_id_mask(path: Path, names: tuple[str, ...], colours: tuple[tuple[float, float, float], ...],
                   tolerance: float = 110.0) -> np.ndarray:
    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)
    opaque = rgba[:, :, 3] >= 250
    rgb = rgba[:, :, :3].astype(np.float32)
    palette = np.stack([linear_to_srgb(colour) for colour in colours])
    distances = np.linalg.norm(rgb[:, :, None, :] - palette[None, None, :, :], axis=3)
    nearest = np.argmin(distances, axis=2)
    minimum = np.min(distances, axis=2)
    unknown = opaque & (minimum > tolerance)
    if np.any(unknown):
        y, x = np.argwhere(unknown)[0]
        raise ValueError(f"unknown opaque ID colour {tuple(rgba[y, x, :3])} in {path.name} at {x},{y}")
    result = np.zeros(opaque.shape, dtype=np.uint8)
    result[opaque] = nearest[opaque] + 1
    return result


def decode_regions(path: Path) -> np.ndarray:
    return decode_id_mask(path, REGIONS, REGION_LINEAR)


def decode_materials(path: Path) -> np.ndarray:
    return decode_id_mask(path, MATERIALS, MATERIAL_LINEAR)


def load_registration() -> dict[str, Any]:
    return json.loads((PROFILE_ROOT / "registration.json").read_text(encoding="utf-8"))


def fixed_transform(image: Image.Image, ids: np.ndarray, transform: dict[str, Any],
                    resample: Image.Resampling) -> tuple[Image.Image, np.ndarray]:
    left, top, right, bottom = transform["sourceBox"]
    target_left, target_top = transform["targetOffset"]
    target_width, target_height = transform["targetSize"]
    crop = image.crop((left, top, right, bottom)).resize((target_width, target_height), resample)
    id_crop = Image.fromarray(ids[top:bottom, left:right]).resize(
        (target_width, target_height), Image.Resampling.NEAREST)
    output = Image.new("RGB", CANVAS, (19, 15, 12))
    foreground = (np.asarray(id_crop) > 0).astype(np.uint8) * 255
    output.paste(crop, (target_left, target_top), Image.fromarray(foreground))
    output_ids = np.zeros((CANVAS[1], CANVAS[0]), dtype=np.uint8)
    output_ids[target_top:target_top + target_height,
               target_left:target_left + target_width] = np.asarray(id_crop)
    return output, output_ids
