"""Render nonprimitive curved pauldron variants without touching accepted source."""

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

VARIANTS = ("gothic", "cupped", "lames")
SHOULDERS = {"left": (-.38, .01, 1.38), "right": (.38, .01, 1.38)}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=VARIANTS, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def curved_plate(name, shoulder, side_sign, dimensions, material, root):
    (radius_x, radius_y, radius_z, bottom_degrees, top_degrees,
     span_degrees, thickness, ridge, raised_corners) = dimensions
    latitudes = 9
    longitudes = 19
    vertices = []
    for layer in (0, 1):
        inset = thickness * layer
        for lat_index in range(latitudes):
            for lon_index in range(longitudes):
                longitude_degrees = (-span_degrees + 2 * span_degrees
                                     * lon_index / (longitudes - 1))
                corner = abs(longitude_degrees) / span_degrees
                local_bottom = bottom_degrees + raised_corners * corner * corner
                latitude = math.radians(local_bottom +
                                        (top_degrees - local_bottom)
                                        * lat_index / (latitudes - 1))
                longitude = math.radians(longitude_degrees)
                cos_lat = math.cos(latitude)
                crest = ridge * max(0.0, 1.0 - corner) ** 2 * cos_lat
                vertices.append((
                    shoulder[0] + side_sign * ((radius_x - inset) * cos_lat
                                               * math.cos(longitude) + crest),
                    shoulder[1] + (radius_y - inset) * cos_lat * math.sin(longitude),
                    shoulder[2] + (radius_z - inset) * math.sin(latitude),
                ))
    layer_size = latitudes * longitudes
    faces = []
    for layer in (0, 1):
        offset = layer * layer_size
        for lat_index in range(latitudes - 1):
            for lon_index in range(longitudes - 1):
                a = offset + lat_index * longitudes + lon_index
                quad = (a, a + longitudes, a + longitudes + 1, a + 1)
                faces.append(quad if layer == 0 else tuple(reversed(quad)))
    boundaries = []
    boundaries.append([index for index in range(longitudes)])
    boundaries.append([(latitudes - 1) * longitudes + index for index in range(longitudes)])
    boundaries.append([index * longitudes for index in range(latitudes)])
    boundaries.append([index * longitudes + longitudes - 1 for index in range(latitudes)])
    for boundary in boundaries:
        for index in range(len(boundary) - 1):
            a, following = boundary[index], boundary[index + 1]
            faces.append((a, following, following + layer_size, a + layer_size))
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
    result = control.finish(obj, name, material, root, 0.003, False)
    outer_faces = (latitudes - 1) * (longitudes - 1)
    for polygon in result.data.polygons[:outer_faces]:
        polygon.use_smooth = True
    return result


def build_variant(variant, side, shoulder, material, root):
    side_sign = -1 if side == "left" else 1
    if variant == "gothic":
        curved_plate(side + "_pauldron", shoulder, side_sign,
                     (.172, .150, .138, -52, 86, 112, .011, .024, 20),
                     material, root)
    elif variant == "cupped":
        curved_plate(side + "_pauldron", shoulder, side_sign,
                     (.180, .132, .122, -64, 76, 94, .012, .008, 8),
                     material, root)
    else:
        curved_plate(side + "_pauldron", shoulder, side_sign,
                     (.158, .140, .132, 2, 87, 106, .011, .014, 8),
                     material, root)
        lower = (shoulder[0], shoulder[1], shoulder[2] - .010)
        curved_plate(side + "_pauldron_lower", lower, side_sign,
                     (.178, .154, .148, -62, 23, 114, .010, .004, 18),
                     material, root)


def main():
    args = arguments()
    root = control.make_warrior()
    material = bpy.data.materials["worn_dark_steel"]
    for side, shoulder in SHOULDERS.items():
        old = bpy.data.objects.get(side + "_pauldron")
        bpy.data.objects.remove(old, do_unlink=True)
        build_variant(args.variant, side, shoulder, material, root)
        for rivet in (-1, 1):
            obj = bpy.data.objects[f"{side}_pauldron_rivet_{rivet}"]
            obj.location.y = -.105
    args.review.mkdir(parents=True, exist_ok=True)
    control.render_reviews(args.review, root)
    print(f"rendered {args.variant} to {args.review}")


if __name__ == "__main__":
    main()
