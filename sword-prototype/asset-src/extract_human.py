"""Extract the selected anatomy from Blender's pinned CC0 human bundle.

Run through ``npm run armour:extract``.  The 50 MB archive remains ignored;
these level-zero, face-set-selected OBJ files are the small production sources.
The source body faces Blender -Y and calls +X character-left, so extraction
normalizes it once to X-right, Y-back, Z-up before the fitting build sees it.
"""

import argparse
from pathlib import Path
import sys
import tempfile
import zipfile

import bpy


BODY = "GEO-body_male_realistic"
BLEND = "human_base_meshes_bundle.blend"

# The bundle authors these anatomical regions as sculpt face sets.  Fingers and
# fingers have their own labels; keeping those is what makes this a human model
# rather than another mitten approximation. The separately sourced boots own
# the feet, so unused anatomical foot extracts are deliberately not committed.
SEGMENTS = {
    "human-torso.obj": {1},
    "human-pelvis.obj": {18},
    "human-neck.obj": {22},
    # 6 is reserved between the facial sets in this version but has no faces.
    # Naming the whole 2..8 interval makes a later populated set fail the pins
    # as anatomy rather than disappear because an old extractor skipped it.
    "human-head.obj": {*range(2, 9), 17},
    "human-hand-r.obj": {10, *range(84, 104)},
    "human-hand-l.obj": {9, *range(64, 84)},
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def write_segment(mesh, labels, wanted, target):
    mesh.calc_loop_triangles()
    triangles = [triangle for triangle in mesh.loop_triangles
                 if labels[triangle.polygon_index] in wanted]
    used = sorted({index for triangle in triangles for index in triangle.vertices})
    remap = {old: new + 1 for new, old in enumerate(used)}
    rows = [
        "# Level-zero anatomical extract from Blender Human Base Meshes v1.4.1 (CC0)",
        f"o {target.stem}",
    ]
    for index in used:
        point = mesh.vertices[index].co
        rows.append(f"v {-point.x:.7f} {point.y:.7f} {point.z:.7f}")
    rows.append("usemtl blender_human_cc0")
    for triangle in triangles:
        # Normalizing character-left to X-right mirrors the source. Reverse the
        # winding at the same boundary so outward remains outward.
        rows.append("f " + " ".join(str(remap[index]) for index in reversed(triangle.vertices)))
    target.write_bytes(("\n".join(rows) + "\n").encode("ascii"))
    print(f"wrote {target} ({len(triangles)} triangles)")


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.source) as archive, tempfile.TemporaryDirectory() as scratch:
        member = next((name for name in archive.namelist() if name.endswith("/" + BLEND)), None)
        if member is None:
            raise RuntimeError(f'human bundle has no "{BLEND}"')
        archive.extract(member, scratch)
        source_path = Path(scratch) / member

        bpy.ops.wm.read_factory_settings(use_empty=True)
        with bpy.data.libraries.load(str(source_path), link=False) as (source, target):
            if BODY not in source.objects:
                raise RuntimeError(f'human bundle has no mesh object named "{BODY}"')
            target.objects = [BODY]
        body = next(obj for obj in bpy.data.objects if obj.name.startswith(BODY))
        if body.type != "MESH":
            raise RuntimeError(f'"{BODY}" is not a mesh')
        body.matrix_world.identity()
        for modifier in body.modifiers:
            if modifier.type == "MULTIRES":
                modifier.levels = 0
                modifier.render_levels = 0
                modifier.sculpt_levels = 0

        mesh = body.data
        attribute = mesh.attributes.get(".sculpt_face_set")
        if attribute is None:
            raise RuntimeError("human body carries no anatomical sculpt face sets")
        labels = [item.value for item in attribute.data]
        for filename, wanted in SEGMENTS.items():
            write_segment(mesh, labels, wanted, args.output / filename)

        notice = (
            "Blender Human Base Meshes v1.4.1\n"
            "Source: https://www.blender.org/download/demo-files/\n"
            "Archive: https://download.blender.org/demo/asset-bundles/human-base-meshes/"
            "human-base-meshes-bundle-v1.4.1.zip\n"
            "The official Blender source page publishes this asset bundle under CC0.\n"
            "Selected object: GEO-body_male_realistic, Multires level 0.\n"
        )
        (args.output / "SOURCE.txt").write_bytes(notice.encode("ascii"))


main()
