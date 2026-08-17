"""Deterministic semantically animated Fighter and Brute art.

Blender is Z-up internally.  Public measurements and helper arguments use the
runtime's right-handed glTF `(x, y, z)` convention and convert at the seam.
The meshes are deliberately rigid children of named transforms: authoritative
hands and equipment sockets can be driven directly without skinning corrections.
"""

import hashlib
import math
from pathlib import Path
import struct

import bpy
import numpy as np


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


def _verified_source(root, spec):
    path = Path(root) / spec["path"]
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise RuntimeError("combatant atlas SHA-256 differs from the manifest")
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise RuntimeError("combatant atlas is not a PNG with a leading IHDR")
    width, height = struct.unpack(">II", data[16:24])
    if width != spec["width"] or height != spec["height"]:
        raise RuntimeError("combatant atlas dimensions differ from the manifest")
    return bpy.data.images.load(str(path), check_existing=False)


def _packed_image(name, width, height, pixels, colour_space):
    image = bpy.data.images.new(name, width=width, height=height, alpha=True)
    image.colorspace_settings.name = colour_space
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.pack()
    return image


def _bake_texture_set(root, spec):
    source = _verified_source(root, spec)
    width = int(spec["embeddedWidth"])
    height = int(spec["embeddedHeight"])
    source.scale(width, height)
    albedo_pixels = np.asarray(source.pixels[:], dtype=np.float32).reshape((height, width, 4))
    # The generated studies are neutral source colour, not final lighting.
    # Grade their four declared material quadrants into a readable value ladder
    # before deriving normal/ORM so pale skin, black iron and leather do not
    # collapse into the same muddy midtone under the room key.
    scales = {
        "fighter": ((1.24, 1.25, 1.24), (0.72, 0.66, 0.62),
                    (0.76, 0.69, 0.61), (0.78, 0.70, 0.64)),
        "brute": ((0.74, 0.70, 0.61), (0.80, 0.72, 0.64),
                  (1.08, 1.03, 0.90), (0.70, 0.64, 0.56)),
        "equipment": ((1.22, 1.23, 1.20), (0.82, 0.83, 0.82),
                      (0.80, 0.72, 0.60), (0.68, 0.60, 0.52)),
    }[spec["set"]]
    lifts = {
        "fighter": ((0.045, 0.048, 0.050), (0.012, 0.008, 0.006),
                    (0.012, 0.008, 0.004), (0.018, 0.014, 0.010)),
        "brute": ((0.008, 0.006, 0.003), (0.020, 0.015, 0.010),
                  (0.020, 0.018, 0.012), (0.008, 0.005, 0.003)),
        "equipment": ((0.050, 0.052, 0.050), (0.025, 0.027, 0.027),
                      (0.010, 0.006, 0.003), (0.006, 0.004, 0.002)),
    }[spec["set"]]
    saturation = {
        "fighter": (0.82, 0.72, 0.70, 0.50),
        "brute": (0.64, 0.48, 0.68, 0.62),
        "equipment": (0.72, 0.68, 0.72, 0.68),
    }[spec["set"]]
    for quadrant, scale in enumerate(scales):
        x0 = width // 2 if quadrant % 2 else 0
        x1 = width if quadrant % 2 else width // 2
        y0 = height // 2 if quadrant < 2 else 0
        y1 = height if quadrant < 2 else height // 2
        graded = (albedo_pixels[y0:y1, x0:x1, :3] * np.asarray(scale) +
                  np.asarray(lifts[quadrant]))
        grey = (graded[:, :, :1] * 0.2126 + graded[:, :, 1:2] * 0.7152 +
                graded[:, :, 2:3] * 0.0722)
        albedo_pixels[y0:y1, x0:x1, :3] = np.clip(
            grey + (graded - grey) * saturation[quadrant], 0.0, 1.0)
    albedo = _packed_image(spec["set"] + "_albedo", width, height, albedo_pixels, "sRGB")

    luminance = (albedo_pixels[:, :, 0] * 0.2126 +
                 albedo_pixels[:, :, 1] * 0.7152 +
                 albedo_pixels[:, :, 2] * 0.0722)
    gradient_y, gradient_x = np.gradient(luminance)
    strength = 2.2
    normal_x = -gradient_x * strength
    normal_y = -gradient_y * strength
    normal_z = np.ones_like(luminance)
    length = np.sqrt(normal_x * normal_x + normal_y * normal_y + normal_z * normal_z)
    normal_pixels = np.empty_like(albedo_pixels)
    normal_pixels[:, :, 0] = normal_x / length * 0.5 + 0.5
    normal_pixels[:, :, 1] = normal_y / length * 0.5 + 0.5
    normal_pixels[:, :, 2] = normal_z / length * 0.5 + 0.5
    normal_pixels[:, :, 3] = 1.0
    normal = _packed_image(spec["set"] + "_normal", width, height, normal_pixels, "Non-Color")

    orm_pixels = np.empty_like(albedo_pixels)
    orm_pixels[:, :, 0] = np.clip(0.68 + luminance * 0.30, 0.0, 1.0)
    orm_pixels[:, :, 1] = np.clip(0.92 - luminance * 0.28, 0.46, 0.94)
    metallic = np.asarray([float(value) for value in spec["metallicQuadrants"]],
                          dtype=np.float32)
    half_x = width // 2
    half_y = height // 2
    orm_pixels[:half_y, :half_x, 2] = metallic[2]
    orm_pixels[:half_y, half_x:, 2] = metallic[3]
    orm_pixels[half_y:, :half_x, 2] = metallic[0]
    orm_pixels[half_y:, half_x:, 2] = metallic[1]
    orm_pixels[:, :, 3] = 1.0
    orm = _packed_image(spec["set"] + "_orm", width, height, orm_pixels, "Non-Color")
    bpy.data.images.remove(source)
    return {"albedo": albedo, "normal": normal, "orm": orm}


def build_combatant_materials(manifest, root):
    images = {spec["set"]: _bake_texture_set(root, spec) for spec in manifest["textures"]}
    result = {}
    for name in sorted(manifest["materials"]):
        spec = manifest["materials"][name]
        material = bpy.data.materials.new(name)
        colour = tuple(float(value) for value in spec["baseColor"])
        material.diffuse_color = colour
        material.metallic = float(spec["metallic"])
        material.roughness = float(spec["roughness"])
        material["atlas_quadrant"] = int(spec["atlasQuadrant"])
        material.use_nodes = True
        principled = material.node_tree.nodes.get("Principled BSDF")
        principled.inputs["Base Color"].default_value = colour
        principled.inputs["Metallic"].default_value = material.metallic
        principled.inputs["Roughness"].default_value = material.roughness
        texture_set = images[spec["textureSet"]]
        albedo = material.node_tree.nodes.new("ShaderNodeTexImage")
        albedo.name = name + "_albedo"
        albedo.label = f"{spec['textureSet']} albedo quadrant {spec['atlasQuadrant']}"
        albedo.image = texture_set["albedo"]
        material.node_tree.links.new(albedo.outputs["Color"], principled.inputs["Base Color"])
        normal_texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        normal_texture.name = name + "_normal"
        normal_texture.image = texture_set["normal"]
        normal_map = material.node_tree.nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 0.42
        material.node_tree.links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
        material.node_tree.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
        orm = material.node_tree.nodes.new("ShaderNodeTexImage")
        orm.name = name + "_orm"
        orm.image = texture_set["orm"]
        separate = material.node_tree.nodes.new("ShaderNodeSeparateColor")
        separate.mode = "RGB"
        material.node_tree.links.new(orm.outputs["Color"], separate.inputs["Color"])
        material.node_tree.links.new(separate.outputs["Green"], principled.inputs["Roughness"])
        material.node_tree.links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
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
    quadrant = int(material["atlas_quadrant"])
    origin_x = 0.04 + (0.5 if quadrant % 2 else 0)
    # Manifest quadrants are written in ordinary image order (top row first),
    # while UV V grows from the bottom. Keeping the flip here makes the atlas
    # declaration legible and prevents skin sampling armour or cloth.
    origin_y = 0.54 if quadrant < 2 else 0.04
    xs = [vertex.co.x for vertex in obj.data.vertices]
    ys = [vertex.co.y for vertex in obj.data.vertices]
    zs = [vertex.co.z for vertex in obj.data.vertices]
    x_span = max(max(xs) - min(xs), 1e-6)
    y_span = max(max(ys) - min(ys), 1e-6)
    z_span = max(max(zs) - min(zs), 1e-6)
    planar = y_span < max(x_span, z_span) * 0.45
    for polygon in obj.data.polygons:
        for loop_index in polygon.loop_indices:
            co = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co
            if planar:
                # A single front projection gives every bevel/side wall zero
                # UV area. Blender then exports a zero tangent for those faces,
                # which is invalid glTF and also erases their baked grain. Pick
                # the projection plane from each face's dominant normal.
                normal = polygon.normal
                if abs(normal.y) >= max(abs(normal.x), abs(normal.z)):
                    u = (co.x - min(xs)) / x_span
                    v = (co.z - min(zs)) / z_span
                elif abs(normal.x) >= abs(normal.z):
                    u = (co.y - min(ys)) / y_span
                    v = (co.z - min(zs)) / z_span
                else:
                    u = (co.x - min(xs)) / x_span
                    v = (co.y - min(ys)) / y_span
            else:
                u = (math.atan2(co.y, co.x) + math.pi) / (2 * math.pi)
                v = (co.z - min(zs)) / z_span
            uv.data[loop_index].uv = (origin_x + u * 0.42, origin_y + v * 0.42)
    # The glTF tangent exporter rejects n-gons before it triangulates its own
    # payload.  Apply the same deterministic triangulation to every LOD here so
    # all 135 normal-mapped primitives carry authored tangent space.
    triangulate = obj.modifiers.new("authored_tangent_triangles", "TRIANGULATE")
    triangulate.quad_method = "FIXED"
    triangulate.ngon_method = "BEAUTY"
    _select_only(obj)
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    modifier = obj.modifiers.new("semantic_armature", "ARMATURE")
    modifier.object = armature
    obj["semantic_mesh"] = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def _box(name, parent, material, size, position=(0, 0, 0), bevel=0.025, rotation=(0, 0, 0),
         bevel_segments=1):
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.object
    obj.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("worn_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return _finish_mesh(obj, name, parent, material, position, rotation)


def _cylinder(name, parent, material, radius, depth, position=(0, 0, 0), vertices=10,
              rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    return _finish_mesh(bpy.context.object, name, parent, material, position, rotation)


def _sphere(name, parent, material, radius, position=(0, 0, 0), scale=(1, 1, 1),
            subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius)
    obj = bpy.context.object
    obj.scale = (scale[0], scale[2], scale[1])
    _select_only(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish_mesh(obj, name, parent, material, position)


def _cone(name, parent, material, radius, depth, position=(0, 0, 0), vertices=8,
          rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=0, depth=depth)
    return _finish_mesh(bpy.context.object, name, parent, material, position, rotation)


def _mesh_from_faces(name, parent, material, vertices, faces, position=(0, 0, 0),
                     bevel=0.0, bevel_segments=1):
    mesh = bpy.data.meshes.new("mesh_" + name)
    mesh.from_pydata([_location(vertex) for vertex in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if bevel > 0:
        modifier = obj.modifiers.new("worn_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        _select_only(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    result = _finish_mesh(obj, name, parent, material, position)
    for polygon in result.data.polygons:
        polygon.use_smooth = False
    return result


def _frustum(name, parent, material, bottom, top, height, position=(0, 0, 0),
             bevel=0.0, bevel_segments=1):
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
    return _mesh_from_faces(name, parent, material, vertices, faces, position,
                            bevel, bevel_segments)


def _strap_harness(name, parent, material, position=(0, 0, 0), bevel=0.02,
                   bevel_segments=1):
    vertices = []
    faces = []
    straps = [
        ((-0.15, 0.10), 0.72, 0.058, -1.03),
        ((0.15, 0.10), 0.72, 0.058, 1.03),
        ((0.00, -0.09), 0.68, 0.075, 0.0),
    ]
    depth = 0.055
    for (centre_x, centre_y), length, width, angle in straps:
        along = (math.cos(angle), math.sin(angle))
        across = (-along[1], along[0])
        outline = []
        for sign_along, sign_across in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            outline.append((
                centre_x + along[0] * length * 0.5 * sign_along +
                across[0] * width * 0.5 * sign_across,
                centre_y + along[1] * length * 0.5 * sign_along +
                across[1] * width * 0.5 * sign_across,
            ))
        offset = len(vertices)
        vertices.extend([(x, y, -depth / 2) for x, y in outline])
        vertices.extend([(x, y, depth / 2) for x, y in outline])
        faces.extend([
            (offset, offset + 1, offset + 2, offset + 3),
            (offset + 7, offset + 6, offset + 5, offset + 4),
            (offset, offset + 4, offset + 5, offset + 1),
            (offset + 1, offset + 5, offset + 6, offset + 2),
            (offset + 2, offset + 6, offset + 7, offset + 3),
            (offset + 3, offset + 7, offset + 4, offset),
        ])
    return _mesh_from_faces(name, parent, material, vertices, faces, position,
                            bevel, bevel_segments)


def _extruded_profile(name, parent, material, points, thickness, position=(0, 0, 0),
                      bevel=0.0, bevel_segments=1):
    half = thickness / 2
    count = len(points)
    vertices = [(x, y, -half) for x, y in points] + [(x, y, half) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    return _mesh_from_faces(name, parent, material, vertices, faces, position,
                            bevel, bevel_segments)


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


def _anatomical_loft(name, parent, material, rings, vertices=16, position=(0, 0, 0),
                     bevel=0.0, bevel_segments=1):
    """Build a vertically sampled elliptical volume, optionally offset per ring.

    A circular cylinder with more sides is still a tube.  These rings carry the
    shoulder, knee, calf, ankle, cheek and jaw changes that must survive the
    game camera; the optional centre offsets let a limb bend without changing
    any authoritative bone or socket.
    """
    points = []
    for ring in rings:
        y, radius_x, radius_z = ring[:3]
        centre_x, centre_z = ring[3:] if len(ring) == 5 else (0.0, 0.0)
        points.extend((centre_x + radius_x * math.cos(index * 2 * math.pi / vertices),
                       y,
                       centre_z + radius_z * math.sin(index * 2 * math.pi / vertices))
                      for index in range(vertices))
    faces = [tuple(reversed(range(vertices))),
             tuple(range((len(rings) - 1) * vertices, len(rings) * vertices))]
    for ring_index in range(len(rings) - 1):
        start = ring_index * vertices
        following = start + vertices
        for index in range(vertices):
            next_index = (index + 1) % vertices
            faces.append((start + index, start + next_index,
                          following + next_index, following + index))
    return _mesh_from_faces(name, parent, material, points, faces, position,
                            bevel, bevel_segments)


def _curved_front_shell(name, parent, material, rings, thickness, columns=9,
                        position=(0, 0, 0), bevel=0.0, bevel_segments=1):
    """A convex front shell whose outline follows independently sized rows."""
    vertices = []
    for depth_offset in (0.0, thickness):
        for y, half_width, depth in rings:
            for column in range(columns):
                ratio = -1.0 + 2.0 * column / (columns - 1)
                curve = math.sqrt(max(0.0, 1.0 - ratio * ratio))
                vertices.append((half_width * ratio, y, -depth * curve + depth_offset))
    row_count = len(rings)
    layer_size = row_count * columns
    faces = []
    for layer in range(2):
        base = layer * layer_size
        for row in range(row_count - 1):
            for column in range(columns - 1):
                a = base + row * columns + column
                b = a + 1
                c = a + columns + 1
                d = a + columns
                faces.append((a, b, c, d) if layer == 0 else (d, c, b, a))
    for row in range(row_count - 1):
        for column in (0, columns - 1):
            front = row * columns + column
            next_front = front + columns
            back = front + layer_size
            next_back = next_front + layer_size
            faces.append((front, back, next_back, next_front))
    for row in (0, row_count - 1):
        start = row * columns
        for column in range(columns - 1):
            front = start + column
            following = front + 1
            back = front + layer_size
            back_following = following + layer_size
            faces.append((front, following, back_following, back))
    return _mesh_from_faces(name, parent, material, vertices, faces, position,
                            bevel, bevel_segments)


def _multi_extruded_profiles(name, parent, material, profiles, thickness,
                             position=(0, 0, 0), bevel=0.0, bevel_segments=1):
    """Combine several profile islands into one semantic mesh."""
    vertices = []
    faces = []
    half = thickness / 2
    for points in profiles:
        count = len(points)
        offset = len(vertices)
        vertices.extend((x, y, -half) for x, y in points)
        vertices.extend((x, y, half) for x, y in points)
        faces.append(tuple(offset + index for index in reversed(range(count))))
        faces.append(tuple(offset + count + index for index in range(count)))
        for index in range(count):
            following = (index + 1) % count
            faces.append((offset + index, offset + following,
                          offset + count + following, offset + count + index))
    return _mesh_from_faces(name, parent, material, vertices, faces, position,
                            bevel, bevel_segments)


def _irregular_loft(name, parent, material, rings, vertices=14, position=(0, 0, 0),
                    bevel=0.0, bevel_segments=1):
    """An asymmetric deterministic loft for hewn wood and other organic gear."""
    points = []
    for ring_index, ring in enumerate(rings):
        y, radius_x, radius_z = ring[:3]
        centre_x, centre_z = ring[3:] if len(ring) == 5 else (0.0, 0.0)
        for index in range(vertices):
            angle = index * 2 * math.pi / vertices
            wobble = 1.0 + 0.10 * math.sin(index * 5.0 + ring_index * 1.7)
            points.append((centre_x + radius_x * wobble * math.cos(angle), y,
                           centre_z + radius_z * wobble * math.sin(angle)))
    faces = [tuple(reversed(range(vertices))),
             tuple(range((len(rings) - 1) * vertices, len(rings) * vertices))]
    for ring_index in range(len(rings) - 1):
        start = ring_index * vertices
        following = start + vertices
        for index in range(vertices):
            next_index = (index + 1) % vertices
            faces.append((start + index, start + next_index,
                          following + next_index, following + index))
    return _mesh_from_faces(name, parent, material, points, faces, position,
                            bevel, bevel_segments)


def _join_semantic(name, parts):
    """Join modeled subcomponents while preserving one published mesh identity."""
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    result = parts[0]
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.join()
    result.name = name
    result.data.name = "mesh_" + name
    result["semantic_mesh"] = name
    return result


def _fingered_hand(name, parent, palm_material, detail, position=(0, 0, 0),
                   finger_material=None, scale=1.0):
    finger_material = finger_material or palm_material
    parts = [_anatomical_loft(
        name + "__palm", parent, palm_material,
        [(0.045 * scale, 0.090 * scale, 0.070 * scale),
         (-0.065 * scale, 0.105 * scale, 0.080 * scale),
         (-0.145 * scale, 0.085 * scale, 0.065 * scale)],
        max(10, detail["radial"] // 2), position, 0.004, detail["bevel"])]
    for index, x in enumerate((-0.060, -0.020, 0.020, 0.060)):
        parts.append(_anatomical_loft(
            f"{name}__finger_{index}", parent, finger_material,
            [(-0.12 * scale, 0.018 * scale, 0.022 * scale),
             (-0.225 * scale, 0.016 * scale, 0.019 * scale)],
            max(8, detail["radial"] // 3),
            (position[0] + x * scale, position[1], position[2] - 0.018 * scale),
            0.002, detail["bevel"]))
    parts.append(_anatomical_loft(
        name + "__thumb", parent, finger_material,
        [(0.005, 0.030 * scale, 0.025 * scale),
         (-0.105 * scale, 0.026 * scale, 0.022 * scale, -0.035 * scale, 0.0)],
        max(8, detail["radial"] // 3),
        (position[0] + 0.095 * scale, position[1] - 0.025 * scale, position[2]),
        0.002, detail["bevel"]))
    return _join_semantic(name, parts)


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


LOD_DETAIL = {
    "high": {"radial": 48, "sphere": 4, "bevel": 4},
    "mid": {"radial": 24, "sphere": 3, "bevel": 2},
    "low": {"radial": 7, "sphere": 1, "bevel": 1},
}


def _fighter(manifest, materials, nodes=None, lod="high"):
    prefix = "FIGHTER_"
    if nodes is None:
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
    detail = LOD_DETAIL[lod]
    name = lambda semantic: prefix + "lod_" + lod + "_mesh_" + semantic
    mesh = {}
    add = lambda obj: mesh.setdefault(obj.name, obj)
    add(_anatomical_loft(name("pelvis_skirt"), nodes["pelvis"], materials["fighter_burgundy"],
                         [(-0.28, 0.26, 0.19), (-0.14, 0.25, 0.18),
                          (0.02, 0.22, 0.16), (0.17, 0.21, 0.15)],
                         detail["radial"], (0, 0, 0), 0.012, detail["bevel"]))
    add(_cylinder(name("pelvis_belt"), nodes["pelvis"], materials["fighter_leather"],
                  0.265, 0.105, (0, 0.12, 0), vertices=detail["radial"]))
    add(_anatomical_loft(name("torso_cuirass"), nodes["torso"],
                         materials["fighter_dark_steel"],
                         [(-0.30, 0.23, 0.16), (-0.15, 0.27, 0.18),
                          (0.04, 0.30, 0.20), (0.23, 0.34, 0.22),
                          (0.38, 0.27, 0.18)], detail["radial"],
                         (0, 0.12, 0), 0.012, detail["bevel"]))
    breastplate_parts = [_curved_front_shell(
        name("torso_breastplate") + "__plate", nodes["torso"], materials["fighter_steel"],
        [(-0.20, 0.18, 0.175), (-0.06, 0.25, 0.205),
         (0.13, 0.29, 0.225), (0.28, 0.26, 0.205),
         (0.39, 0.13, 0.155), (0.45, 0.10, 0.13)],
        0.032, max(7, detail["radial"] // 3), (0, 0.10, 0),
        0.012, detail["bevel"])]
    if lod != "low":
        for band_index, (band_y, width, depth) in enumerate(
                ((-0.08, 0.225, 0.222), (0.07, 0.265, 0.238), (0.36, 0.145, 0.175))):
            breastplate_parts.append(_curved_front_shell(
                name("torso_breastplate") + f"__edge_{band_index}", nodes["torso"],
                materials["fighter_steel"],
                [(band_y - 0.018, width, depth), (band_y + 0.018, width, depth)],
                0.020, max(7, detail["radial"] // 3), (0, 0.10, -0.020),
                0.004, detail["bevel"]))
        for rivet_index, rivet_x in enumerate((-0.17, 0.17)):
            breastplate_parts.append(_sphere(
                name("torso_breastplate") + f"__rivet_{rivet_index}", nodes["torso"],
                materials["fighter_steel"], 0.022, (rivet_x, 0.35, -0.225),
                scale=(1.0, 1.0, 0.45), subdivisions=max(1, detail["sphere"] - 2)))
    add(_join_semantic(name("torso_breastplate"), breastplate_parts))
    add(_extruded_profile(name("torso_cape"), nodes["torso"], materials["fighter_burgundy"],
                          [(-0.24, 0.31), (0.24, 0.31), (0.20, -0.36), (-0.20, -0.36)],
                          0.04, (0, -0.03, 0.20), 0.012, detail["bevel"]))
    face_parts = [_anatomical_loft(
        name("head_face") + "__volume", nodes["head"], materials["fighter_skin"],
        [(-0.10, 0.055, 0.045), (-0.055, 0.075, 0.060),
         (0.015, 0.086, 0.066), (0.075, 0.076, 0.058),
         (0.11, 0.058, 0.046)], max(10, detail["radial"] // 2),
        (0, 0.10, -0.195), 0.005, detail["bevel"]),
        _extruded_profile(name("head_face") + "__nose", nodes["head"],
                          materials["fighter_skin"],
                          [(-0.020, 0.035), (0.020, 0.035), (0.025, -0.025),
                           (0, -0.055), (-0.025, -0.025)],
                          0.070, (0, 0.115, -0.255), 0.004, detail["bevel"])]
    if lod != "low":
        for eye_x in (-0.034, 0.034):
            face_parts.append(_sphere(name("head_face") + f"__eye_{eye_x}", nodes["head"],
                                      materials["fighter_skin"], 0.012,
                                      (eye_x, 0.17, -0.258), scale=(1.0, 0.65, 0.45),
                                      subdivisions=max(1, detail["sphere"] - 2)))
        for ear_x in (-0.073, 0.073):
            face_parts.append(_sphere(name("head_face") + f"__ear_{ear_x}", nodes["head"],
                                      materials["fighter_skin"], 0.018,
                                      (ear_x, 0.13, -0.195), scale=(0.55, 1.0, 0.70),
                                      subdivisions=max(1, detail["sphere"] - 2)))
    add(_join_semantic(name("head_face"), face_parts))
    add(_anatomical_loft(name("head_helmet"), nodes["head"], materials["fighter_steel"],
                         [(-0.13, 0.14, 0.14), (0.02, 0.205, 0.19),
                          (0.17, 0.215, 0.20), (0.31, 0.17, 0.165),
                          (0.39, 0.06, 0.06)], detail["radial"],
                         (0, 0.02, 0.0), 0.006, detail["bevel"]))
    add(_extruded_profile(name("head_visor"), nodes["head"],
                          materials["fighter_dark_steel"],
                          [(-0.18, 0.06), (-0.050, 0.06), (-0.035, -0.02),
                           (-0.025, -0.15), (0, -0.185), (0.025, -0.15),
                           (0.035, -0.02), (0.050, 0.06), (0.18, 0.06),
                           (0.17, 0.12), (-0.17, 0.12)],
                          0.042, (0, 0.20, -0.235), 0.009, detail["bevel"]))
    add(_extruded_profile(name("head_plume"), nodes["head"], materials["fighter_burgundy"],
                          [(-0.045, -0.10), (-0.05, 0.13), (0, 0.27), (0.05, 0.13),
                           (0.045, -0.10)], 0.19, (0, 0.37, 0.02),
                          0.018, detail["bevel"]))
    for side in ("left", "right"):
        node = nodes[f"arm_{side}"]
        add(_anatomical_loft(name(f"arm_{side}"), node, materials["fighter_burgundy"],
                             [(0.09, 0.15, 0.13), (-0.06, 0.155, 0.135),
                              (-0.22, 0.12, 0.105), (-0.36, 0.095, 0.085),
                              (-0.42, 0.085, 0.075)], detail["radial"]))
        add(_anatomical_loft(name(f"forearm_{side}"), nodes[f"hand_{side}"],
                             materials["fighter_dark_steel"],
                             [(0.35, 0.09, 0.085), (0.23, 0.14, 0.115),
                              (0.08, 0.12, 0.10), (-0.04, 0.082, 0.075)],
                             detail["radial"], bevel=0.006,
                             bevel_segments=detail["bevel"]))
        add(_anatomical_loft(name(f"pauldron_{side}"), node, materials["fighter_steel"],
                             [(-0.11, 0.16, 0.14), (0.01, 0.23, 0.19),
                              (0.14, 0.19, 0.16), (0.21, 0.08, 0.08)],
                             detail["radial"], (0, 0.01, 0), 0.008,
                             detail["bevel"]))
        if lod == "low":
            add(_anatomical_loft(name(f"hand_{side}"), nodes[f"hand_{side}"],
                                 materials["fighter_steel"],
                                 [(0.04, 0.075, 0.060), (-0.14, 0.082, 0.065)],
                                 detail["radial"], (0, 0.02, -0.02)))
        else:
            add(_fingered_hand(name(f"hand_{side}"), nodes[f"hand_{side}"],
                               materials["fighter_steel"], detail,
                               (0, 0.02, -0.02), materials["fighter_steel"], 0.82))
    for side, x in (("left", -0.14), ("right", 0.14)):
        add(_anatomical_loft(name(f"leg_{side}"), nodes["pelvis"],
                             materials["fighter_dark_steel"],
                             [(-0.10, 0.14, 0.12), (-0.25, 0.155, 0.135),
                              (-0.38, 0.13, 0.115), (-0.53, 0.115, 0.10),
                              (-0.67, 0.09, 0.082), (-0.76, 0.082, 0.075)],
                             detail["radial"], position=(x, 0, 0)))
        add(_anatomical_loft(name(f"boot_{side}"), nodes["pelvis"],
                             materials["fighter_leather"],
                             [(-0.87, 0.10, 0.16, 0, -0.07),
                              (-0.79, 0.13, 0.18, 0, -0.055),
                              (-0.68, 0.12, 0.13, 0, -0.015),
                              (-0.61, 0.09, 0.095, 0, 0.0)], detail["radial"],
                             position=(x, 0, 0), bevel=0.008,
                             bevel_segments=detail["bevel"]))
    shield_outer = [(-0.52, 0.018, 0.04), (-0.34, 0.24, 0.075),
                    (-0.08, 0.35, 0.10), (0.20, 0.37, 0.11),
                    (0.38, 0.10, 0.075), (0.43, 0.035, 0.04)]
    shield_inner = [(-0.47, 0.012, 0.055), (-0.30, 0.205, 0.088),
                    (-0.07, 0.305, 0.112), (0.18, 0.325, 0.12),
                    (0.34, 0.08, 0.082), (0.37, 0.028, 0.05)]
    shield_parts = [
        _curved_front_shell(name("shield") + "__rim", nodes["socket_shield"],
                            materials["equipment_dark_steel"], shield_outer, 0.055,
                            max(7, detail["radial"] // 3), bevel=0.024,
                            bevel_segments=detail["bevel"]),
    ]
    if lod != "low":
        shield_parts.extend([
            _curved_front_shell(name("shield") + "__field", nodes["socket_shield"],
                                materials["equipment_dark_steel"], shield_inner, 0.035,
                                max(7, detail["radial"] // 3), (0, 0, -0.035), 0.012,
                                detail["bevel"]),
        ])
    add(_join_semantic(name("shield"), shield_parts))
    sword_parts = [
        _extruded_profile(name("sword") + "__blade", nodes["socket_weapon_right"],
                          materials["equipment_steel"],
                          [(-0.052, -0.12), (-0.050, -0.60), (0, -0.76),
                           (0.050, -0.60), (0.052, -0.12)], 0.045,
                          bevel=0.010, bevel_segments=detail["bevel"]),
    ]
    if lod != "low":
        sword_parts.extend([
        _extruded_profile(name("sword") + "__guard", nodes["socket_weapon_right"],
                          materials["equipment_steel"],
                          [(-0.20, -0.08), (-0.19, -0.14), (-0.055, -0.16),
                           (0, -0.12), (0.055, -0.16), (0.19, -0.14),
                           (0.20, -0.08), (0.055, -0.105), (-0.055, -0.105)],
                          0.075, bevel=0.012, bevel_segments=detail["bevel"]),
        _anatomical_loft(name("sword") + "__grip", nodes["socket_weapon_right"],
                         materials["equipment_steel"],
                         [(0.10, 0.048, 0.043), (-0.08, 0.042, 0.038)],
                         max(10, detail["radial"] // 3)),
        _sphere(name("sword") + "__pommel", nodes["socket_weapon_right"],
                materials["equipment_steel"], 0.058, (0, 0.12, 0),
                scale=(1.0, 0.78, 0.78), subdivisions=max(1, detail["sphere"] - 1)),
        ])
    add(_join_semantic(name("sword"), sword_parts))
    return nodes, mesh


def _brute(manifest, materials, nodes=None, lod="high"):
    prefix = "BRUTE_"
    if nodes is None:
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
    detail = LOD_DETAIL[lod]
    name = lambda semantic: prefix + "lod_" + lod + "_mesh_" + semantic
    mesh = {}
    add = lambda obj: mesh.setdefault(obj.name, obj)
    add(_anatomical_loft(name("pelvis_kilt"), nodes["pelvis"], materials["brute_hide"],
                         [(-0.30, 0.35, 0.26), (-0.12, 0.34, 0.25),
                          (0.06, 0.30, 0.22), (0.19, 0.28, 0.20)],
                         detail["radial"], bevel=0.014,
                         bevel_segments=detail["bevel"]))
    add(_cylinder(name("pelvis_belt"), nodes["pelvis"], materials["brute_leather"],
                  0.335, 0.135, (0, 0.17, 0), vertices=detail["radial"]))
    add(_anatomical_loft(name("torso_hide"), nodes["torso"], materials["brute_skin"],
                         [(-0.34, 0.34, 0.23), (-0.17, 0.39, 0.26),
                          (0.04, 0.44, 0.29), (0.25, 0.48, 0.31),
                          (0.43, 0.45, 0.29), (0.53, 0.34, 0.23)],
                         detail["radial"], (0, 0.18, 0), 0.018,
                         detail["bevel"]))
    add(_strap_harness(name("torso_mantle"), nodes["torso"], materials["brute_leather"],
                       (0, 0.43, -0.315), 0.022, detail["bevel"]))
    add(_cylinder(name("torso_buckle"), nodes["torso"], materials["brute_bone"],
                  0.095, 0.045, (0, -0.05, -0.29), vertices=detail["radial"],
                  rotation=(1.57079632679, 0, 0)))
    add(_anatomical_loft(name("head"), nodes["head"], materials["brute_skin"],
                         [(-0.19, 0.14, 0.13), (-0.06, 0.23, 0.195),
                          (0.12, 0.255, 0.215), (0.29, 0.22, 0.19),
                          (0.40, 0.12, 0.11), (0.45, 0.04, 0.04)],
                         detail["radial"], (0, 0.07, -0.03), 0.009,
                         detail["bevel"]))
    # The upper cap and narrow nose guard leave a real recessed eye band and
    # exposed cheek/jaw volume instead of painting a face onto a black sphere.
    brow_parts = [_multi_extruded_profiles(
        name("head_brow") + "__cap_guard", nodes["head"], materials["equipment_dark_steel"],
        [[(-0.22, 0.10), (-0.20, 0.27), (0, 0.38), (0.20, 0.27),
          (0.22, 0.10), (0.07, 0.085), (-0.07, 0.085)],
         [(-0.030, 0.095), (0.030, 0.095), (0.038, -0.13),
          (0, -0.18), (-0.038, -0.13)]],
        0.065, (0, 0.09, -0.235), 0.012, detail["bevel"])]
    if lod != "low":
        for rivet_index, rivet_x in enumerate((-0.145, 0.145)):
            brow_parts.append(_sphere(
                name("head_brow") + f"__rivet_{rivet_index}", nodes["head"],
                materials["equipment_dark_steel"], 0.021, (rivet_x, 0.225, -0.285),
                scale=(1.0, 1.0, 0.45), subdivisions=max(1, detail["sphere"] - 2)))
    add(_join_semantic(name("head_brow"), brow_parts))
    for side, x, roll in (("left", -0.20, -0.42), ("right", 0.20, 0.42)):
        add(_cone(name(f"horn_{side}"), nodes["head"], materials["brute_bone"],
                  0.095, 0.40, (x, 0.32, 0), vertices=detail["radial"],
                  rotation=(0, 0, roll)))
        add(_cone(name(f"tusk_{side}"), nodes["head"], materials["brute_bone"],
                  0.038, 0.17, (x * 0.45, 0.00, -0.23), vertices=max(8, detail["radial"] // 2),
                  rotation=(0, 0, 3.14159265359)))
    for side in ("left", "right"):
        add(_anatomical_loft(name(f"arm_{side}"), nodes[f"arm_{side}"],
                             materials["brute_skin"],
                             [(0.10, 0.23, 0.20), (-0.08, 0.245, 0.205),
                              (-0.25, 0.20, 0.17), (-0.40, 0.155, 0.135),
                              (-0.53, 0.135, 0.12)], detail["radial"]))
        add(_anatomical_loft(name(f"forearm_{side}"), nodes[f"hand_{side}"],
                             materials["brute_hide"],
                             [(0.44, 0.14, 0.13), (0.30, 0.19, 0.16),
                              (0.15, 0.205, 0.17), (0.02, 0.16, 0.14),
                              (-0.06, 0.13, 0.115)], detail["radial"],
                             bevel=0.008, bevel_segments=detail["bevel"]))
        if lod == "low":
            add(_anatomical_loft(name(f"hand_{side}"), nodes[f"hand_{side}"],
                                 materials["brute_skin"],
                                 [(0.05, 0.13, 0.11), (-0.21, 0.14, 0.12)],
                                 detail["radial"], (0, 0.02, -0.03)))
        else:
            add(_fingered_hand(name(f"hand_{side}"), nodes[f"hand_{side}"],
                               materials["brute_skin"], detail, (0, 0.02, -0.03),
                               materials["brute_skin"], 1.18))
    for side, x in (("left", -0.18), ("right", 0.18)):
        add(_anatomical_loft(name(f"leg_{side}"), nodes["pelvis"],
                             materials["brute_skin"],
                             [(-0.13, 0.185, 0.16), (-0.30, 0.22, 0.19),
                              (-0.46, 0.18, 0.155), (-0.61, 0.16, 0.14),
                              (-0.76, 0.13, 0.115), (-0.88, 0.115, 0.10)],
                             detail["radial"], position=(x, 0, 0)))
        add(_anatomical_loft(name(f"boot_{side}"), nodes["pelvis"],
                             materials["brute_hide"],
                             [(-1.01, 0.13, 0.20, 0, -0.09),
                              (-0.92, 0.17, 0.23, 0, -0.07),
                              (-0.80, 0.16, 0.17, 0, -0.02),
                              (-0.70, 0.125, 0.125, 0, 0.0)],
                             detail["radial"], position=(x, 0, 0),
                             bevel=0.01, bevel_segments=detail["bevel"]))
    club_parts = [_irregular_loft(
        name("club") + "__wood", nodes["socket_weapon_right"], materials["equipment_hide"],
        [(0.04, 0.075, 0.07), (-0.54, 0.085, 0.08),
         (-0.66, 0.16, 0.13, -0.025, 0.015),
         (-0.80, 0.25, 0.18, 0.035, -0.02),
         (-0.95, 0.22, 0.165, -0.025, 0.025),
         (-1.09, 0.13, 0.11, 0.02, 0.0)],
        max(10, detail["radial"] // 2), bevel=0.008,
        bevel_segments=detail["bevel"])]
    if lod != "low":
        for band_index, (band_y, band_radius) in enumerate(((-0.75, 0.235), (-0.96, 0.215))):
            club_parts.append(_cylinder(
                name("club") + f"__iron_band_{band_index}", nodes["socket_weapon_right"],
                materials["equipment_hide"], band_radius, 0.055,
                (0, band_y, 0), vertices=detail["radial"]))
    add(_join_semantic(name("club"), club_parts))
    return nodes, mesh


def _clip(armature, targets, name, samples):
    armature.animation_data_create()
    action = bpy.data.actions.new(name)
    armature.animation_data.action = action
    for target in targets.values():
        target.rotation_mode = "XYZ"
    for frame, poses in samples:
        for semantic, (location, rotation) in poses.items():
            target = targets[semantic]
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
    targets = {semantic: armature.pose.bones[prefix + semantic]
               for semantic in ("pelvis", "torso", "head")}
    base = (0, 0, 0)
    neutral = (base, base)
    pose = lambda pelvis=neutral, torso=neutral, head=neutral: {
        "pelvis": pelvis, "torso": torso, "head": head,
    }
    _clip(armature, targets, prefix + "idle", [
        (1, pose((base, (0, 0, -0.012)))),
        (16, pose(((0, 0.016, 0), (0, 0, 0.012)),
                  (base, (0.008, 0, 0.010)), (base, (-0.006, 0, -0.008)))),
        (31, pose((base, (0, 0, -0.012)))),
    ])
    _clip(armature, targets, prefix + "walk", [
        (1, pose((base, (0.028, 0, -0.052)), (base, (0, 0.020, 0.020)),
                 (base, (0, -0.012, -0.012)))),
        (8, pose(((0, 0.040, 0), (-0.028, 0, 0.052)), (base, (0, -0.020, -0.020)),
                 (base, (0, 0.012, 0.012)))),
        (16, pose((base, (0.028, 0, -0.052)), (base, (0, 0.020, 0.020)),
                  (base, (0, -0.012, -0.012)))),
    ])
    _clip(armature, targets, prefix + "stagger", [
        (1, pose((base, base))),
        (6, pose(((0, -0.06, 0.10), (0.14, 0, 0.20)),
                 (base, (-0.16, 0.04, -0.12)), (base, (0.10, -0.04, 0.08)))),
        (14, pose((base, base))),
    ])
    _clip(armature, targets, prefix + "fall", [
        (1, pose((base, base))),
        (16, pose(((0, -0.34, 0.28), (1.30, 0, 0.10)),
                  (base, (0.20, 0, -0.08)), (base, (-0.12, 0, 0.04)))),
        (31, pose(((0, -0.48, 0.38), (1.57079632679, 0, 0.10)),
                  (base, (0.26, 0, -0.10)), (base, (-0.14, 0, 0.05)))),
    ])


def build_combatants(manifest, materials):
    fighter_nodes = None
    brute_nodes = None
    fighter_meshes = {}
    brute_meshes = {}
    for lod in ("high", "mid", "low"):
        fighter_nodes, meshes = _fighter(manifest, materials, fighter_nodes, lod)
        fighter_meshes.update(meshes)
        brute_nodes, meshes = _brute(manifest, materials, brute_nodes, lod)
        brute_meshes.update(meshes)
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
