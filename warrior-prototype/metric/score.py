"""Measure eight fixed warrior renders against the annotated concept turnarounds."""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.metadata
import json
import os
from pathlib import Path
from typing import Any
import warnings

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion, distance_transform_edt, sobel


ROOT = Path(__file__).resolve().parents[1]
METRIC_ROOT = Path(__file__).resolve().parent
ANNOTATIONS_PATH = METRIC_ROOT / "reference" / "annotations.json"
MODEL_MANIFEST_PATH = METRIC_ROOT / "model-manifest.json"
DEFAULT_CANDIDATE = ROOT / ".review"
DEFAULT_OUTPUT = ROOT / ".review" / "similarity"
VIEWS = (
    "front", "front_left", "left", "back_left",
    "back", "back_right", "right", "front_right",
)
CANVAS = (512, 640)
BACKGROUND = np.array((19, 15, 12), dtype=np.uint8)
PARTS = {
    "body_armour": 1,
    "head_hair": 2,
    "shield": 3,
    "sword": 4,
    "tabard": 5,
}
PART_RGB = {
    1: np.array((255, 0, 0), dtype=np.float32),
    2: np.array((0, 255, 0), dtype=np.float32),
    3: np.array((0, 0, 255), dtype=np.float32),
    4: np.array((255, 255, 0), dtype=np.float32),
    5: np.array((255, 0, 255), dtype=np.float32),
}
PART_WEIGHTS = {
    "body_armour": 0.30,
    "head_hair": 0.15,
    "shield": 0.20,
    "sword": 0.20,
    "tabard": 0.15,
}
COMPONENT_WEIGHTS = {
    "silhouette": 0.20,
    "parts": 0.25,
    "landmarks": 0.15,
    "dreamsim": 0.20,
    "lpips": 0.10,
    "palette_texture": 0.10,
}
FORMULA_VERSION = 1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def state_dict_sha256(model: Any) -> str:
    digest = hashlib.sha256()
    for name, tensor in sorted(model.state_dict().items()):
        value = tensor.detach().cpu().contiguous()
        digest.update(name.encode("utf-8"))
        digest.update(str(value.dtype).encode("ascii"))
        digest.update(np.asarray(value).tobytes())
    return digest.hexdigest()


def configure_model_cache() -> None:
    cache = ROOT / ".metric-cache"
    os.environ.setdefault("HF_HOME", str(cache / "huggingface"))
    os.environ.setdefault("TORCH_HOME", str(cache / "torch"))
    os.environ.setdefault("XDG_CACHE_HOME", str(cache))


class NeuralMetrics:
    def __init__(self, verify: bool = True) -> None:
        configure_model_cache()
        warnings.filterwarnings("ignore", message="xFormers is not available.*")
        warnings.filterwarnings("ignore", message="Already found a `peft_config` attribute.*")
        warnings.filterwarnings("ignore", message="The parameter 'pretrained' is deprecated.*")
        warnings.filterwarnings("ignore", message="Arguments other than a weight enum.*")
        warnings.filterwarnings("ignore", message="You are using `torch.load` with `weights_only=False`.*")
        import torch
        import lpips
        from dreamsim import dreamsim

        torch.set_grad_enabled(False)
        torch.use_deterministic_algorithms(True)
        torch.set_num_threads(1)
        self.torch = torch
        self.dreamsim, self.dreamsim_preprocess = dreamsim(
            pretrained=True, device="cpu", dreamsim_type="dinov2_vitb14",
            cache_dir=str(ROOT / ".metric-cache" / "dreamsim"),
        )
        self.dreamsim.eval()
        self.lpips = lpips.LPIPS(net="alex", version="0.1", verbose=False).cpu().eval()
        self.hashes = {
            "dreamsim_dinov2_vitb14": state_dict_sha256(self.dreamsim),
            "lpips_alex_0.1": state_dict_sha256(self.lpips),
        }
        if verify:
            if not MODEL_MANIFEST_PATH.exists():
                raise RuntimeError("model-manifest.json is missing; run npm run similarity:setup")
            expected = json.loads(MODEL_MANIFEST_PATH.read_text(encoding="utf-8"))["stateDictSha256"]
            if self.hashes != expected:
                raise RuntimeError(
                    "perceptual model weights differ from metric/model-manifest.json; "
                    "remove .metric-cache and run npm run similarity:setup"
                )

    def distances(self, reference: Image.Image, candidate: Image.Image) -> tuple[float, float]:
        if reference.size == candidate.size and reference.tobytes() == candidate.tobytes():
            return 0.0, 0.0
        torch = self.torch
        with torch.inference_mode():
            reference_dream = self.dreamsim_preprocess(reference).cpu()
            candidate_dream = self.dreamsim_preprocess(candidate).cpu()
            dreamsim_value = float(self.dreamsim(reference_dream, candidate_dream).item())
            reference_lpips = self._lpips_tensor(reference)
            candidate_lpips = self._lpips_tensor(candidate)
            lpips_value = float(self.lpips(reference_lpips, candidate_lpips).item())
        return dreamsim_value / 0.5, lpips_value / 0.5

    def _lpips_tensor(self, image: Image.Image) -> Any:
        resized = image.resize((256, 256), Image.Resampling.LANCZOS)
        values = np.asarray(resized, dtype=np.float32) / 127.5 - 1.0
        return self.torch.from_numpy(values.transpose(2, 0, 1)).unsqueeze(0)


def model_manifest(neural: NeuralMetrics) -> dict[str, Any]:
    packages = {}
    for name in ("dreamsim", "lpips", "torch", "torchvision"):
        packages[name] = importlib.metadata.version(name)
    return {
        "schemaVersion": 1,
        "device": "cpu",
        "floatMode": "float32",
        "packages": packages,
        "stateDictSha256": neural.hashes,
    }


def polygon_mask(size: tuple[int, int], points: list[list[float]]) -> np.ndarray:
    image = Image.new("L", size, 0)
    ImageDraw.Draw(image).polygon([tuple(point) for point in points], fill=255)
    return np.asarray(image) > 0


def reference_view(annotations: dict[str, Any], name: str) -> dict[str, Any]:
    spec = annotations["views"][name]
    source_path = (ANNOTATIONS_PATH.parent / spec.get("source", annotations["source"])).resolve()
    source = Image.open(source_path).convert("RGB")
    x, y, width, height = spec["crop"]
    beauty = source.crop((x, y, x + width, y + height))
    silhouette = polygon_mask((width, height), spec["silhouette"])
    for part_name in annotations.get("ignoredParts", []):
        points = spec["parts"].get(part_name)
        if points:
            silhouette[polygon_mask((width, height), points)] = False
    parts = np.zeros((height, width), dtype=np.uint8)
    parts[silhouette] = PARTS["body_armour"]
    for part_name in ("head_hair", "tabard", "shield", "sword"):
        if part_name in annotations.get("ignoredParts", []):
            continue
        points = spec["parts"].get(part_name)
        if points:
            parts[polygon_mask((width, height), points)] = PARTS[part_name]
    landmarks = {
        landmark: point for landmark, point in spec["landmarks"].items()
        if not (landmark == "tabard_bottom" and "tabard" in annotations.get("ignoredParts", []))
    }
    return {"beauty": beauty, "parts": parts, "landmarks": landmarks}


def decode_part_mask(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3].astype(np.float32)
    result = np.zeros(rgb.shape[:2], dtype=np.uint8)
    distances = []
    ids = []
    for part_id, colour in PART_RGB.items():
        distances.append(np.sum((rgb - colour) ** 2, axis=2))
        ids.append(part_id)
    stacked = np.stack(distances, axis=2)
    nearest = np.argmin(stacked, axis=2)
    opaque = rgba[:, :, 3] > 32
    for index, part_id in enumerate(ids):
        # Workbench still passes object colours through display transforms. Alpha
        # is the authority for foreground; nearest palette colour is the stable
        # semantic ID even when the displayed RGB value is not an exact byte.
        result[(nearest == index) & opaque] = part_id
    return result


def candidate_view(directory: Path, name: str, landmarks: dict[str, Any], ignored_parts: list[str]) -> dict[str, Any]:
    beauty_path = directory / f"{name}.png"
    parts_path = directory / f"{name}.parts.png"
    if not beauty_path.exists() or not parts_path.exists():
        raise FileNotFoundError(f"candidate view {name} needs {beauty_path.name} and {parts_path.name}")
    parts = decode_part_mask(Image.open(parts_path))
    for part_name in ignored_parts:
        parts[parts == PARTS[part_name]] = 0
    view_landmarks = dict(landmarks["views"][name])
    if "tabard" in ignored_parts:
        view_landmarks.pop("tabard_bottom", None)
    return {
        "beauty": Image.open(beauty_path).convert("RGB"),
        "parts": parts,
        "landmarks": view_landmarks,
    }


def canonicalize(view: dict[str, Any]) -> dict[str, Any]:
    image = view["beauty"]
    parts = np.asarray(view["parts"], dtype=np.uint8)
    foreground = parts > 0
    ys, xs = np.nonzero(foreground)
    if len(xs) == 0:
        raise ValueError("view has an empty foreground mask")
    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    source_width = right - left
    source_height = bottom - top
    width, height = CANVAS
    scale = min(width * 0.90 / source_width, height * 0.90 / source_height)
    target_width = max(1, round(source_width * scale))
    target_height = max(1, round(source_height * scale))
    target_left = (width - target_width) // 2
    target_top = round(height * 0.95) - target_height
    beauty_crop = image.crop((left, top, right, bottom)).resize(
        (target_width, target_height), Image.Resampling.LANCZOS,
    )
    parts_crop = Image.fromarray(parts[top:bottom, left:right]).resize(
        (target_width, target_height), Image.Resampling.NEAREST,
    )
    output_image = Image.new("RGB", CANVAS, tuple(int(value) for value in BACKGROUND))
    output_image.paste(beauty_crop, (target_left, target_top), Image.fromarray(
        (np.asarray(parts_crop) > 0).astype(np.uint8) * 255,
    ))
    output_parts = np.zeros((height, width), dtype=np.uint8)
    output_parts[target_top:target_top + target_height, target_left:target_left + target_width] = np.asarray(parts_crop)
    output_landmarks = {}
    for name, point in view["landmarks"].items():
        output_landmarks[name] = [
            target_left + (float(point[0]) - left) * scale,
            target_top + (float(point[1]) - top) * scale,
        ]
    return {"beauty": output_image, "parts": output_parts, "landmarks": output_landmarks}


def intersection_over_union(left: np.ndarray, right: np.ndarray) -> float:
    union = np.count_nonzero(left | right)
    if union == 0:
        return 1.0
    return float(np.count_nonzero(left & right) / union)


def silhouette_distance(reference: np.ndarray, candidate: np.ndarray) -> float:
    overlap = 1.0 - intersection_over_union(reference, candidate)
    reference_edge = reference ^ binary_erosion(reference)
    candidate_edge = candidate ^ binary_erosion(candidate)
    diagonal = float(np.hypot(*reference.shape))
    if not np.any(reference_edge) or not np.any(candidate_edge):
        boundary = 1.0
    else:
        to_candidate = distance_transform_edt(~candidate_edge)[reference_edge].mean()
        to_reference = distance_transform_edt(~reference_edge)[candidate_edge].mean()
        boundary = float((to_candidate + to_reference) / (2.0 * diagonal * 0.05))
    return 0.65 * overlap + 0.35 * boundary


def part_distance(reference: np.ndarray, candidate: np.ndarray) -> tuple[float, dict[str, float]]:
    values = {}
    total = 0.0
    for name, weight in PART_WEIGHTS.items():
        value = 1.0 - intersection_over_union(reference == PARTS[name], candidate == PARTS[name])
        values[name] = value
        total += weight * value
    return total, values


def landmark_distance(reference: dict[str, list[float]], candidate: dict[str, list[float]]) -> tuple[float, dict[str, float]]:
    diagonal = float(np.hypot(CANVAS[0], CANVAS[1]))
    values = {}
    for name, point in reference.items():
        if name not in candidate:
            values[name] = 1.0
            continue
        values[name] = float(np.linalg.norm(np.asarray(point) - np.asarray(candidate[name])) / (diagonal * 0.15))
    return float(np.mean(list(values.values()))), values


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float64) / 255.0
    values = np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)
    xyz = values @ np.array([
        [0.4124564, 0.2126729, 0.0193339],
        [0.3575761, 0.7151522, 0.1191920],
        [0.1804375, 0.0721750, 0.9503041],
    ])
    xyz /= np.array((0.95047, 1.0, 1.08883))
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack((116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])), axis=1)


def palette_texture_distance(reference: Image.Image, candidate: Image.Image, reference_mask: np.ndarray, candidate_mask: np.ndarray) -> float:
    reference_values = np.asarray(reference)[reference_mask]
    candidate_values = np.asarray(candidate)[candidate_mask]
    if len(reference_values) == 0 or len(candidate_values) == 0:
        return 1.0
    reference_lab = rgb_to_lab(reference_values)
    candidate_lab = rgb_to_lab(candidate_values)
    mean_delta = np.linalg.norm(reference_lab.mean(axis=0) - candidate_lab.mean(axis=0)) / 60.0
    spread_delta = np.linalg.norm(reference_lab.std(axis=0) - candidate_lab.std(axis=0)) / 50.0
    reference_gray = np.asarray(reference.convert("L"), dtype=np.float32) / 255.0
    candidate_gray = np.asarray(candidate.convert("L"), dtype=np.float32) / 255.0
    reference_gradient = np.hypot(sobel(reference_gray, axis=0), sobel(reference_gray, axis=1))[reference_mask]
    candidate_gradient = np.hypot(sobel(candidate_gray, axis=0), sobel(candidate_gray, axis=1))[candidate_mask]
    texture_delta = abs(float(reference_gradient.mean() - candidate_gradient.mean())) / 0.25
    return float(0.60 * mean_delta + 0.20 * spread_delta + 0.20 * texture_delta)


def overlay_image(reference: np.ndarray, candidate: np.ndarray) -> Image.Image:
    output = np.zeros((CANVAS[1], CANVAS[0], 3), dtype=np.uint8)
    output[reference, 1] = 220
    output[candidate, 0] = 220
    output[reference & candidate] = (230, 230, 230)
    return Image.fromarray(output)


def aggregate_distances(distances: list[float]) -> float:
    if len(distances) != len(VIEWS):
        raise ValueError(f"expected {len(VIEWS)} view distances, got {len(distances)}")
    return 0.75 * float(np.mean(distances)) + 0.25 * max(distances)


def score_view(reference: dict[str, Any], candidate: dict[str, Any], neural: NeuralMetrics | None) -> tuple[dict[str, Any], Image.Image]:
    reference = canonicalize(reference)
    candidate = canonicalize(candidate)
    reference_mask = reference["parts"] > 0
    candidate_mask = candidate["parts"] > 0
    parts_value, part_values = part_distance(reference["parts"], candidate["parts"])
    landmarks_value, landmark_values = landmark_distance(reference["landmarks"], candidate["landmarks"])
    components = {
        "silhouette": silhouette_distance(reference_mask, candidate_mask),
        "parts": parts_value,
        "landmarks": landmarks_value,
        "dreamsim": None,
        "lpips": None,
        "palette_texture": palette_texture_distance(
            reference["beauty"], candidate["beauty"], reference_mask, candidate_mask,
        ),
    }
    if neural is not None:
        components["dreamsim"], components["lpips"] = neural.distances(
            reference["beauty"], candidate["beauty"],
        )
    available_weight = sum(
        COMPONENT_WEIGHTS[name] for name, value in components.items() if value is not None
    )
    distance = sum(
        COMPONENT_WEIGHTS[name] * float(value)
        for name, value in components.items() if value is not None
    ) / available_weight
    return {
        "distance": distance,
        "components": components,
        "parts": part_values,
        "landmarks": landmark_values,
    }, overlay_image(reference_mask, candidate_mask)


def score(candidate_directory: Path, output_directory: Path, classical: bool = False) -> dict[str, Any]:
    annotations = json.loads(ANNOTATIONS_PATH.read_text(encoding="utf-8"))
    candidate_landmarks_path = candidate_directory / "landmarks.json"
    candidate_landmarks = json.loads(candidate_landmarks_path.read_text(encoding="utf-8"))
    neural = None if classical else NeuralMetrics()
    output_directory.mkdir(parents=True, exist_ok=True)
    view_results = {}
    for name in VIEWS:
        result, overlay = score_view(
            reference_view(annotations, name),
            candidate_view(candidate_directory, name, candidate_landmarks, annotations.get("ignoredParts", [])),
            neural,
        )
        view_results[name] = result
        overlay.save(output_directory / f"{name}-mask-overlay.png")
    distances = [view_results[name]["distance"] for name in VIEWS]
    aggregate = aggregate_distances(distances)
    reference_paths = {
        Path(spec.get("source", annotations["source"])).name:
            (ANNOTATIONS_PATH.parent / spec.get("source", annotations["source"])).resolve()
        for spec in annotations["views"].values()
    }
    report = {
        "schemaVersion": 1,
        "formulaVersion": FORMULA_VERSION,
        "referenceProfile": annotations.get("profile", "default"),
        "canonical": not classical,
        "distance": aggregate,
        "aggregation": {"meanWeight": 0.75, "worstViewWeight": 0.25},
        "componentWeights": COMPONENT_WEIGHTS,
        "views": view_results,
        "inputs": {
            "referenceSha256": {
                name: sha256_file(path) for name, path in sorted(reference_paths.items())
            },
            "optionalReferenceSha256": sha256_file(
                (ANNOTATIONS_PATH.parent / annotations["optionalSource"]).resolve()
            ) if annotations.get("optionalSource") else None,
            "annotationsSha256": sha256_file(ANNOTATIONS_PATH),
            "candidate": {
                name: {
                    "beautySha256": sha256_file(candidate_directory / f"{name}.png"),
                    "partsSha256": sha256_file(candidate_directory / f"{name}.parts.png"),
                }
                for name in VIEWS
            },
            "candidateLandmarksSha256": sha256_file(candidate_landmarks_path),
        },
        "models": None if neural is None else model_manifest(neural),
    }
    (output_directory / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8",
    )
    write_html_report(report, output_directory)
    return report


def write_html_report(report: dict[str, Any], output_directory: Path) -> None:
    rows = []
    cards = []
    for name in VIEWS:
        view = report["views"][name]
        components = " ".join(
            f"<span>{html.escape(key)} {value:.3f}</span>"
            for key, value in view["components"].items() if value is not None
        )
        rows.append(f"<tr><th>{name}</th><td>{view['distance']:.4f}</td><td>{components}</td></tr>")
        cards.append(
            f"<figure><img src=\"{name}-mask-overlay.png\" alt=\"{name} silhouette overlay\">"
            f"<figcaption>{name}: green reference, red candidate, white overlap</figcaption></figure>"
        )
    canonical = "canonical" if report["canonical"] else "classical smoke score"
    document = f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Warrior visual distance</title>
<style>
body {{ margin: 2rem; color: #eee; background: #15110f; font: 16px system-ui; }}
h1 {{ font-size: 1.5rem; }} .distance {{ font-size: 3rem; margin: .5rem 0; }}
table {{ border-collapse: collapse; width: 100%; }} th,td {{ padding: .6rem; border-bottom: 1px solid #493a32; text-align:left; }}
td span {{ display:inline-block; margin-right:1rem; }} .cards {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; }}
figure {{ margin:0; }} img {{ width:100%; background:#000; }} figcaption {{ color:#bbb; font-size:.8rem; }}
</style><body><h1>Warrior visual distance</h1><div class="distance">{report['distance']:.4f}</div>
<p>Lower is closer; zero is identical. This is a {canonical} formula-v{report['formulaVersion']} result.</p>
<table><thead><tr><th>View</th><th>Distance</th><th>Components</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<div class="cards">{''.join(cards)}</div></body></html>"""
    (output_directory / "report.html").write_text(document, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, default=DEFAULT_CANDIDATE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--classical", action="store_true", help="skip DreamSim and LPIPS; not a canonical score")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = score(args.candidate.resolve(), args.output.resolve(), args.classical)
    qualifier = "classical smoke distance" if args.classical else "visual distance"
    print(f"{qualifier}: {report['distance']:.4f}")
    print(f"report: {args.output.resolve() / 'report.html'}")


if __name__ == "__main__":
    main()
