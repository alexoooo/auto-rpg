"""Rigid-v2 region-aware diagnostic and similarity report."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, distance_transform_edt, laplace, sobel

from score import (ANNOTATIONS_PATH, NeuralMetrics, VIEWS, canonicalize,
                   landmark_distance, reference_view, rgb_to_lab, sha256_file)
from v2_contract import (CANVAS, MATERIALS, PROFILE_NAME, PROFILE_ROOT, REGIONS,
                         decode_materials, decode_regions, fixed_transform,
                         load_registration)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATE = ROOT / ".review"
DEFAULT_OUTPUT = ROOT / ".review" / "similarity-v2"
WEIGHTS = {
    "silhouette": .15,
    "structure": .25,
    "landmarks": .10,
    "global_neural": .15,
    "region_neural": .20,
    "material_appearance": .15,
}


def iou(left: np.ndarray, right: np.ndarray) -> float:
    union = np.count_nonzero(left | right)
    return 1.0 if union == 0 else float(np.count_nonzero(left & right) / union)


def boundary_distance(left: np.ndarray, right: np.ndarray) -> tuple[float, float]:
    left_edge = left ^ binary_erosion(left)
    right_edge = right ^ binary_erosion(right)
    if not np.any(left_edge) and not np.any(right_edge):
        return 0.0, 1.0
    if not np.any(left_edge) or not np.any(right_edge):
        return 1.0, 0.0
    diagonal = float(np.hypot(*left.shape))
    to_right = distance_transform_edt(~right_edge)[left_edge]
    to_left = distance_transform_edt(~left_edge)[right_edge]
    symmetric = float((to_right.mean() + to_left.mean()) / (2 * diagonal * .05))
    tolerance = diagonal * .0075
    precision = float(np.mean(to_left <= tolerance))
    recall = float(np.mean(to_right <= tolerance))
    f_score = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
    return symmetric, f_score


def mask_geometry(mask: np.ndarray) -> dict[str, Any]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return {"area": 0, "centroid": None, "bounds": None, "orientationDegrees": None}
    centered = np.column_stack((xs - xs.mean(), ys - ys.mean()))
    covariance = centered.T @ centered / max(1, len(xs))
    values, vectors = np.linalg.eigh(covariance)
    axis = vectors[:, np.argmax(values)]
    return {
        "area": int(len(xs)),
        "centroid": [float(xs.mean()), float(ys.mean())],
        "bounds": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
        "orientationDegrees": float(np.degrees(np.arctan2(axis[1], axis[0]))),
    }


def transform_landmarks(points: dict[str, list[float]], transform: dict[str, Any]) -> dict[str, list[float]]:
    left, top, right, bottom = transform["sourceBox"]
    target_left, target_top = transform["targetOffset"]
    width, height = transform["targetSize"]
    sx = width / (right - left)
    sy = height / (bottom - top)
    return {name: [target_left + (point[0] - left) * sx,
                   target_top + (point[1] - top) * sy] for name, point in points.items()}


def region_montage(image: Image.Image, ids: np.ndarray, visible: list[int]) -> Image.Image:
    tiles = []
    source = np.asarray(image)
    for region_id in visible[:6]:
        mask = ids == region_id
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            continue
        pad = 12
        left, right = max(0, xs.min() - pad), min(source.shape[1], xs.max() + pad + 1)
        top, bottom = max(0, ys.min() - pad), min(source.shape[0], ys.max() + pad + 1)
        crop = source[top:bottom, left:right].copy()
        local_mask = mask[top:bottom, left:right]
        crop[~local_mask] = (19, 15, 12)
        tiles.append(Image.fromarray(crop).resize((128, 128), Image.Resampling.LANCZOS))
    result = Image.new("RGB", (384, 256), (19, 15, 12))
    for index, tile in enumerate(tiles):
        result.paste(tile, ((index % 3) * 128, (index // 3) * 128))
    return result


def material_distance(reference: Image.Image, candidate: Image.Image,
                      reference_ids: np.ndarray, candidate_ids: np.ndarray) -> tuple[float, dict[str, float]]:
    reference_array = np.asarray(reference)
    candidate_array = np.asarray(candidate)
    reference_gray = np.asarray(reference.convert("L"), dtype=np.float32) / 255
    candidate_gray = np.asarray(candidate.convert("L"), dtype=np.float32) / 255
    values = {}
    for material_id, name in enumerate(MATERIALS, 1):
        left = binary_erosion(reference_ids == material_id, iterations=2)
        right = binary_erosion(candidate_ids == material_id, iterations=2)
        if not np.any(left):
            continue
        if not np.any(right):
            values[name] = 1.0
            continue
        left_lab = rgb_to_lab(reference_array[left])
        right_lab = rgb_to_lab(candidate_array[right])
        colour = np.linalg.norm(left_lab.mean(0) - right_lab.mean(0)) / 60
        spread = np.linalg.norm(left_lab.std(0) - right_lab.std(0)) / 50
        left_gradient = np.hypot(sobel(reference_gray, 0), sobel(reference_gray, 1))[left]
        right_gradient = np.hypot(sobel(candidate_gray, 0), sobel(candidate_gray, 1))[right]
        gradient = abs(float(left_gradient.mean() - right_gradient.mean())) / .25
        left_laplace = np.abs(laplace(reference_gray))[left]
        right_laplace = np.abs(laplace(candidate_gray))[right]
        texture = abs(float(left_laplace.mean() - right_laplace.mean())) / .20
        values[name] = float(.45 * colour + .20 * spread + .20 * gradient + .15 * texture)
    return (float(np.mean(list(values.values()))) if values else 1.0), values


def contact_diagnostics(regions: np.ndarray) -> dict[str, float]:
    pairs = (("left_hand", "sword_hilt"), ("right_hand", "shield_field"),
             ("left_pauldron", "left_upper_arm"), ("right_pauldron", "right_upper_arm"),
             ("collar", "torso"))
    values = {}
    for left_name, right_name in pairs:
        left = regions == REGIONS.index(left_name) + 1
        right = regions == REGIONS.index(right_name) + 1
        if not np.any(left) or not np.any(right):
            values[f"{left_name}:{right_name}"] = 1.0
            continue
        distance = distance_transform_edt(~right)[left]
        values[f"{left_name}:{right_name}"] = float(distance.min() / 20)
    return values


def score(candidate_directory: Path, output_directory: Path, classical: bool = False) -> dict[str, Any]:
    annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
    registration = load_registration()
    candidate_landmarks = json.loads((candidate_directory / "landmarks.json").read_text(encoding="utf-8"))
    neural = None if classical else NeuralMetrics()
    output_directory.mkdir(parents=True, exist_ok=True)
    views = {}
    for view in VIEWS:
        reference = canonicalize(reference_view(annotations, view))
        reference_regions = np.asarray(Image.open(PROFILE_ROOT / "structural" / f"{view}.png"), dtype=np.uint8)
        reference_materials = np.asarray(Image.open(PROFILE_ROOT / "material" / f"{view}.png"), dtype=np.uint8)
        candidate_regions_raw = decode_regions(candidate_directory / f"{view}.regions.png")
        candidate_materials_raw = decode_materials(candidate_directory / f"{view}.materials.png")
        candidate_beauty_raw = Image.open(candidate_directory / f"{view}.scoring.png").convert("RGB")
        transform = registration["views"][view]["candidate"]
        candidate_beauty, candidate_regions = fixed_transform(
            candidate_beauty_raw, candidate_regions_raw, transform, Image.Resampling.LANCZOS)
        _, candidate_materials = fixed_transform(
            candidate_beauty_raw, candidate_materials_raw, transform, Image.Resampling.NEAREST)
        reference_mask = reference_regions > 0
        candidate_mask = candidate_regions > 0
        silhouette_iou = iou(reference_mask, candidate_mask)
        silhouette_boundary, _ = boundary_distance(reference_mask, candidate_mask)
        region_values = {}
        active = []
        for region_id, name in enumerate(REGIONS[:-1], 1):
            left, right = reference_regions == region_id, candidate_regions == region_id
            if not np.any(left):
                continue
            boundary, f_score = boundary_distance(left, right)
            value = .65 * (1 - iou(left, right)) + .35 * boundary
            region_values[name] = {
                "distance": value, "boundaryFScore": f_score,
                "reference": mask_geometry(left), "candidate": mask_geometry(right),
            }
            active.append(region_id)
        structure = float(np.mean([value["distance"] for value in region_values.values()]))
        ref_landmarks = reference["landmarks"]
        cand_landmarks = transform_landmarks(candidate_landmarks["views"][view], transform)
        landmarks, landmark_values = landmark_distance(ref_landmarks, cand_landmarks)
        material, material_values = material_distance(reference["beauty"], candidate_beauty,
                                                       reference_materials, candidate_materials)
        global_neural = region_neural = None
        neural_values = None
        if neural:
            gd, gl = neural.distances(reference["beauty"], candidate_beauty)
            reference_montage = region_montage(reference["beauty"], reference_regions, active)
            candidate_montage = region_montage(candidate_beauty, candidate_regions, active)
            rd, rl = neural.distances(reference_montage, candidate_montage)
            global_neural, region_neural = (gd + gl) / 2, (rd + rl) / 2
            neural_values = {"globalDreamSim": gd, "globalLPIPS": gl,
                             "regionDreamSim": rd, "regionLPIPS": rl}
        components = {
            "silhouette": .65 * (1 - silhouette_iou) + .35 * silhouette_boundary,
            "structure": structure,
            "landmarks": landmarks,
            "global_neural": global_neural,
            "region_neural": region_neural,
            "material_appearance": material,
        }
        denominator = sum(WEIGHTS[name] for name, value in components.items() if value is not None)
        distance = sum(WEIGHTS[name] * value for name, value in components.items() if value is not None) / denominator
        overlay = np.zeros((CANVAS[1], CANVAS[0], 3), dtype=np.uint8)
        overlay[reference_mask, 1] = 220
        overlay[candidate_mask, 0] = 220
        overlay[reference_mask & candidate_mask] = 230
        Image.fromarray(overlay).save(output_directory / f"{view}-boundary.png")
        views[view] = {
            "distance": distance, "components": components, "neural": neural_values,
            "regions": region_values, "materials": material_values,
            "landmarks": landmark_values, "contacts": contact_diagnostics(candidate_regions),
        }
    distances = sorted(view["distance"] for view in views.values())
    aggregate = .80 * float(np.mean(distances)) + .20 * float(np.mean(distances[-2:]))
    report = {
        "schemaVersion": 2, "formulaVersion": 2, "referenceProfile": PROFILE_NAME,
        "canonical": not classical, "distance": aggregate,
        "aggregation": {"meanWeight": .80, "twoWorstMeanWeight": .20},
        "componentWeights": WEIGHTS, "views": views,
        "inputs": {
            "registrationSha256": sha256_file(PROFILE_ROOT / "registration.json"),
            "regionsSha256": sha256_file(PROFILE_ROOT / "regions.json"),
            "candidateLandmarksSha256": sha256_file(candidate_directory / "landmarks.json"),
            "candidate": {
                view: {
                    "beautySha256": sha256_file(candidate_directory / f"{view}.scoring.png"),
                    "regionsSha256": sha256_file(candidate_directory / f"{view}.regions.png"),
                    "materialsSha256": sha256_file(candidate_directory / f"{view}.materials.png"),
                }
                for view in VIEWS
            },
        },
    }
    (output_directory / "report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_atlas(report, output_directory)
    return report


def write_atlas(report: dict[str, Any], output: Path) -> None:
    headers = "".join(f"<th>{html.escape(view)}</th>" for view in VIEWS)
    rows = []
    for region in REGIONS[:-1]:
        cells = []
        for view in VIEWS:
            value = report["views"][view]["regions"].get(region)
            if value is None:
                cells.append("<td class='na'>occluded</td>")
            else:
                shade = min(100, round(value["distance"] * 60))
                cells.append(f"<td style='background:hsl({120-shade},55%,24%)'>{value['distance']:.3f}</td>")
        rows.append(f"<tr><th>{html.escape(region)}</th>{''.join(cells)}</tr>")
    cards = "".join(f"<figure><img src='{view}-boundary.png'><figcaption>{view}</figcaption></figure>" for view in VIEWS)
    document = f"""<!doctype html><meta charset='utf-8'><title>Rigid-v2 residual atlas</title>
<style>body{{background:#15110f;color:#eee;font:14px system-ui;margin:2rem}}table{{border-collapse:collapse}}th,td{{padding:.4rem;border:1px solid #493a32;text-align:center}}.na{{color:#777}}.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-top:2rem}}figure{{margin:0}}img{{width:100%}}</style>
<h1>Rigid-v2 residual atlas</h1><p>Distance {report['distance']:.4f}; lower is closer. Cells retain global placement.</p>
<table><thead><tr><th>region</th>{headers}</tr></thead><tbody>{''.join(rows)}</tbody></table><div class='cards'>{cards}</div>"""
    (output / "atlas.html").write_text(document, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, default=DEFAULT_CANDIDATE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--classical", action="store_true")
    args = parser.parse_args()
    report = score(args.candidate.resolve(), args.output.resolve(), args.classical)
    print(f"{PROFILE_NAME} visual distance: {report['distance']:.4f}")
    print(f"atlas: {args.output.resolve() / 'atlas.html'}")


if __name__ == "__main__":
    main()
