"""Retarget the complete CC0 Ranger onto the prototype's thirteen visual bones.

The donor already contains the thing the previous builder tried to reconstruct:
one proportioned outfit, a weighted armature and articulated fingers. This
builder keeps that authored whole. It lowers and closes the donor's arms through
that native skin, bakes the coherent pose, and then applies one uniform fit into
the exact physics joint table in ``dimensions.json``. Faces are split by their
dominant target bone so a future sever can hide one region without cutting
through a triangle owned by another.

The resulting skin is cosmetic. Physics remains authoritative in the browser.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


TARGET_ORDER = (
    "torso", "head", "pelvis",
    "swordUpperArm", "swordForearm", "swordHand",
    "offUpperArm", "offForearm", "offHand",
    "thighLeft", "shinLeft", "thighRight", "shinRight",
)


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--dimensions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def fighter_to_blender(point):
    """Fighter (right, height, forward) to Blender before glTF's Y-up export."""
    return Vector((-point[0], -point[2], point[1]))


def source_digest(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f'"{path}" digest {actual}; expected {expected}')


def material(name, colour, metallic=0.0, roughness=0.75):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*colour, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    value.diffuse_color = (*colour, 1.0)
    value.metallic = metallic
    value.roughness = roughness
    return value


def target_segments(dimensions):
    bones = dimensions["bones"]
    fighter = dimensions["fighter"]
    body = dimensions["body"]

    def joint(name):
        return fighter_to_blender(bones[name]["joint"])

    def centre(name):
        return fighter_to_blender(bones[name]["centre"])

    sword_wrist = bones["swordHand"]["joint"]
    off_wrist = bones["offHand"]["joint"]
    return {
        # A bone node's origin is the edit-bone head. Figure.syncSkin drives
        # that node from the matching physics capsule, whose origin is its
        # centre rather than its anatomical joint. Tails only establish the
        # authored basis and are deliberately disconnected from child heads.
        "torso": (centre("torso"), joint("head")),
        "head": (centre("head"), fighter_to_blender((0, fighter["height"], 0))),
        "pelvis": (centre("pelvis"), fighter_to_blender((0, body["hip"], 0))),
        "swordUpperArm": (centre("swordUpperArm"), joint("swordForearm")),
        "swordForearm": (centre("swordForearm"), joint("swordHand")),
        # A 180 mm visual hand fixes the old miniature hand without changing the
        # 120 mm physics capsule or its weapon weld point.
        "swordHand": (centre("swordHand"), fighter_to_blender((
            sword_wrist[0], bones["swordHand"]["centre"][1] - 0.18, sword_wrist[2],
        ))),
        "offUpperArm": (centre("offUpperArm"), joint("offForearm")),
        "offForearm": (centre("offForearm"), joint("offHand")),
        "offHand": (centre("offHand"), fighter_to_blender((
            off_wrist[0], bones["offHand"]["centre"][1] - 0.18, off_wrist[2],
        ))),
        "thighLeft": (centre("thighLeft"), joint("shinLeft")),
        "shinLeft": (centre("shinLeft"), fighter_to_blender((-body["hipSide"], 0.015, 0.055))),
        "thighRight": (centre("thighRight"), joint("shinRight")),
        "shinRight": (centre("shinRight"), fighter_to_blender((body["hipSide"], 0.015, 0.055))),
    }


def build_target_armature(segments):
    data = bpy.data.armatures.new("WarriorRig")
    rig = bpy.data.objects.new("WarriorRig", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    parents = {
        "head": "torso", "pelvis": "torso",
        "swordUpperArm": "torso", "swordForearm": "swordUpperArm", "swordHand": "swordForearm",
        "offUpperArm": "torso", "offForearm": "offUpperArm", "offHand": "offForearm",
        "thighLeft": "pelvis", "shinLeft": "thighLeft",
        "thighRight": "pelvis", "shinRight": "thighRight",
    }
    made = {}
    for name in TARGET_ORDER:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = segments[name]
        bone.use_connect = False
        if name in parents:
            bone.parent = made[parents[name]]
        made[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    return rig


def source_target(name):
    if name in {"root", "pelvis"}:
        return "pelvis"
    if name.startswith("spine_") or name.startswith("clavicle_"):
        return "torso"
    if name in {"neck_01", "Head"}:
        return "head"
    # The glTF is already in Blender's right-handed frame. Its `_l` geometry
    # lives at +X, which is the fighter's left/off side after Babylon performs
    # its handedness conversion; swapping these was what crossed both coat tails
    # through the crotch in the first retargeted render.
    for suffix, side in (("_l", "off"), ("_r", "sword")):
        if name == "upperarm" + suffix:
            return side + "UpperArm"
        if name == "lowerarm" + suffix:
            return side + "Forearm"
        if name == "hand" + suffix or name.endswith(suffix) and any(
            name.startswith(digit) for digit in ("index_", "middle_", "ring_", "pinky_", "thumb_")
        ):
            return side + "Hand"
    if name == "thigh_l":
        return "thighLeft"
    if name in {"calf_l", "foot_l", "ball_l", "ball_leaf_l"}:
        return "shinLeft"
    if name == "thigh_r":
        return "thighRight"
    if name in {"calf_r", "foot_r", "ball_r", "ball_leaf_r"}:
        return "shinRight"
    return None


def pose_native_bind(source_rig, dimensions, fit_scale):
    """Use the donor rig to lower its arms and close both hands coherently."""
    for suffix, angle in (("l", -90), ("r", 90)):
        pose = source_rig.pose.bones[f"upperarm_{suffix}"]
        pose.rotation_mode = "XYZ"
        # Ranger is authored in a T-pose. Its upper-arm local Z is the shoulder
        # hinge which brings the whole native weighted sleeve, pauldron and arm
        # down together. Baking this deformation preserves the authored surface;
        # separately transforming target-owned vertices made cloth seams into
        # the crotch spikes and detached shoulder fins this asset replaces.
        pose.rotation_euler.z = math.radians(angle)
        pose.scale.y = dimensions["arm"]["upperLength"] / (
            source_rig.data.bones[f"upperarm_{suffix}"].length * fit_scale
        )
        forearm = source_rig.pose.bones[f"lowerarm_{suffix}"]
        forearm.scale.y = dimensions["arm"]["foreLength"] / (
            source_rig.data.bones[f"lowerarm_{suffix}"].length * fit_scale
        )
    for suffix in ("l", "r"):
        for digit in ("index", "middle", "ring", "pinky"):
            for index, angle in ((1, 54), (2, 68), (3, 58)):
                pose = source_rig.pose.bones.get(f"{digit}_0{index}_{suffix}")
                if pose is None:
                    continue
                pose.rotation_mode = "XYZ"
                # The donor finger bones run along local Y; their local X lies
                # in the palm plane. Curling about X closes the fingers. The old
                # Z-axis attempt splayed them sideways into the grotesque spikes
                # this replacement exists to remove.
                pose.rotation_euler.x = math.radians(-angle)
        for index, x_angle in ((1, 18), (2, 22), (3, 16)):
            pose = source_rig.pose.bones.get(f"thumb_0{index}_{suffix}")
            if pose is None:
                continue
            pose.rotation_mode = "XYZ"
            pose.rotation_euler.x = math.radians(-x_angle)
    bpy.context.view_layer.update()


def source_fit_transform(source_meshes, fighter):
    """Fit the complete donor with one transform; never reshape body regions."""
    points = [
        obj.matrix_world @ vertex.co
        for obj in source_meshes
        for vertex in obj.data.vertices
    ]
    floor = min(point.z for point in points)
    crown = max(point.z for point in points)
    scale = fighter["height"] / (crown - floor)
    # The physics shoulders are 20 mm forward of the torso axis. The donor is
    # centred on its shoulder plane, so align the complete character there as
    # part of the same global translation. This also puts each closed fist over
    # its physical weapon root instead of 13 mm behind it.
    return Matrix.Translation((0.0, -fighter["shoulderFront"], -floor * scale)) @ Matrix.Scale(scale, 4)


def remapped_weights(source, vertex):
    weights = {}
    for membership in vertex.groups:
        source_name = source.vertex_groups[membership.group].name
        target = source_target(source_name)
        if target is not None and membership.weight > 0:
            weights[target] = weights.get(target, 0.0) + membership.weight
    total = sum(weights.values())
    if total <= 1e-8:
        return {"torso": 1.0}
    return {name: value / total for name, value in weights.items()}


def ranger_materials():
    return {
        "cloth": material("cloth", (0.29, 0.10, 0.12), 0.0, 0.88),
        "cloth_surcoat": material("cloth_surcoat", (0.29, 0.10, 0.12), 0.0, 0.88),
        "leather": material("leather", (0.13, 0.075, 0.045), 0.0, 0.72),
        "steel": material("steel", (0.44, 0.48, 0.54), 0.92, 0.24),
        "flesh": material("flesh", (0.48, 0.25, 0.16), 0.0, 0.70),
        "brass": material("helmet.brass", (0.42, 0.23, 0.055), 0.82, 0.28),
        "black": material("helmet.black", (0.012, 0.014, 0.018), 0.25, 0.34),
    }


def role_for(source_name, slot_name):
    if "Regular_Male" in slot_name:
        return "flesh"
    if source_name == "Male_Ranger_Acc_Pauldron":
        return "steel"
    if source_name == "Male_Ranger_Body":
        return "cloth_surcoat"
    if source_name in {"Male_Ranger_Arms_Bracer", "Male_Ranger_Feet_Boots"} or "Belt" in source_name:
        return "leather"
    return "cloth"


def split_source_mesh(source, target_rig, fit, materials):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        if len(evaluated_mesh.vertices) != len(source.data.vertices):
            raise RuntimeError(f'"{source.name}" armature evaluation changed vertex indices')
        source.data.calc_loop_triangles()
        uv_source = source.data.uv_layers.active
        positions = []
        weights = []
        for index, original in enumerate(source.data.vertices):
            remapped = remapped_weights(source, original)
            posed = evaluated.matrix_world @ evaluated_mesh.vertices[index].co
            positions.append(fit @ posed)
            weights.append(remapped)

        triangles_by_owner = {name: [] for name in TARGET_ORDER}
        for triangle in source.data.loop_triangles:
            totals = {name: 0.0 for name in TARGET_ORDER}
            for vertex_index in triangle.vertices:
                for target, weight in weights[vertex_index].items():
                    totals[target] += weight
            owner = max(TARGET_ORDER, key=lambda name: totals[name])
            triangles_by_owner[owner].append(triangle)

        built = []
        for owner, triangles in triangles_by_owner.items():
            if not triangles:
                continue
            used = sorted({index for triangle in triangles for index in triangle.vertices})
            remap = {old: new for new, old in enumerate(used)}
            mesh = bpy.data.meshes.new(f"{source.name}__region_{owner}_mesh")
            mesh.from_pydata(
                [positions[index] for index in used], [],
                [tuple(remap[index] for index in triangle.vertices) for triangle in triangles],
            )
            mesh.update(calc_edges=True)
            for slot in source.material_slots:
                mesh.materials.append(materials[role_for(source.name, slot.name)])
            for polygon, triangle in zip(mesh.polygons, triangles):
                polygon.material_index = min(triangle.material_index, max(0, len(mesh.materials) - 1))
                polygon.use_smooth = True
            if uv_source is not None:
                uv_target = mesh.uv_layers.new(name="UVMap")
                for polygon, triangle in zip(mesh.polygons, triangles):
                    for new_loop, old_loop in zip(polygon.loop_indices, triangle.loops):
                        uv_target.data[new_loop].uv = uv_source.data[old_loop].uv

            obj = bpy.data.objects.new(f"{source.name}__region_{owner}", mesh)
            bpy.context.scene.collection.objects.link(obj)
            for target in TARGET_ORDER:
                group = obj.vertex_groups.new(name=target)
                for new_index, old_index in enumerate(used):
                    weight = weights[old_index].get(target, 0.0)
                    if weight > 0:
                        group.add([new_index], weight, "REPLACE")
            modifier = obj.modifiers.new("WarriorRig", "ARMATURE")
            modifier.object = target_rig
            obj.parent = target_rig
            built.append(obj)
        return built
    finally:
        evaluated.to_mesh_clear()


def parse_helmet(path, target_rig, fit, materials):
    vertices, uvs, triangles, triangle_uvs, roles = [], [], [], [], []
    active = "Grey"
    for raw in path.read_text(encoding="utf8").splitlines():
        fields = raw.split()
        if not fields:
            continue
        if fields[0] == "v":
            # The archive's OBJ is Y-up: (x, z, -y) relative to its Blender
            # source. Restore Blender's Z-up basis before applying the measured
            # fit. Reading the OBJ triples directly turns depth into height and
            # presents the helmet's crown as a featureless face-sized dome.
            x, y_up, back = (float(value) for value in fields[1:4])
            point = Vector((x, -back, y_up))
            point *= 0.15
            vertices.append(fit @ (point + Vector((0, 0, 1.640))))
        elif fields[0] == "vt":
            uvs.append(tuple(float(value) for value in fields[1:3]))
        elif fields[0] == "usemtl":
            active = fields[1]
        elif fields[0] == "f":
            corners = [field.split("/") for field in fields[1:]]
            for index in range(1, len(corners) - 1):
                tri = (corners[0], corners[index], corners[index + 1])
                triangles.append(tuple(int(corner[0]) - 1 for corner in tri))
                triangle_uvs.append(tuple(int(corner[1]) - 1 if len(corner) > 1 and corner[1] else None for corner in tri))
                roles.append(active)

    mesh = bpy.data.meshes.new("Helmet3__region_head_mesh")
    mesh.from_pydata(vertices, [], triangles)
    mesh.update(calc_edges=True)
    role_material = {"Grey": materials["steel"], "Golden": materials["brass"], "Black": materials["black"]}
    for role in ("Grey", "Golden", "Black"):
        mesh.materials.append(role_material[role])
    material_index = {role: index for index, role in enumerate(("Grey", "Golden", "Black"))}
    uv_layer = mesh.uv_layers.new(name="UVMap") if uvs else None
    for polygon, role, face_uvs in zip(mesh.polygons, roles, triangle_uvs):
        polygon.material_index = material_index[role]
        polygon.use_smooth = True
        if uv_layer:
            for loop_index, source_uv in zip(polygon.loop_indices, face_uvs):
                if source_uv is not None:
                    uv_layer.data[loop_index].uv = uvs[source_uv]
    obj = bpy.data.objects.new("Helmet3__region_head", mesh)
    bpy.context.scene.collection.objects.link(obj)
    group = obj.vertex_groups.new(name="head")
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("WarriorRig", "ARMATURE")
    modifier.object = target_rig
    obj.parent = target_rig
    return obj


def grip_marker(name, bone_name, centre, rig):
    marker = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(marker)
    marker.empty_display_type = "PLAIN_AXES"
    marker.empty_display_size = 0.04
    marker.parent = rig
    marker.parent_type = "BONE"
    marker.parent_bone = bone_name
    marker.matrix_world = Matrix.Translation(fighter_to_blender(centre))
    return marker


def build(dimensions, source_root):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    provenance = json.loads((source_root / "armour-sources.json").read_text(encoding="utf8"))
    rows = {row["id"]: row for row in provenance["sources"]}
    ranger_row = rows["quaternius-modular-character-outfits-fantasy-standard-2026"]
    helmet_row = rows["quaternius-animated-knight-2018"]
    ranger_path = source_root / "armour" / "quaternius-ranger" / "ranger-source.gltf"
    helmet_path = source_root / "armour" / "quaternius-knight" / "Helmet3.obj"
    source_digest(ranger_path, ranger_row["extracts"]["ranger-source.gltf"])
    source_digest(ranger_path.with_suffix(".bin"), ranger_row["extracts"]["ranger-source.bin"])
    source_digest(helmet_path, helmet_row["extracts"]["Helmet3.obj"])

    bpy.ops.import_scene.gltf(filepath=str(ranger_path))
    source_rig = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    source_meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name != "Icosphere"
    ]
    fit = source_fit_transform(source_meshes, dimensions["fighter"])
    pose_native_bind(source_rig, dimensions, fit.to_scale().x)

    target_by_name = target_segments(dimensions)
    target_rig = build_target_armature(target_by_name)
    materials = ranger_materials()
    built = []
    for source in source_meshes:
        built.extend(split_source_mesh(source, target_rig, fit, materials))
    built.append(parse_helmet(helmet_path, target_rig, fit, materials))

    bones = dimensions["bones"]
    hand_length = dimensions["arm"]["handLength"]
    primary_grip = list(bones["swordHand"]["centre"])
    secondary_grip = list(bones["offHand"]["centre"])
    primary_grip[1] -= hand_length / 2
    secondary_grip[1] -= hand_length / 2
    built.append(grip_marker("grip.primary", "swordHand", primary_grip, target_rig))
    built.append(grip_marker("grip.secondary", "offHand", secondary_grip, target_rig))

    for obj in source_meshes:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.objects.remove(source_rig, do_unlink=True)
    root = bpy.data.objects.new("Warrior", None)
    bpy.context.scene.collection.objects.link(root)
    target_rig.parent = root
    return root, target_rig, built


def export(root, rig, built, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    rig.select_set(True)
    for obj in built:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", check_existing=False,
        export_yup=True, use_selection=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=True, export_morph=False,
        export_extras=True,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


def main():
    args = arguments()
    dimensions = json.loads(args.dimensions.read_text(encoding="utf8"))
    if dimensions.get("schema") != 1:
        raise RuntimeError(f"dimensions.json schema {dimensions.get('schema')}, expected 1")
    root, rig, built = build(dimensions, Path(__file__).resolve().parent)
    export(root, rig, built, args.output)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
