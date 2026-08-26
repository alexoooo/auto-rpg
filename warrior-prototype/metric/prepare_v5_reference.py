"""Build rigid-v5 from explicitly routed, ontology-consistent proposals."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from prepare_v2_reference import bbox, transform_for_box, warp_ids
from prepare_v4_reference import classify, materials_from_regions, smooth_body_regions
from score import ANNOTATIONS_PATH, reference_view
from v2_contract import MATERIALS, REGIONS, VIEWS


REFERENCE = Path(__file__).resolve().parent / "reference"
TARGET = REFERENCE / "rigid-v5"
PROPOSALS = REFERENCE / "proposals"
CARDINAL_VIEWS = {"front", "left", "back", "right"}
CARDINAL = PROPOSALS / "warrior-angles-cardinal-imagegen-v2.png"
DIAGONAL_SHEET = PROPOSALS / "warrior-angles-diagonal-imagegen.png"


def main() -> None:
    if TARGET.exists():
        raise SystemExit("rigid-v5 already exists; reference profiles are immutable")
    annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
    registration = json.loads(
        (REFERENCE / "rigid-v4" / "registration.json").read_text(encoding="utf-8"))
    registration.update({
        "profile": "rigid-v5",
        "parentProfile": "rigid-v4",
        "ownershipSource": "explicit cardinal/diagonal routing plus consistent ontology proposals",
    })
    (TARGET / "structural").mkdir(parents=True)
    (TARGET / "material").mkdir(parents=True)
    sheets = {
        "cardinal": np.asarray(Image.open(CARDINAL).convert("RGB")),
        "diagonal": np.asarray(Image.open(DIAGONAL_SHEET).convert("RGB")),
    }
    visibility = {}
    for view in VIEWS:
        spec = annotations["views"][view]
        source = sheets["cardinal" if view in CARDINAL_VIEWS else "diagonal"]
        x, y, width, height = spec["crop"]
        crop = source[y:y + height, x:x + width]
        raw_reference = reference_view(annotations, view)
        # Both v5 sheets deliberately share the diagonal ontology. The
        # synthetic name selects that explicit palette and limb mapping. Actual
        # sheet routing above uses exact view membership; the old substring test
        # mistook the cardinal `left` and `right` views for diagonal views.
        raw_ids = classify("front_left", crop, spec, raw_reference["parts"] > 0)
        transform = transform_for_box(bbox(raw_reference["parts"] > 0))
        ids = smooth_body_regions(warp_ids(raw_ids, transform))
        materials = materials_from_regions(ids)
        # The proposal uses the torso teal for the rectangular mail/fauld
        # under-panels as well as the cuirass. Preserve that material cue below
        # the waist instead of collapsing the complete skirt to leather.
        rows = np.indices(raw_ids.shape)[0] / raw_ids.shape[0]
        torso_id = REGIONS.index("torso") + 1
        raw_mail = ((raw_ids == torso_id) & (rows >= .42)
                    & (raw_reference["parts"] > 0)).astype(np.uint8)
        mail = warp_ids(raw_mail, transform) > 0
        materials[mail] = MATERIALS.index("mail_underlayer") + 1
        Image.fromarray(ids).save(TARGET / "structural" / f"{view}.png")
        Image.fromarray(materials).save(TARGET / "material" / f"{view}.png")
        visibility[view] = {
            name: int(np.count_nonzero(ids == index))
            for index, name in enumerate(REGIONS, 1)
        }
    (TARGET / "registration.json").write_text(
        json.dumps(registration, indent=2) + "\n", encoding="utf-8")
    regions = {
        "schemaVersion": 1,
        "profile": "rigid-v5",
        "parentProfile": "rigid-v4",
        "review": "consistent-ontology target masks reviewed before phase-05 asset scoring",
        "regions": {name: index for index, name in enumerate(REGIONS, 1)},
        "materials": {name: index for index, name in enumerate(MATERIALS, 1)},
        "visibilityPixels": visibility,
    }
    (TARGET / "regions.json").write_text(
        json.dumps(regions, indent=2) + "\n", encoding="utf-8")
    consistency = {
        "schemaVersion": 1,
        "profile": "rigid-v5",
        "parentProfile": "rigid-v4",
        "status": "frozen-consistent-ontology",
        "reviewedViews": list(VIEWS),
        "sourceBoundary": "imagegen proposals plus target annotations only",
        "knownLimits": [
            "proposals are coarse and do not establish exact mail links or fingers",
            "independently generated sheets are directional rather than orthographic truth",
        ],
        "views": {
            view: {
                "confidence": "medium",
                "note": "Explicit cardinal or diagonal sheet with shared limb ontology.",
            }
            for view in VIEWS
        },
    }
    (TARGET / "consistency.json").write_text(
        json.dumps(consistency, indent=2) + "\n", encoding="utf-8")
    print(f"wrote consistency-repaired proposal profile to {TARGET}")


if __name__ == "__main__":
    main()
