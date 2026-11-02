"""The posed grass lizard decimated, unwrapped afresh, and its colour and normals baked from the full scan.

Run by scripts/reptile/build-assets.mjs:
  blender -b --disable-autoexec -P scripts/reptile/retopo.py -- <hires.glb> <out folder> <triangles> <map size>

The scan's own UV seams stop a simplifier well short of a game's budget, so the mesh is collapsed
with no regard for them and given new texture coordinates, and its look is baked onto them from the
full scan: the colour alone (no lighting), and a tangent-space normal map. Writes low.glb (y up,
no material), colour.png and normal.png to the out folder.
"""
import bpy, sys, math, os

argv = sys.argv[sys.argv.index("--") + 1:]
src, out, target, size = argv[0], argv[1], int(argv[2]), int(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = [o for o in bpy.context.scene.objects if o.type == "MESH"]

bpy.ops.object.select_all(action="DESELECT")
for o in hi: o.select_set(True)
bpy.context.view_layer.objects.active = hi[0]
bpy.ops.object.duplicate()
bpy.ops.object.join()
low = bpy.context.view_layer.objects.active
low.name = "low"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-6)
bpy.ops.object.mode_set(mode="OBJECT")
tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
mod = low.modifiers.new("dec", "DECIMATE")
mod.ratio = target / tris
mod.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="dec")
print("low triangles", sum(len(p.vertices) - 2 for p in low.data.polygons))

low.data.materials.clear()
while low.data.uv_layers: low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name="UV")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
bpy.ops.object.mode_set(mode="OBJECT")
for p in low.data.polygons: p.use_smooth = True

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 4
bake = scene.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = 0.004
bake.max_ray_distance = 0.02
bake.margin = 8
bake.margin_type = "EXTEND"

mat = bpy.data.materials.new("baked")
mat.use_nodes = True
low.data.materials.append(mat)
node = mat.node_tree.nodes.new("ShaderNodeTexImage")
mat.node_tree.nodes.active = node

def run(kind, name, colour):
    image = bpy.data.images.new(name, size, size, alpha=False)
    image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    node.image = image
    bpy.ops.object.select_all(action="DESELECT")
    for o in hi: o.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    if kind == "DIFFUSE":
        bake.use_pass_direct = False
        bake.use_pass_indirect = False
        bake.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    else:
        bake.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
    image.filepath_raw = os.path.join(out, name + ".png")
    image.file_format = "PNG"
    image.save()

run("DIFFUSE", "colour", True)
run("NORMAL", "normal", False)

bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "low.glb"), use_selection=True, export_format="GLB", export_materials="NONE",
                          export_yup=True, export_normals=True, export_apply=True)
print("done")
