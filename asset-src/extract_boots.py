"""Extract the clean LOD1 pair from Poly Haven's pinned CC0 boot source."""

import argparse
from pathlib import Path
import sys

import bpy


OBJECTS = {
    "rubber_boots_l_LOD1": "boot-l.obj",
    "rubber_boots_r_LOD1": "boot-r.obj",
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def write_obj(source, target, depsgraph):
    evaluated = source.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=False, depsgraph=depsgraph)
    try:
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        centre_x = (min(point.x for point in points) + max(point.x for point in points)) / 2
        mesh.calc_loop_triangles()
        rows = [
            "# Clean LOD1 extract from Poly Haven's CC0 Rubber Boots",
            f"o {source.name}",
        ]
        rows.extend(
            f"v {point.x - centre_x:.7f} {point.y:.7f} {point.z:.7f}"
            for point in points
        )
        rows.extend(
            "f " + " ".join(str(index + 1) for index in triangle.vertices)
            for triangle in mesh.loop_triangles
        )
        target.write_bytes(("\n".join(rows) + "\n").encode("ascii"))
    finally:
        evaluated.to_mesh_clear()


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for source_name, filename in OBJECTS.items():
        source = bpy.data.objects.get(source_name)
        if source is None or source.type != "MESH":
            raise RuntimeError(f'boot source has no mesh object named "{source_name}"')
        target = args.output / filename
        write_obj(source, target, depsgraph)
        print(f"wrote {target}")
    (args.output / "SOURCE.txt").write_bytes(
        (
            "Poly Haven Rubber Boots\n"
            "Source: https://polyhaven.com/a/rubber_boots\n"
            "Download: https://dl.polyhaven.org/file/ph-assets/Models/blend/1k/rubber_boots/rubber_boots_1k.blend\n"
            "Poly Haven publishes this asset under CC0.\n"
            "Selected objects: clean left and right LOD1 meshes; materials and textures discarded.\n"
        ).encode("ascii")
    )


main()
