"""Generate tiny deterministic PBR seed textures for the authored-v2 pipeline."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import sobel


ROOT = Path(__file__).resolve().parent
TEXTURES = ROOT / "textures"
SIZE = 256


def write(name: str, values: np.ndarray) -> dict[str, object]:
    path = TEXTURES / name
    Image.fromarray(values.astype(np.uint8), "RGB").save(path, optimize=False)
    return {
        "file": f"textures/{name}", "width": SIZE, "height": SIZE,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main() -> None:
    TEXTURES.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[:SIZE, :SIZE]
    scratch = ((x * 17 + y * 31 + (x ^ y) * 7) % 29) / 28
    material_properties = {
        "worn_dark_steel": ((.075, .080, .080), .76, .37),
        "polished_steel_edges": ((.22, .23, .22), .88, .24),
        "blackened_iron": ((.055, .050, .045), .72, .48),
        "aged_brass": ((.34, .21, .075), .68, .33),
        "worn_leather": ((.105, .045, .018), .02, .68),
        "burgundy_cloth": ((.25, .035, .025), .0, .82),
        "warm_skin": ((.42, .22, .13), .0, .62),
        "hair_and_beard": ((.045, .025, .016), .0, .78),
    }
    def srgb(linear):
        values = np.asarray(linear)
        values = np.where(values <= .0031308, values * 12.92,
                          1.055 * np.power(values, 1 / 2.4) - .055)
        return values * 255
    normal = np.zeros((SIZE, SIZE, 3), dtype=np.uint8) + np.array((128, 128, 255), dtype=np.uint8)
    normal[:, :, 0] = 126 + np.rint((scratch - .5) * 5).astype(np.int8)
    files = []
    variation = (scratch - .5)[:, :, None] * 6
    for name, (colour, metallic, roughness) in material_properties.items():
        base = np.clip(srgb(colour)[None, None, :] + variation, 0, 255)
        files.append(write(f"{name}-base.png", base))
        orm = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
        orm[:, :, 0] = 255
        orm[:, :, 1] = np.clip(
            np.rint((roughness + (scratch - .5) * .08) * 255), 0, 255)
        orm[:, :, 2] = np.rint(metallic * 255).astype(np.uint8)
        files.append(write(f"{name}-orm.png", orm))
    files.append(write("dark-plate-normal.png", normal))
    authored_source = ROOT / "texture-sources" / "dark-steel-imagegen.png"
    if authored_source.exists():
        authored = Image.open(authored_source).convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        authored_values = np.asarray(authored, dtype=np.uint8)
        files.append(write("authored-dark-steel-base.png", authored_values))
        gray = np.asarray(authored.convert("L"), dtype=np.float32) / 255
        dx, dy = sobel(gray, axis=1), sobel(gray, axis=0)
        strength = .035
        normals = np.dstack((-dx * strength, -dy * strength, np.ones_like(gray)))
        normals /= np.linalg.norm(normals, axis=2, keepdims=True)
        normals = (normals * .5 + .5) * 255
        files.append(write("authored-dark-steel-normal.png", normals))
        authored_orm = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
        authored_orm[:, :, 0] = 255
        authored_orm[:, :, 1] = np.clip(205 - gray * 70, 120, 220)
        authored_orm[:, :, 2] = 190
        files.append(write("authored-dark-steel-orm.png", authored_orm))
    manifest = {
        "schemaVersion": 1, "texelDensity": "256px tile on generated UVs; authored regions may replace it with measured UV density",
        "normalConvention": "OpenGL +Y", "files": files,
        "authoredSource": "texture-sources/dark-steel-imagegen.png",
        "authoredPrompt": "tileable dark battered steel, neutral albedo capture, restrained scratches and oxidation, no plate outline or lighting gradient",
        "payloadLimitBytes": 4_000_000,
    }
    (ROOT / "texture-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
