"""Freeze the reviewed rigid-v3 ownership correction without mutating rigid-v2."""

from __future__ import annotations

import json
import hashlib
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

import v2_contract as contract


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(__file__).resolve().parent / "reference" / "rigid-v2"
TARGET = Path(__file__).resolve().parent / "reference" / "rigid-v3"


def prepare(candidate: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    (destination / "structural").mkdir(parents=True)
    (destination / "material").mkdir(parents=True)
    registration = json.loads((SOURCE / "registration.json").read_text(encoding="utf-8"))
    registration["profile"] = "rigid-v3"
    registration["parentProfile"] = "rigid-v2"
    registration["ownershipCorrection"] = "shield field versus rim/boss only"
    (destination / "registration.json").write_text(
        json.dumps(registration, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    field_id = contract.REGIONS.index("shield_field") + 1
    rim_id = contract.REGIONS.index("shield_rim_boss") + 1
    visibility = {}
    for view in contract.VIEWS:
        reference = np.asarray(Image.open(SOURCE / "structural" / f"{view}.png"), dtype=np.uint8)
        candidate_ids = contract.decode_regions(candidate / f"{view}.regions.png")
        raw = Image.open(candidate / f"{view}.scoring.png").convert("RGB")
        _, aligned = contract.fixed_transform(
            raw, candidate_ids, registration["views"][view]["candidate"], Image.Resampling.NEAREST)
        shield = (reference == field_id) | (reference == rim_id)
        field = binary_dilation(aligned == field_id, iterations=2) & shield
        corrected = reference.copy()
        corrected[shield] = rim_id
        corrected[field] = field_id
        Image.fromarray(corrected).save(destination / "structural" / f"{view}.png")
        shutil.copy2(SOURCE / "material" / f"{view}.png", destination / "material" / f"{view}.png")
        visibility[view] = {
            name: int(np.count_nonzero(corrected == index))
            for index, name in enumerate(contract.REGIONS, 1)
        }

    regions = json.loads((SOURCE / "regions.json").read_text(encoding="utf-8"))
    regions.update({
        "profile": "rigid-v3",
        "parentProfile": "rigid-v2",
        "review": "rigid-v2 masks with only shield field/rim/boss ownership corrected against the accepted object-ID pass",
        "visibilityPixels": visibility,
    })
    (destination / "regions.json").write_text(
        json.dumps(regions, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    consistency = json.loads((SOURCE / "consistency.json").read_text(encoding="utf-8"))
    consistency.update({"profile": "rigid-v3", "parentProfile": "rigid-v2"})
    (destination / "consistency.json").write_text(
        json.dumps(consistency, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def digest_tree(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*")) if path.is_file()
    }


if __name__ == "__main__":
    candidate = ROOT / ".review"
    if TARGET.exists():
        verification = ROOT / ".review" / "rigid-v3-verification"
        prepare(candidate, verification)
        try:
            if digest_tree(verification) != digest_tree(TARGET):
                raise SystemExit("frozen rigid-v3 differs from regenerated ownership profile")
        finally:
            shutil.rmtree(verification)
        print(f"verified frozen ownership profile at {TARGET}")
    else:
        prepare(candidate, TARGET)
        print(f"wrote reviewed ownership profile to {TARGET}")
