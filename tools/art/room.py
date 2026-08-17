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


def _planar_uv(obj, repeat_u=1):
    """Give joined architectural boxes one tangent frame per physical plane.

    Blender's per-cube default islands mirror alternate triangles after boxes
    are joined. That was invisible under diffuse-only paint, but a normal map
    turned each quad into a light/dark chevron. World-scale planar projection
    keeps brush and masonry frequency continuous through every triangulation.
    """
    mesh = obj.data
    while len(mesh.uv_layers):
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv = mesh.uv_layers.new(name="UVMap")
    low_x = min(vertex.co.x for vertex in mesh.vertices)
    high_x = max(vertex.co.x for vertex in mesh.vertices)
    low_y = min(vertex.co.y for vertex in mesh.vertices)
    high_y = max(vertex.co.y for vertex in mesh.vertices)
    low_z = min(vertex.co.z for vertex in mesh.vertices)
    high_z = max(vertex.co.z for vertex in mesh.vertices)
    span_x = max(0.000001, high_x - low_x)
    span_y = max(0.000001, high_y - low_y)
    span_z = max(0.000001, high_z - low_z)
    for polygon in mesh.polygons:
        normal = polygon.normal
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if abs(normal.z) >= abs(normal.x) and abs(normal.z) >= abs(normal.y):
                value = ((vertex.x - low_x) / span_x * repeat_u,
                         (vertex.y - low_y) / span_y)
            elif abs(normal.y) >= abs(normal.x):
                u = (vertex.x - low_x) / span_x
                value = ((u if normal.y >= 0 else 1 - u) * repeat_u,
                         (vertex.z - low_z) / span_z)
            else:
                u = (vertex.y - low_y) / span_y
                value = (u if normal.x >= 0 else 1 - u,
                         (vertex.z - low_z) / span_z)
            uv.data[loop_index].uv = value


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
        elif semantic_name in ("ROOM_floor_a", "ROOM_floor_c"):
            palette_name = "floorA" if polygon.normal.z > 0.5 else "floorEdge"
        elif semantic_name in ("ROOM_floor_b", "ROOM_floor_d"):
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
    _select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    _planar_uv(obj)
    return _finish(obj, name, material, [width, height, depth])


def _join_boxes(name, node, material, boxes, repeat_u=1):
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
    _planar_uv(parts[0], repeat_u)
    return _finish(parts[0], name, material, _dimensions(node))


def _barrel(name, node, material):
    width, height, _depth = _dimensions(node)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=width / 2, depth=height,
                                       location=(0, 0, height / 2))
    obj = bpy.context.object
    modifier = obj.modifiers.new(name="deterministic_tangent_triangles", type="TRIANGULATE")
    modifier.quad_method = "FIXED"
    _select_only(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return _finish(obj, name, material, [width, height, _depth])


def _irregular_flagstone(name, node, material, seed):
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    width = maximum[0] - minimum[0]
    depth = maximum[2] - minimum[2]
    height = maximum[1] - minimum[1]
    # Variation belongs in the periodic albedo and its declared rotations. The
    # old octagonal silhouette stopped short of every tile corner; a grid of
    # those gaps became the black trenches visible in the owner screenshot.
    # A full square closes every shared edge and keeps mortar inside the paint.
    _ = seed
    outline = [
        (minimum[0], minimum[2]), (maximum[0], minimum[2]),
        (maximum[0], maximum[2]), (minimum[0], maximum[2]),
    ]
    vertices = [(x, -z, 0) for x, z in outline] + [(x, -z, height) for x, z in outline]
    faces = [tuple(range(4)), tuple(reversed(range(4, 8)))]
    for index in range(4):
        following = (index + 1) % 4
        faces.append((index, following, following + 4, index + 4))
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


def _seamless_straight_wall(name, node, material, seed):
    """One repeatable tile of masonry with flush, uncapped run boundaries.

    Runtime contour runs repeat this source at tile frequency. Every course
    reaches both X extrema with uniform depth, so adjacent copies meet without
    exposing a narrow end profile and never stretch their blocks or UVs.
    """
    minimum = _numbers(node["bounds"]["min"])
    maximum = _numbers(node["bounds"]["max"])
    width = maximum[0] - minimum[0]
    height = maximum[1] - minimum[1]
    centre_x = (minimum[0] + maximum[0]) / 2
    # Mortar is shallow relief, never a hole through the architecture. The
    # earlier independent block boxes exposed the void at every joint and read
    # as railings/pickets in the live isometric view. This recessed continuous
    # core preserves a solid silhouette while the fitted stones articulate it.
    cells = max(1, round(maximum[0] - minimum[0]))
    boxes = [((width, height, 0.13),
              (centre_x, (minimum[1] + maximum[1]) / 2, 0.0))]
    randomizer = random.Random(seed)
    course_height = height / 3
    horizontal_gap = 0.050
    vertical_gap = 0.034
    # A continuous core owns silhouette and closure. These shallow ashlar
    # plates overlap the recessed core and vary 12 mm in projection. That is
    # enough for the upper-right key to separate individual blocks without
    # changing the exact semantic hull or opening a mortar hole. Alternating
    # two-block-per-cell courses keep stones chunky and break module boundaries
    # without a repeated railing or picket rhythm.
    for face in (-1, 1):
        for course in range(3):
            count = cells * 2 + course % 2
            weights = [0.82 + randomizer.random() * 0.36 for _ in range(count)]
            total = sum(weights)
            cursor = minimum[0]
            low_y = minimum[1] + course * course_height + vertical_gap / 2
            high_y = minimum[1] + (course + 1) * course_height - vertical_gap / 2
            for index, weight in enumerate(weights):
                following = maximum[0] if index + 1 == count else cursor + width * weight / total
                low_x = cursor + (horizontal_gap / 2 if index else 0)
                high_x = following - (horizontal_gap / 2 if index + 1 < count else 0)
                outer = 0.09 if course == 0 and index == 0 else 0.078 + randomizer.random() * 0.012
                inner = 0.062
                relief = outer - inner
                relief_z = face * (inner + relief / 2)
                boxes.append(((high_x - low_x, high_y - low_y, relief),
                              ((low_x + high_x) / 2, (low_y + high_y) / 2, relief_z)))
                cursor = following
    return _join_boxes(name, node, material, boxes, repeat_u=cells)


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
    _select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    _planar_uv(obj)
    return _finish(obj, name, material, [width, height, depth])


def _torch_sconce(name, node, material):
    """A wall fixture whose silhouette still reads at the game camera.

    The old single cuboid satisfied the socket contract but looked like a post
    planted in the floor. These joined masses keep the same declared hull and
    pivot while making the backplate, projecting arm, bowl and wrapped haft
    legible without inventing another runtime placement rule.
    """
    boxes = [
        ((0.16, 0.34, 0.045), (0.0, 0.22, 0.0125)),
        ((0.07, 0.07, 0.17), (0.0, 0.31, -0.075)),
        ((0.13, 0.055, 0.11), (0.0, 0.385, -0.12)),
        ((0.065, 0.10, 0.065), (0.0, 0.44, -0.14)),
    ]
    return _join_boxes(name, node, material, boxes)


def build_room(manifest, materials):
    nodes = {piece["node"]: piece for piece in manifest["pieces"]}
    meshes = {}
    for name in sorted(nodes):
        node = nodes[name]
        material = materials[node["materialRole"]]
        if name in ("ROOM_floor_a", "ROOM_floor_b", "ROOM_floor_c", "ROOM_floor_d"):
            floor_salts = {
                "ROOM_floor_a": 0xA1, "ROOM_floor_b": 0xB2,
                "ROOM_floor_c": 0xC3, "ROOM_floor_d": 0xD4,
            }
            obj = _irregular_flagstone(
                name, node, material, manifest["generatorSeed"] ^ floor_salts[name],
            )
        elif name == "ROOM_wall_straight" or name.startswith("ROOM_wall_run_"):
            run_salt = int(name.rsplit("_", 1)[-1]) if name.startswith("ROOM_wall_run_") else 1
            obj = _seamless_straight_wall(
                name, node, material, manifest["generatorSeed"] ^ 0x571A ^ run_salt,
            )
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
            obj = _torch_sconce(name, node, material)
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
