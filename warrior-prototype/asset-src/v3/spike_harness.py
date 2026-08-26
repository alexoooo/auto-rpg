"""Spike: fit armour to the CC0 human base mesh by extracting it from the body.

The question this answers is the one the base mesh spike left open -- given a
real body, is there a mechanism for putting armour on it that does not reduce to
authoring shapes from nothing, which is what eighty-seven experiments showed
does not work.

There is, and it depends on something the bundle already ships. Every body in
the bundle carries a sculpt face-set attribute that segments it into named
anatomical parts: torso, abdomen, pelvis, upper arm, forearm, hand, thigh, shin,
foot, neck, skull. That segmentation is the selection primitive armour needs. A
piece of plate is then not modelled, it is derived:

    select the anatomy it covers -> relax the surface so it reads as forged
    plate rather than shrink-wrapped skin -> push it out over the padding
    beneath -> solidify it into real thickness -> crease and bevel its rim

Armour built this way cannot float off the body, cannot intersect it, and cannot
be out of proportion, because its proportions are the anatomy. What is left to
author is the part that is actually design work: where each piece starts and
stops, how far it stands off the body, and how hard its edges are.

This is an evaluation spike, not a build step. It writes nothing the accepted
asset depends on.
"""

from __future__ import annotations

import argparse
import importlib.util
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
BUNDLE = (HERE.parents[2] / ".tools" / "human-base-meshes"
          / "human-base-meshes-bundle-v1.4.1" / "human_base_meshes_bundle.blend")

# The accepted warrior stands with its feet at .03 and its crown at 2.035 once
# the 0085 root scale is applied. Matching that envelope keeps this render
# framed exactly like every other review render.
GROUND = 0.03
CROWN = 2.035

# The anatomical face sets, read off the bundle rather than guessed. Left and
# right are the character left and right: the body faces -y, so +x is its left.
SKULL = 17
NECK = 22
TORSO = 1
ABDOMEN = 19
PELVIS = 18
UPPER_ARM = {"r": 20, "l": 21}
FOREARM = {"r": 11, "l": 12}
HAND = {"r": 10, "l": 9}
THIGH = {"r": 23, "l": 24}
SHIN = {"r": 16, "l": 15}
FOOT = {"r": 13, "l": 14}


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
    parser.add_argument("--blend", type=Path)
    parser.add_argument("--body", default="GEO-body_male_realistic")
    # Level 0 is the 10,590-quad game cage. The armour is derived from it, so
    # the whole harness stays inside the accepted triangle budget.
    parser.add_argument("--subdivision", type=int, default=0)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def source_body(name, subdivision):
    """Append the base mesh and return it evaluated at a multires level."""
    if not BUNDLE.exists():
        raise SystemExit(f"human base mesh bundle is not vendored at {BUNDLE}")
    with bpy.data.libraries.load(str(BUNDLE), link=False) as (source, target):
        if name not in source.objects:
            raise SystemExit(f"{name} is not in the bundle")
        target.objects = [name]
    body = next(obj for obj in bpy.data.objects if obj.name.startswith(name))
    bpy.context.scene.collection.objects.link(body)
    body.matrix_world.identity()
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            modifier.levels = subdivision
            modifier.render_levels = subdivision
            modifier.sculpt_levels = subdivision
    return body


def face_sets(mesh):
    """The per-face anatomical label, as a plain list indexed by face."""
    attribute = mesh.attributes.get(".sculpt_face_set")
    if attribute is None:
        raise SystemExit("this body carries no face sets, so it cannot be segmented")
    return [item.value for item in attribute.data]


class Anatomy:
    """The body surface, queryable by anatomical part."""

    def __init__(self, body):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = body.evaluated_get(depsgraph)
        self.mesh = bpy.data.meshes.new_from_object(evaluated)
        self.labels = face_sets(self.mesh)
        heights = [vertex.co.z for vertex in self.mesh.vertices]
        self.low, self.high = min(heights), max(heights)

    def height(self, fraction):
        """A height given as a fraction of the standing figure, 0 at the sole."""
        return self.low + (self.high - self.low) * fraction

    def axis(self, sets):
        """The direction a limb actually runs in, so plates are cut across it.

        The figure stands in an A-pose, so an arm is nowhere near vertical and a
        horizontal cut across one would not be the seam an armourer makes. The
        axis is read off the anatomy: the vector from the low end of the part to
        the high end.
        """
        points = [self.mesh.vertices[index].co
                  for face in self.mesh.polygons if self.labels[face.index] in sets
                  for index in face.vertices]
        if not points:
            raise ValueError(f"no geometry carries face sets {sorted(sets)}")
        points.sort(key=lambda point: point.z)
        edge = max(1, len(points) // 4)
        low = sum(points[:edge], Vector()) / edge
        high = sum(points[-edge:], Vector()) / edge
        direction = high - low
        return direction.normalized() if direction.length > 1e-6 else Vector((0, 0, 1))


def extract(anatomy, name, sets, low=None, high=None, side=None,
            stand_off=0.012, thickness=0.008, relax=6, keep=None, inboard=None):
    """Derive one plate from the body surface.

    `sets` are the anatomical labels it covers, `low` and `high` clip it to a
    band, `stand_off` is how far it sits proud of the skin, `thickness` is the
    plate itself, and `relax` is how many smoothing passes flatten the anatomy
    out of it. `keep` is an optional predicate on the face centre, which is how
    a piece that is not a simple band -- a pauldron cap, a half-collar -- says
    what it wants.
    """
    mesh = bmesh.new()
    mesh.from_mesh(anatomy.mesh)
    mesh.faces.ensure_lookup_table()

    doomed = []
    for face in mesh.faces:
        centre = face.calc_center_median()
        wanted = anatomy.labels[face.index] in sets
        if wanted and side == "l" and centre.x < 0.0:
            wanted = False
        if wanted and side == "r" and centre.x > 0.0:
            wanted = False
        if wanted and keep is not None and not keep(centre):
            wanted = False
        if not wanted:
            doomed.append(face)
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    if not mesh.faces:
        raise ValueError(f"{name}: the selection is empty")

    # Where a plate ends is a straight seam, not the ragged edge of whichever
    # quads happened to fall inside a height band. Cut it, across the limb.
    direction = anatomy.axis(sets)
    cuts = [(low, direction, "z", True), (high, direction, "z", False)]
    if inboard is not None:
        outward = Vector((1.0, 0.0, 0.0)) if side == "l" else Vector((-1.0, 0.0, 0.0))
        cuts.append((inboard if side == "l" else -inboard, outward, "x", True))
    for position, plane, coordinate, drop_behind in cuts:
        if position is None:
            continue
        centre = sum((vertex.co for vertex in mesh.verts), Vector()) / len(mesh.verts)
        along = getattr(plane, coordinate)
        here = getattr(centre, coordinate)
        step = (position - here) / along if abs(along) > 1e-6 else 0.0
        bmesh.ops.bisect_plane(
            mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
            plane_co=centre + plane * step, plane_no=plane,
            clear_inner=drop_behind, clear_outer=not drop_behind)
        bmesh.ops.delete(mesh, geom=[vertex for vertex in mesh.verts
                                     if not vertex.link_faces], context="VERTS")
        if not mesh.faces:
            raise ValueError(f"{name}: cutting at {position:.3f} removed everything")

    # Relax the patch so it stops reading as skin. Boundary vertices are left
    # alone so the plate still meets the anatomy it was cut from.
    interior = [vertex for vertex in mesh.verts if not vertex.is_boundary]
    for _ in range(relax):
        bmesh.ops.smooth_vert(mesh, verts=interior, factor=0.5,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)

    mesh.normal_update()
    for vertex in mesh.verts:
        vertex.co += vertex.normal * stand_off

    bmesh.ops.solidify(mesh, geom=list(mesh.faces), thickness=-thickness)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))

    data = bpy.data.meshes.new(f"{name}_mesh")
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def crease(obj, sharp_degrees=32.0, bevel=0.0025):
    """Shade the plate smooth but keep its forged edges hard."""
    limit = math.radians(sharp_degrees)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    for edge in obj.data.edges:
        edge.use_edge_sharp = False
    faces = {}
    for polygon in obj.data.polygons:
        for key in polygon.edge_keys:
            faces.setdefault(key, []).append(polygon.normal)
    lookup = {edge.key: edge for edge in obj.data.edges}
    for key, normals in faces.items():
        edge = lookup.get(key)
        if edge is None:
            continue
        if len(normals) != 2:
            edge.use_edge_sharp = True
        elif normals[0].angle(normals[1], 0.0) > limit:
            edge.use_edge_sharp = True
    modifier = obj.modifiers.new(f"{obj.name}_edge", "BEVEL")
    modifier.width = bevel
    modifier.segments = 2
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(30.0)


def build_harness(anatomy):
    """The pieces, as a design: what each one covers and how it sits."""
    waist = anatomy.height(0.585)
    chest_top = anatomy.height(0.815)
    shoulder = anatomy.height(0.795)
    hip = anatomy.height(0.505)

    pieces = []

    pieces.append(("cuirass", extract(
        anatomy, "cuirass", {TORSO, ABDOMEN}, low=waist, high=chest_top,
        stand_off=0.016, thickness=0.010, relax=10)))

    pieces.append(("gorget", extract(
        anatomy, "gorget", {NECK, TORSO}, low=chest_top - 0.02,
        high=anatomy.height(0.875), stand_off=0.012, thickness=0.007, relax=4)))

    pieces.append(("fauld", extract(
        anatomy, "fauld", {PELVIS, ABDOMEN}, low=hip, high=waist + 0.01,
        stand_off=0.018, thickness=0.009, relax=8)))

    for side in ("l", "r"):
        pieces.append((f"pauldron_{side}", extract(
            anatomy, f"pauldron_{side}", {UPPER_ARM[side], TORSO}, side=side,
            low=shoulder - 0.13, high=shoulder + 0.06, inboard=0.085,
            stand_off=0.026, thickness=0.010, relax=8)))

        pieces.append((f"rerebrace_{side}", extract(
            anatomy, f"rerebrace_{side}", {UPPER_ARM[side]}, side=side,
            high=shoulder - 0.15, stand_off=0.014, thickness=0.007, relax=6)))

        pieces.append((f"vambrace_{side}", extract(
            anatomy, f"vambrace_{side}", {FOREARM[side]}, side=side,
            high=anatomy.height(0.605), stand_off=0.014, thickness=0.007, relax=6)))

        pieces.append((f"cuisse_{side}", extract(
            anatomy, f"cuisse_{side}", {THIGH[side]}, side=side,
            low=anatomy.height(0.315), stand_off=0.016, thickness=0.008, relax=8)))

        pieces.append((f"greave_{side}", extract(
            anatomy, f"greave_{side}", {SHIN[side]}, side=side,
            low=anatomy.height(0.055), high=anatomy.height(0.265),
            stand_off=0.014, thickness=0.007, relax=6)))

    return pieces


def main():
    args = arguments()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    body = source_body(args.body, args.subdivision)
    anatomy = Anatomy(body)
    pieces = build_harness(anatomy)

    # The review world is nearly black, so a fully metallic surface has almost no
    # diffuse left to catch and reads as a silhouette. The accepted asset solves
    # this at metallic .76; the harness stays in that family.
    steel = v1.material("harness_steel", (0.205, 0.215, 0.235), 0.80, 0.29)
    dark_steel = v1.material("harness_steel_dark", (0.090, 0.090, 0.100), 0.72, 0.44)
    skin = v1.material("warm_skin", (0.42, 0.22, 0.13), 0.0, 0.74)

    body.data.materials.clear()
    body.data.materials.append(skin)
    for polygon in body.data.polygons:
        polygon.use_smooth = True

    for name, obj in pieces:
        obj.data.materials.append(dark_steel if name.startswith(("fauld", "gorget")) else steel)
        crease(obj)

    # Everything is authored at bundle scale, so the whole figure is scaled once,
    # about the floor, exactly as the accepted asset is.
    root = bpy.data.objects.new("Warrior", None)
    bpy.context.scene.collection.objects.link(root)
    scale = (CROWN - GROUND) / (anatomy.high - anatomy.low)
    root.scale = (scale, scale, scale)
    root.location.z = GROUND - anatomy.low * scale
    for obj in [body] + [piece for _, piece in pieces]:
        obj.parent = root
    bpy.context.view_layer.update()

    triangles = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in [body] + [piece for _, piece in pieces]:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    print(f"HARNESS {len(pieces)} plates over the body, {triangles} triangles, "
          f"scaled {scale:.4f} to {CROWN - GROUND:.3f} m")

    if args.blend is not None:
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend))

    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in [root, body] + [piece for _, piece in pieces]:
            obj.select_set(True)
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
    print(f"HARNESS wrote {args.output} and review renders to {args.review}")


if __name__ == "__main__":
    main()
