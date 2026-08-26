"""Screen real UV image-texture coverage on the accepted warrior."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
BASE_PATH = HERE.parent / "build_warrior.py"
TEXTURE_PATH = HERE.parent / "textures" / "worn-dark-steel-albedo-v1.png"
spec = importlib.util.spec_from_file_location("warrior_control", BASE_PATH)
control = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(control)

VARIANTS = ("torso_only", "upper_body", "rigid_plate")


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def textured_material():
    value = control.material("uv_worn_dark_steel", (1.0, 1.0, 1.0), .72, .56)
    nodes = value.node_tree.nodes
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "exported_worn_steel_albedo"
    texture.image = bpy.data.images.load(str(TEXTURE_PATH), check_existing=True)
    texture.extension = "REPEAT"
    value.node_tree.links.new(texture.outputs["Color"],
                              nodes["Principled BSDF"].inputs["Base Color"])
    return value


def selected(obj, variant):
    name = obj.name
    if variant == "torso_only":
        return name == "cuirass_mass"
    if variant == "upper_body":
        return (name == "cuirass_mass" or name.endswith("_pauldron")
                or name.endswith("_vambrace"))
    # This screen asks whether the existing rigid steel hierarchy benefits from
    # a spatial albedo.  Object-name exclusion proved too permissive: it silently
    # admitted skin and hair, turning a material test into a whole-character
    # recolour.  The accepted material slot is the authoritative boundary.
    return (len(obj.data.materials) == 1
            and obj.data.materials[0] is not None
            and obj.data.materials[0].name == "worn_dark_steel")


def main():
    args = arguments()
    root = control.make_warrior()
    root.scale.x = .91
    root.scale.z = 1.10
    root.location.z = .05 * (1.0 - 1.10)
    material = textured_material()
    assigned = []
    for obj in tuple(bpy.data.objects):
        if (obj.type == "MESH" and obj.parent == root and selected(obj, args.variant)
                and len(obj.data.uv_layers) > 0):
            obj.data.materials.clear()
            obj.data.materials.append(material)
            assigned.append(obj.name)
    if not assigned:
        raise ValueError(f"texture variant {args.variant} selected no UV meshes")
    root["screen_variant"] = args.variant
    root["screen_texture"] = TEXTURE_PATH.name
    root["screen_texture_objects"] = ",".join(sorted(assigned))
    args.review.mkdir(parents=True, exist_ok=True)
    control.render_reviews(args.review, root)
    print(f"rendered texture {args.variant} on {', '.join(sorted(assigned))}")


if __name__ == "__main__":
    main()
