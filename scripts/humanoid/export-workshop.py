"""Blender --background --disable-autoexec assets/character-lab/fighter.blend --python this.py.

Read-only derivative of the workshop source. Never saves the .blend or rewrites the preview.
Keeps authored topology, UVs, materials, textures and rest transforms; removes preview motion.
"""
import bpy, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'assets/character-lab/fighter.blend'
rig = bpy.data.objects['WorkshopRig']
bones = rig.data.bones
out = ROOT / 'public/assets/humanoid/workshop-fighter.glb'
profile_path = ROOT / 'assets/humanoid/workshop-fighter.json'

def length(name):
    return (bones[name].tail_local - bones[name].head_local).length

def region(name):
    side = 'primary' if name.endswith('_r') else 'secondary'
    leg = 'R' if name.endswith('_r') else 'L'
    if name.startswith(('upperarm',)): return side + '.upper'
    if name.startswith(('lowerarm', 'forearm')): return side + '.fore'
    if name.startswith(('hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_')): return side + '.hand'
    if name.startswith('thigh_'): return 'locomotion.thigh' + leg
    if name.startswith('calf_'): return 'locomotion.shin' + leg
    if name.startswith(('foot_', 'ball_', 'toe_')): return 'locomotion.foot' + leg
    if name == 'pelvis': return 'locomotion.pelvis'
    if name.startswith('neck'): return 'head.neck'
    if name.startswith(('head', 'eye', 'jaw')): return 'head.head'
    return 'torso.core'

# Store authored finger poses separately; no walk/attack track may reach game authority.
grips = {}
for kit in ['empty', 'sword', 'shield', 'sword-shield']:
    rig.animation_data.action = bpy.data.actions['inspection-' + kit]
    bpy.context.scene.frame_set(1)
    grips[kit] = {p.name: list(p.matrix_basis.to_quaternion()) for p in rig.pose.bones
                  if p.name.startswith(('thumb_', 'index_', 'middle_', 'ring_', 'pinky_'))}
for obj in list(bpy.data.objects):
    obj.animation_data_clear()
    if obj.name.startswith('bow__') or obj.get('authoringOnly'):
        bpy.data.objects.remove(obj, do_unlink=True)
for pose in rig.pose.bones:
    pose.matrix_basis.identity()
rig.data.pose_position = 'REST'
bpy.context.view_layer.update()

profile = {
    'version': 1, 'model': 'workshop-fighter',
    'source': {'path': 'assets/character-lab/fighter.blend',
               'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
               'anatomy': 'MakeHuman/MPFB CC0; workshop-authored clothing, equipment and fitting'},
    'upperLength': length('upperarm_r'), 'foreLength': length('lowerarm_r'),
    'thighLength': length('thigh_r'), 'shinLength': length('calf_r'),
    'hipSide': abs(bones['thigh_r'].head_local.x),
    'shoulderSide': abs(bones['upperarm_r'].head_local.x),
    'shoulderHeight': bones['upperarm_r'].head_local.z,
    'neckHeight': bones['neck_01'].head_local.z,
    'neckLength': length('neck_01'),
    'bones': {b.name: {'host': region(b.name), 'head': list(b.head_local),
                     'tail': list(b.tail_local), 'matrix': [list(row) for row in b.matrix_local]}
              for b in bones},
    'grips': grips,
}
# Babylon's left-handed glTF root reflects source X after Blender's Z-up conversion.
def point(p): return Vector((-p.x, p.z, -p.y))
def frame(centre, y, z):
    y = y.normalized(); z = (z - y * z.dot(y)).normalized(); x = y.cross(z).normalized()
    q = Matrix((x, y, z)).transposed().to_quaternion()
    return {'position': list(centre), 'rotation': [q.x,q.y,q.z,q.w]}
frames = {}
def segment(key, name, end=None):
    a = point(bones[name].head_local); b = point(bones[end].head_local if end else bones[name].tail_local)
    frames[key] = frame((a+b)/2, a-b, Vector((0,0,1)))
for s, slot, leg in [('r','primary','R'),('l','secondary','L')]:
    segment(slot+'.upper','upperarm_'+s,'lowerarm_'+s)
    segment(slot+'.fore','lowerarm_'+s,'hand_'+s)
    w = bones['hand_'+s].head_local
    v = (bones['middle_01_'+s].head_local-w).normalized()
    u = bones['index_01_'+s].head_local-bones['pinky_01_'+s].head_local
    u = (u-v*u.dot(v)).normalized()
    n = u.cross(v) * (-1 if s=='l' else 1)
    scale = (bones['middle_01_'+s].head_local-w).length/.1209
    handle = point((u+.2*v).normalized())
    y = -point(v); y = (y-handle*y.dot(handle)).normalized()
    centre = point(w)-y*.045
    frames[slot+'.hand'] = frame(centre,y,handle)
    grip = point(w+(v*.095+n*.046)*scale)
    q = Matrix((y.cross(handle),y,handle)).transposed().to_quaternion()
    profile.setdefault('palm',{})[slot] = list(q.inverted()@(grip-centre))
    segment('locomotion.thigh'+leg,'thigh_'+s,'calf_'+s)
    segment('locomotion.shin'+leg,'calf_'+s,'foot_'+s)
    frames['locomotion.foot'+leg] = frame(point(bones['foot_'+s].head_local)+Vector((0,-.04,.065)),Vector((0,1,0)),Vector((0,0,1)))
frames['locomotion.pelvis'] = frame(point(bones['pelvis'].head_local),Vector((0,1,0)),Vector((0,0,1)))
waist = .08+.025+profile['thighLength']+profile['shinLength']+.08
frames['torso.core'] = frame(Vector((0,(waist+profile['neckHeight'])/2,0)),Vector((0,1,0)),Vector((0,0,1)))
frames['head.neck'] = frame(Vector((0,profile['neckHeight']+profile['neckLength']/2,0)),Vector((0,1,0)),Vector((0,0,1)))
frames['head.head'] = frame(Vector((0,profile['neckHeight']+profile['neckLength']+.12,0)),Vector((0,1,0)),Vector((0,0,1)))
profile['frames'] = frames
equipment = {}
for prefix, slot, part in [('sword','primary','blade'),('shield','secondary','plate')]:
    row=frames[slot+'.hand']; q=Quaternion((row['rotation'][3],*row['rotation'][:3])); centre=Vector(row['position'])
    obj=bpy.data.objects[prefix+'__'+('blade' if prefix=='sword' else 'board')]
    points=[q.inverted()@(point(obj.matrix_world@v.co)-centre) for v in obj.data.vertices]
    equipment[part]={'points':[list(p) for p in points]}
profile['equipment']=equipment
profile_path.write_text(json.dumps(profile, indent=2) + '\n')
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_animations=False,
                         export_skins=True, export_extras=True, export_yup=True)
print('Workshop derivative:', out, 'source SHA256:', profile['source']['sha256'])
