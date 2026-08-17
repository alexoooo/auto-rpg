"""Deterministic semantically animated Fighter and Brute art.

Blender is Z-up internally.  Public measurements and helper arguments use the
runtime's right-handed glTF `(x, y, z)` convention and convert at the seam.
The meshes are deliberately rigid children of named transforms: authoritative
hands and equipment sockets can be driven directly without skinning corrections.
"""

import hashlib
from pathlib import Path
import struct

import bpy


PARENTS = {
    "root": None, "pelvis": "root", "torso": "pelvis", "head": "torso",
    "arm_left": "torso", "hand_left": "arm_left",
    "arm_right": "torso", "hand_right": "arm_right",
    "socket_weapon_left": "hand_left", "socket_weapon_right": "hand_right",
    "socket_shield": "root",
    "region_head": "root", "region_torso": "root", "region_left_arm": "root",
    "region_right_arm": "root", "region_legs": "root",
    "idle": "root", "walk": "root", "stagger": "root", "fall": "root",
}


def _location(value):
    x, y, z = value
    return (x, -z, y)


def _select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _verified_atlas(root, spec):
    path = Path(root) / spec["path"]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise RuntimeError("combatant atlas SHA-256 differs from the manifest")
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise RuntimeError("combatant atlas is not a PNG with a leading IHDR")
    width, height = struct.unpack(">II", data[16:24])
    if width != spec["width"] or height != spec["height"]:
        raise RuntimeError("combatant atlas dimensions differ from the manifest")
    source = bpy.data.images.load(str(path), check_existing=False)
    source.scale(spec["embeddedWidth"], spec["embeddedHeight"])
    image = bpy.data.images.new("combatant_material_atlas", width=spec["embeddedWidth"],
                                height=spec["embeddedHeight"], alpha=True)
    image.colorspace_settings.name = "sRGB"
    image.pixels[:] = source.pixels[:]
    image.pack()
    bpy.data.images.remove(source)
    return image


def build_combatant_materials(manifest, root):
    image = _verified_atlas(root, manifest["texture"])
    result = {}
    # Quadrants are kept as semantic provenance even though the generated atlas
    # is sampled as a single worn-surface field by the low-poly UVs.  That avoids
    # an exporter-specific texture-transform correction in runtime TypeScript.
    for name in sorted(manifest["materials"]):
        spec = manifest["materials"][name]
        material = bpy.data.materials.new(name)
        colour = tuple(float(value) for value in spec["baseColor"])
        material.diffuse_color = colour
        material.metallic = float(spec["metallic"])
        material.roughness = float(spec["roughness"])
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        principled.inputs["Base Color"].default_value = colour
        principled.inputs["Metallic"].default_value = material.metallic
        principled.inputs["Roughness"].default_value = material.roughness
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.name = "combatant_material_atlas"
        texture.label = f"atlas quadrant {spec['atlasQuadrant']}"
        texture.image = image
        # Multiplying retains each material's silhouette colour while the atlas
        # supplies the irregular leather/metal wear requested by the concept.
        mix = material.node_tree.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 0.58
        mix.inputs[2].default_value = colour
        material.node_tree.links.new(texture.outputs["Color"], mix.inputs[1])
        material.node_tree.links.new(mix.outputs["Color"], principled.inputs["Base Color"])
        result[name] = material
    return result


def _empty(name, parent, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.location = _location(position)
    obj["semantic_name"] = name.split("_", 1)[1]
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def _finish_mesh(obj, name, parent, material, position=(0, 0, 0), rotation=(0, 0, 0)):
    obj.name = name
    obj.data.name = f"mesh_{name}"
    obj.data.materials.append(material)
    obj.location = _location(position)
    # Rotation arguments follow glTF axes: yaw Y, pitch X, roll Z.  These art
    # accents never become a runtime correction table.
    obj.rotation_euler = (rotation[0], -rotation[2], rotation[1])
    armature, bone_name = parent
    # Blender's authored relationship is explicit even though the glTF scene
    # flattens object parents at export: that combination keeps the exporter
    # warning-free and keeps skinned mesh nodes at glTF roots as recommended.
    modifier = obj.modifiers.new("semantic_armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    # Primitive and bevel operators can leave UVs that differ by one float LSB
    # across two clean scenes.  The authored atlas needs only a stable quadrant
    # sample, so rebuild every loop from exact ordinal corners after modifiers.
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    uv = obj.data.uv_layers.new(name="UVMap")
    quadrants = {
        "combatant_bone": 0, "combatant_skin": 1,
        "combatant_burgundy": 2, "combatant_hide": 2, "combatant_leather": 2,
        "combatant_dark_steel": 3, "combatant_steel": 3,
    }
    quadrant = quadrants[material.name]
    origin_x = 0.04 + (0.5 if quadrant % 2 else 0)
    origin_y = 0.04 + (0.5 if quadrant < 2 else 0)
    corners = ((origin_x, origin_y), (origin_x + 0.42, origin_y),
               (origin_x + 0.42, origin_y + 0.42), (origin_x, origin_y + 0.42))
    for polygon in obj.data.polygons:
        for ordinal, loop_index in enumerate(polygon.loop_indices):
            uv.data[loop_index].uv = corners[ordinal % 4]
    obj["semantic_mesh"] = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def _box(name, parent, material, size, position=(0, 0, 0), bevel=0.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("worn_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return _finish_mesh(obj, name, parent, material, position, rotation)


def _cylinder(name, parent, material, radius, depth, position=(0, 0, 0), vertices=10,
              rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    return _finish_mesh(bpy.context.object, name, parent, material, position, rotation)


def _sphere(name, parent, material, radius, position=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius)
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish_mesh(obj, name, parent, material, position)


def _cone(name, parent, material, radius, depth, position=(0, 0, 0), vertices=8,
          rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0, depth=depth)
    return _finish_mesh(bpy.context.object, name, parent, material, position, rotation)


def _mesh_from_faces(name, parent, material, vertices, faces, position=(0, 0, 0)):
    mesh = bpy.data.meshes.new("mesh_" + name)
    mesh.from_pydata([_location(vertex) for vertex in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    result = _finish_mesh(obj, name, parent, material, position)
    for polygon in result.data.polygons:
        polygon.use_smooth = False
    return result


def _frustum(name, parent, material, bottom, top, height, position=(0, 0, 0)):
    bottom_x, bottom_z = bottom
    top_x, top_z = top
    low = -height / 2
    high = height / 2
    vertices = [
        (-bottom_x / 2, low, -bottom_z / 2), (bottom_x / 2, low, -bottom_z / 2),
        (bottom_x / 2, low, bottom_z / 2), (-bottom_x / 2, low, bottom_z / 2),
        (-top_x / 2, high, -top_z / 2), (top_x / 2, high, -top_z / 2),
        (top_x / 2, high, top_z / 2), (-top_x / 2, high, top_z / 2),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7),
             (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return _mesh_from_faces(name, parent, material, vertices, faces, position)


def _extruded_profile(name, parent, material, points, thickness, position=(0, 0, 0)):
    half = thickness / 2
    count = len(points)
    vertices = [(x, y, -half) for x, y in points] + [(x, y, half) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    return _mesh_from_faces(name, parent, material, vertices, faces, position)


def _tapered_cylinder(name, parent, material, rings, vertices=10, position=(0, 0, 0)):
    import math
    points = []
    for y, radius in rings:
        points.extend((radius * math.cos(index * 2 * math.pi / vertices), y,
                       radius * math.sin(index * 2 * math.pi / vertices))
                      for index in range(vertices))
    faces = [tuple(reversed(range(vertices))),
             tuple(range((len(rings) - 1) * vertices, len(rings) * vertices))]
    for ring in range(len(rings) - 1):
        start = ring * vertices
        following = start + vertices
        for index in range(vertices):
            next_index = (index + 1) % vertices
            faces.append((start + index, start + next_index,
                          following + next_index, following + index))
    return _mesh_from_faces(name, parent, material, points, faces, position)


def _rig(prefix, semantic_names, positions):
    bones = [semantic for semantic in semantic_names if semantic not in ("idle", "walk", "stagger", "fall")]
    armature_data = bpy.data.armatures.new(prefix + "skeleton")
    armature = bpy.data.objects.new(prefix + "armature", armature_data)
    armature["semantic_skeleton"] = prefix.rstrip("_").lower()
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    global_positions = {}
    for semantic in bones:
        parent_name = PARENTS[semantic]
        local = positions.get(semantic, (0, 0, 0))
        if parent_name is None:
            world = local
        else:
            parent_world = global_positions[parent_name]
            world = tuple(parent_world[index] + local[index] for index in range(3))
        global_positions[semantic] = world
        bone = armature_data.edit_bones.new(prefix + semantic)
        bone.head = _location(world)
        bone.tail = (bone.head.x, bone.head.y, bone.head.z + 0.08)
        bone.use_connect = False
        if parent_name is not None:
            bone.parent = armature_data.edit_bones[prefix + parent_name]
    bpy.ops.object.mode_set(mode="OBJECT")
    nodes = {semantic: (armature, prefix + semantic) for semantic in bones}
    markers = {}
    for semantic in ("idle", "walk", "stagger", "fall"):
        marker = _empty(prefix + semantic, armature)
        marker.parent_type = "BONE"
        marker.parent_bone = prefix + "root"
        markers[semantic] = marker
        nodes[semantic] = (armature, prefix + "root")
    nodes["__armature__"] = armature
    nodes["__markers__"] = markers
    return nodes


def _fighter(manifest, materials):
    prefix = "FIGHTER_"
    nodes = _rig(prefix, manifest["semanticNames"], {
        "pelvis": (0, 0.93, 0), "torso": (0, 0.32, 0), "head": (0, 0.48, 0),
        "arm_left": (-0.38, 0.34, 0), "hand_left": (0, -0.43, 0),
        "arm_right": (0.38, 0.34, 0), "hand_right": (0, -0.43, 0),
        "socket_weapon_left": (0, -0.13, 0), "socket_weapon_right": (0, -0.13, 0),
        "socket_shield": (-0.48, 1.12, 0.04),
        "region_head": (0, 1.69, 0), "region_torso": (0, 1.31, 0),
        "region_left_arm": (-0.40, 1.27, 0), "region_right_arm": (0.40, 1.27, 0),
        "region_legs": (0, 0.57, 0),
    })
    mesh = {}
    add = lambda obj: mesh.setdefault(obj.name, obj)
    add(_box(prefix + "mesh_pelvis_skirt", nodes["pelvis"], materials["combatant_burgundy"],
             (0.48, 0.32, 0.28), (0, -0.04, 0)))
    add(_cylinder(prefix + "mesh_pelvis_belt", nodes["pelvis"], materials["combatant_leather"],
                  0.255, 0.10, (0, 0.12, 0), vertices=12))
    add(_frustum(prefix + "mesh_torso_cuirass", nodes["torso"], materials["combatant_dark_steel"],
                 (0.44, 0.26), (0.62, 0.34), 0.60, (0, 0.14, 0)))
    add(_box(prefix + "mesh_torso_breastplate", nodes["torso"], materials["combatant_steel"],
             (0.38, 0.31, 0.055), (0, 0.20, -0.17), bevel=0.025))
    add(_box(prefix + "mesh_torso_cape", nodes["torso"], materials["combatant_burgundy"],
             (0.45, 0.65, 0.035), (0, -0.02, 0.18), bevel=0.015, rotation=(0.08, 0, 0)))
    add(_sphere(prefix + "mesh_head_face", nodes["head"], materials["combatant_skin"],
                0.15, (0, 0.12, 0), scale=(0.82, 1.0, 0.82)))
    add(_sphere(prefix + "mesh_head_helmet", nodes["head"], materials["combatant_steel"],
                0.21, (0, 0.16, 0), scale=(1.0, 0.96, 0.92)))
    add(_box(prefix + "mesh_head_visor", nodes["head"], materials["combatant_dark_steel"],
             (0.31, 0.085, 0.055), (0, 0.17, -0.18), bevel=0.012))
    add(_box(prefix + "mesh_head_plume", nodes["head"], materials["combatant_burgundy"],
             (0.08, 0.26, 0.22), (0, 0.43, 0.02), bevel=0.025))
    for side in ("left", "right"):
        node = nodes[f"arm_{side}"]
        add(_cylinder(prefix + f"mesh_arm_{side}", node, materials["combatant_burgundy"],
                      0.11, 0.27, (0, -0.12, 0), vertices=10))
        add(_cylinder(prefix + f"mesh_forearm_{side}", nodes[f"hand_{side}"],
                      materials["combatant_dark_steel"], 0.095, 0.27, (0, 0.12, 0), vertices=10))
        add(_sphere(prefix + f"mesh_pauldron_{side}", node, materials["combatant_steel"],
                    0.19, (0, 0.0, 0), scale=(1.18, 0.70, 1.0)))
        add(_box(prefix + f"mesh_hand_{side}", nodes[f"hand_{side}"], materials["combatant_steel"],
                 (0.17, 0.20, 0.16), (0, -0.08, 0), bevel=0.035))
    for side, x in (("left", -0.14), ("right", 0.14)):
        add(_cylinder(prefix + f"mesh_leg_{side}", nodes["pelvis"], materials["combatant_dark_steel"],
                      0.11, 0.62, (x, -0.44, 0), vertices=10))
        add(_box(prefix + f"mesh_boot_{side}", nodes["pelvis"], materials["combatant_leather"],
                 (0.20, 0.20, 0.32), (x, -0.77, -0.07), bevel=0.035))
    add(_extruded_profile(prefix + "mesh_shield", nodes["socket_shield"],
                          materials["combatant_dark_steel"],
                          [(0, 0.40), (0.38, 0.22), (0.34, -0.18), (0, -0.52),
                           (-0.34, -0.18), (-0.38, 0.22)], 0.08))
    add(_extruded_profile(prefix + "mesh_sword", nodes["socket_weapon_right"],
                          materials["combatant_steel"],
                          [(-0.055, 0.02), (-0.055, -0.10), (-0.18, -0.10),
                           (-0.18, -0.16), (-0.055, -0.16), (-0.055, -0.62),
                           (0, -0.76), (0.055, -0.62), (0.055, -0.16),
                           (0.18, -0.16), (0.18, -0.10), (0.055, -0.10),
                           (0.055, 0.02)], 0.045))
    return nodes, mesh


def _brute(manifest, materials):
    prefix = "BRUTE_"
    nodes = _rig(prefix, manifest["semanticNames"], {
        "pelvis": (0, 1.02, 0), "torso": (0, 0.39, 0), "head": (0, 0.56, 0),
        "arm_left": (-0.53, 0.39, 0), "hand_left": (0, -0.57, 0),
        "arm_right": (0.53, 0.39, 0), "hand_right": (0, -0.57, 0),
        "socket_weapon_left": (0, -0.18, 0), "socket_weapon_right": (0, -0.18, 0),
        "socket_shield": (-0.61, 1.34, 0.03),
        "region_head": (0, 1.99, -0.10), "region_torso": (0, 1.48, 0),
        "region_left_arm": (-0.55, 1.42, 0), "region_right_arm": (0.55, 1.42, 0),
        "region_legs": (0, 0.66, 0),
    })
    mesh = {}
    add = lambda obj: mesh.setdefault(obj.name, obj)
    add(_box(prefix + "mesh_pelvis_kilt", nodes["pelvis"], materials["combatant_hide"],
             (0.62, 0.42, 0.38), (0, -0.03, 0), bevel=0.045))
    add(_cylinder(prefix + "mesh_pelvis_belt", nodes["pelvis"], materials["combatant_leather"],
                  0.325, 0.13, (0, 0.17, 0), vertices=12))
    add(_sphere(prefix + "mesh_torso_hide", nodes["torso"], materials["combatant_skin"],
                0.40, (0, 0.20, 0), scale=(1.05, 1.28, 0.72)))
    add(_box(prefix + "mesh_torso_mantle", nodes["torso"], materials["combatant_hide"],
             (0.92, 0.18, 0.45), (0, 0.45, 0), bevel=0.07))
    add(_cylinder(prefix + "mesh_torso_buckle", nodes["torso"], materials["combatant_bone"],
                  0.09, 0.04, (0, -0.05, -0.28), vertices=10, rotation=(1.57079632679, 0, 0)))
    add(_sphere(prefix + "mesh_head", nodes["head"], materials["combatant_skin"],
                0.24, (0, 0.12, -0.10), scale=(1.0, 1.08, 0.88)))
    add(_box(prefix + "mesh_head_brow", nodes["head"], materials["combatant_hide"],
             (0.39, 0.09, 0.08), (0, 0.20, -0.20), bevel=0.025))
    for side, x, roll in (("left", -0.20, -0.42), ("right", 0.20, 0.42)):
        add(_cone(prefix + f"mesh_horn_{side}", nodes["head"], materials["combatant_bone"],
                  0.09, 0.38, (x, 0.32, 0), vertices=8, rotation=(0, 0, roll)))
        add(_cone(prefix + f"mesh_tusk_{side}", nodes["head"], materials["combatant_bone"],
                  0.035, 0.16, (x * 0.45, 0.00, -0.22), vertices=8, rotation=(0, 0, 3.14159265359)))
    for side in ("left", "right"):
        add(_cylinder(prefix + f"mesh_arm_{side}", nodes[f"arm_{side}"], materials["combatant_skin"],
                      0.17, 0.34, (0, -0.16, 0), vertices=10))
        add(_cylinder(prefix + f"mesh_forearm_{side}", nodes[f"hand_{side}"],
                      materials["combatant_hide"], 0.15, 0.34, (0, 0.15, 0), vertices=10))
        add(_sphere(prefix + f"mesh_hand_{side}", nodes[f"hand_{side}"], materials["combatant_skin"],
                    0.17, (0, -0.10, 0), scale=(1.0, 1.15, 0.92)))
    for side, x in (("left", -0.18), ("right", 0.18)):
        add(_cylinder(prefix + f"mesh_leg_{side}", nodes["pelvis"], materials["combatant_skin"],
                      0.145, 0.70, (x, -0.53, 0), vertices=10))
        add(_box(prefix + f"mesh_boot_{side}", nodes["pelvis"], materials["combatant_hide"],
                 (0.26, 0.24, 0.38), (x, -0.90, -0.09), bevel=0.045))
    add(_tapered_cylinder(prefix + "mesh_club", nodes["socket_weapon_right"],
                          materials["combatant_hide"],
                          [(0.03, 0.075), (-0.55, 0.085), (-0.78, 0.16), (-1.0, 0.24)],
                          vertices=10))
    return nodes, mesh


def _clip(armature, target, name, samples):
    armature.animation_data_create()
    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    target.rotation_mode = "XYZ"
    for frame, location, rotation in samples:
        target.location = _location(location)
        target.rotation_euler = (rotation[0], -rotation[2], rotation[1])
        target.keyframe_insert(data_path="location", frame=frame, group=name)
        target.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.name = name
    armature.animation_data.action = None


def _animations(prefix, nodes):
    armature = nodes["__armature__"]
    pelvis = armature.pose.bones[prefix + "pelvis"]
    base = (0, 0, 0)
    _clip(armature, pelvis, prefix + "idle", [(1, base, (0, 0, 0)), (16, (0, 0.018, 0), (0, 0, 0)), (31, base, (0, 0, 0))])
    _clip(armature, pelvis, prefix + "walk", [(1, base, (0.025, 0, -0.045)), (8, (0, 0.035, 0), (-0.025, 0, 0.045)), (16, base, (0.025, 0, -0.045))])
    _clip(armature, pelvis, prefix + "stagger", [(1, base, (0, 0, 0)), (6, (0, -0.05, 0.08), (0.12, 0, 0.18)), (14, base, (0, 0, 0))])
    _clip(armature, pelvis, prefix + "fall", [(1, base, (0, 0, 0)), (16, (0, -0.34, 0.28), (1.36, 0, 0.10)), (31, (0, -0.48, 0.38), (1.57079632679, 0, 0.10))])


def build_combatants(manifest, materials):
    fighter_nodes, fighter_meshes = _fighter(manifest, materials)
    brute_nodes, brute_meshes = _brute(manifest, materials)
    _animations("FIGHTER_", fighter_nodes)
    _animations("BRUTE_", brute_nodes)
    return {
        "fighter": {"nodes": {name: value for name, value in fighter_nodes.items() if not name.startswith("__")},
                    "armature": fighter_nodes["__armature__"], "markers": fighter_nodes["__markers__"],
                    "meshes": fighter_meshes},
        "brute": {"nodes": {name: value for name, value in brute_nodes.items() if not name.startswith("__")},
                  "armature": brute_nodes["__armature__"], "markers": brute_nodes["__markers__"],
                  "meshes": brute_meshes},
    }
