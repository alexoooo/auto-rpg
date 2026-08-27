"""Extract the selected CC0 Ranger pieces from Quaternius's pinned archive.

Run this through ``npm run armour:extract``.  The archive stays in the ignored
review directory; the selected stripped source glTF, small render-only OBJ
studies and the bundled CC0 notice are committed beside the warrior builder.
The glTF is kept because it carries the skin weights and finger rig that the
OBJ studies necessarily discard; only its large unused textures are removed.
"""

import argparse
import json
from pathlib import Path
import sys
import tempfile
import zipfile

import bpy


SOURCES = {
    "Male_Ranger_Body.gltf": {
        "Male_Ranger_Body": "ranger-body.obj",
        "Male_Ranger_Body_Belt_1": "ranger-belt-upper.obj",
        "Male_Ranger_Body_Belt_2": "ranger-belt-lower.obj",
    },
    "Male_Ranger_Arms.gltf": {"Male_Ranger_Arms": "ranger-arms.obj"},
    "Male_Ranger_Acc_Pauldron.gltf": {
        "Male_Ranger_Acc_Pauldron": "ranger-pauldron.obj",
    },
    "Male_Ranger_Feet_Boots.gltf": {
        "Male_Ranger_Feet_Boots": "ranger-boots.obj",
    },
    "Male_Ranger_Head_Hood.gltf": {"Male_Ranger_Head_Hood": "ranger-hood.obj"},
    "Male_Ranger_Legs.gltf": {"Male_Ranger_Legs": "ranger-legs.obj"},
}

MODULAR_PARTS = "Exports/glTF (Godot-Unreal)/Modular Parts/"


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
        mesh.calc_loop_triangles()
        rows = [
            "# Evaluated render-only extract from Quaternius's CC0 Modular Character Outfits - Fantasy",
            f"o {source.name}",
        ]
        rows.extend(f"v {point.x:.7f} {point.y:.7f} {point.z:.7f}" for point in points)
        active = None
        for triangle in mesh.loop_triangles:
            index = triangle.material_index
            label = source.material_slots[index].name if index < len(source.material_slots) else "unassigned"
            if label != active:
                rows.append(f"usemtl {label.replace(' ', '_')}")
                active = label
            rows.append("f " + " ".join(str(index + 1) for index in triangle.vertices))
        # Text-mode writes silently turn these pinned bytes into CRLF on
        # Windows.  Explicit ASCII bytes make the same extract on every host.
        target.write_bytes(("\n".join(rows) + "\n").encode("ascii"))
    finally:
        evaluated.to_mesh_clear()


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.source) as archive, tempfile.TemporaryDirectory() as scratch:
        members = archive.namelist()
        body_member = next(
            (name for name in members if name.endswith(MODULAR_PARTS + "Male_Ranger_Body.gltf")),
            None,
        )
        if body_member is None:
            raise RuntimeError("clothing archive has no Ranger modular-parts glTF directory")
        prefix = body_member[:-len("Male_Ranger_Body.gltf")]
        selected = [name for name in members if name.startswith(prefix) and not name.endswith("/")]
        archive.extractall(scratch, selected)

        license_member = next((name for name in members if name.endswith("/License_Standard.txt")), None)
        if license_member is None:
            raise RuntimeError("clothing archive has no bundled License_Standard.txt")
        license_text = archive.read(license_member).decode("utf-8").replace("\r\n", "\n")
        (args.output / "LICENSE.txt").write_bytes(license_text.encode("utf-8"))

        full_gltf = next(
            (name for name in members if name.endswith("Exports/glTF (Godot-Unreal)/Outfits/Male_Ranger.gltf")),
            None,
        )
        if full_gltf is None:
            raise RuntimeError("clothing archive has no full Male_Ranger.gltf outfit")
        full_bin = full_gltf[:-len("Male_Ranger.gltf")] + "Male_Ranger.bin"
        document = json.loads(archive.read(full_gltf).decode("utf8"))
        document["buffers"][0]["uri"] = "ranger-source.bin"
        document.pop("images", None)
        document.pop("textures", None)
        document.pop("samplers", None)
        for source_material in document.get("materials", []):
            source_material.pop("normalTexture", None)
            source_material.pop("occlusionTexture", None)
            source_material.pop("emissiveTexture", None)
            pbr = source_material.get("pbrMetallicRoughness", {})
            pbr.pop("baseColorTexture", None)
            pbr.pop("metallicRoughnessTexture", None)
        gltf_target = args.output / "ranger-source.gltf"
        bin_target = args.output / "ranger-source.bin"
        gltf_target.write_bytes((json.dumps(document, indent=2) + "\n").encode("utf8"))
        bin_target.write_bytes(archive.read(full_bin))
        print(f"wrote {gltf_target}")
        print(f"wrote {bin_target}")

        for source_file, objects in SOURCES.items():
            bpy.ops.wm.read_factory_settings(use_empty=True)
            source_path = Path(scratch) / (prefix + source_file)
            bpy.ops.import_scene.gltf(filepath=str(source_path))
            bpy.context.scene.frame_set(0)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            for source_name, filename in objects.items():
                source = bpy.data.objects.get(source_name)
                if source is None or source.type != "MESH":
                    raise RuntimeError(f'clothing donor has no mesh object named "{source_name}"')
                target = args.output / filename
                write_obj(source, target, depsgraph)
                print(f"wrote {target}")


main()
