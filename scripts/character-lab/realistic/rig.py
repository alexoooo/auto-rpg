"""Workshop-only deformation helpers; baked into ordinary glTF skin joints."""
import bpy
from mathutils import Matrix,Vector,Quaternion
from mathutils.kdtree import KDTree

def prepare(rig):
 if 'upperarm_swing_l' not in rig.data.bones:
  bpy.context.view_layer.objects.active=rig;rig.hide_set(False);rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
  for side in ['l','r']:
   source=rig.data.edit_bones['upperarm_'+side]
   for label in ['swing','twist']:
    bone=rig.data.edit_bones.new(f'upperarm_{label}_{side}');bone.head=source.head;bone.tail=source.tail;bone.roll=source.roll;bone.parent=source.parent
  bpy.ops.object.mode_set(mode='OBJECT')
  for o in bpy.context.scene.objects:
   if o.type!='MESH' or o.get('authoringOnly'):continue
   for side in ['l','r']:
    original=o.vertex_groups.get('upperarm_'+side)
    if original is None:continue
    swing=o.vertex_groups.get('upperarm_swing_'+side) or o.vertex_groups.new(name='upperarm_swing_'+side)
    twist=o.vertex_groups.get('upperarm_twist_'+side) or o.vertex_groups.new(name='upperarm_twist_'+side)
    upper=rig.data.bones['upperarm_'+side];axis=upper.tail_local-upper.head_local;length=axis.length;axis.normalize()
    for vertex in o.data.vertices:
     total=sum(g.weight for g in vertex.groups if g.group==original.index)
     if total<.001:continue
     original.remove([vertex.index])
     if o.get('rigidBone')=='upperarm_'+side:swing.add([vertex.index],total,'REPLACE');continue
     t=max(0,min(1,(vertex.co-upper.head_local).dot(axis)/length))
     pair=(swing,twist) if t<.5 else (twist,original);f=t*2 if t<.5 else (t-.5)*2
     pair[0].add([vertex.index],total*(1-f),'REPLACE');pair[1].add([vertex.index],total*f,'REPLACE')
    if o.get('rigidBone')=='upperarm_'+side:o['rigidBone']='upperarm_swing_'+side
 if 'arrow_flight' not in rig.data.bones:
  bpy.context.view_layer.objects.active=rig;rig.hide_set(False);rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
  source=rig.data.edit_bones['hand_l'];bone=rig.data.edit_bones.new('arrow_flight');bone.head=source.head;bone.tail=source.tail;bone.roll=source.roll
  bpy.ops.object.mode_set(mode='OBJECT')
 if 'forearm_twist_1_l' not in rig.data.bones:
  bpy.context.view_layer.objects.active=rig;rig.hide_set(False);rig.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT')
  for side in ['l','r']:
   wrist=rig.data.edit_bones['hand_'+side]
   for i in [1,2]:
    bone=rig.data.edit_bones.new(f'forearm_twist_{i}_{side}')
    bone.head=wrist.head;bone.tail=wrist.tail;bone.roll=wrist.roll
    bone.parent=rig.data.edit_bones['lowerarm_'+side];bone.use_deform=True
  bpy.ops.object.mode_set(mode='OBJECT')
  for o in bpy.context.scene.objects:
   if o.type!='MESH' or o.get('rigidBone') or o.get('authoringOnly'):continue
   for side in ['l','r']:
    names=['lowerarm_'+side,f'forearm_twist_1_{side}',f'forearm_twist_2_{side}','hand_'+side]
    groups=[o.vertex_groups.get(name) or o.vertex_groups.new(name=name) for name in names]
    elbow=rig.data.bones[names[0]].head_local;wrist=rig.data.bones[names[-1]].head_local;axis=wrist-elbow;length=axis.length;axis.normalize()
    for vertex in o.data.vertices:
     total=sum(g.weight for g in vertex.groups if g.group in [groups[0].index,groups[-1].index])
     if total<.001:continue
     t=(vertex.co-elbow).dot(axis)/length
     if t<.12:continue
     t=max(0,min(1,t));knots=[.12,.45,.78,1]
     j=next((j for j in range(3) if t<=knots[j+1]),2);f=(t-knots[j])/(knots[j+1]-knots[j])
     for g in groups:g.remove([vertex.index])
     groups[j].add([vertex.index],total*(1-f),'REPLACE');groups[j+1].add([vertex.index],total*f,'REPLACE')
 # Seam tubes must deform with their own garment, not a guessed rigid bone.
 for o in list(bpy.context.scene.objects):
  if '_seam' not in o.name:continue
  source=bpy.data.objects.get(o.name.split('_seam')[0])
  if source is None or source.get('rigidBone'):continue
  tree=KDTree(len(source.data.vertices))
  for v in source.data.vertices:tree.insert(v.co,v.index)
  tree.balance();o.vertex_groups.clear()
  for vertex in o.data.vertices:
   _,index,_=tree.find(vertex.co)
   weights=sorted(source.data.vertices[index].groups,key=lambda g:g.weight,reverse=True)[:4];total=sum(g.weight for g in weights)
   for entry in weights:
    name=source.vertex_groups[entry.group].name;group=o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
    group.add([vertex.index],entry.weight/total,'REPLACE')
  if 'rigidBone' in o:del o['rigidBone']
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or o.get('authoringOnly'):continue
  for v in o.data.vertices:
   weights=sorted([(g.group,g.weight) for g in v.groups if g.weight>1e-6],key=lambda pair:pair[1],reverse=True)
   if len(weights)<=4:continue
   for index,_ in weights:o.vertex_groups[index].remove([v.index])
   total=sum(weight for _,weight in weights[:4])
   for index,weight in weights[:4]:o.vertex_groups[index].add([v.index],weight/total,'REPLACE')

def distribute_twist(rig,side):
 bpy.context.view_layer.update()
 b=rig.data.bones;p=rig.pose.bones
 upper='upperarm_'+side;parent=b[upper].parent.name
 parentRotation=(p[parent].matrix@b[parent].matrix_local.inverted()).to_quaternion()
 restDirection=b['lowerarm_'+side].head_local-b[upper].head_local
 direction=p['lowerarm_'+side].head-p[upper].head
 swing=(parentRotation@restDirection).rotation_difference(direction)@parentRotation
 full=(p[upper].matrix@b[upper].matrix_local.inverted()).to_quaternion()
 if swing.dot(full)<0:full.negate()
 for label,f in [('swing',0),('twist',.5)]:
  name=f'upperarm_{label}_{side}';q=swing.slerp(full,f)
  p[name].matrix=Matrix.Translation(p[upper].head)@q.to_matrix().to_4x4()@b[name].matrix_local.to_3x3().to_4x4()
 lower=p['lowerarm_'+side].matrix@b['lowerarm_'+side].matrix_local.inverted()
 hand=p['hand_'+side].matrix@b['hand_'+side].matrix_local.inverted()
 q0=lower.to_quaternion();q1=hand.to_quaternion()
 # Only axial forearm twist belongs in these helpers. Spreading the wrist's
 # bending rotation up the forearm rotates flesh about the wrist and produces
 # an artificial bulge near the elbow.
 axis=(p['hand_'+side].head-p['lowerarm_'+side].head).normalized()
 relative=q1@q0.inverted();v=Vector((relative.x,relative.y,relative.z))
 projected=axis*v.dot(axis);twist=Quaternion((relative.w,*projected))
 if twist.magnitude<1e-7:twist=Quaternion()
 else:twist.normalize()
 if twist.w<0:twist.negate()
 for i,f in [(1,.4),(2,.75)]:
  name=f'forearm_twist_{i}_{side}';q=Quaternion().slerp(twist,f)@q0
  p[name].matrix=Matrix.Translation(p['hand_'+side].head)@q.to_matrix().to_4x4()@b[name].matrix_local.to_3x3().to_4x4()
 bpy.context.view_layer.update()

def continuous_keys(rig,previous):
 for bone in rig.pose.bones:
  bone.rotation_mode='QUATERNION';q=bone.rotation_quaternion
  if bone.name in previous and previous[bone.name].dot(q)<0:q.negate()
  previous[bone.name]=q.copy()
  bone.scale=(1,1,1)
