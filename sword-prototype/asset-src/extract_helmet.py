"""Extract the selected helmet and a qualification-only full Knight source."""

import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import zipfile

import bpy


def as_row(vector):
    return [float(vector[index]) for index in range(3)]


def write_knight_metadata(source_bytes, target):
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 1:
        raise RuntimeError(
            f"Knight source requires one armature and one mesh; found {len(armatures)} and {len(meshes)}"
        )
    armature = armatures[0]
    armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = meshes[0].evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        influences = []
        overweight = []
        for vertex in mesh.vertices:
            assigned = [group for group in vertex.groups if group.weight > 0]
            influences.append(len(assigned))
            overweight.extend({
                "vertex": vertex.index,
                "group": group.group,
                "weight": float(group.weight),
            } for group in assigned if group.weight > 1)
        mesh_row = {
            "name": meshes[0].name,
            "vertices": len(mesh.vertices),
            "polygons": len(mesh.polygons),
            "boundsWorldMin": [min(point[axis] for point in points) for axis in range(3)],
            "boundsWorldMax": [max(point[axis] for point in points) for axis in range(3)],
            "maxInfluences": max(influences),
            "verticesOverFourInfluences": sum(value > 4 for value in influences),
            "weightsOverOne": overweight,
        }
    finally:
        evaluated.to_mesh_clear()
    bones = {}
    for bone in armature.data.bones:
        bones[bone.name] = {
            "headWorld": as_row(armature.matrix_world @ bone.head_local),
            "tailWorld": as_row(armature.matrix_world @ bone.tail_local),
        }
    actions = [{
        "name": action.name,
        "frameRange": [float(value) for value in action.frame_range],
        "groups": sorted(group.name for group in action.groups),
    } for action in bpy.data.actions]
    metadata = {
        "schema": 1,
        "authority": "read-only measurements from the untouched creator blend member",
        "sourceMember": "Knight Character by @Quaternius/Blends/KnightCharacter.blend",
        "sourceMemberSha256": hashlib.sha256(source_bytes).hexdigest(),
        "blenderVersion": bpy.app.version_string,
        "sourceAxes": {"up": "+Z", "side": "+X", "forward": "-Y"},
        "gameAxisMapping": ["+X", "+Z", "-Y"],
        "armature": armature.name,
        "mesh": mesh_row,
        "bones": bones,
        "actions": actions,
    }
    target.write_bytes((json.dumps(metadata, indent=2, sort_keys=True) + "\n").encode("utf8"))
    print(f"wrote {target}")


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def main():
    args = arguments()
    args.output.mkdir(parents=True, exist_ok=True)
    wanted = {
        "Helmet3.obj": "Knight Character by @Quaternius/OBJ/Helmet3.obj",
        "Helmet3.mtl": "Knight Character by @Quaternius/OBJ/Helmet3.mtl",
    }
    with zipfile.ZipFile(args.source) as archive:
        names = set(archive.namelist())
        for output_name, member in wanted.items():
            if member not in names:
                raise RuntimeError(f'helmet archive has no "{member}"')
            target = args.output / output_name
            target.write_bytes(archive.read(member))
            print(f"wrote {target}")

        blend_member = "Knight Character by @Quaternius/Blends/KnightCharacter.blend"
        if blend_member not in names:
            raise RuntimeError(f'helmet archive has no "{blend_member}"')
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / "KnightCharacter.blend"
            source_bytes = archive.read(blend_member)
            creator_target = args.output / "KnightCharacter.blend"
            creator_target.write_bytes(source_bytes)
            print(f"wrote {creator_target}")
            source.write_bytes(source_bytes)
            bpy.ops.wm.open_mainfile(filepath=str(source))
            write_knight_metadata(source_bytes, args.output / "knight-source-metadata.json")
            target = args.output / "knight-source.gltf"
            bpy.ops.export_scene.gltf(
                filepath=str(target),
                export_format="GLTF_SEPARATE",
                export_animations=True,
                export_all_influences=True,
                export_materials="EXPORT",
                export_skins=True,
            )
            print(f"wrote {target}")
            print(f"wrote {args.output / 'knight-source.bin'}")


main()
