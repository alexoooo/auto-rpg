"""Build the armoured warrior this rig wears, one object per costume piece.

Run through ``scripts/run-blender.mjs``; it is what writes ``dimensions.json``
and what checks the result::

    npm run asset:build

**Nothing in here is a number.** Every dimension comes out of
``asset-src/dimensions.json``, which ``run-blender.mjs`` regenerates from
``src/config.ts`` and ``src/figure.ts`` immediately before Blender is started.
That is the whole reason this file exists rather than the study in
``../warrior-prototype``, which is 422 lines of excellent procedural armour
built to a body 55 mm taller with shoulders 170 mm further out. Scaling that
result to fit would have produced a warrior that fits *today*, and a stretched
one the first time a limb was retuned. Constants that appear below are
proportions -- how far a pauldron laps over the shoulder it caps -- not
measurements, and each one is expressed against a number that came from the
JSON.

**Coordinates are the fighter's, not Blender's.** Every position written below
is ``(x, height, forward)``: exactly the frame ``config.ts``'s ``body`` table and
``figure.ts``'s piece anchors are written in, so a line here can be read straight
against a line there. ``_blender`` is the only place the axes are permuted, and
it does the permutation once. Getting this wrong is cheap to do and expensive to
see -- it puts a nose on the back of a head -- which is why
``scripts/check-warrior.mjs`` asserts every piece's bounds in all three axes
rather than in the height alone.

**No skinning, no skeleton, no armature.** The hierarchy already exists as
eleven physics bodies with motorised joints between them, and ``figure.ts``
parents each piece to the body it covers. A skinned mesh would add a second
opinion about where a shoulder is, and the two would disagree the moment
somebody retuned the first one.

**No sword and no shield.** The sword is a physics body with its own compound
shape and a hand that is three simulated bones; modelling one into a fist would
put a costume on the subject of the experiment. A shield is out of scope until
it can block, because a cosmetic shield that does not block is precisely the lie
the rig overlay exists to expose.
"""

import argparse
import json
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


# Tessellation. Two of these are in the scene at once and the arena is already
# paying for a 2048 shadow map, four-sample MSAA and a bloom pass, so these are
# set where a silhouette stops looking faceted and not one step beyond it.
SPHERE_SEGMENTS = 20
SPHERE_RINGS = 10
TUBE_SIDES = 18
RING_MAJOR = 18
RING_MINOR = 8


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--dimensions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def _blender(point):
    """Fighter ``(x, height, forward)`` to a Blender position.

    Three frames sit between this file and the browser, and only this function
    knows about any of them. Blender is Z-up with a character conventionally
    facing -Y; the glTF exporter's Y-up conversion sends Blender ``(x, y, z)``
    to glTF ``(x, z, -y)``, which lands that character's front on glTF +Z where
    the format wants it; and Babylon's loader converts glTF's right-handed frame
    to its own left-handed one by **negating X**. Compose the three and every
    semantic axis survives -- right stays right, up stays up, forward stays
    forward -- which is what makes the numbers below readable against
    ``config.ts`` directly.

    That last step is measured, not assumed. Authoring the warrior facing
    Blender +Y instead put it in the arena with its X and Z both flipped: a
    figure with its nose on the back of its head, its boots pointing behind it
    and its pauldrons swapped -- and, because the model is nearly symmetric,
    one that looks approximately fine in a screenshot. `scripts/check-warrior.mjs`
    asserts bounds in all three axes for exactly this reason.
    """
    return Vector((-point[0], -point[2], point[1]))


def _extent(size):
    """The same permutation for a size or a radius, with no sign in it.

    Scale is not a position: a negative component here would mirror the
    primitive it is applied to and invert its winding, which `recalc_face_normals`
    would then have to undo. Permute, and leave the signs alone.
    """
    return Vector((size[0], size[2], size[1]))


def material(name, colour, metallic, roughness):
    """One of the arena's four surfaces, as Blender understands it.

    These exist so the committed ``.glb`` opens in any viewer as a warrior
    rather than as a grey lump. They are **not** what the game renders: at
    runtime ``figure.ts`` re-dresses every piece out of the arena's own PBR
    palette, which is lit by the scene's HDRI and is live-tunable, and a second
    set of materials arriving with the asset would be a second opinion about
    what steel looks like. The colours here are copied from that palette so the
    two agree; if they ever disagree, the palette is the one that is right.
    """
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


def _finish(obj, smooth):
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def ball(centre, radii, smooth=True):
    """A scaled sphere: the workhorse for a pauldron, a knee, a skull."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=SPHERE_SEGMENTS, ring_count=SPHERE_RINGS, location=_blender(centre)
    )
    obj = bpy.context.object
    obj.scale = _extent(radii)
    return _finish(obj, smooth)


def box(centre, size, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=_blender(centre))
    obj = bpy.context.object
    obj.scale = _extent(size)
    return _finish(obj, smooth)


def tube(start, end, radius_start, radius_end, smooth=True):
    """A limb, tapered. A cone with two radii covers every one of them."""
    a = _blender(start)
    b = _blender(end)
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(
        vertices=TUBE_SIDES,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=(a + b) / 2,
    )
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return _finish(obj, smooth)


def ring(centre, major, minor, smooth=True):
    """A band around a limb: a strap, a cuff, a gorget. Axis is vertical."""
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=RING_MAJOR,
        minor_segments=RING_MINOR,
        location=_blender(centre),
    )
    return _finish(bpy.context.object, smooth)


def plate(points, front, back, smooth=False):
    """A flat panel with an authored silhouette, extruded forward.

    ``points`` are ``(x, height)`` in the fighter's frame, anticlockwise as seen
    from the front. This is what makes a breastplate read as a breastplate and
    not as a box: the shoulders taper, the waist narrows, and the bottom edge
    comes to a point.
    """
    vertices = [_blender((x, y, back)) for x, y in points]
    vertices += [_blender((x, y, front)) for x, y in points]
    count = len(points)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new("plate_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("plate", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return _finish(obj, smooth)


def imported_obj(path, name, transform, keep_face=lambda _centre, _material: True):
    """Read selected CC0 OBJ faces into the fighter frame.

    Importing through Blender's OBJ operator makes the result depend on operator
    axis defaults. This tiny reader keeps the source's X/right, Y/up convention
    explicit and is intentionally limited to the vertex/face/material grammar
    used by the pinned, evaluated armour extracts.  ``transform`` is explicit
    because this donor is Blender Z-up while the old Quaternius OBJ was Y-up;
    hiding that difference in an importer default is how armour gets fitted
    backwards while still looking almost plausible.
    """
    vertices = []
    faces = []
    material = ""
    for raw in path.read_text(encoding="utf8").splitlines():
        fields = raw.split()
        if not fields:
            continue
        if fields[0] == "v":
            vertices.append(tuple(float(value) for value in fields[1:4]))
        elif fields[0] == "usemtl":
            material = fields[1]
        elif fields[0] == "f":
            face = tuple(int(value.split("/")[0]) - 1 for value in fields[1:])
            centre = tuple(sum(vertices[index][axis] for index in face) / len(face) for axis in range(3))
            fitted = [Vector(transform(vertices[index])) for index in face]
            area = ((fitted[1] - fitted[0]).cross(fitted[2] - fitted[0])).length / 2
            if keep_face(centre, material) and area >= 0.0000005:
                faces.append(face)
    used = sorted({index for face in faces for index in face})
    remap = {old: new for new, old in enumerate(used)}
    points = []
    for index in used:
        points.append(_blender(transform(vertices[index])))
    mesh = bpy.data.meshes.new(name + "_source_mesh")
    mesh.from_pydata(points, [], [tuple(remap[index] for index in face) for face in faces])
    mesh.update(calc_edges=True)
    # The source carries sub-millimetre sliver triangles around layered plate
    # seams.  They do not survive the fitted scale as visible detail, but their
    # nearly-collinear UVs have no tangent frame.  Collapse only that imported
    # residue before it joins the authored piece; procedural facial details are
    # deliberately outside this cleanup.
    cleaned = bmesh.new()
    cleaned.from_mesh(mesh)
    bmesh.ops.dissolve_degenerate(cleaned, dist=0.001, edges=list(cleaned.edges))
    cleaned.to_mesh(mesh)
    cleaned.free()
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name + "_source", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return _finish(obj, True)


def piece(name, joint, parts, surface, root):
    """Weld one costume piece together and cut its origin at its own joint.

    Every sub-object's transform is baked into its vertices first, so the merge
    is a pure union and the result carries no transform of its own but the one
    set here. That matters: the checker asserts a node has no rotation and no
    scale, because a node that has either is a node whose translation is not its
    origin, and then "the origin is at the joint" stops meaning anything.
    """
    welded = bmesh.new()
    for part in parts:
        # `matrix_basis`, not `matrix_world`, and this cost an afternoon. Blender
        # evaluates `matrix_world` from the dependency graph, and the graph is
        # only stepped when the next operator runs -- so every sub-object here
        # baked correctly *except the last one built*, which was still carrying
        # the identity it was created with and welded in at its unscaled
        # primitive size. Half the figure was right, which is the failure mode
        # that survives a glance. `matrix_basis` is computed from the object's
        # own location, rotation and scale on every access; none of these has a
        # parent yet, so the two are the same matrix whenever both are correct.
        part.data.transform(part.matrix_basis)
        welded.from_mesh(part.data)
    # Every sub-object is a closed shell, so "outward" is well defined for each
    # of them separately and this costs nothing. It is here for `plate`, whose
    # winding follows the order its silhouette was typed in: get that backwards
    # and the panel is invisible from the front and solid from behind, which
    # looks like a missing piece rather than like an inside-out one.
    bmesh.ops.recalc_face_normals(welded, faces=welded.faces)
    bmesh.ops.dissolve_degenerate(welded, dist=1e-8, edges=list(welded.edges))
    # Tangent generation only has a defined answer for triangles and quads.
    # `plate()` deliberately starts with silhouette n-gons, so triangulation
    # belongs here, after the pieces are welded and before the export sees them.
    bmesh.ops.triangulate(welded, faces=list(welded.faces))
    mesh = bpy.data.meshes.new(name + "_mesh")
    welded.to_mesh(mesh)
    mesh.update(calc_edges=True)
    welded.free()
    for part in parts:
        bpy.data.objects.remove(part, do_unlink=True)

    pivot = _blender(joint)
    mesh.transform(Matrix.Translation(-pivot))
    mesh.materials.append(surface)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = pivot
    obj.parent = root
    # Let Blender pack the final, already-triangulated loops. Its exporter may
    # split loops again while creating tangents; projecting before that split
    # left two silhouette triangles with three identical UVs even though the
    # in-memory layer was sound. Smart Project supplies a real island boundary
    # for those faces and survives the tangent split.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Named island strategies for the places a camera can actually expose.
    # The open face gets tighter cuts around its features; the surcoat panels
    # and articulated skirt split at much shallower garment boundaries. Other
    # pieces use the broad sixty-six-degree hard-surface cut.
    island_angles = {
        "head": 0.61,
        "helm": 0.61,
        "surcoat": 0.35,
        "skirt": 0.70,
        "upperArmL": 0.35,
        "upperArmR": 0.35,
    }
    bpy.ops.uv.smart_project(angle_limit=island_angles.get(name, 1.15192), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Smart Project packs every object to the full square. Normalize by actual
    # triangle surface area instead: sqrt(UV area / square metres) is then the
    # same 0.30 UV units/metre for a nasal, breastplate, sleeve or surcoat.
    # Runtime `scale` remains the intentional family detail frequency.
    uv_layer = obj.data.uv_layers.active
    if uv_layer:
        mesh_area = sum(polygon.area for polygon in obj.data.polygons)
        uv_area = 0.0
        for polygon in obj.data.polygons:
            if len(polygon.loop_indices) != 3:
                raise RuntimeError(f'"{name}" reached UV density normalization before triangulation')
            uv = [uv_layer.data[index].uv for index in polygon.loop_indices]
            uv_area += abs((uv[1].x - uv[0].x) * (uv[2].y - uv[0].y) -
                           (uv[1].y - uv[0].y) * (uv[2].x - uv[0].x)) / 2
        if mesh_area <= 0 or uv_area <= 0:
            raise RuntimeError(f'"{name}" has no area for UV density normalization')
        factor = 0.30 * (mesh_area / uv_area) ** 0.5
        centre_u = (min(loop.uv.x for loop in uv_layer.data) + max(loop.uv.x for loop in uv_layer.data)) / 2
        centre_v = (min(loop.uv.y for loop in uv_layer.data) + max(loop.uv.y for loop in uv_layer.data)) / 2
        for loop in uv_layer.data:
            loop.uv.x = 0.5 + (loop.uv.x - centre_u) * factor
            loop.uv.y = 0.5 + (loop.uv.y - centre_v) * factor
            if loop.uv.x < -1e-6 or loop.uv.x > 1 + 1e-6 or loop.uv.y < -1e-6 or loop.uv.y > 1 + 1e-6:
                raise RuntimeError(f'"{name}" cannot fit the shared UV density in [0,1]')
    return obj


def build(dimensions):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new("Warrior", None)
    bpy.context.scene.collection.objects.link(root)

    # The arena's palette, copied. See `material` for why these are not the ones
    # the game renders with.
    surfaces = {
        "steel": material("steel", (0.62, 0.65, 0.70), 1.0, 0.22),
        "leather": material("leather", (0.16, 0.11, 0.08), 0.0, 0.78),
        "cloth": material("cloth", (0.29, 0.10, 0.12), 0.0, 0.92),
        "flesh": material("flesh", (0.68, 0.48, 0.38), 0.0, 0.68),
        # The two side-coloured panels are exported as cloth. The colour that
        # tells left from right is `figure.ts`'s, because it is per fighter and
        # there is one asset: an authored colour here could only ever be one of
        # the two, and the wrong one would look deliberate.
        "side": material("cloth_surcoat", (0.29, 0.10, 0.12), 0.0, 0.92),
    }

    fighter = dimensions["fighter"]
    body = dimensions["body"]
    bones = dimensions["bones"]
    clothing_root = Path(__file__).resolve().parent / "armour" / "quaternius-ranger"

    height = fighter["height"]
    shoulder_side = fighter["shoulderSide"]
    shoulder_height = fighter["shoulderHeight"]
    shoulder_front = fighter["shoulderFront"]

    waist = body["waist"]
    neck = body["neck"]
    torso_radius = body["torsoRadius"]
    torso_top = body["torsoCentre"] + body["torsoLength"] / 2
    head_centre = body["headCentre"]
    head_radius = body["headRadius"]
    pelvis_centre = body["pelvisCentre"]
    pelvis_radius = body["pelvisRadius"]
    pelvis_top = pelvis_centre + body["pelvisLength"] / 2
    pelvis_bottom = pelvis_centre - body["pelvisLength"] / 2

    arm = dimensions["arm"]
    off = -shoulder_side
    elbow = body["offElbow"]
    fore_bottom = body["offForeCentre"] - body["offForeLength"] / 2
    hand = fore_bottom - 0.06
    hip = body["hip"]
    hip_side = body["hipSide"]
    knee = body["knee"]
    ankle = body["shinCentre"] - body["shinLength"] / 2

    # Quaternius authors the Ranger upright, in metres, with X sideways, Y back
    # and Z up.  The maps below keep those proportions wherever this shorter,
    # broader physics rig allows it.  They are measured against the pinned
    # modular files, while every target landmark comes from dimensions.json.
    def ranger_torso(point):
        x, source_back, up = point
        return (
            x * 0.94,
            waist + 0.015 + (up - 1.125) * 0.90,
            -(source_back - 0.03) * 0.94,
        )

    def ranger_hood(point):
        x, source_back, up = point
        return (
            x * head_radius * 1.25 / 0.1516,
            neck + (up - 1.5253) * (height - neck) / (1.8650 - 1.5253),
            -(source_back - 0.025) * 0.90,
        )

    def ranger_arm(point):
        x, source_back, up = point
        outward = 1 if x >= 0 else -1
        along = abs(x) - 0.18
        span = arm["upperLength"] + arm["foreLength"]
        return (
            outward * (shoulder_side + (up - 1.45) * 0.82),
            shoulder_height - along * span / (0.8994 - 0.18),
            shoulder_front - (source_back - 0.05) * 0.86,
        )

    def ranger_pauldron(point, side):
        x, source_back, up = point
        return (
            side * (shoulder_side + (x - 0.20) * 0.75),
            shoulder_height + (up - 1.48) * 0.80,
            shoulder_front - (source_back - 0.05) * 0.80,
        )

    def ranger_legs(point):
        x, source_back, up = point
        return (
            x,
            0.04 + (up - 0.4226) * (hip - 0.04) / (1.0514 - 0.4226),
            -(source_back - 0.04) * 0.90,
        )

    def ranger_boots(point):
        x, source_back, up = point
        return (
            x * 0.95,
            (up + 0.0040) * 0.86,
            -source_back * 0.82 + 0.035,
        )

    made = {}

    wanted = {p["name"]: p["bone"] for p in dimensions["pieces"]}

    def add(name, parts, surface):
        if name not in wanted:
            raise RuntimeError(f"this script builds \"{name}\" and figure.ts does not dress it")
        made[name] = piece(name, bones[wanted[name]]["joint"], parts, surfaces[surface], root)

    # ---- the hips ----
    #
    # The pelvis capsule is 0.32 m across and 0.26 m tall; the padded cloth over it
    # follows that envelope rather than inventing one, so a hit that the overlay
    # shows landing on the pelvis lands somewhere the eye also calls the hips.
    add("pelvis", [
        ball((0, pelvis_centre - 0.005, 0), (pelvis_radius * 1.03, 0.13, pelvis_radius * 0.85)),
        ring((0, pelvis_top - 0.04, 0), pelvis_radius * 0.97, 0.022),
        box((0, pelvis_top - 0.04, pelvis_radius * 0.92), (0.055, 0.05, 0.03)),
    ], "cloth")

    # Preserve the Ranger's narrow, overlapping coat-skirt silhouette.  The
    # conservative posture seam is carried by a small inner fauld at the waist,
    # not by inflating the visible garment into a hoop skirt.
    skirt_top = waist + 0.09
    skirt_bottom = pelvis_bottom + 0.025
    ranger_skirt_bottom = 0.9085435
    ranger_skirt_top = 1.115

    def ranger_skirt(point):
        x, source_forward, up = point
        return (
            x * 1.04,
            skirt_bottom + (up - ranger_skirt_bottom)
            * (skirt_top - skirt_bottom) / (ranger_skirt_top - ranger_skirt_bottom),
            -(source_forward - 0.04) * 1.04,
        )

    def ranger_belt(point):
        x, source_forward, up = point
        belt_bottom = 1.1253091
        belt_top = 1.2357826
        return (
            x,
            waist + 0.015 + (up - belt_bottom),
            -(source_forward + 0.008),
        )

    add("skirt", [
        imported_obj(
            clothing_root / "ranger-body.obj",
            "quaternius_ranger_skirt",
            ranger_skirt,
            lambda centre, _material: centre[2] <= ranger_skirt_top,
        ),
    ], "side")

    # ---- the trunk ----
    add("belly", [
        ball((0, waist + 0.09, 0), (torso_radius * 0.87, 0.11, torso_radius * 0.71)),
        imported_obj(
            clothing_root / "ranger-belt-upper.obj",
            "quaternius_ranger_belt_upper",
            ranger_belt,
        ),
        imported_obj(
            clothing_root / "ranger-belt-lower.obj",
            "quaternius_ranger_belt_lower",
            ranger_belt,
        ),
    ], "leather")

    chest_top = torso_top - 0.06
    chest_bottom = waist + 0.09
    add("chest", [
        ball((0, (chest_top + chest_bottom) / 2, 0),
             (torso_radius * 0.88, (chest_top - chest_bottom) / 2, torso_radius * 0.50)),
    ], "cloth")

    add("collar", [
        ring((0, torso_top - 0.035, 0), 0.070, 0.018),
    ], "leather")

    # Pauldrons cap the shoulder joint and lap two lames over the upper arm. The
    # checker asserts each one's bounds actually contain the joint it caps,
    # because a pauldron that has drifted inboard is the single most obvious way
    # for an authored figure to stop agreeing with the rig underneath it.
    for name, side in (("pauldronL", -1), ("pauldronR", 1)):
        x = side * shoulder_side
        add(name, [
            ball((x, shoulder_height + 0.02, shoulder_front - 0.01), (0.095, 0.070, 0.088)),
            imported_obj(
                clothing_root / "ranger-pauldron.obj",
                "quaternius_ranger_pauldron_" + name,
                lambda point, side=side: ranger_pauldron(point, side),
            ),
        ], "steel")

    # The side colour now rides the donor's fitted tunic instead of two flat
    # heraldic boards.  Its quilted lower edge and closures stay readable from
    # the game camera without hiding a separate breastplate.
    add("surcoat", [
        imported_obj(
            clothing_root / "ranger-body.obj",
            "quaternius_ranger_tunic",
            ranger_torso,
            lambda centre, _material: centre[2] > ranger_skirt_top,
        ),
    ], "side")

    # ---- the head ----
    add("neck", [
        tube((0, neck - 0.07, -0.01), (0, neck + 0.05, -0.005), 0.052, 0.048),
    ], "flesh")

    add("head", [
        ball((0, head_centre - 0.015, -0.005), (head_radius * 0.89, 0.10, head_radius)),
        ball((0, head_centre - 0.075, 0.02), (0.078, 0.055, 0.088)),
        ball((0, head_centre - 0.028, head_radius * 0.90), (0.018, 0.028, 0.035)),
        box((0, head_centre + 0.012, head_radius * 0.76), (0.13, 0.022, 0.045)),
    ], "flesh")

    # The authored hood keeps the face open and closes the broken rear opening
    # that the rejected plate donor exposed in orbit views.
    brow = head_centre + 0.005
    add("helm", [
        imported_obj(
            clothing_root / "ranger-hood.obj",
            "quaternius_ranger_hood",
            ranger_hood,
        ),
    ], "cloth")

    add("nasal", [
        box((0, brow + 0.055, head_radius * 0.90), (0.050, 0.025, 0.025)),
    ], "steel")

    # ---- both arms ----
    #
    # Both, where this used to dress only one. The sword arm was left bare on
    # purpose -- it was the single simulated arm and the subject of the whole
    # prototype, and a sleeve on it would have been a costume on the thing being
    # measured. There are two simulated arms now, and dressing one of them leaves
    # a fighter in half a shirt, which reads as a bug rather than as an
    # instrument. `G` is the instrument: it takes the entire costume off.
    #
    # Every measurement comes from the `arm` block, because both arms are built
    # from it. The old off arm had its own slightly shorter numbers in `body`,
    # and a sleeve cut to those and hung on one of these sat two centimetres out
    # of place -- which is exactly the drift `check-warrior.mjs` exists to refuse
    # and did refuse, by name, the first time this was rebuilt.
    arm_elbow = shoulder_height - arm["upperLength"]
    arm_wrist = arm_elbow - arm["foreLength"]
    arm_fist = arm_wrist - arm["handLength"]

    for suffix, x in (("R", shoulder_side), ("L", off)):
        # A hair inboard down the arm, so the sleeve tapers the way a sleeve
        # does rather than running as a straight tube from shoulder to wrist.
        lean = -0.002 if x > 0 else 0.002

        add("upperArm" + suffix, [
            tube((x, shoulder_height + 0.01, shoulder_front),
                 (x + lean, arm_elbow - 0.01, shoulder_front),
                 arm["upperRadius"] * 0.96, arm["upperRadius"] * 0.78),
            imported_obj(
                clothing_root / "ranger-arms.obj",
                "quaternius_ranger_upperArm" + suffix,
                ranger_arm,
                lambda centre, _material, x=x:
                    centre[0] * x > 0 and ranger_arm(centre)[1] >= arm_elbow,
            ),
        ], "cloth")

        add("forearm" + suffix, [
            ball((x + lean, arm_elbow, shoulder_front), (0.058, 0.05, 0.058)),
            tube((x + lean, arm_elbow + 0.01, shoulder_front),
                 (x + lean * 1.5, arm_wrist + 0.01, shoulder_front),
                 arm["foreRadius"] * 1.15, arm["foreRadius"] * 0.92),
            ring((x + lean, arm_elbow - 0.06, shoulder_front), arm["foreRadius"] * 1.04, 0.011),
            ring((x + lean * 1.5, arm_wrist + 0.06, shoulder_front), arm["foreRadius"] * 0.98, 0.011),
            imported_obj(
                clothing_root / "ranger-arms.obj",
                "quaternius_ranger_forearm" + suffix,
                ranger_arm,
                lambda centre, _material, x=x:
                    centre[0] * x > 0
                    and arm_wrist <= ranger_arm(centre)[1] < arm_elbow,
            ),
        ], "leather")

        # A fist rather than an open hand, because every one of these is holding
        # something -- and because an open hand modelled out of two spheres reads
        # as a mitten.
        add("hand" + suffix, [
            ball((x + lean * 1.5, arm_fist + arm["handLength"] * 0.55, shoulder_front + 0.005),
                 (arm["handRadius"] * 1.0, arm["handLength"] * 0.46, arm["handRadius"] * 1.13)),
            ball((x - lean * 12, arm_fist + arm["handLength"] * 0.78, shoulder_front + 0.035),
                 (0.020, 0.028, 0.025)),
        ], "flesh")

    # ---- the legs ----
    for suffix, side in (("L", -1), ("R", 1)):
        x = side * hip_side
        add("thigh" + suffix, [
            tube((x, hip, 0), (x - side * 0.003, knee, 0.005), 0.070, 0.056),
            imported_obj(
                clothing_root / "ranger-legs.obj",
                "quaternius_ranger_thigh" + suffix,
                ranger_legs,
                lambda centre, _material, side=side:
                    centre[0] * side > 0 and ranger_legs(centre)[1] >= knee,
            ),
        ], "cloth")

        add("shin" + suffix, [
            ball((x - side * 0.003, knee + 0.005, 0.012), (0.076, 0.065, 0.078)),
            tube((x - side * 0.003, knee - 0.01, 0.005), (x - side * 0.005, ankle + 0.05, 0.01),
                 0.072, 0.052),
            ring((x - side * 0.004, (knee + ankle) / 2, 0.008), 0.062, 0.011),
            imported_obj(
                clothing_root / "ranger-legs.obj",
                "quaternius_ranger_shin_cloth" + suffix,
                ranger_legs,
                lambda centre, _material, side=side:
                    centre[0] * side > 0 and ranger_legs(centre)[1] < knee,
            ),
            imported_obj(
                clothing_root / "ranger-boots.obj",
                "quaternius_ranger_shin_boot" + suffix,
                ranger_boots,
                lambda centre, _material, side=side:
                    centre[0] * side > 0 and ranger_boots(centre)[1] > 0.13,
            ),
        ], "leather")

        # The sole is on the floor, and the checker says so to the millimetre: a
        # boot 20 mm up and the whole figure reads as hovering, which is the one
        # defect nobody ever attributes to the asset.
        add("foot" + suffix, [
            imported_obj(
                clothing_root / "ranger-boots.obj",
                "quaternius_ranger_foot" + suffix,
                ranger_boots,
                lambda centre, _material, side=side:
                    centre[0] * side > 0 and ranger_boots(centre)[1] <= 0.13,
            ),
        ], "leather")

    missing = [p["name"] for p in dimensions["pieces"] if p["name"] not in made]
    if missing:
        raise RuntimeError(f"figure.ts dresses pieces this script does not build: {missing}")
    return root


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
        # UVs are an authored-asset contract now. Every costume family carries
        # a normal map, so every exported primitive needs its tangent frame.
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=False, export_morph=False,
        export_extras=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")

    # Compact every accessor, buffer view and byte span that the export leaves
    # unreachable. Session 07 also stripped non-steel tangents here; all four
    # costume families are normal-mapped now, so none are optional payload.
    raw = output.read_bytes()
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("exported GLB does not start with its JSON chunk")
    document = json.loads(raw[20:20 + json_length].decode("utf-8"))
    materials = document.get("materials", [])
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            material_index = primitive.get("material")
            material_name = materials[material_index].get("name", "") if material_index is not None else ""
            if material_name not in {"steel", "leather", "cloth", "cloth_surcoat", "flesh"}:
                primitive.get("attributes", {}).pop("TANGENT", None)
    binary_header = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", raw, binary_header)
    binary = raw[binary_header + 8:binary_header + 8 + binary_length]

    used_accessors = set()
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            used_accessors.update(primitive.get("attributes", {}).values())
            if "indices" in primitive:
                used_accessors.add(primitive["indices"])
    accessor_order = sorted(used_accessors)
    accessor_remap = {old: new for new, old in enumerate(accessor_order)}
    accessors = document.get("accessors", [])
    compact_accessors = [accessors[index] for index in accessor_order]
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive["attributes"] = {
                semantic: accessor_remap[index]
                for semantic, index in primitive.get("attributes", {}).items()
            }
            if "indices" in primitive:
                primitive["indices"] = accessor_remap[primitive["indices"]]

    used_views = {
        accessor["bufferView"] for accessor in compact_accessors if "bufferView" in accessor
    }
    used_views.update(
        image["bufferView"] for image in document.get("images", []) if "bufferView" in image
    )
    view_order = sorted(used_views)
    view_remap = {old: new for new, old in enumerate(view_order)}
    source_views = document.get("bufferViews", [])
    compact_views = []
    compact_binary = bytearray()
    for old_index in view_order:
        view = dict(source_views[old_index])
        while len(compact_binary) % 4:
            compact_binary.append(0)
        source_start = view.get("byteOffset", 0)
        view["byteOffset"] = len(compact_binary)
        compact_binary.extend(binary[source_start:source_start + view["byteLength"]])
        compact_views.append(view)
    for accessor in compact_accessors:
        if "bufferView" in accessor:
            accessor["bufferView"] = view_remap[accessor["bufferView"]]
    for image in document.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = view_remap[image["bufferView"]]

    document["accessors"] = compact_accessors
    document["bufferViews"] = compact_views
    document["buffers"][0]["byteLength"] = len(compact_binary)
    binary = bytes(compact_binary) + b"\0" * ((4 - len(compact_binary) % 4) % 4)
    encoded = json.dumps(document, separators=(",", ":")).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)

    total = 20 + len(encoded) + 8 + len(binary)
    output.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total) +
        struct.pack("<II", len(encoded), 0x4E4F534A) + encoded +
        struct.pack("<II", len(binary), binary_type) + binary
    )


def main():
    args = arguments()
    dimensions = json.loads(args.dimensions.read_text(encoding="utf-8"))
    if dimensions.get("schema") != 1:
        raise RuntimeError(f"dimensions.json schema {dimensions.get('schema')}, expected 1")
    root = build(dimensions)
    export(root, args.output)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
