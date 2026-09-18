"""Render the shipping Warrior in poses that expose rigid-piece seams.

This is visual evidence, not an image golden. Run it after ``npm run asset:build``
through ``npm run asset:review``; eight PNGs land in the ignored ``.review``
directory. Upright front/back views catch source fitting and clothing layers.
Guard, reach and crouch views rotate the same thirteen rigid bodies used by the game.
The named max-flex pair takes one elbow to 120 degrees and exposes a cuff that only
looks connected at ordinary combat angles, which the old upright AABB verifier could
not see.
"""

import json
from math import radians
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
DIMENSIONS = json.loads((ROOT / "asset-src" / "dimensions.json").read_text(encoding="utf8"))


def blender_point(point):
    x, height, forward = point
    return Vector((-x, -forward, height))


def make_review_rig():
    frames = DIMENSIONS["bones"]
    parents = {
        "torso": None,
        "pelvis": "torso",
        "head": "torso",
        "swordUpperArm": "torso",
        "swordForearm": "swordUpperArm",
        "swordHand": "swordForearm",
        "offUpperArm": "torso",
        "offForearm": "offUpperArm",
        "offHand": "offForearm",
        "thighLeft": "pelvis",
        "shinLeft": "thighLeft",
        "thighRight": "pelvis",
        "shinRight": "thighRight",
    }
    bones = {}
    for name, parent_name in parents.items():
        bone = bpy.data.objects.new("review." + name, None)
        bpy.context.scene.collection.objects.link(bone)
        bone.matrix_world = Matrix.Translation(blender_point(frames[name]["joint"]))
        if parent_name:
            world = bone.matrix_world.copy()
            bone.parent = bones[parent_name]
            bone.matrix_world = world
        bones[name] = bone

    for piece in DIMENSIONS["pieces"]:
        obj = bpy.data.objects.get(piece["name"])
        if obj is None:
            raise RuntimeError(f'warrior.glb has no review piece "{piece["name"]}"')
        world = obj.matrix_world.copy()
        obj.parent = bones[piece["bone"]]
        obj.matrix_world = world
    return bones


def clear_pose(bones):
    for bone in bones.values():
        bone.rotation_euler = (0, 0, 0)


def pose_guard(bones):
    clear_pose(bones)
    bones["swordUpperArm"].rotation_euler = (radians(-58), radians(16), radians(-8))
    bones["swordForearm"].rotation_euler = (radians(42), 0, radians(-8))
    bones["swordHand"].rotation_euler = (radians(-18), 0, 0)
    bones["offUpperArm"].rotation_euler = (radians(-68), radians(-22), radians(10))
    bones["offForearm"].rotation_euler = (radians(62), 0, radians(8))
    bones["offHand"].rotation_euler = (radians(12), 0, 0)


def pose_reach(bones):
    clear_pose(bones)
    bones["torso"].rotation_euler = (radians(-8), 0, radians(-12))
    bones["swordUpperArm"].rotation_euler = (radians(-88), radians(10), radians(-5))
    bones["swordForearm"].rotation_euler = (radians(8), 0, 0)
    bones["swordHand"].rotation_euler = (radians(-20), 0, 0)
    bones["offUpperArm"].rotation_euler = (radians(-46), radians(-24), radians(12))
    bones["offForearm"].rotation_euler = (radians(76), 0, 0)


def pose_max_flex(bones):
    clear_pose(bones)
    bones["swordUpperArm"].rotation_euler = (radians(-54), radians(12), radians(-8))
    bones["swordForearm"].rotation_euler = (radians(120), 0, 0)
    bones["swordHand"].rotation_euler = (radians(-12), 0, 0)
    bones["offUpperArm"].rotation_euler = (radians(-34), radians(-18), radians(8))
    bones["offForearm"].rotation_euler = (radians(54), 0, radians(5))


def pose_crouch(bones):
    clear_pose(bones)
    bones["torso"].rotation_euler = (radians(-12), 0, radians(8))
    bones["pelvis"].rotation_euler = (radians(8), 0, radians(-5))
    bones["thighLeft"].rotation_euler = (radians(-42), radians(-5), 0)
    bones["shinLeft"].rotation_euler = (radians(78), 0, 0)
    bones["thighRight"].rotation_euler = (radians(34), radians(5), 0)
    bones["shinRight"].rotation_euler = (radians(58), 0, 0)
    pose_guard_arms = {
        "swordUpperArm": (radians(-48), radians(12), radians(-6)),
        "swordForearm": (radians(50), 0, radians(-6)),
        "offUpperArm": (radians(-58), radians(-18), radians(8)),
        "offForearm": (radians(64), 0, radians(6)),
    }
    for name, rotation in pose_guard_arms.items():
        bones[name].rotation_euler = rotation


def aim(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def ground_pose(bones):
    bpy.context.view_layer.update()
    low = min(
        (obj.matrix_world @ vertex.co).z
        for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name != "review.floor"
        for vertex in obj.data.vertices
    )
    bones["torso"].location.z -= low
    bpy.context.view_layer.update()


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "assets" / "warrior.glb"))
bones = make_review_rig()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("World")
scene.world.color = (0.025, 0.03, 0.045)

bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
floor = bpy.context.object
floor.name = "review.floor"
floor_material = bpy.data.materials.new("floor")
floor_material.diffuse_color = (0.055, 0.065, 0.08, 1)
floor.data.materials.append(floor_material)

bpy.ops.object.light_add(type="AREA", location=(-2.2, -3.0, 4.0))
bpy.context.object.data.energy = 900
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 4
bpy.ops.object.light_add(type="AREA", location=(2.5, 1.0, 2.4))
bpy.context.object.data.energy = 650
bpy.context.object.data.color = (0.45, 0.6, 1.0)
bpy.context.object.data.size = 3

bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.lens = 62

reviews = [
    ("upright-front", clear_pose, (1.15, -3.5, 1.5), (0, 0, 0.92)),
    ("upright-back", clear_pose, (-1.15, 3.5, 1.5), (0, 0, 0.92)),
    ("guard-front", pose_guard, (1.2, -3.45, 1.45), (0, -0.02, 0.95)),
    ("guard-side", pose_guard, (3.3, -0.7, 1.4), (0, 0, 0.95)),
    ("max-flex-front", pose_max_flex, (1.2, -3.45, 1.45), (0, -0.02, 0.95)),
    ("max-flex-side", pose_max_flex, (3.3, -0.7, 1.4), (0, 0, 0.95)),
    ("reach-three-quarter", pose_reach, (2.6, -2.6, 1.4), (0, -0.05, 1.0)),
    ("crouch-three-quarter", pose_crouch, (-2.6, -2.5, 1.35), (0, -0.02, 0.78)),
]
for label, pose, location, target in reviews:
    pose(bones)
    ground_pose(bones)
    camera.location = location
    aim(camera, target)
    scene.render.filepath = str(ROOT / ".review" / f"warrior-{label}.png")
    bpy.ops.render.render(write_still=True)
