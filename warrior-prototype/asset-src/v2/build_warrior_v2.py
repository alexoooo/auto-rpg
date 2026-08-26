"""Build the parallel authored-v2 control with stable semantic contracts."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import bmesh


HERE = Path(__file__).resolve().parent
PARENT = HERE.parent / "build_warrior.py"
spec = importlib.util.spec_from_file_location("warrior_v1_builder", PARENT)
v1 = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(v1)


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def publish_contract(root):
    for child in root.children_recursive:
        if child.type != "MESH":
            continue
        child["warrior_region"] = v1.region_group(child.name)
        child["warrior_material_class"] = v1.material_group(child)
        mesh = bmesh.new()
        mesh.from_mesh(child.data)
        bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
        mesh.to_mesh(child.data)
        mesh.free()
        if not child.data.uv_layers:
            uv = child.data.uv_layers.new(name="UVMap")
            # Loop-space generated coordinates are deterministic and exportable.
            for loop in child.data.loops:
                vertex = child.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = ((vertex.x + 1.0) * .5, (vertex.z + 1.0) * .5)
    root["warrior_contract"] = "authored-v2-schema-1"
    root["source_license"] = "Original project-authored geometry; repository license"
    root["coordinate_system"] = "Blender Z-up meters; glTF Y-up export"


def attach_seed_texture():
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        if "_eye_socket_material" in material.name:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        shader = nodes.get("Principled BSDF")
        base_path = (HERE / "textures" / "authored-dark-steel-base.png"
                     if material.name == "worn_dark_steel"
                     else HERE / "textures" / f"{material.name}-base.png")
        if base_path.exists():
            image = bpy.data.images.load(str(base_path), check_existing=True)
            node = nodes.new("ShaderNodeTexImage")
            node.name = "exported_material_base"
            node.image = image
            node.interpolation = "Linear"
            links.new(node.outputs["Color"], shader.inputs["Base Color"])
        orm_path = (HERE / "textures" / "authored-dark-steel-orm.png"
                    if material.name == "worn_dark_steel"
                    else HERE / "textures" / f"{material.name}-orm.png")
        if orm_path.exists():
            orm_image = bpy.data.images.load(str(orm_path), check_existing=True)
            orm_image.colorspace_settings.name = "Non-Color"
            orm_node = nodes.new("ShaderNodeTexImage")
            orm_node.name = "exported_material_orm"
            orm_node.image = orm_image
            orm_node.interpolation = "Linear"
            channels = nodes.new("ShaderNodeSeparateColor")
            channels.name = "exported_material_orm_channels"
            links.new(orm_node.outputs["Color"], channels.inputs["Color"])
            links.new(channels.outputs["Green"], shader.inputs["Roughness"])
            links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
        normal_path = (HERE / "textures" / "authored-dark-steel-normal.png"
                       if material.name == "worn_dark_steel"
                       else HERE / "textures" / "dark-plate-normal.png")
        normal_image = bpy.data.images.load(str(normal_path), check_existing=True)
        normal_image.colorspace_settings.name = "Non-Color"
        normal_node = nodes.new("ShaderNodeTexImage")
        normal_node.name = "exported_seed_normal"
        normal_node.image = normal_image
        normal_node.interpolation = "Linear"
        mapping = nodes.new("ShaderNodeNormalMap")
        mapping.inputs["Strength"].default_value = .12
        links.new(normal_node.outputs["Color"], mapping.inputs["Color"])
        links.new(mapping.outputs["Normal"], shader.inputs["Normal"])


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


def main():
    args = arguments()
    root = v1.make_warrior()
    for child in root.children_recursive:
        if child.type == "MESH" and child.name.endswith("_eye_socket"):
            eye_material = child.data.materials[0].copy()
            eye_material.name = child.name + "_material"
            child.data.materials[0] = eye_material
    publish_contract(root)
    attach_seed_texture()
    args.source.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.source), check_existing=False)
    export(root, args.output)
    v1.render_reviews(args.review, root)
    print(f"wrote {args.source}, {args.output}, and {args.review}")


if __name__ == "__main__":
    main()
