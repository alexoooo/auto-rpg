"""Strip Blender Studio's Human Base Meshes bundle (CC0) down to its realistic skeleton.

Run: blender --background --disable-autoexec human_base_meshes_bundle.blend --python this.py -- assets/skeleton/skeleton-source.blend
Keeps only the "Skeleton - Realistic" collection, applies its MIRROR modifiers and removes its
SUBSURF modifiers, so the saved file holds the exact base cages build-assets.py reads.
"""
import bpy, sys
from pathlib import Path

out = Path(sys.argv[sys.argv.index('--') + 1:][0]).resolve()
keep = set(bpy.data.collections["Skeleton - Realistic"].all_objects)
for obj in list(bpy.data.objects):
    if obj not in keep: bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
for col in list(bpy.data.collections):
    if col.name != "Skeleton - Realistic": bpy.data.collections.remove(col)
skeleton = bpy.data.collections["Skeleton - Realistic"]
if skeleton.name not in scene.collection.children: scene.collection.children.link(skeleton)
for obj in keep:
    for mod in list(obj.modifiers):
        if mod.type == 'SUBSURF': obj.modifiers.remove(mod)
    if obj.data.users > 1: obj.data = obj.data.copy()
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for slot in obj.material_slots: slot.material = None
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
print("SAVED", out, len(keep), "objects", sum(len(o.data.vertices) for o in keep), "vertices")
