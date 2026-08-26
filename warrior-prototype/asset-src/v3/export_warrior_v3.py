"""Deterministic export for the authored warrior-v3 torso-to-waist subsystem.

The v1 generator stays the control for the head, arms, legs, gorget, cloth and
equipment. This entry point removes the primitive torso and waist nodes it owns,
builds one authored replacement in their place, publishes the semantic contract,
and renders the same eight fixed review angles the metric uses, so a v3 render
is directly comparable with the accepted control.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bmesh
import bpy


HERE = Path(__file__).resolve().parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


v1 = _load("warrior_v1_builder", HERE.parent / "build_warrior.py")
torso = _load("warrior_v3_torso", HERE / "warrior_v3_torso.py")

MATERIAL_NAMES = {
    "steel": "worn_dark_steel",
    "bright": "polished_steel_edges",
    "black": "blackened_iron",
    "brass": "aged_brass",
    "leather": "worn_leather",
}

# Equipment attachment points, published so a later rig does not have to
# rediscover authored information from geometry.
SOCKETS = {
    "sword_grip": (-0.48, -0.31, 0.89),
    "shield_grip": (0.50, -0.19, 0.80),
    "neck": (0.0, -0.035, 1.50),
}


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--variant", choices=torso.VARIANTS, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def take_ownership(names):
    """Delete the control nodes the authored subsystem replaces."""
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise SystemExit(f"control node {name} was not found; the v1 source moved")
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def publish_sockets(root):
    for name, location in SOCKETS.items():
        socket = bpy.data.objects.new("socket_" + name, None)
        bpy.context.scene.collection.objects.link(socket)
        socket.empty_display_size = 0.05
        socket.location = location
        socket.parent = root
        socket["warrior_socket"] = name


AXIS_PAIRS = ((1, 2), (0, 2), (0, 1))


def box_project(mesh):
    """A deterministic fallback UV for control parts the subsystem does not own.

    Each face is projected down its own dominant axis. A single flat projection
    collapses every face that points along it, and a zero-area UV face yields a
    zero-length tangent, which is a hard glTF validation error once tangents are
    actually exported.
    """
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        normal = polygon.normal
        axis = max(range(3), key=lambda index: abs(normal[index]))
        first, second = AXIS_PAIRS[axis]
        for loop_index in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (point[first] * .5 + .5, point[second] * .5 + .5)


def publish_contract(root, variant):
    """Give every mesh a stable region, material class and UV island."""
    for child in root.children_recursive:
        if child.type != "MESH":
            continue
        if "warrior_region" not in child:
            child["warrior_region"] = v1.region_group(child.name)
        if "warrior_material_class" not in child:
            child["warrior_material_class"] = v1.material_group(child)
    root["warrior_contract"] = "authored-v3-schema-1"
    root["warrior_variant"] = variant
    root["authored_subsystem"] = "torso_waist"
    root["source_license"] = "Original project-authored geometry; repository license"
    root["coordinate_system"] = "Blender Z-up meters; glTF Y-up export"


def classifiers():
    """Prefer the published extras, and fall back to the control rules."""
    v1_region = v1.region_group
    v1_material = v1.material_group

    def region_group(value):
        obj = value if hasattr(value, "name") else bpy.data.objects.get(value)
        if obj is not None and "warrior_region" in obj:
            return obj["warrior_region"]
        return v1_region(value)

    def material_group(obj):
        if "warrior_material_class" in obj:
            return obj["warrior_material_class"]
        return v1_material(obj)

    v1.region_group = region_group
    v1.material_group = material_group


def publish_uvs(root):
    """Give every control part a UV island, on the geometry that actually ships.

    The forged-edge bevels are applied first on purpose. Projecting before the
    bevel leaves the bevel faces with interpolated coordinates that can collapse
    to zero area, and a zero-area UV face exports a zero-length tangent, which
    is a hard glTF validation error.
    """
    for child in root.children_recursive:
        if child.type != "MESH" or not child.modifiers:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        child.select_set(True)
        bpy.context.view_layer.objects.active = child
        for modifier in list(child.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        # A bevel clamped against a short edge can collapse a face to zero area,
        # which projects to a zero-area UV and then to a zero-length tangent.
        edit = bmesh.new()
        edit.from_mesh(child.data)
        bmesh.ops.dissolve_degenerate(edit, dist=1e-5, edges=list(edit.edges))
        edit.to_mesh(child.data)
        edit.free()
        child.data.update()
    for child in root.children_recursive:
        if child.type != "MESH" or "authored_subsystem" in child:
            continue
        while child.data.uv_layers:
            child.data.uv_layers.remove(child.data.uv_layers[0])
        box_project(child.data)


def triangulate(root):
    """Export-time only. The saved .blend keeps its quads so it stays editable.

    This runs as a modifier rather than an edit so it lands after the forged-edge
    bevel. Bevelling leaves n-gons at the corners, and tangents cannot be
    computed for those, so triangulating the base mesh first would silently drop
    tangents from every bevelled plate.
    """
    for child in root.children_recursive:
        if child.type != "MESH":
            continue
        modifier = child.modifiers.new(child.name + "_export_triangles", "TRIANGULATE")
        modifier.quad_method = "SHORTEST_DIAGONAL"
        if hasattr(modifier, "keep_custom_normals"):
            modifier.keep_custom_normals = True


def export(root, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    result = bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", check_existing=False,
        export_yup=True, export_apply=True, use_selection=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=False, export_morph=False,
        export_extras=True,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


def topology_report(root):
    """Manifold, normal and UV facts the readiness funnel needs before scoring."""
    report = {"parts": [], "nonManifoldEdges": 0, "looseVertices": 0,
              "flippedFaces": 0, "meshesWithoutUv": 0}
    for child in sorted(root.children_recursive, key=lambda value: value.name):
        if child.type != "MESH":
            continue
        edit = bmesh.new()
        edit.from_mesh(child.data)
        boundary = sum(1 for edge in edit.edges if len(edge.link_faces) != 2)
        loose = sum(1 for vertex in edit.verts if not vertex.link_edges)
        authored = child.get("authored_subsystem") is not None
        if authored:
            report["nonManifoldEdges"] += boundary
            report["looseVertices"] += loose
        # Control parts are projected at export time; an authored plate is
        # expected to carry the island its own topology defines.
        if authored and not child.data.uv_layers:
            report["meshesWithoutUv"] += 1
        report["parts"].append({
            "name": child.name, "authored": authored,
            "region": child.get("warrior_region"),
            "materialClass": child.get("warrior_material_class"),
            "vertices": len(edit.verts), "faces": len(edit.faces),
            "openEdges": boundary,
        })
        edit.free()
    return report


def main():
    args = arguments()
    root = v1.make_warrior()
    take_ownership(torso.REMOVED)
    materials = {key: bpy.data.materials[name] for key, name in MATERIAL_NAMES.items()}
    torso.build(args.variant, materials, root)
    publish_sockets(root)
    publish_contract(root, args.variant)

    # The accepted 0085 proportion model is part of the control, not of this
    # subsystem, so it is reapplied exactly as the v1 entry point applies it.
    root.scale.x = .91
    root.scale.z = 1.10
    root.location.z = .05 * (1.0 - 1.10)

    if args.source is not None:
        args.source.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.source), check_existing=False)

    args.review.mkdir(parents=True, exist_ok=True)
    (args.review / "topology.json").write_text(
        json.dumps(topology_report(root), indent=2) + "\n", encoding="utf-8")

    classifiers()
    v1.render_reviews(args.review, root)
    publish_uvs(root)
    triangulate(root)
    export(root, args.output)
    print(f"wrote {args.output} and review renders to {args.review}")


if __name__ == "__main__":
    main()
