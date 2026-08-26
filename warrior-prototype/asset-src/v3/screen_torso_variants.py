"""Screen continuous authored torso shells inside the accepted 0085 envelope."""

from __future__ import annotations

import argparse
import importlib.util
import math
from pathlib import Path
import sys

import bpy
import bmesh


HERE = Path(__file__).resolve().parent
BASE_PATH = HERE.parent / "build_warrior.py"
spec = importlib.util.spec_from_file_location("warrior_control", BASE_PATH)
control = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(control)

VARIANTS = ("forged", "lobstered", "longline")
REMOVED = {
    "padded_torso", "cuirass_mass", "breastplate", "breastplate_shadow",
    "cuirass_ridge_0", "cuirass_ridge_1", "cuirass_ridge_2", "cuirass_ridge_3",
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def torso_shell(name, rings, material, root, segments=28, front_keel=.0,
                shoulder_cut=.0, smooth=True):
    """Build one closed shell from authored elliptical cross-sections."""
    vertices = []
    for ring_index, (z, radius_x, radius_y, center_y) in enumerate(rings):
        ring_fraction = ring_index / (len(rings) - 1)
        for sample in range(segments):
            angle = 2 * math.pi * sample / segments
            x = radius_x * math.cos(angle)
            y = center_y + radius_y * math.sin(angle)
            front = max(0.0, -math.sin(angle)) ** 3
            side = abs(math.cos(angle))
            y -= front_keel * front * math.sin(math.pi * ring_fraction)
            z_adjusted = z - shoulder_cut * side ** 6 * ring_fraction ** 5
            vertices.append((x, y, z_adjusted))
    faces = [tuple(reversed(range(segments))),
             tuple(range((len(rings) - 1) * segments, len(rings) * segments))]
    for ring in range(len(rings) - 1):
        for sample in range(segments):
            following = (sample + 1) % segments
            faces.append((ring * segments + sample,
                          ring * segments + following,
                          (ring + 1) * segments + following,
                          (ring + 1) * segments + sample))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(mesh)
    edit.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    result = control.finish(obj, name, material, root, .008, smooth)
    result["authored_subsystem"] = "torso_shell"
    return result


def build_variant(variant, steel, black, root):
    if variant == "forged":
        torso_shell("cuirass_mass", (
            (.94, .255, .155, .005), (1.03, .285, .175, .000),
            (1.18, .355, .205, -.010), (1.36, .370, .205, -.005),
            (1.49, .285, .165, .005)), steel, root,
            segments=28, front_keel=.032, shoulder_cut=.028)
    elif variant == "lobstered":
        torso_shell("cuirass_mass", (
            (.94, .270, .150, .010), (1.08, .315, .180, .000),
            (1.24, .365, .205, -.010), (1.40, .350, .195, -.005),
            (1.49, .285, .160, .005)), black, root,
            segments=24, front_keel=.018, shoulder_cut=.020)
        for index, (low, high, width) in enumerate((
                (1.02, 1.18, .322), (1.15, 1.33, .357), (1.30, 1.46, .335))):
            torso_shell(f"cuirass_lame_{index}", (
                (low, width * .88, .174, -.012 - index * .003),
                (high, width, .194, -.010 - index * .003)),
                steel, root, segments=24, front_keel=.025, smooth=True)
    else:
        torso_shell("cuirass_mass", (
            (.88, .300, .165, .015), (.98, .275, .165, .005),
            (1.12, .305, .188, -.005), (1.30, .365, .205, -.010),
            (1.45, .345, .185, .000), (1.50, .285, .155, .010)),
            steel, root, segments=28, front_keel=.025, shoulder_cut=.018)


def main():
    args = arguments()
    root = control.make_warrior()
    root.scale.x = .91
    root.scale.z = 1.10
    root.location.z = .05 * (1.0 - 1.10)
    for name in REMOVED:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
    build_variant(args.variant, bpy.data.materials["worn_dark_steel"],
                  bpy.data.materials["blackened_iron"], root)
    args.review.mkdir(parents=True, exist_ok=True)
    control.render_reviews(args.review, root)
    print(f"rendered torso system {args.variant} to {args.review}")


if __name__ == "__main__":
    main()
