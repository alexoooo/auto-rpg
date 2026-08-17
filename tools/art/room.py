"""Geometry recipe for the representative room slice.

Blender is Z-up internally. Helpers accept the manifest's glTF `(x, y, z)` order
and map it to Blender `(x, -z, y)` so exported bounds retain the manifest axes.
"""

import hashlib
import random

import bpy


def _select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _numbers(values):
    return [float(value) for value in values]


def _dimensions(node):
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    return [maximum[index] - minimum[index] for index in range(3)]


def _finish(obj, name, material, dimensions):
    obj.name = name
    obj.data.name = f"mesh_{name}"
    obj.data.materials.append(material)
    _select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj["semantic_name"] = name
    obj["dimensions_m"] = dimensions
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def _palette(styling, name):
    return [float(value) for value in styling["palette"][name]]


def _styled_colour(styling, palette_name, semantic_name, polygon_index):
    colour = _palette(styling, palette_name)
    if palette_name == "neutral":
        return colour
    token = f'{semantic_name}:{polygon_index}'.encode("ascii")
    bucket = hashlib.sha256(token).digest()[0] % 9 - 4
    multiplier = 1 + bucket * float(styling["variation"]) / 4
    return [min(1, max(0, channel * multiplier)) for channel in colour[:3]] + [colour[3]]


def _apply_styling(obj, semantic_name, material_role, styling):
    mesh = obj.data
    colour = mesh.color_attributes.new(
        name=styling["attribute"], type="BYTE_COLOR", domain="CORNER",
    )
    mesh.color_attributes.active_color = colour
    mesh.color_attributes.active = colour
    for polygon in mesh.polygons:
        if semantic_name == "ROOM_prop_barrel" and polygon.normal.z > 0.5:
            palette_name = "woodEnd"
        elif material_role == "wood_current":
            palette_name = "woodTop" if polygon.normal.z > 0.5 else "woodSide"
        elif material_role not in ("floor_current", "stone_current"):
            palette_name = "neutral"
        elif semantic_name == "ROOM_floor_a":
            palette_name = "floorA" if polygon.normal.z > 0.5 else "floorEdge"
        elif semantic_name == "ROOM_floor_b":
            palette_name = "floorB" if polygon.normal.z > 0.5 else "floorEdge"
        elif semantic_name.startswith("ROOM_wall_") or semantic_name == "ROOM_door_frame":
            palette_name = "wallTop" if polygon.normal.z > 0.5 else "wallSide"
        else:
            palette_name = "stoneDetail"
        style_index = polygon.index // 6 if (semantic_name.startswith("ROOM_wall_") or
                                               semantic_name == "ROOM_door_frame") else polygon.index
        value = _styled_colour(styling, palette_name, semantic_name, style_index)
        for loop_index in polygon.loop_indices:
            colour.data[loop_index].color = value


def _box(name, node, material, centre_x=None, centre_z=None):
    width, height, depth = _dimensions(node)
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    centre_x = (minimum[0] + maximum[0]) / 2 if centre_x is None else centre_x
    centre_z = (minimum[2] + maximum[2]) / 2 if centre_z is None else centre_z
    centre_y = (minimum[1] + maximum[1]) / 2
    bpy.ops.mesh.primitive_cube_add(location=(centre_x, -centre_z, centre_y))
    obj = bpy.context.object
    obj.scale = (width / 2, depth / 2, height / 2)
    return _finish(obj, name, material, [width, height, depth])


def _join_boxes(name, node, material, boxes):
    parts = []
    for index, (size, centre) in enumerate(boxes):
        width, height, depth = size
        x, y, z = centre
        bpy.ops.mesh.primitive_cube_add(location=(x, -z, y))
        part = bpy.context.object
        part.name = f"{name}_part_{index}"
        part.scale = (width / 2, depth / 2, height / 2)
        _select_only(part)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(part)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    return _finish(parts[0], name, material, _dimensions(node))


def _barrel(name, node, material):
    width, height, _depth = _dimensions(node)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=width / 2, depth=height,
                                       location=(0, 0, height / 2))
    return _finish(bpy.context.object, name, material, [width, height, _depth])


def _irregular_flagstone(name, node, material, seed):
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    width = maximum[0] - minimum[0]
    depth = maximum[2] - minimum[2]
    height = maximum[1] - minimum[1]
    randomizer = random.Random(seed)
    inset = [0.055 + randomizer.random() * 0.035 for _ in range(8)]
    outline = [
        (minimum[0] + inset[0], minimum[2]), (maximum[0] - inset[1], minimum[2]),
        (maximum[0], minimum[2] + inset[2]), (maximum[0], maximum[2] - inset[3]),
        (maximum[0] - inset[4], maximum[2]), (minimum[0] + inset[5], maximum[2]),
        (minimum[0], maximum[2] - inset[6]), (minimum[0], minimum[2] + inset[7]),
    ]
    vertices = [(x, -z, 0) for x, z in outline] + [(x, -z, height) for x, z in outline]
    faces = [tuple(range(8)), tuple(reversed(range(8, 16)))]
    for index in range(8):
        following = (index + 1) % 8
        faces.append((index, following, following + 8, index + 8))
    mesh = bpy.data.meshes.new(f"mesh_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(verbose=False)
    mesh.update(calc_edges=True)
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = ((vertex.x - minimum[0]) / width, (-vertex.y - minimum[2]) / depth)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return _finish(obj, name, material, [width, height, depth])


def _coursed_run(boxes, minimum, maximum, run_axis, seed, courses=4, counts=(4, 5),
                 side_inset=0.015):
    """Append fitted masonry blocks without moving the semantic collision hull.

    The small empty seams are visible mortar lines. Every run still reaches its
    declared extrema, so presentation detail cannot become a second placement
    contract hidden inside the mesh.
    """
    randomizer = random.Random(seed)
    other_axis = 2 if run_axis == 0 else 0
    run_min, run_max = minimum[run_axis], maximum[run_axis]
    other_min, other_max = minimum[other_axis], maximum[other_axis]
    course_height = (maximum[1] - minimum[1]) / courses
    horizontal_gap = min(0.016, (run_max - run_min) / 40)
    vertical_gap = min(0.014, course_height / 10)
    for course in range(courses):
        count = counts[course % len(counts)]
        weights = [0.84 + randomizer.random() * 0.32 for _ in range(count)]
        weight_total = sum(weights)
        boundaries = [run_min]
        consumed = 0
        for weight in weights[:-1]:
            consumed += weight
            boundaries.append(run_min + (run_max - run_min) * consumed / weight_total)
        boundaries.append(run_max)
        low_y = minimum[1] + course * course_height + (vertical_gap / 2 if course else 0)
        high_y = minimum[1] + (course + 1) * course_height - (
            vertical_gap / 2 if course + 1 < courses else 0
        )
        for index in range(count):
            low_run = boundaries[index] + (horizontal_gap / 2 if index else 0)
            high_run = boundaries[index + 1] - (horizontal_gap / 2 if index + 1 < count else 0)
            inset_low = 0 if course == 0 and index == 0 else randomizer.random() * side_inset
            inset_high = 0 if course == 0 and index == 0 else randomizer.random() * side_inset
            lows = [minimum[0], low_y, minimum[2]]
            highs = [maximum[0], high_y, maximum[2]]
            lows[run_axis], highs[run_axis] = low_run, high_run
            lows[other_axis], highs[other_axis] = other_min + inset_low, other_max - inset_high
            size = tuple(highs[axis] - lows[axis] for axis in range(3))
            centre = tuple((lows[axis] + highs[axis]) / 2 for axis in range(3))
            boxes.append((size, centre))


def _junction_wall(name, node, material, seed, directions):
    """Build one joined centreline topology from a core and cardinal arms.

    Each arm starts at the core face and reaches the exact tile edge. The arm
    calls have no transverse inset, so coursing may articulate the silhouette
    without opening a light leak at a corner or tee. Local direction names use
    the exported ground plane: +X east and +Z south.
    """
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    low_y, high_y = minimum[1], maximum[1]
    half = 0.09
    boxes = []
    _coursed_run(
        boxes, [-half, low_y, -half], [half, high_y, half], 0,
        seed ^ 0xC0DE, counts=(1,), side_inset=0,
    )
    arms = {
        "E": ([half, low_y, -half], [maximum[0], high_y, half], 0, 0xE001),
        "W": ([minimum[0], low_y, -half], [-half, high_y, half], 0, 0xE002),
        "S": ([-half, low_y, half], [half, high_y, maximum[2]], 2, 0xE003),
        "N": ([-half, low_y, minimum[2]], [half, high_y, -half], 2, 0xE004),
    }
    for direction in directions:
        low, high, axis, salt = arms[direction]
        _coursed_run(
            boxes, low, high, axis, seed ^ salt, counts=(2, 3), side_inset=0,
        )
    return _join_boxes(name, node, material, boxes)


def _door_frame(name, node, material, seed):
    boxes = []
    _coursed_run(boxes, [-0.5, 0, -0.09], [-0.36, 0.78, 0.09], 0, seed,
                 counts=(1,), courses=4)
    _coursed_run(boxes, [0.36, 0, -0.09], [0.5, 0.78, 0.09], 0, seed ^ 0xD001,
                 counts=(1,), courses=4)
    _coursed_run(boxes, [-0.5, 0.78, -0.09], [0.5, 0.92, 0.09], 0, seed ^ 0xD002,
                 counts=(5,), courses=1)
    return _join_boxes(name, node, material, boxes)


def _door_leaf(name, node, material):
    width, height, depth = _dimensions(node)
    bpy.ops.mesh.primitive_cube_add(location=(width / 2, 0, height / 2))
    obj = bpy.context.object
    obj.scale = (width / 2, depth / 2, height / 2)
    return _finish(obj, name, material, [width, height, depth])


def build_room(manifest, materials):
    nodes = {piece["node"]: piece for piece in manifest["pieces"]}
    meshes = {}
    for name in sorted(nodes):
        node = nodes[name]
        material = materials[node["materialRole"]]
        if name == "ROOM_floor_a":
            obj = _irregular_flagstone(name, node, material, manifest["generatorSeed"] ^ 0xA1)
        elif name == "ROOM_floor_b":
            obj = _irregular_flagstone(name, node, material, manifest["generatorSeed"] ^ 0xB2)
        elif name == "ROOM_wall_straight":
            obj = _junction_wall(name, node, material, manifest["generatorSeed"] ^ 0x571A,
                                 ("E", "W"))
        elif name == "ROOM_wall_inside":
            obj = _junction_wall(name, node, material, manifest["generatorSeed"] ^ 0x1A51,
                                 ("E", "S"))
        elif name == "ROOM_wall_outside":
            obj = _junction_wall(name, node, material, manifest["generatorSeed"] ^ 0x0A75,
                                 ("E", "S", "W"))
        elif name == "ROOM_wall_end":
            obj = _junction_wall(name, node, material, manifest["generatorSeed"] ^ 0xE0D0,
                                 ("E",))
        elif name == "ROOM_door_frame":
            obj = _door_frame(name, node, material, manifest["generatorSeed"] ^ 0xD00F)
        elif name == "ROOM_door_leaf":
            obj = _door_leaf(name, node, material)
        elif name == "ROOM_prop_barrel":
            obj = _barrel(name, node, material)
        elif name == "ROOM_torch_bracket":
            obj = _box(name, node, material, centre_z=-0.07)
        else:
            obj = _box(name, node, material)
        _apply_styling(obj, name, node["materialRole"], manifest["styling"])
        meshes[name] = obj

    bracket = nodes["ROOM_torch_bracket"]
    socket_spec = bracket["socket"]
    socket = bpy.data.objects.new(socket_spec["name"], None)
    socket.empty_display_type = "PLAIN_AXES"
    tx, ty, tz = _numbers(socket_spec["translation"])
    socket.location = (tx, -tz, ty)
    socket["semantic_name"] = socket_spec["name"]
    bpy.context.scene.collection.objects.link(socket)
    socket.parent = meshes[bracket["node"]]
    return meshes, socket
