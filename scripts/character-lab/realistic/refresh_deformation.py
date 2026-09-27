"""Rebake deformation helpers on existing authored clips, without changing poses."""
import bpy,sys
from pathlib import Path
from mathutils import Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build
from rig import prepare,distribute_twist
from morph_export import add_morph_animation

for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['fighter','rogue']):
 bpy.ops.wm.open_mainfile(filepath=str(build.SOURCE/(kind+'.blend')))
 rig=bpy.data.objects['WorkshopRig']
 prepare(rig)
 names=[f'forearm_twist_{i}_{s}' for s in ['l','r'] for i in [1,2]]+[f'upperarm_{label}_{s}' for s in ['l','r'] for label in ['swing','twist']]
 modifiers=[(m,m.show_viewport) for o in bpy.context.scene.objects if o.type=='MESH' for m in o.modifiers]
 for m,_ in modifiers:m.show_viewport=False
 for action in list(bpy.data.actions):
  if action.name not in [p+w for p in ['loop-','inspection-'] for w in ['empty','sword','shield','sword-shield','bow']]:continue
  print('DEFORMATION',kind,action.name,flush=True)
  rig.animation_data.action=action;previous={}
  for frame in (range(1,722) if action.name.startswith('loop-') else [1,3]):
   bpy.context.scene.frame_set(frame)
   for side in ['l','r']:distribute_twist(rig,side)
   for name in names:
    p=rig.pose.bones[name];p.rotation_mode='QUATERNION'
    if name in previous and previous[name].dot(p.rotation_quaternion)<0:p.rotation_quaternion.negate()
    previous[name]=p.rotation_quaternion.copy()
    p.keyframe_insert('location',frame=frame);p.keyframe_insert('rotation_quaternion',frame=frame)
  for curve in action.fcurves:
   for key in curve.keyframe_points:key.interpolation='LINEAR'
 rig.animation_data.action=None
 for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
 rig.location=(0,0,0);rig.rotation_euler=(0,0,0)
 for m,visible in modifiers:m.show_viewport=visible
 bpy.context.scene.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=str(build.SOURCE/(kind+'.blend')),compress=True)
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if not o.get('authoringOnly'):o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(build.OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True,export_optimize_animation_size=True,export_force_sampling=False)
 add_morph_animation(build.OUT/(kind+'.glb'))
