"""Build the standalone warrior study and its four review angles."""

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def arguments():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(values)


def material(name, colour, metallic=0.0, roughness=0.65):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*colour, 1.0)
    value.metallic = metallic
    value.roughness = roughness
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*colour, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


def finish(obj, name, used_material, root, bevel=0.0, smooth=False):
    obj.name = name
    obj.data.name = name + "_mesh"
    obj.data.materials.append(used_material)
    obj.parent = root
    if bevel > 0:
        modifier = obj.modifiers.new(name + "_soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def rounded_box(name, location, scale, used_material, root, bevel=0.025, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, used_material, root, bevel)


def sphere(name, location, scale, used_material, root, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=16, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, used_material, root, 0.006, True)


def cylinder(name, location, radius, depth, used_material, root, vertices=32, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=location, rotation=rotation)
    return finish(bpy.context.object, name, used_material, root, 0.01, True)


def cone(name, location, radius1, radius2, depth, used_material, root, vertices=28,
         rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2,
                                   depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, name, used_material, root, 0.008, True)


def segment(name, start, end, radius, used_material, root, vertices=28):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length,
                                       location=midpoint)
    obj = bpy.context.object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    return finish(obj, name, used_material, root, 0.009, True)


def prism(name, points, depth, used_material, root, bevel=0.018):
    vertices = [(x, -depth / 2, z) for x, z in points] + [(x, depth / 2, z) for x, z in points]
    count = len(points)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, name, used_material, root, bevel)


def blade(name, start, end, start_width, end_width, depth, used_material, root):
    start = Vector((start[0], 0, start[1]))
    end = Vector((end[0], 0, end[1]))
    direction = (end - start).normalized()
    side = Vector((-direction.z, 0, direction.x))
    points = [
        (start.x + side.x * start_width, start.z + side.z * start_width),
        (end.x + side.x * end_width, end.z + side.z * end_width),
        (end.x - side.x * end_width, end.z - side.z * end_width),
        (start.x - side.x * start_width, start.z - side.z * start_width),
    ]
    return prism(name, points, depth, used_material, root, 0.008)


def torus(name, location, major, minor, used_material, root, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                    major_segments=32, minor_segments=10,
                                    location=location, rotation=rotation)
    return finish(bpy.context.object, name, used_material, root, 0.004, True)


def make_warrior():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new("Warrior", None)
    bpy.context.scene.collection.objects.link(root)

    steel = material("worn_dark_steel", (0.16, 0.17, 0.17), 0.76, 0.37)
    bright = material("polished_steel_edges", (0.42, 0.43, 0.40), 0.84, 0.26)
    black = material("blackened_iron", (0.055, 0.05, 0.045), 0.72, 0.48)
    brass = material("aged_brass", (0.34, 0.21, 0.075), 0.72, 0.32)
    leather = material("worn_leather", (0.17, 0.085, 0.036), 0.0, 0.82)
    cloth = material("burgundy_cloth", (0.25, 0.035, 0.025), 0.0, 0.92)
    skin = material("warm_skin", (0.42, 0.22, 0.13), 0.0, 0.74)
    hair = material("hair_and_beard", (0.045, 0.025, 0.016), 0.0, 0.96)

    # A dark under-body closes small gaps while every visible read comes from layered pieces.
    sphere("padded_torso", (0, 0.02, 1.18), (0.34, 0.20, 0.40), black, root)
    prism("rear_tabard", [(-0.16, 0.94), (0.16, 0.94), (0.15, 0.43),
                          (0.07, 0.38), (0.01, 0.44), (-0.06, 0.36),
                          (-0.15, 0.42)], 0.035, cloth, root).location.y = 0.23

    # Legs and boots: asymmetry makes the stance feel held rather than generated in a T-pose.
    for side, x, lean in (("left", -0.17, -0.025), ("right", 0.17, 0.035)):
        segment(side + "_thigh", (x, 0.01, 0.83), (x + lean, 0.015, 0.51), 0.13, black, root)
        sphere(side + "_knee", (x + lean, -0.025, 0.50), (0.145, 0.13, 0.13), steel, root)
        rounded_box(side + "_knee_ridge", (x + lean, -0.135, 0.51), (0.105, 0.035, 0.05), bright, root, 0.012)
        segment(side + "_shin", (x + lean, 0.01, 0.47), (x + lean * 1.4, 0.02, 0.20), 0.105, black, root)
        cone(side + "_greave", (x + lean, -0.055, 0.33), 0.12, 0.155, 0.31, steel, root)
        rounded_box(side + "_boot", (x + lean * 1.4, -0.055, 0.105), (0.14, 0.22, 0.105), leather, root, 0.035)
        for band, height in enumerate((0.23, 0.35)):
            torus(f"{side}_greave_band_{band}", (x + lean, -0.005, height),
                  0.108 + band * 0.008, 0.014, bright, root)

    # Waist, segmented faulds, and the ragged red tabard from the concept fighter.
    cylinder("belt", (0, 0, 0.89), 0.34, 0.105, leather, root, rotation=(0, 0, 0))
    rounded_box("belt_buckle", (0, -0.245, 0.90), (0.075, 0.025, 0.065), brass, root, 0.012)
    for row, (height, width) in enumerate(((0.84, 0.34), (0.77, 0.315), (0.70, 0.29))):
        rounded_box(f"fauld_{row}", (0, -0.02 - row * 0.008, height),
                    (width, 0.19, 0.075), steel, root, 0.025)
        rounded_box(f"fauld_edge_{row}", (0, -0.215, height - 0.045),
                    (width * 0.93, 0.018, 0.018), bright, root, 0.007)
    tabard = prism("tabard", [(-0.105, 0.88), (0.105, 0.88), (0.11, 0.37),
                               (0.035, 0.42), (-0.025, 0.34), (-0.11, 0.40)], 0.025,
                   cloth, root, 0.008)
    tabard.location.y = -0.235
    rounded_box("tabard_badge", (0, -0.265, 0.69), (0.038, 0.012, 0.10), brass, root, 0.008)

    # The cuirass is built in overlapping volumes so highlights separate its silhouette.
    sphere("cuirass_mass", (0, -0.015, 1.20), (0.36, 0.205, 0.39), steel, root)
    prism("breastplate", [(-0.30, 1.43), (0, 1.51), (0.30, 1.43),
                           (0.265, 1.05), (0.13, 0.96), (-0.13, 0.96), (-0.265, 1.05)],
          0.075, steel, root, 0.025).location.y = -0.215
    rounded_box("breastplate_shadow", (0, -0.269, 1.20), (0.225, 0.018, 0.035), steel, root, 0.01)
    for row, z in enumerate((1.08, 1.19, 1.30, 1.40)):
        rounded_box(f"cuirass_ridge_{row}", (0, -0.292, z),
                    (0.24 + (z - 1.08) * 0.16, 0.012, 0.012), brass, root, 0.005)
    torus("gorget", (0, 0, 1.50), 0.18, 0.035, bright, root)
    segment("cross_body_strap", (-0.24, -0.315, 1.44), (0.22, -0.315, 1.00),
            0.034, leather, root, 20)
    for index in range(5):
        fraction = index / 4
        sphere(f"cross_body_rivet_{index}",
               (-0.24 + 0.46 * fraction, -0.35, 1.44 - 0.44 * fraction),
               (0.013, 0.010, 0.013), brass, root, 16)

    # Shoulders and lowered arms make a compact, readable turntable silhouette.
    arm_points = {
        "left": ((-0.38, 0.01, 1.38), (-0.51, -0.02, 1.10), (-0.49, -0.12, 0.83)),
        "right": ((0.38, 0.01, 1.38), (0.51, -0.05, 1.08), (0.50, -0.19, 0.80)),
    }
    for side, (shoulder, elbow, hand) in arm_points.items():
        sphere(side + "_pauldron", shoulder, (0.20, 0.17, 0.145), steel, root)
        for ridge in range(3):
            torus(f"{side}_pauldron_ridge_{ridge}",
                  (shoulder[0], shoulder[1] - 0.14, shoulder[2] + 0.07 - ridge * 0.055),
                  0.15 - ridge * 0.012, 0.012, bright, root, rotation=(math.pi / 2, 0, 0))
        segment(side + "_upper_arm", shoulder, elbow, 0.115, black, root)
        segment(side + "_vambrace", elbow, hand, 0.12, steel, root)
        sphere(side + "_gauntlet", hand, (0.11, 0.10, 0.13), bright, root)
        for rivet in (-1, 1):
            sphere(f"{side}_pauldron_rivet_{rivet}",
                   (shoulder[0] + rivet * 0.105, -0.16, shoulder[2] + 0.04),
                   (0.018, 0.012, 0.018), brass, root, 20)

    # The canonical turnaround leaves the battered face exposed. Uneven hair tufts
    # keep the head readable in silhouette without pretending a procedural mesh is hair.
    sphere("head", (0, -0.035, 1.63), (0.145, 0.125, 0.175), skin, root)
    sphere("nose", (0, -0.158, 1.63), (0.028, 0.038, 0.055), skin, root, 24)
    for side, x in (("left", -0.054), ("right", 0.054)):
        sphere(side + "_eye_socket", (x, -0.151, 1.68), (0.032, 0.012, 0.018), black, root, 20)
    sphere("beard", (0, -0.14, 1.555), (0.105, 0.045, 0.09), hair, root, 28)
    sphere("hair_back", (0, 0.055, 1.66), (0.15, 0.11, 0.17), hair, root, 28)
    hair_tufts = ((-0.11, -0.04, 1.775, -0.50), (-0.055, -0.075, 1.79, -0.25),
                  (0.01, -0.08, 1.80, 0.08), (0.07, -0.055, 1.79, 0.30),
                  (0.12, -0.01, 1.77, 0.52), (-0.145, 0.025, 1.735, -0.70),
                  (0.145, 0.045, 1.73, 0.72))
    for index, (x, y, z, tilt) in enumerate(hair_tufts):
        cone(f"hair_tuft_{index}", (x, y, z), 0.038, 0.006, 0.11,
             hair, root, 16, rotation=(0, tilt, 0))

    # A tall heater shield follows the four-angle reference and stays broad in profile.
    shield_points = [(-0.78, 1.32), (-0.49, 1.36), (-0.39, 1.17),
                     (-0.43, 0.78), (-0.61, 0.48), (-0.82, 0.78), (-0.88, 1.12)]
    shield = prism("kite_shield", shield_points, 0.07, black, root, 0.025)
    shield.location.y = -0.28
    inner = [(-0.75, 1.28), (-0.52, 1.31), (-0.44, 1.14),
             (-0.48, 0.81), (-0.61, 0.57), (-0.77, 0.81), (-0.82, 1.10)]
    shield_field = prism("shield_field", inner, 0.035, steel, root, 0.018)
    shield_field.location.y = -0.34
    sphere("shield_boss", (-0.63, -0.39, 1.02), (0.105, 0.045, 0.105), brass, root, 28)
    for index, (x, z) in enumerate(shield_points[:-1]):
        sphere(f"shield_rivet_{index}", (x * 0.97, -0.385, z * 0.97 + 0.025),
               (0.018, 0.012, 0.018), brass, root, 18)

    # The sword hangs ready at the right hand and remains legible from the rear.
    blade("sword_blade", (0.50, 0.78), (0.66, 0.08), 0.055, 0.006, 0.045, bright, root).location.y = -0.31
    segment("sword_guard", (0.38, -0.31, 0.78), (0.63, -0.31, 0.84), 0.025, brass, root, 20)
    segment("sword_grip", (0.49, -0.31, 0.80), (0.46, -0.31, 0.98), 0.035, leather, root, 22)
    sphere("sword_pommel", (0.45, -0.31, 1.00), (0.055, 0.045, 0.055), brass, root, 22)

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
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=False, export_morph=False,
    )
    if result != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {result}")


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area_light(name, location, energy, size, colour):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = colour
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    look_at(light, (0, 0, 1.0))


def render_reviews(review):
    review.mkdir(parents=True, exist_ok=True)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -0.025))
    ground = bpy.context.object
    ground.data.materials.append(material("review_ground", (0.025, 0.022, 0.018), 0, 0.96))
    camera_data = bpy.data.cameras.new("review_camera")
    camera = bpy.data.objects.new("review_camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera.data.lens = 72
    area_light("warm_key", (-3.5, -4.5, 5.5), 850, 4.0, (1.0, 0.53, 0.26))
    area_light("cool_fill", (4.0, -0.5, 3.2), 420, 4.5, (0.32, 0.48, 0.72))
    area_light("rim", (2.5, 3.5, 4.8), 620, 3.0, (1.0, 0.33, 0.12))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world = bpy.data.worlds.new("review_world")
    scene.world.color = (0.004, 0.004, 0.003)
    for degrees in (0, 90, 180, 270):
        angle = math.radians(degrees - 55)
        camera.location = (4.5 * math.cos(angle), 4.5 * math.sin(angle), 2.5)
        look_at(camera, (0, 0, 1.0))
        scene.render.filepath = str(review / f"warrior-{degrees:03d}.png")
        bpy.ops.render.render(write_still=True)


def main():
    args = arguments()
    root = make_warrior()
    export(root, args.output)
    render_reviews(args.review)
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
