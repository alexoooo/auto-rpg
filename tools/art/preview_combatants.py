"""Render pinned combatant turntable and isometric review stills.

The output directory is review evidence, not a runtime asset. Invoke through
the pinned Blender binary after a verified combatant export.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from combatants import build_combatant_materials, build_combatants


def _look_at(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def _area(name, location, energy, size, colour):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = colour
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    _look_at(light, (0, 0, 1))


def _prepare(output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    manifest = json.loads((ROOT / "tools" / "art" / "combatants-manifest.json").read_text(encoding="utf-8"))
    built = build_combatants(manifest, build_combatant_materials(manifest, ROOT))
    # The runtime deliberately replaces exported inverse binds with identity:
    # every rigid part is joint-local. Reproduce that reviewed seam here by
    # placing each part at its rest-bone head instead of asking Blender to apply
    # its ordinary skinned-mesh inverse bind.
    for kind, offset_x in (("fighter", -0.9), ("brute", 0.9)):
        armature = built[kind]["armature"]
        for obj in built[kind]["meshes"].values():
            bone_name = obj.vertex_groups[0].name
            local = obj.location.copy()
            for modifier in list(obj.modifiers):
                obj.modifiers.remove(modifier)
            obj.parent = None
            obj.location = armature.data.bones[bone_name].head_local + local
            obj.location.x += offset_x
    for obj in bpy.context.scene.objects:
        obj.hide_render = obj.type == "MESH" and "_lod_high_mesh_" not in obj.name
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.03))
    ground = bpy.context.object
    ground.name = "review_ground"
    material = bpy.data.materials.new("review_ground")
    material.diffuse_color = (0.035, 0.038, 0.043, 1)
    material.roughness = 1
    ground.data.materials.append(material)

    camera_data = bpy.data.cameras.new("review_camera")
    camera = bpy.data.objects.new("review_camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.25
    _area("warm_key", (-3.8, -4.5, 6.0), 900, 4.0, (1.0, 0.58, 0.30))
    _area("cool_fill", (4.0, 1.5, 3.5), 520, 5.0, (0.35, 0.52, 0.75))
    _area("top_rim", (0, 3.5, 6.5), 700, 3.0, (0.95, 0.72, 0.48))

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("review_world")
    scene.world.color = (0.006, 0.008, 0.012)
    scene.frame_set(1)
    output.mkdir(parents=True, exist_ok=True)
    return scene, camera


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    scene, camera = _prepare(args.output)
    for degrees in (0, 90, 180, 270):
        angle = math.radians(degrees - 55)
        camera.location = (5.8 * math.cos(angle), 5.8 * math.sin(angle), 3.8)
        _look_at(camera, (0, 0, 1.05))
        scene.render.filepath = str(args.output / f"combatants-turntable-{degrees:03d}.png")
        bpy.ops.render.render(write_still=True)
    # Match the game view from negative world X/Z. Runtime Z maps to Blender
    # negative Y, so the corresponding Blender camera sits at positive Y.
    camera.location = (-4.8, 5.6, 4.6)
    camera.data.ortho_scale = 4.15
    _look_at(camera, (0, 0, 1.12))
    scene.render.resolution_x = 900
    scene.render.resolution_y = 650
    for lod in ("high", "mid", "low"):
        for obj in scene.objects:
            if obj.type == "MESH" and "_lod_" in obj.name:
                obj.hide_render = f"_lod_{lod}_mesh_" not in obj.name
        scene.render.filepath = str(args.output / f"combatants-game-camera-{lod}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
