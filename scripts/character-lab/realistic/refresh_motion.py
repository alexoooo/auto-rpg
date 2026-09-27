"""Re-author motion/equipment on a saved fitted body, without rebuilding MPFB."""
import bpy,sys,os
from pathlib import Path
from mathutils import Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build
from motion import author_motion
from morph_export import add_morph_animation
for kind in (sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['fighter','rogue']):
 bpy.ops.wm.open_mainfile(filepath=str(build.SOURCE/(kind+'.blend')))
 rig=bpy.data.objects['WorkshopRig'];rig.animation_data_clear();rig.location=(0,0,0);rig.rotation_euler=(0,0,0)
 for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
 for o in list(bpy.data.objects):
  if o.name.startswith(('sword__','shield__','bow__')):bpy.data.objects.remove(o,do_unlink=True)
 weapons=os.environ.get('WORKSHOP_WEAPONS','').split(',') if os.environ.get('WORKSHOP_WEAPONS') else None
 for a in list(bpy.data.actions):
  if weapons is None or any(a.name==prefix+w or a.name.startswith(prefix+w+'-bow__') for w in weapons for prefix in ['loop-','inspection-']):bpy.data.actions.remove(a)
 mats=tuple(next(m for m in bpy.data.materials if m.name.split('.')[0]==name) for name in ['Worn saddle leather','Blackened steel','Aged brass','Honed steel','Yew heartwood','Linen string'])
 author_motion(rig,kind,mats,build.mesh,build.tube,weapons)
 for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
 bpy.context.scene.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=str(build.SOURCE/(kind+'.blend')),compress=True)
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if not o.get('authoringOnly'):o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(build.OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True,export_optimize_animation_size=True,export_force_sampling=False)
 add_morph_animation(build.OUT/(kind+'.glb'))
 print('REFRESHED',kind,flush=True)
