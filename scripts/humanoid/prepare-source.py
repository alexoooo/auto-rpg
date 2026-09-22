"""Strip unused scene objects and executable UI scripts from the CC0 source; preserve editable meshes and deform rig.
blender --background --disable-autoexec Knight.blend --python scripts/humanoid/prepare-source.py -- assets/humanoid/knight-source.blend
"""
import bpy, sys
keep={'rig','Man','Belt','BreastPlate','cuisse','Gauntlets','Helmet','Shoes','Shoulder-Plate','eyes-Left','eyes-Right'}
for obj in list(bpy.data.objects):
    if obj.name not in keep: bpy.data.objects.remove(obj,do_unlink=True)
for text in list(bpy.data.texts): bpy.data.texts.remove(text)
for obj in bpy.data.objects:
    obj.animation_data_clear()
    if obj.type=='ARMATURE':
        for bone in obj.pose.bones:
            for constraint in list(bone.constraints): bone.constraints.remove(constraint)
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index('--')+1],compress=True)
