"""Spike: drop the CC0 Blender human base mesh into the warrior review setup.

This is an evaluation spike, not a build step. It answers one question -- what
foundation would authored armour actually sit on -- by putting the base mesh
under the identical eight-angle cameras, lighting and scale the metric uses, and
exporting it so it can be turned in the viewer alongside the current asset.

The bundle is CC0 and is vendored under the gitignored `.tools/`, so nothing here
is committed and the whole spike is reversible.
"""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
BUNDLE = (HERE.parents[2] / ".tools" / "human-base-meshes"
          / "human-base-meshes-bundle-v1.4.1" / "human_base_meshes_bundle.blend")

# The accepted warrior stands with its feet at .03 and its crown at 2.035 once
# the 0085 root scale is applied. Matching that envelope keeps the spike render
# framed exactly like every other review render.
GROUND = 0.03
CROWN = 2.035


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


v1 = _load("warrior_v1_builder", HERE.parent / "build_warrior.py")


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--object", default="GEO-body_male_realistic")
    # Multires level 0 is the 10,590-quad game cage. Level 1 keeps enough
    # surface detail to judge the form in a browser without shipping a
    # million-triangle file.
    parser.add_argument("--subdivision", type=int, default=1)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def main():
    args = arguments()
    if not BUNDLE.exists():
        raise SystemExit(f"human base mesh bundle is not vendored at {BUNDLE}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(BUNDLE), link=False) as (source, target):
        if args.object not in source.objects:
            raise SystemExit(f"{args.object} is not in the bundle")
        target.objects = [args.object]
    body = next(obj for obj in bpy.data.objects if obj.name.startswith(args.object))
    bpy.context.scene.collection.objects.link(body)
    body.matrix_world.identity()
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            modifier.levels = args.subdivision
            modifier.render_levels = args.subdivision
            modifier.sculpt_levels = args.subdivision

    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    heights = [vertex.co.z for vertex in mesh.vertices]
    low, high = min(heights), max(heights)
    scale = (CROWN - GROUND) / (high - low)
    body.scale = (scale, scale, scale)
    body.location.z = GROUND - low * scale
    bpy.context.view_layer.update()
    print(f"SPIKE cage {len(body.data.polygons)} quads, "
          f"subdivision {args.subdivision} -> {len(mesh.polygons)} faces, "
          f"scaled {scale:.4f} to {CROWN - GROUND:.3f} m")
    evaluated.to_mesh_clear()

    body.data.materials.clear()
    body.data.materials.append(v1.material("warm_skin", (0.42, 0.22, 0.13), 0.0, 0.74))

    root = bpy.data.objects.new("Warrior", None)
    bpy.context.scene.collection.objects.link(root)
    world = body.matrix_world.copy()
    body.parent = root
    body.matrix_world = world

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.object.select_all(action="DESELECT")
        root.select_set(True)
        body.select_set(True)
        bpy.context.view_layer.objects.active = root
        result = bpy.ops.export_scene.gltf(
            filepath=str(args.output), export_format="GLB", check_existing=False,
            export_yup=True, export_apply=True, use_selection=True,
            export_texcoords=True, export_normals=True, export_tangents=False,
            export_materials="EXPORT", export_cameras=False, export_lights=False,
            export_animations=False, export_skins=False, export_morph=False,
        )
        if result != {"FINISHED"}:
            raise RuntimeError(f"glTF export failed: {result}")

    v1.render_reviews(args.review, root)
    print(f"SPIKE wrote {args.output} and review renders to {args.review}")


if __name__ == "__main__":
    main()
