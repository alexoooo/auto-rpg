"""Authored hard-surface toolkit for the warrior-v3 torso-to-waist subsystem.

Every surface in this module is explicit vertex and face data. Nothing here
reaches for ``bpy.ops.mesh.primitive_*``: a plate is an authored cross-section
lofted between authored vertical stations, trimmed along its top and bottom
edge, given a real thickness, and creased where a smith would leave a fold.
The v1 generator stays the control for everything this subsystem does not own.
"""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector


def ring(profile, width, front, back, keel):
    """Expand one authored half-profile into a closed ring of columns.

    ``profile`` runs from the front centre line to the back centre line as
    ``(u, t, k)``. ``u`` is the fraction of the half width, ``t`` walks the
    depth from the front plane at ``-1`` to the back plane at ``+1``, and ``k``
    lifts the forged centre keel clear of the front plane. Column ``0`` is the
    front centre and the mirrored columns follow the back centre, so a panel can
    be cut as any contiguous wrapping column range.
    """
    half = [(u * width, t * (front if t < 0 else back) - k * keel) for u, t, k in profile]
    columns = list(half)
    for x, y in reversed(half[1:-1]):
        columns.append((-x, y))
    return columns


def inflate(columns, amount):
    """Offset a ring along its own outward normal, for straps worn over plate."""
    if not amount:
        return list(columns)
    count = len(columns)
    centre = Vector((sum(point[0] for point in columns) / count,
                     sum(point[1] for point in columns) / count))
    offset = []
    for index, (x, y) in enumerate(columns):
        before = columns[index - 1]
        after = columns[(index + 1) % count]
        tangent = Vector((after[0] - before[0], after[1] - before[1]))
        normal = Vector((tangent.y, -tangent.x))
        radial = Vector((x, y)) - centre
        if normal.length < 1e-9:
            normal = radial
        normal.normalize()
        if normal.dot(radial) < 0:
            normal = -normal
        offset.append((x + normal.x * amount, y + normal.y * amount))
    return offset


def station(profile, z, width, front, back, keel=0.0, lift=0.0):
    """One authored vertical station: a height paired with its own ring."""
    return (z, inflate(ring(profile, width, front, back, keel), lift))


def mark_sharp(mesh, degrees):
    """Crease every fold steeper than ``degrees`` and every open rim."""
    threshold = math.cos(math.radians(degrees))
    normals = {}
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for key in polygon.edge_keys:
            normals.setdefault(key, []).append(polygon.normal.copy())
    for edge in mesh.edges:
        touching = normals.get(edge.key, ())
        edge.use_edge_sharp = len(touching) != 2 or touching[0].dot(touching[1]) < threshold


def _oriented_outward(vertices, faces):
    """Face an open panel away from the body axis so thickness grows inward."""
    total = 0.0
    for face in faces:
        points = [Vector(vertices[index]) for index in face]
        centre = sum(points, Vector()) / len(points)
        normal = (points[1] - points[0]).cross(points[2] - points[0])
        total += normal.dot(Vector((centre.x, centre.y, 0.0)))
    return total >= 0.0


def sample(sections, z, column):
    """Read one column of the lofted surface at an arbitrary height.

    Trimming an armhole or a plackart point moves the boundary along the body,
    not straight down through it, so a trimmed vertex has to be resolved against
    the neighbouring stations instead of keeping the end station ring.
    """
    heights = [entry[0] for entry in sections]
    if z >= heights[0]:
        return sections[0][1][column]
    if z <= heights[-1]:
        return sections[-1][1][column]
    for index in range(len(sections) - 1):
        upper, lower = heights[index], heights[index + 1]
        if lower <= z <= upper:
            fraction = (upper - z) / (upper - lower) if upper != lower else 0.0
            near = sections[index][1][column]
            far = sections[index + 1][1][column]
            return (near[0] + (far[0] - near[0]) * fraction,
                    near[1] + (far[1] - near[1]) * fraction)
    return sections[-1][1][column]


def _grid_uv(sections, selected, closed):
    """Authored island coordinates: arc length across, height down."""
    top = sections[0][1]
    across = [0.0]
    for index in range(1, len(selected)):
        previous = Vector(top[selected[index - 1]])
        current = Vector(top[selected[index]])
        across.append(across[-1] + (current - previous).length)
    if closed:
        across.append(across[-1] + (Vector(top[selected[0]]) - Vector(top[selected[-1]])).length)
    span = across[-1] or 1.0
    down = [0.0]
    for index in range(1, len(sections)):
        down.append(down[-1] + abs(sections[index][0] - sections[index - 1][0]))
    height = down[-1] or 1.0
    return [[(across[column] / span, 1.0 - down[row] / height)
             for column in range(len(selected))] for row in range(len(sections))]


def surface(name, sections, material, root, *, columns=None, thickness=0.0,
            top_edge=None, bottom_edge=None, cap=False, sharp_degrees=22.0,
            bevel=0.005, region="torso", material_class="dark_plate",
            subsystem="torso_waist"):
    """Loft one authored plate, band, or shell from its vertical stations.

    ``sections`` runs top to bottom. ``columns`` selects a contiguous wrapping
    slice of the ring for an open panel, or stays ``None`` for a band that
    closes all the way round. ``top_edge`` and ``bottom_edge`` trim the first
    and last station per column, which is how the armhole, the throat notch and
    the fauld hem are shaped. ``thickness`` gives an open surface a real inner
    face and rim; a capped shell is already solid and takes none.
    """
    selected = list(range(len(sections[0][1]))) if columns is None else list(columns)
    closed = columns is None
    span = len(selected)
    rows = len(sections)

    # Trimming shortens the patch, it does not fold it: each column runs from its
    # own trimmed top to its own trimmed bottom, and the interior rows keep the
    # station spacing as fractions of that span. Every vertex is then resolved
    # against the loft, so an armhole cut follows the body instead of cutting
    # through it.
    heights = [entry[0] for entry in sections]
    total = heights[0] - heights[-1]
    fractions = [(heights[0] - value) / total if total else 0.0 for value in heights]
    tops = [heights[0] + (top_edge[index] if top_edge else 0.0) for index in range(span)]
    bottoms = [heights[-1] + (bottom_edge[index] if bottom_edge else 0.0)
               for index in range(span)]
    for index in range(span):
        if bottoms[index] >= tops[index]:
            raise ValueError(f"{name}: column {index} was trimmed inside out")

    vertices = []
    for row in range(rows):
        for index, column in enumerate(selected):
            height = tops[index] + (bottoms[index] - tops[index]) * fractions[row]
            x, y = sample(sections, height, column)
            vertices.append((x, y, height))

    faces = []
    for row in range(rows - 1):
        for index in range(span if closed else span - 1):
            following = (index + 1) % span
            faces.append((row * span + index, row * span + following,
                          (row + 1) * span + following, (row + 1) * span + index))
    if cap:
        faces.append(tuple(reversed(range(span))))
        faces.append(tuple(range((rows - 1) * span, rows * span)))
    if not _oriented_outward(vertices, faces):
        faces = [tuple(reversed(face)) for face in faces]

    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()

    islands = _grid_uv(sections, selected, closed)
    edit = bmesh.new()
    edit.from_mesh(mesh)
    edit.verts.ensure_lookup_table()
    layer = edit.loops.layers.uv.new("UVMap")
    for face in edit.faces:
        for loop in face.loops:
            index = loop.vert.index
            if index < rows * span:
                loop[layer].uv = islands[index // span][index % span]
    if cap:
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    if thickness > 0.0:
        bmesh.ops.solidify(edit, geom=list(edit.faces), thickness=-thickness)
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = root
    obj["warrior_region"] = region
    obj["warrior_material_class"] = material_class
    obj["authored_subsystem"] = subsystem
    mark_sharp(mesh, sharp_degrees)
    if bevel > 0.0:
        modifier = obj.modifiers.new(name + "_forged_edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(25.0)
    return obj
