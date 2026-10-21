"""Export portable, lossless character data from the editable masters."""
import bpy, sys
from pathlib import Path
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/art'))
sys.path.insert(0, str(ROOT / 'scripts/character-lab/realistic'))
from morph_export import add_morph_animation
from source_images import unpack_images

mode, source, destination = sys.argv[sys.argv.index('--') + 1:]
source, destination = Path(source).resolve(), Path(destination).resolve()
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.preferences.filepaths.save_version = 0

if mode == 'unpack':
    unpack_images(source, destination)
    bpy.ops.wm.save_as_mainfile(filepath=str(source), compress=True)
elif mode == 'export':
    rig = bpy.data.objects['WorkshopRig']
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if not obj.get('authoringOnly'):
            obj.select_set(True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
        export_extras=True, export_optimize_animation_size=True, export_force_sampling=False)
    add_morph_animation(destination)
else:
    raise ValueError('Unknown export mode: ' + mode)
