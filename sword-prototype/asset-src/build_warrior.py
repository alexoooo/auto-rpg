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
    # Triangles, before anything asks for a tangent. Blender computes tangent
    # space only for tris and quads, and `plate` authors n-gons by construction --
    # its whole job is a silhouette typed as a list of points. Without this the
    # exporter prints "Tangent space can only be computed for tris/quads,
    # aborting" once per piece and quietly ships a file with no TANGENT
    # attribute, which the normal maps then have to guess at per pixel.
    bmesh.ops.triangulate(welded, faces=welded.faces)
    mesh = bpy.data.meshes.new(name + "_mesh")
    welded.to_mesh(mesh)
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
    _unwrap(obj)
    return obj


def _unwrap(obj):
    """Give a welded piece somewhere for a texture to sit.

    The asset carried no UVs at all until now, and `export_texcoords` was off to
    match. That is most of why the warriors read as a toy: twenty-one primitives
    painted in four flat colours are twenty-one flat colours however good the
    silhouette is, because no real surface is one colour anywhere.

    Smart UV Project rather than anything cleverer, and packed into 0..1 per
    piece rather than laid out at a shared physical scale. Both are deliberate.
    The maps are *tiling* -- steel, leather, cloth, wood, none of them authored
    for this body -- so there is nothing to lay out *to*; what matters is only
    that each piece gets a sane, non-overlapping, low-distortion patch, and how
    many times the map repeats across it is a decision the runtime makes and can
    change while you watch. `config.ts`'s `surfaces.tiles` is that decision.

    `angle_limit` is generous because these are welded unions of spheres and
    boxes: a tight limit shatters a pauldron into forty islands and every seam
    between them is a place the tiling map visibly jumps.
    """
    previous = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    if previous:
        bpy.context.view_layer.objects.active = previous


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

    made = {}

    wanted = {p["name"]: p["bone"] for p in dimensions["pieces"]}

    def add(name, parts, surface):
        if name not in wanted:
            raise RuntimeError(f"this script builds \"{name}\" and figure.ts does not dress it")
        made[name] = piece(name, bones[wanted[name]]["joint"], parts, surfaces[surface], root)

    # ---- the hips ----
    #
    # The pelvis capsule is 0.32 m across and 0.26 m tall; the leather over it
    # follows that envelope rather than inventing one, so a hit that the overlay
    # shows landing on the pelvis lands somewhere the eye also calls the hips.
    add("pelvis", [
        ball((0, pelvis_centre - 0.005, 0), (pelvis_radius * 1.03, 0.13, pelvis_radius * 0.85)),
        ring((0, pelvis_top - 0.04, 0), pelvis_radius * 0.97, 0.022),
        box((0, pelvis_top - 0.04, pelvis_radius * 0.92), (0.055, 0.05, 0.03)),
    ], "leather")

    # Faulds: a short flared skirt off the belt, and one of the two panels that
    # carry the fighter's colour.
    add("skirt", [
        tube((0, pelvis_top - 0.02, 0), (0, pelvis_bottom + 0.025, 0),
             pelvis_radius * 1.15, pelvis_radius * 1.52),
        ring((0, pelvis_bottom + 0.04, 0), pelvis_radius * 1.48, 0.015),
    ], "side")

    # ---- the trunk ----
    add("belly", [
        ball((0, waist + 0.09, 0), (torso_radius * 0.87, 0.11, torso_radius * 0.71)),
        ring((0, waist + 0.04, 0), torso_radius * 0.84, 0.016),
        ring((0, waist + 0.14, 0), torso_radius * 0.88, 0.016),
    ], "leather")

    chest_top = torso_top - 0.06
    chest_bottom = waist + 0.09
    add("chest", [
        ball((0, (chest_top + chest_bottom) / 2, 0),
             (torso_radius * 0.97, (chest_top - chest_bottom) / 2, torso_radius * 0.68)),
        plate([(-0.155, chest_top), (0, chest_top + 0.04), (0.155, chest_top),
               (0.135, chest_bottom + 0.05), (0.07, chest_bottom),
               (-0.07, chest_bottom), (-0.135, chest_bottom + 0.05)],
              torso_radius * 0.82, torso_radius * 0.30),
        plate([(-0.15, chest_top), (0.15, chest_top),
               (0.13, chest_bottom + 0.04), (-0.13, chest_bottom + 0.04)],
              -torso_radius * 0.30, -torso_radius * 0.80),
        box((0, chest_bottom + 0.06, torso_radius * 0.84), (0.20, 0.014, 0.02)),
        box((0, chest_bottom + 0.15, torso_radius * 0.85), (0.23, 0.014, 0.02)),
        box((0, chest_bottom + 0.24, torso_radius * 0.84), (0.21, 0.014, 0.02)),
    ], "steel")

    add("collar", [
        ring((0, torso_top - 0.04, 0), torso_radius * 0.66, 0.032),
        box((0, torso_top - 0.07, 0), (torso_radius * 1.58, 0.05, torso_radius * 1.16)),
    ], "steel")

    # Pauldrons cap the shoulder joint and lap two lames over the upper arm. The
    # checker asserts each one's bounds actually contain the joint it caps,
    # because a pauldron that has drifted inboard is the single most obvious way
    # for an authored figure to stop agreeing with the rig underneath it.
    for name, x in (("pauldronL", -shoulder_side), ("pauldronR", shoulder_side)):
        outward = 1 if x > 0 else -1
        add(name, [
            ball((x, shoulder_height + 0.02, shoulder_front - 0.01), (0.105, 0.075, 0.095)),
            ball((x + outward * 0.015, shoulder_height - 0.04, shoulder_front - 0.01),
                 (0.098, 0.05, 0.09)),
            ball((x + outward * 0.026, shoulder_height - 0.10, shoulder_front - 0.01),
                 (0.088, 0.045, 0.082)),
        ], "steel")

    # The surcoat. It is the one piece this session adds and it is here to be
    # read rather than worn: two helmed figures in the same steel are the same
    # figure at the distance the Fixed camera sits at.
    surcoat_top = torso_top - 0.07
    surcoat_bottom = waist - 0.04
    front = torso_radius * 0.88
    hem = [(-0.115, surcoat_top), (0.115, surcoat_top), (0.115, surcoat_bottom + 0.06),
           (0.05, surcoat_bottom), (0, surcoat_bottom + 0.05),
           (-0.05, surcoat_bottom), (-0.115, surcoat_bottom + 0.06)]
    add("surcoat", [
        plate(hem, front + 0.02, front),
        plate([(x, y) for x, y in reversed(hem)], -front, -front - 0.02),
        box((0, surcoat_top - 0.015, 0), (0.23, 0.03, (front + 0.02) * 2)),
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

    # A helm with the face open. The comment on `figure.ts`'s primitive has
    # always claimed a skullcap and a visible face, and the primitive it
    # describes is a steel egg over the whole head, because a box and a sphere
    # cannot cut an opening. The cone stops at the brow, the rim closes the
    # seam, and the two cheek plates leave the eyes and the beard showing.
    crown = height
    brow = head_centre + 0.005
    add("helm", [
        tube((0, brow, -0.004), (0, crown, -0.004), head_radius * 1.19, 0.03),
        ring((0, brow + 0.005, -0.004), head_radius * 1.12, 0.016),
        ball((0, brow - 0.04, -head_radius * 0.81), (0.10, 0.055, 0.05)),
        ball((-head_radius * 0.93, brow - 0.05, 0.01), (0.032, 0.055, 0.06)),
        ball((head_radius * 0.93, brow - 0.05, 0.01), (0.032, 0.055, 0.06)),
    ], "steel")

    add("nasal", [
        box((0, brow - 0.02, head_radius * 0.95), (0.026, 0.10, 0.03)),
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
                 arm["upperRadius"] * 1.11, arm["upperRadius"] * 0.89),
            ring((x + lean, arm_elbow + 0.02, shoulder_front), arm["upperRadius"] * 0.93, 0.012),
        ], "cloth")

        add("forearm" + suffix, [
            ball((x + lean, arm_elbow, shoulder_front), (0.058, 0.05, 0.058)),
            tube((x + lean, arm_elbow + 0.01, shoulder_front),
                 (x + lean * 1.5, arm_wrist + 0.01, shoulder_front),
                 arm["foreRadius"] * 1.15, arm["foreRadius"] * 0.92),
            ring((x + lean, arm_elbow - 0.06, shoulder_front), arm["foreRadius"] * 1.04, 0.011),
            ring((x + lean * 1.5, arm_wrist + 0.06, shoulder_front), arm["foreRadius"] * 0.98, 0.011),
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
            ball((x, hip - 0.01, 0), (0.090, 0.070, 0.090)),
            tube((x, hip, 0), (x - side * 0.003, knee, 0.005), 0.088, 0.072),
        ], "cloth")

        add("shin" + suffix, [
            ball((x - side * 0.003, knee + 0.005, 0.012), (0.076, 0.065, 0.078)),
            tube((x - side * 0.003, knee - 0.01, 0.005), (x - side * 0.005, ankle + 0.05, 0.01),
                 0.072, 0.052),
            ring((x - side * 0.004, (knee + ankle) / 2, 0.008), 0.062, 0.011),
        ], "leather")

        # The sole is on the floor, and the checker says so to the millimetre: a
        # boot 20 mm up and the whole figure reads as hovering, which is the one
        # defect nobody ever attributes to the asset.
        add("foot" + suffix, [
            box((x - side * 0.003, 0.045, 0.045), (0.105, 0.090, 0.240)),
            ball((x - side * 0.003, 0.030, 0.160), (0.050, 0.030, 0.045)),
            ball((x - side * 0.005, 0.095, 0.000), (0.062, 0.045, 0.070)),
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
        # Both on, where both were off. `export_texcoords` is what makes the
        # UVs above reach the file at all; `export_tangents` is what a normal
        # map needs to know which way is along the surface. Without tangents
        # Babylon derives them per pixel from screen-space derivatives, which
        # works and is visibly noisier on curved welded shells like these.
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=False, export_morph=False,
        export_extras=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


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
